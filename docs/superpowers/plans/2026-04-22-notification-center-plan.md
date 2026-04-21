# Notification Center + Depot Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** One place for the system to tell the player what needs attention — low missile depots, empty AD batteries, completed R&D, delivered acquisitions, slipped contracts, pending vignettes. Replaces the invisible "check Armory to find out your depot is empty" problem discovered after Plan 19.

**Architecture:** No new persistent state. Backend synthesizes notifications on every GET by combining (a) live stock / battery rows (low-stock warnings), (b) last ~20 rows of `CampaignEvent` mapped to info notifications, (c) pending vignettes. Stable per-notification `id` strings let the frontend track read-state in localStorage, so no backend storage. Acquisitions gets deep-link URL params so notification → one-tap restock. Also folds in three line-item clarity fixes on the stockpile Offer cards so players understand the multi-quarter delivery cadence.

**Tech Stack:** FastAPI / Pydantic / SQLAlchemy / React 19 / Zustand / Vitest / pytest.

---

## Notification shape (locked up front)

```python
# backend/app/schemas/notification.py
class Notification(BaseModel):
    id: str                # stable, e.g. "low_stock:12:meteor" or "event:1234"
    kind: str              # "low_stock" | "empty_stock" | "empty_ad" |
                           # "rd_completed" | "acquisition_completed" |
                           # "acquisition_slipped" | "pending_vignette"
    severity: str          # "warning" | "info"
    title: str             # "Meteor depot low at Ambala"
    body: str              # "14 / 72 — reorder before next engagement"
    action_url: str        # "/campaign/{id}/procurement?..."
    created_at: str | None # ISO — for event-derived; null for state-derived
```

```ts
// frontend/src/lib/types.ts
export interface Notification {
  id: string;
  kind: "low_stock" | "empty_stock" | "empty_ad"
      | "rd_completed" | "acquisition_completed"
      | "acquisition_slipped" | "pending_vignette";
  severity: "warning" | "info";
  title: string;
  body: string;
  action_url: string;
  created_at: string | null;
}
export interface NotificationListResponse { notifications: Notification[]; }
```

**Thresholds:**
- `low_stock`: `stock < starting_capacity × 0.25` (where starting_capacity = `squadron.strength × 4` per Plan 18 seed formula — but since we don't persist "capacity," use `stock < 20` as a flat threshold for simplicity). Actual impl: compute per-base per-weapon starting-capacity by aggregating `squadron.strength × 4` across squadrons at that base for that weapon; alert when current stock < 25% of that derived capacity. If no squadron at the base can use that weapon (0 capacity), skip.
- `empty_stock`: stock == 0 and a squadron at that base still carries the weapon in its loadout (i.e. a real problem).
- `empty_ad`: `ADBattery.interceptor_stock == 0`.
- `rd_completed` / `acquisition_completed` / `acquisition_slipped`: show for 10 turns after the event (i.e. any such event with `(event.year, event.quarter)` within 10 quarters of current campaign clock).
- `pending_vignette`: always listed until resolved.

**Sorting:** severity DESC (warnings first), then `created_at` DESC, then `id` ASC as tiebreaker.

**Deep-link URL templates:**
- `low_stock` / `empty_stock`: `/campaign/{cid}/procurement?tab=acquisitions&view=offers&offer=missiles&missile={weapon_id}&base={base_id}&qty={topup}` where `topup = max(20, capacity - current_stock)` rounded up to nearest 10.
- `empty_ad`: `/campaign/{cid}/procurement?tab=acquisitions&view=offers&offer=reloads&ad_system={system_id}&battery={battery_id}&qty={capacity}`.
- `rd_completed` (missile): `/campaign/{cid}/armory?tab=missiles`.
- `rd_completed` (ad_system): `/campaign/{cid}/procurement?tab=acquisitions&view=offers&offer=ad_systems&focus_ad={ad_system_id}`.
- `rd_completed` (platform): `/campaign/{cid}/procurement?tab=acquisitions&view=offers&offer=aircraft&focus={platform_id}`.
- `acquisition_completed`: `/campaign/{cid}/hangar` (for platforms) or `/campaign/{cid}/armory?tab=missiles` (for missile_batch) or `/campaign/{cid}/armory?tab=ad` (for ad_battery/ad_reload).
- `acquisition_slipped`: `/campaign/{cid}/procurement?tab=acquisitions&view=orders`.
- `pending_vignette`: `/campaign/{cid}/vignette/{vignette_id}`.

---

## File Structure

**Backend — new:**
- `backend/app/api/notifications.py` — endpoint + synthesizer.
- `backend/app/schemas/notification.py` — Pydantic models.
- `backend/tests/test_notifications_api.py` — endpoint tests with fixtures for each kind.

**Backend — modified:**
- `backend/main.py` — register router.

**Frontend — new:**
- `frontend/src/components/notifications/NotificationBell.tsx` — header bell + count badge.
- `frontend/src/pages/NotificationsPage.tsx` — list view.
- `frontend/src/components/notifications/__tests__/NotificationBell.test.tsx`
- `frontend/src/components/notifications/__tests__/NotificationsPage.test.tsx`

**Frontend — modified:**
- `frontend/src/lib/types.ts` — `Notification`, `NotificationListResponse`.
- `frontend/src/lib/api.ts` — `getNotifications(cid)`.
- `frontend/src/store/campaignStore.ts` — `notifications: Notification[]`, `readNotificationIds: Set<string>`, `loadNotifications(cid)`, `markNotificationRead(id)`. Read-ids persisted to localStorage keyed `notifications_read_{cid}`.
- `frontend/src/App.tsx` — register `/campaign/:id/notifications` route.
- `frontend/src/pages/CampaignMapView.tsx` — mount `NotificationBell` in header.
- `frontend/src/components/procurement/AcquisitionPipeline.tsx` — read new URL params `missile`, `base`, `qty`, `ad_system`, `battery` and pre-fill + focus the matching offer card. Also add delivery-rate clarity lines on `MissileBatchOfferCard`, `ADBatteryOfferCard`, `ADReloadOfferCard`.
- `frontend/src/store/campaignStore.ts::advanceTurn` — call `loadNotifications(cid)` after advancing.
- `frontend/src/store/campaignStore.ts::commitVignette` — call `loadNotifications(cid)` after resolving.

---

## Task 1: Backend synthesizer + endpoint

**Files:**
- Create: `backend/app/schemas/notification.py`
- Create: `backend/app/api/notifications.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Pydantic model**

```python
# backend/app/schemas/notification.py
from pydantic import BaseModel


class Notification(BaseModel):
    id: str
    kind: str
    severity: str
    title: str
    body: str
    action_url: str
    created_at: str | None = None


class NotificationListResponse(BaseModel):
    notifications: list[Notification]
```

- [ ] **Step 2: Synthesizer + endpoint**

```python
# backend/app/api/notifications.py
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.models.ad_battery import ADBattery
from app.models.acquisition import AcquisitionOrder
from app.models.campaign_base import CampaignBase
from app.models.event import CampaignEvent
from app.models.missile_stock import MissileStock
from app.models.rd_program import RDProgramState
from app.models.squadron import Squadron
from app.models.vignette import Vignette
from app.schemas.notification import Notification, NotificationListResponse


router = APIRouter(prefix="/api/campaigns", tags=["notifications"])


_SHOTS_PER_AIRFRAME = 4
_LOW_STOCK_PCT = 0.25
_EVENT_RECENCY_Q = 10  # show event-derived notifications within this many quarters


def _base_name_map(db: Session, campaign_id: int) -> dict[int, str]:
    rows = db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()
    return {b.id: b.name for b in rows}


def _weapon_capacity_at_base(
    squadrons: list[Squadron], base_id: int, weapon_id: str,
) -> int:
    """Derived 'starting capacity' = sum(strength × shots-per-airframe) for
    squadrons at this base whose loadout includes the weapon."""
    total = 0
    for sq in squadrons:
        if sq.base_id != base_id:
            continue
        ld = PLATFORM_LOADOUTS.get(sq.platform_id, {})
        weapons = list(ld.get("bvr", [])) + list(ld.get("wvr", []))
        if weapon_id in weapons:
            total += (sq.strength or 0) * _SHOTS_PER_AIRFRAME
    return total


def _synthesize(db: Session, campaign_id: int) -> list[Notification]:
    camp = get_campaign(db, campaign_id)
    if camp is None:
        return []

    out: list[Notification] = []
    base_names = _base_name_map(db, campaign_id)
    squadrons = db.query(Squadron).filter_by(campaign_id=campaign_id).all()

    # 1. Low / empty missile stock
    stocks = db.query(MissileStock).filter_by(campaign_id=campaign_id).all()
    for s in stocks:
        cap = _weapon_capacity_at_base(squadrons, s.base_id, s.weapon_id)
        if cap <= 0:
            continue  # no squadron at this base uses this weapon — skip
        base = base_names.get(s.base_id, f"base-{s.base_id}")
        topup = max(20, cap - s.stock)
        # Round up to nearest 10
        topup = ((topup + 9) // 10) * 10
        url = (f"/campaign/{campaign_id}/procurement"
               f"?tab=acquisitions&view=offers&offer=missiles"
               f"&missile={s.weapon_id}&base={s.base_id}&qty={topup}")
        if s.stock == 0:
            out.append(Notification(
                id=f"empty_stock:{s.base_id}:{s.weapon_id}",
                kind="empty_stock", severity="warning",
                title=f"{s.weapon_id.upper()} depot EMPTY at {base}",
                body=f"0 / {cap} — reorder before next engagement",
                action_url=url,
            ))
        elif s.stock < cap * _LOW_STOCK_PCT:
            out.append(Notification(
                id=f"low_stock:{s.base_id}:{s.weapon_id}",
                kind="low_stock", severity="warning",
                title=f"{s.weapon_id.upper()} depot low at {base}",
                body=f"{s.stock} / {cap} — reorder to top up",
                action_url=url,
            ))

    # 2. Empty AD batteries
    batteries = db.query(ADBattery).filter_by(campaign_id=campaign_id).all()
    for b in batteries:
        if (b.interceptor_stock or 0) > 0:
            continue
        base = base_names.get(b.base_id, f"base-{b.base_id}")
        url = (f"/campaign/{campaign_id}/procurement"
               f"?tab=acquisitions&view=offers&offer=reloads"
               f"&ad_system={b.system_id}&battery={b.id}")
        out.append(Notification(
            id=f"empty_ad:{b.id}",
            kind="empty_ad", severity="warning",
            title=f"{b.system_id.upper()} battery at {base} has 0 interceptors",
            body="Reload via Acquisitions → AD Reloads",
            action_url=url,
        ))

    # 3. Pending vignettes
    pendings = db.query(Vignette).filter_by(
        campaign_id=campaign_id, status="pending",
    ).all()
    for v in pendings:
        ps = v.planning_state or {}
        scenario_name = ps.get("scenario_name", v.scenario_id)
        ao = (ps.get("ao") or {}).get("name", "")
        out.append(Notification(
            id=f"pending_vignette:{v.id}",
            kind="pending_vignette", severity="warning",
            title=f"Pending vignette: {scenario_name}",
            body=f"AO: {ao}" if ao else "Commit force via Ops Room",
            action_url=f"/campaign/{campaign_id}/vignette/{v.id}",
        ))

    # 4. Recent event-derived notifications
    now_q = camp.current_year * 4 + (camp.current_quarter - 1)
    cutoff_q = now_q - _EVENT_RECENCY_Q
    interesting_kinds = (
        "rd_completed", "acquisition_completed", "acquisition_slipped",
    )
    events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type.in_(interesting_kinds),
    ).order_by(CampaignEvent.id.desc()).limit(50).all()

    rd_programs_reg = None  # lazy-load to avoid circular import at module top
    for ev in events:
        ev_q = ev.year * 4 + (ev.quarter - 1)
        if ev_q < cutoff_q:
            continue
        created_iso = f"{ev.year}-Q{ev.quarter}"

        if ev.event_type == "rd_completed":
            program_id = (ev.payload or {}).get("program_id", "")
            if rd_programs_reg is None:
                from app.content.registry import rd_programs as _reg
                rd_programs_reg = _reg()
            spec = rd_programs_reg.get(program_id)
            unlocks = getattr(spec, "unlocks", None) if spec else None
            unlock_kind = getattr(unlocks, "kind", None) if unlocks else None
            target_id = getattr(unlocks, "target_id", None) if unlocks else None

            if unlock_kind == "missile":
                url = f"/campaign/{campaign_id}/armory?tab=missiles"
            elif unlock_kind == "ad_system" and target_id:
                url = (f"/campaign/{campaign_id}/procurement"
                       f"?tab=acquisitions&view=offers&offer=ad_systems"
                       f"&focus_ad={target_id}")
            elif unlock_kind in ("platform", "strike_platform") and target_id:
                url = (f"/campaign/{campaign_id}/procurement"
                       f"?tab=acquisitions&view=offers&offer=aircraft"
                       f"&focus={target_id}")
            else:
                url = f"/campaign/{campaign_id}/armory"
            out.append(Notification(
                id=f"event:{ev.id}",
                kind="rd_completed", severity="info",
                title=f"{spec.name if spec else program_id} R&D complete",
                body="Unlocked — procure via Acquisitions" if unlock_kind else "Doctrinal benefit applied",
                action_url=url,
                created_at=created_iso,
            ))
        elif ev.event_type == "acquisition_completed":
            pid = (ev.payload or {}).get("platform_id", "")
            out.append(Notification(
                id=f"event:{ev.id}",
                kind="acquisition_completed", severity="info",
                title=f"Delivery complete: {pid}",
                body=f"Order {(ev.payload or {}).get('order_id')} fully delivered",
                action_url=f"/campaign/{campaign_id}/procurement?tab=acquisitions&view=orders",
                created_at=created_iso,
            ))
        elif ev.event_type == "acquisition_slipped":
            p = ev.payload or {}
            out.append(Notification(
                id=f"event:{ev.id}",
                kind="acquisition_slipped", severity="warning",
                title=f"Delivery slipped: {p.get('platform_id', '')}",
                body=(f"Underfunded — FOC pushed to "
                      f"{p.get('new_foc_year')}-Q{p.get('new_foc_quarter')}"),
                action_url=f"/campaign/{campaign_id}/procurement?tab=acquisitions&view=orders",
                created_at=created_iso,
            ))

    # 5. Sort: severity desc, created_at desc (None last), id asc
    sev_order = {"warning": 0, "info": 1}
    out.sort(key=lambda n: (
        sev_order.get(n.severity, 9),
        (n.created_at is None, n.created_at or ""),  # non-null first, desc via reverse below is messy
        n.id,
    ))
    # Reverse so warnings-first + newest-first for event-derived
    out.sort(key=lambda n: (sev_order.get(n.severity, 9), -(hash(n.created_at or "") & 0xfff)))
    # Actually simpler: separate warnings from info, each sorted by id desc
    warnings = [n for n in out if n.severity == "warning"]
    infos = [n for n in out if n.severity == "info"]
    # For events (info), newer ids = later events = more recent; we already
    # queried with .desc() so that ordering is already approximately right
    # via insertion order. Re-sort defensively:
    infos.sort(key=lambda n: n.id, reverse=True)
    return warnings + infos


@router.get("/{campaign_id}/notifications", response_model=NotificationListResponse)
def list_notifications(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return NotificationListResponse(notifications=_synthesize(db, campaign_id))
```

- [ ] **Step 3: Register router in `backend/main.py`**

Add `from app.api.notifications import router as notifications_router` near other api imports and `app.include_router(notifications_router)` in the includes block.

- [ ] **Step 4: Sanity-import**

```bash
cd backend && python3 -c "from main import app; print([r.path for r in app.routes if 'notifications' in r.path])"
```
Expected: `['/api/campaigns/{campaign_id}/notifications']`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/notification.py backend/app/api/notifications.py backend/main.py
git commit -m "feat(notifications): GET /campaigns/{id}/notifications synthesizer"
```

---

## Task 2: Backend tests for each notification kind

**Files:**
- Create: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write test file**

Mirror the fixture pattern from `backend/tests/test_performance_api.py` (in-memory SQLite + `client_with_session` fixture). Tests:

- `test_notifications_empty_new_campaign` — fresh campaign with no stocks below threshold → returns only `pending_vignette`s if any (likely zero on a just-created campaign; the fixture probably has pending vignettes disabled).

- `test_low_stock_notification_fires_below_threshold` — create MissileStock row at 10 for a base whose seeded squadrons have 72 capacity for Meteor → assert one `low_stock` notification with expected title + deep-link.

- `test_empty_stock_notification_fires_at_zero` — MissileStock at 0 → `empty_stock` severity=warning.

- `test_no_notification_when_base_has_no_squadron_for_weapon` — MissileStock for a weapon nothing at that base uses → no notification.

- `test_empty_ad_notification_fires_when_interceptor_stock_zero` — ADBattery with interceptor_stock=0 → `empty_ad` notification.

- `test_pending_vignette_listed` — create a pending Vignette → one `pending_vignette` notification appears.

- `test_rd_completed_event_becomes_notification_within_recency` — insert a CampaignEvent rd_completed at current turn → notification appears with info severity. Event at (current_q - 15) → does NOT appear (outside recency).

- `test_acquisition_slipped_event_fires_warning` — insert an acquisition_slipped CampaignEvent → warning-severity notification.

- `test_warnings_sorted_before_infos` — mix of warning + info → assert first N are warnings.

- [ ] **Step 2: Run**

```bash
cd backend && python3 -m pytest tests/test_notifications_api.py -v
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_notifications_api.py
git commit -m "test(notifications): endpoint coverage per kind + sort order"
```

---

## Task 3: Frontend types, api, store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/store/campaignStore.ts`

- [ ] **Step 1: Types**

Append to `types.ts`:

```ts
export type NotificationKind =
  | "low_stock" | "empty_stock" | "empty_ad"
  | "rd_completed" | "acquisition_completed"
  | "acquisition_slipped" | "pending_vignette";

export type NotificationSeverity = "warning" | "info";

export interface Notification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_url: string;
  created_at: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
}
```

- [ ] **Step 2: API method**

Add to `api.ts` imports + methods:

```ts
import type {
  // ... existing ...
  NotificationListResponse,
} from "./types";

// inside api object:
async getNotifications(campaignId: number): Promise<NotificationListResponse> {
  const { data } = await http.get<NotificationListResponse>(
    `/api/campaigns/${campaignId}/notifications`,
  );
  return data;
},
```

- [ ] **Step 3: Store state + actions**

In `campaignStore.ts`:

a) Add to state interface:

```ts
notifications: Notification[];
readNotificationIds: Set<string>;
loadNotifications: (campaignId: number) => Promise<void>;
markNotificationRead: (id: string) => void;
```

b) Initial values in `create(...)`:

```ts
notifications: [],
readNotificationIds: new Set<string>(),
```

c) Helpers (module-level, above `create`):

```ts
function readKey(cid: number): string {
  return `notifications_read_${cid}`;
}
function loadReadFromStorage(cid: number): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(cid));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveReadToStorage(cid: number, ids: Set<string>) {
  try {
    localStorage.setItem(readKey(cid), JSON.stringify([...ids]));
  } catch { /* quota/SSR — silent */ }
}
```

d) Actions:

```ts
loadNotifications: async (campaignId: number) => {
  try {
    const resp = await api.getNotifications(campaignId);
    set({
      notifications: resp.notifications,
      readNotificationIds: loadReadFromStorage(campaignId),
    });
  } catch (e) {
    set({ error: (e as Error).message });
  }
},

markNotificationRead: (id: string) => {
  const cid = get().campaign?.id;
  const next = new Set(get().readNotificationIds);
  next.add(id);
  set({ readNotificationIds: next });
  if (cid) saveReadToStorage(cid, next);
},
```

e) In `advanceTurn`, after the campaign update fires, append:

```ts
void get().loadNotifications(cid);
```

(After the existing `void get().loadBases(cid);` block.)

f) In `commitVignette` action, after the resolved vignette is returned, append:

```ts
void get().loadNotifications(campaignId);
```

g) Reset: add `notifications: []` and `readNotificationIds: new Set()` to the reset block.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run build 2>&1 | tail -3
```
Expected: no TS errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts
git commit -m "feat(notifications): types + api.getNotifications + store with localStorage read-tracking"
```

---

## Task 4: NotificationBell component

**Files:**
- Create: `frontend/src/components/notifications/NotificationBell.tsx`
- Create: `frontend/src/components/notifications/__tests__/NotificationBell.test.tsx`

- [ ] **Step 1: Write component**

```tsx
// frontend/src/components/notifications/NotificationBell.tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCampaignStore } from "../../store/campaignStore";

export function NotificationBell({ campaignId }: { campaignId: number }) {
  const notifications = useCampaignStore((s) => s.notifications);
  const readIds = useCampaignStore((s) => s.readNotificationIds);

  const unread = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)),
    [notifications, readIds],
  );
  const unreadWarnings = unread.filter((n) => n.severity === "warning").length;
  const unreadCount = unread.length;

  return (
    <Link
      to={`/campaign/${campaignId}/notifications`}
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
      aria-label={`Notifications (${unreadCount} unread)`}
      title={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
    >
      <span className="text-base">🔔</span>
      {unreadCount > 0 && (
        <span className={[
          "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
          unreadWarnings > 0 ? "bg-rose-500 text-white" : "bg-amber-500 text-slate-900",
        ].join(" ")}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/components/notifications/__tests__/NotificationBell.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "../NotificationBell";
import { useCampaignStore } from "../../../store/campaignStore";
import type { Notification } from "../../../lib/types";

function seedStore(notifications: Notification[], readIds: Set<string>) {
  useCampaignStore.setState({
    notifications,
    readNotificationIds: readIds,
  } as never);
}

describe("NotificationBell", () => {
  it("renders bell with no badge when no unread", () => {
    seedStore([], new Set());
    render(<MemoryRouter><NotificationBell campaignId={1} /></MemoryRouter>);
    expect(screen.getByLabelText(/0 unread/)).toBeTruthy();
  });

  it("shows unread count + rose color when unread warnings exist", () => {
    seedStore([
      { id: "a", kind: "low_stock", severity: "warning", title: "t", body: "b", action_url: "/x", created_at: null },
      { id: "b", kind: "rd_completed", severity: "info", title: "t", body: "b", action_url: "/y", created_at: null },
    ], new Set());
    render(<MemoryRouter><NotificationBell campaignId={1} /></MemoryRouter>);
    const badge = screen.getByText("2");
    expect(badge.className).toContain("rose");
  });

  it("marks read items are excluded from count", () => {
    seedStore([
      { id: "a", kind: "low_stock", severity: "warning", title: "t", body: "b", action_url: "/x", created_at: null },
    ], new Set(["a"]));
    render(<MemoryRouter><NotificationBell campaignId={1} /></MemoryRouter>);
    expect(screen.queryByText("1")).toBeNull();
  });
});
```

- [ ] **Step 3: Run**

```bash
cd frontend && npm run test -- --run NotificationBell 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/notifications/
git commit -m "feat(notifications): NotificationBell header component with unread badge"
```

---

## Task 5: NotificationsPage route + list view

**Files:**
- Create: `frontend/src/pages/NotificationsPage.tsx`
- Create: `frontend/src/pages/__tests__/NotificationsPage.test.tsx`
- Modify: `frontend/src/App.tsx` — register route.

- [ ] **Step 1: Write page**

```tsx
// frontend/src/pages/NotificationsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import type { Notification } from "../lib/types";

type Filter = "all" | "warnings" | "info" | "read";

const KIND_ICON: Record<string, string> = {
  low_stock: "📦", empty_stock: "📦", empty_ad: "🛡",
  rd_completed: "🔬", acquisition_completed: "✈",
  acquisition_slipped: "⏳", pending_vignette: "⚠",
};

export function NotificationsPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const navigate = useNavigate();
  const notifications = useCampaignStore((s) => s.notifications);
  const readIds = useCampaignStore((s) => s.readNotificationIds);
  const loadNotifications = useCampaignStore((s) => s.loadNotifications);
  const markNotificationRead = useCampaignStore((s) => s.markNotificationRead);

  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (Number.isFinite(cid)) loadNotifications(cid);
  }, [cid, loadNotifications]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "warnings":
        return notifications.filter((n) => n.severity === "warning" && !readIds.has(n.id));
      case "info":
        return notifications.filter((n) => n.severity === "info" && !readIds.has(n.id));
      case "read":
        return notifications.filter((n) => readIds.has(n.id));
      default:
        return notifications.filter((n) => !readIds.has(n.id));
    }
  }, [notifications, readIds, filter]);

  const openNotification = (n: Notification) => {
    markNotificationRead(n.id);
    navigate(n.action_url);
  };

  const counts = useMemo(() => {
    const unread = notifications.filter((n) => !readIds.has(n.id));
    return {
      all: unread.length,
      warnings: unread.filter((n) => n.severity === "warning").length,
      info: unread.filter((n) => n.severity === "info").length,
      read: notifications.length - unread.length,
    };
  }, [notifications, readIds]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <h1 className="text-sm font-bold">🔔 Notifications</h1>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3 pb-20">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 overflow-x-auto">
          {(["all", "warnings", "info", "read"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                "flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded capitalize whitespace-nowrap",
                filter === f ? "bg-amber-600 text-slate-900" : "text-slate-300",
              ].join(" ")}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs opacity-60 py-6 text-center">
            {filter === "read" ? "No read notifications yet." : "All caught up. Nothing needs your attention right now."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => {
              const isRead = readIds.has(n.id);
              const border = isRead
                ? "border-slate-800 bg-slate-900/40 opacity-60"
                : n.severity === "warning"
                  ? "border-rose-800 bg-rose-950/20"
                  : "border-sky-800 bg-sky-950/20";
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`w-full text-left border rounded-lg p-3 hover:bg-slate-900 transition-colors ${border}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base">{KIND_ICON[n.kind] ?? "ℹ"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold truncate">{n.title}</span>
                          {n.created_at && (
                            <span className="text-[10px] opacity-60 flex-shrink-0">{n.created_at}</span>
                          )}
                        </div>
                        <p className="text-xs opacity-80 mt-0.5">{n.body}</p>
                        <p className="text-[10px] opacity-60 mt-1">Tap to open →</p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Register route in App.tsx**

```tsx
import { NotificationsPage } from "./pages/NotificationsPage";
// ...
<Route path="/campaign/:id/notifications" element={<NotificationsPage />} />
```

- [ ] **Step 3: Minimal test**

```tsx
// frontend/src/pages/__tests__/NotificationsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationsPage } from "../NotificationsPage";
import { useCampaignStore } from "../../store/campaignStore";
import type { Notification } from "../../lib/types";

const sample: Notification[] = [
  { id: "low_stock:1:meteor", kind: "low_stock", severity: "warning",
    title: "Meteor depot low at Ambala", body: "14 / 72",
    action_url: "/campaign/1/procurement", created_at: null },
  { id: "event:99", kind: "rd_completed", severity: "info",
    title: "AMCA complete", body: "Procure via Acquisitions",
    action_url: "/campaign/1/armory", created_at: "2027-Q2" },
];

describe("NotificationsPage", () => {
  beforeEach(() => {
    useCampaignStore.setState({
      notifications: sample,
      readNotificationIds: new Set(),
      loadNotifications: vi.fn().mockResolvedValue(undefined),
      markNotificationRead: vi.fn((id: string) => {
        useCampaignStore.setState((s) => ({
          readNotificationIds: new Set([...s.readNotificationIds, id]),
        } as never));
      }),
    } as never);
  });

  it("renders warning + info when filter=all", () => {
    render(<MemoryRouter initialEntries={["/campaign/1/notifications"]}>
      <Routes><Route path="/campaign/:id/notifications" element={<NotificationsPage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText(/Meteor depot low/)).toBeTruthy();
    expect(screen.getByText(/AMCA complete/)).toBeTruthy();
  });

  it("warnings filter hides info entries", () => {
    render(<MemoryRouter initialEntries={["/campaign/1/notifications"]}>
      <Routes><Route path="/campaign/:id/notifications" element={<NotificationsPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /^warnings/i }));
    expect(screen.getByText(/Meteor depot low/)).toBeTruthy();
    expect(screen.queryByText(/AMCA complete/)).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests + build**

```bash
cd frontend && npm run test -- --run Notifications 2>&1 | tail -5
cd frontend && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NotificationsPage.tsx frontend/src/pages/__tests__/NotificationsPage.test.tsx frontend/src/App.tsx
git commit -m "feat(notifications): NotificationsPage list + filter + deep-links"
```

---

## Task 6: Mount bell + wire auto-refresh

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: Mount bell in header**

Import and mount next to the other header nav controls:

```tsx
import { NotificationBell } from "../components/notifications/NotificationBell";
// ...
<NotificationBell campaignId={campaign.id} />
```

Pick a reasonable spot — next to the Theme / audio / menu toggles. Keep it small.

- [ ] **Step 2: Trigger initial load on mount**

In the existing useEffect that loads bases/platforms etc on campaign load, add `loadNotifications(campaign.id)`. Pull the action from the store:

```tsx
const loadNotifications = useCampaignStore((s) => s.loadNotifications);
// ...in the "if (campaign)" effect block, append:
loadNotifications(campaign.id);
```

- [ ] **Step 3: Build + test**

```bash
cd frontend && npm run build 2>&1 | tail -3
cd frontend && npm run test -- --run 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(notifications): mount NotificationBell in CampaignMapView header"
```

---

## Task 7: Acquisitions deep-link params + delivery-rate clarity lines

**Files:**
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx`
- Modify: `frontend/src/pages/ProcurementHub.tsx` — thread the new URL params through.

- [ ] **Step 1: Thread new URL params through ProcurementHub**

In `ProcurementHub.tsx`, add these params to the `<AcquisitionPipeline>` props (alongside existing `focusPlatformId`, `focusAdId`):

```tsx
initialOfferCat={searchParams.get("offer") as "aircraft"|"missiles"|"ad_systems"|"reloads" | null}
focusMissile={searchParams.get("missile") ?? undefined}
focusBaseId={searchParams.get("base") ? Number(searchParams.get("base")) : undefined}
focusQty={searchParams.get("qty") ? Number(searchParams.get("qty")) : undefined}
focusAdSystem={searchParams.get("ad_system") ?? undefined}
focusBatteryId={searchParams.get("battery") ? Number(searchParams.get("battery")) : undefined}
```

- [ ] **Step 2: Extend AcquisitionPipeline props + route to the right sub-tab**

Accept the new props. In the `initialOfferCat` setup logic:

```tsx
const initialOfferCat: OfferCategory =
  props.initialOfferCat ??
  (focusPlatformId ? "aircraft"
    : focusAdId ? "ad_systems"
    : props.focusMissile ? "missiles"
    : props.focusBatteryId ? "reloads"
    : "aircraft");
```

- [ ] **Step 3: Pre-fill `MissileBatchOfferCard` when focusMissile matches**

Find `MissileBatchOfferCard`. Extend it to accept optional `initialBaseId` + `initialQty` + `highlighted` props. When `highlighted`, scroll into view + pulsing ring, same as aircraft `OfferCard` already does. Pre-populate the `qty` stepper and `base` select on mount from the initial values.

Render pass in the Missiles sub-tab:

```tsx
{armoryUnlocks.missiles.map((m) => {
  const isFocus = props.focusMissile === m.target_id;
  return (
    <MissileBatchOfferCard
      key={m.target_id}
      missile={m}
      unitCostCr={weaponsById[m.target_id]?.unit_cost_cr ?? 0}
      currentYear={currentYear}
      currentQuarter={currentQuarter}
      bases={bases}
      onSign={onSign}
      disabled={disabled}
      initialBaseId={isFocus ? props.focusBaseId : undefined}
      initialQty={isFocus ? props.focusQty : undefined}
      highlighted={isFocus}
    />
  );
})}
```

- [ ] **Step 4: Pre-fill `ADReloadOfferCard` when focusBatteryId matches**

Similar: extend `ADReloadOfferCard` with `initialTargetBatteryId` + `highlighted`. When a reload deep-link hits the page, auto-select that battery from the `bySystem[systemId]` list and highlight the card.

- [ ] **Step 5: Delivery-rate clarity lines (folded in per the earlier ask)**

Add a small clarifying line under the existing "Delivery 2027-Q2 → FOC 2028-Q1" text on each stockpile offer card:

**MissileBatchOfferCard** — compute per-quarter rate:
```tsx
const totalQuarters = Math.max(1,
  (focYear - firstDeliveryYear) * 4 + (focQuarter - firstDeliveryQuarter) + 1);
const perQ = Math.ceil(qty / totalQuarters);
// Render under the existing Total/Delivery line:
<div className="text-[10px] opacity-60">
  ≈{perQ} {missile.name.toLowerCase()}/q across {totalQuarters} quarter{totalQuarters === 1 ? "" : "s"}
</div>
```

**ADReloadOfferCard** — same pattern:
```tsx
<div className="text-[10px] opacity-60">
  ≈{Math.ceil(qty / totalQuarters)}/q across {totalQuarters} quarter{totalQuarters === 1 ? "" : "s"}
</div>
```

**ADBatteryOfferCard** — different: whole battery ships at FOC, not pro-rated. So:
```tsx
<div className="text-[10px] opacity-60">
  Full battery + {capacity} interceptors delivered at FOC (2028-Q4). Treasury billed pro-rata each quarter.
</div>
```

- [ ] **Step 6: Build + test**

```bash
cd frontend && npm run build 2>&1 | tail -3
cd frontend && npm run test -- --run 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(notifications): Acquisitions deep-link params + per-quarter delivery rate clarity"
```

---

## Task 8: Final sweep + docs + deploy

- [ ] **Step 1: Full backend + frontend test sweeps**

```bash
cd backend && python3 -m pytest -q
cd frontend && npm run test -- --run && npm run build
```
Expect 525 + 9 new backend; 187 + 6-8 new frontend.

- [ ] **Step 2: Update CLAUDE.md**

Append to Current Status after Plan 19:

```markdown
- **Plan 20 (Notification Center)** — ✅ done. 5XX backend tests + 19X frontend vitest tests. New `GET /api/campaigns/{id}/notifications` endpoint synthesizes a live notification list from (a) low/empty MissileStock rows (threshold 25% of derived per-base capacity), (b) empty ADBattery interceptor_stock, (c) pending vignettes, (d) recent `rd_completed` / `acquisition_completed` / `acquisition_slipped` events within 10 quarters. Stable per-notification `id` strings let the frontend track read-state in localStorage keyed `notifications_read_{cid}`. 🔔 bell icon in CampaignMapView header shows unread count badge (rose when warnings, amber otherwise). New `/campaign/:id/notifications` page with All / Warnings / Info / Read filters; tapping any row marks read + navigates to the deep-link. Acquisitions deep-links auto-fill the matching missile/reload offer card with weapon + base + qty pre-populated — one-tap restock from the notification. `advanceTurn` + `commitVignette` auto-refresh notifications. Also folded in per-quarter delivery-rate clarity lines on all 3 stockpile offer cards so players see "≈25 Meteor/q across 4 quarters" instead of a opaque FOC date. Plan file: `docs/superpowers/plans/2026-04-22-notification-center-plan.md`.
```

Bump last-updated date if needed.

- [ ] **Step 3: Commit + push + deploy**

```bash
git add CLAUDE.md
git commit -m "docs: Plan 20 done — notification center + depot alerts"
git push
./deploy.sh
```

Frontend auto-deploys via Vercel.

- [ ] **Step 4: Prod smoke**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/notifications" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'total: {len(d[\"notifications\"])}')
for n in d['notifications'][:5]:
    print(f'  [{n[\"severity\"]}] {n[\"kind\"]}: {n[\"title\"]}')
"
```
Expected: non-empty list for the live campaign 6.

---

## Self-Review

**1. Spec coverage.**
- Notification synthesis for 7 kinds (low_stock, empty_stock, empty_ad, rd_completed, acquisition_completed, acquisition_slipped, pending_vignette) — Task 1.
- localStorage read-tracking — Task 3.
- Bell + badge — Task 4.
- Full-page list + filters — Task 5.
- Auto-refresh on advance/commit — Task 3.
- Deep-link pre-fill — Task 7.
- Delivery-rate clarity lines on offer cards — Task 7.
- CLAUDE.md — Task 8.

All covered.

**2. Placeholder scan.** Task 7 has "extend card with initialBaseId/initialQty" notes that assume current card shape; actual prop names depend on existing code. Adapt in place. All other tasks have concrete code.

**3. Type consistency.**
- `Notification` shape identical frontend/backend.
- Severity literal values match ("warning" | "info").
- Kind literal values match across both sides.
- URL param names (`offer` / `missile` / `base` / `qty` / `ad_system` / `battery`) consistent between synthesizer and AcquisitionPipeline reader.

No inconsistencies.

---

## Execution

Commit directly to `main`. Backend tasks 1-2 as one batched subagent. Frontend tasks 3-7 as a second subagent. Controller finalizes Task 8.
