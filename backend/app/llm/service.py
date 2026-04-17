"""Per-narrative-kind orchestrators.

Each `generate_*` function:
  1. Checks eligibility (raises NarrativeIneligibleError when not).
  2. Looks up an existing CampaignNarrative row; returns its text on hit.
  3. Assembles canonical inputs from the DB.
  4. Builds the prompt, runs it through the LLM cache (get_or_generate).
  5. Persists a CampaignNarrative row + any side effects (e.g. Squadron.ace_name).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.llm.client import chat_completion
from app.llm.cache import get_or_generate
from app.llm.prompts import aar_v1, intel_brief_v1, ace_name_v1, year_recap_v1, year_recap_v2, retrospective_v1, retrospective_v2
from app.llm.prompts import cache_key as make_cache_key
from app.crud.narrative import find_narrative, write_narrative

from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.squadron import Squadron
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.campaign_narrative import CampaignNarrative
from app.models.event import CampaignEvent


class NarrativeIneligibleError(RuntimeError):
    pass


# ----- AAR ---------------------------------------------------------------

def generate_aar(db: Session, campaign: Campaign, vignette: Vignette) -> tuple[str, bool]:
    if vignette.status != "resolved":
        raise NarrativeIneligibleError("vignette is not resolved")
    subject_id = f"vig-{vignette.id}"
    existing = find_narrative(db, campaign.id, "aar", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = {
        "scenario_name": vignette.planning_state.get("scenario_name", vignette.scenario_id),
        "ao": vignette.planning_state.get("ao", {}),
        "year": vignette.year, "quarter": vignette.quarter,
        "planning_state": vignette.planning_state,
        "committed_force": vignette.committed_force or {},
        "outcome": vignette.outcome or {},
        "event_trace": vignette.event_trace or [],
    }
    ihash = aar_v1.build_input_hash(inputs)
    ckey = make_cache_key(aar_v1.KIND, aar_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=aar_v1.KIND, prompt_version=aar_v1.VERSION,
        build_messages=lambda: aar_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    vignette.aar_text = text
    write_narrative(
        db, campaign_id=campaign.id, kind="aar", year=vignette.year,
        quarter=vignette.quarter, subject_id=subject_id, text=text,
        prompt_version=aar_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Intel brief -------------------------------------------------------

def generate_intel_brief(db: Session, campaign: Campaign) -> tuple[str, bool]:
    subject_id = f"{campaign.current_year}-Q{campaign.current_quarter}"
    existing = find_narrative(db, campaign.id, "intel_brief", subject_id)
    if existing is not None:
        return existing.text, True

    # Enforce ≥ 2-quarter gap since any prior brief
    prior = db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign.id,
        CampaignNarrative.kind == "intel_brief",
    ).order_by(CampaignNarrative.year.desc(), CampaignNarrative.quarter.desc()).first()
    if prior is not None:
        gap = (campaign.current_year - prior.year) * 4 + (campaign.current_quarter - prior.quarter)
        if gap < 2:
            raise NarrativeIneligibleError(f"last brief was {gap} quarters ago; need ≥ 2")

    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
    recent_cards = db.query(IntelCard).filter(
        IntelCard.campaign_id == campaign.id
    ).order_by(IntelCard.id.desc()).limit(6).all()

    inputs = {
        "year": campaign.current_year, "quarter": campaign.current_quarter,
        "adversary_states": {r.faction: dict(r.state) for r in adv_rows},
        "recent_intel_cards": [
            {"source_type": c.source_type, "confidence": c.confidence,
             "headline": c.payload.get("headline", "")}
            for c in recent_cards
        ],
    }
    ihash = intel_brief_v1.build_input_hash(inputs)
    ckey = make_cache_key(intel_brief_v1.KIND, intel_brief_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=intel_brief_v1.KIND,
        prompt_version=intel_brief_v1.VERSION,
        build_messages=lambda: intel_brief_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="intel_brief",
        year=campaign.current_year, quarter=campaign.current_quarter,
        subject_id=subject_id, text=text,
        prompt_version=intel_brief_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Ace name ----------------------------------------------------------

def _notable_win(outcome: dict) -> bool:
    return bool(outcome.get("objective_met")) \
        and outcome.get("adv_kia", 0) >= 4 \
        and outcome.get("ind_airframes_lost", 999) <= 1


def _pick_ace_squadron(vignette: Vignette) -> dict | None:
    cf = vignette.committed_force or {}
    squadrons = cf.get("squadrons") or []
    if not squadrons:
        return None
    # Most airframes committed, ties broken by lowest squadron_id
    return sorted(squadrons, key=lambda s: (-s.get("airframes", 0), s.get("squadron_id", 0)))[0]


def generate_ace_name(db: Session, campaign: Campaign, vignette: Vignette) -> tuple[str, bool]:
    if vignette.status != "resolved":
        raise NarrativeIneligibleError("vignette is not resolved")
    if not _notable_win(vignette.outcome or {}):
        raise NarrativeIneligibleError("outcome does not qualify as a notable win")
    chosen = _pick_ace_squadron(vignette)
    if chosen is None:
        raise NarrativeIneligibleError("no squadron committed")
    sqn_id = chosen["squadron_id"]
    subject_id = f"sqn-{sqn_id}"
    existing = find_narrative(db, campaign.id, "ace_name", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = {
        "squadron_name": chosen["name"],
        "platform_id": chosen["platform_id"],
        "vignette": {
            "scenario_name": vignette.planning_state.get("scenario_name", vignette.scenario_id),
            "year": vignette.year, "quarter": vignette.quarter,
            "outcome": vignette.outcome or {},
        },
    }
    ihash = ace_name_v1.build_input_hash(inputs)
    ckey = make_cache_key(ace_name_v1.KIND, ace_name_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=ace_name_v1.KIND,
        prompt_version=ace_name_v1.VERSION,
        build_messages=lambda: ace_name_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
        model=settings.openrouter_model,
    )
    text = text.strip().splitlines()[0]  # Enforce single line defensively

    sq = db.query(Squadron).filter(
        Squadron.campaign_id == campaign.id, Squadron.id == sqn_id
    ).first()
    if sq is not None:
        sq.ace_name = text
        sq.ace_awarded_year = vignette.year
        sq.ace_awarded_quarter = vignette.quarter

    write_narrative(
        db, campaign_id=campaign.id, kind="ace_name",
        year=vignette.year, quarter=vignette.quarter,
        subject_id=subject_id, text=text,
        prompt_version=ace_name_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Year recap --------------------------------------------------------

def _enrich_year_recap_inputs(db: Session, campaign: Campaign, year: int) -> dict:
    """Build enriched input dict for year_recap_v2 from CampaignEvent rows."""
    events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.year == year,
    ).all()

    # Treasury: first Q's starting value from turn_advanced, last Q's ending value
    turn_events = [e for e in events if e.event_type == "turn_advanced"]
    turn_events_sorted = sorted(turn_events, key=lambda e: e.quarter)
    starting_treasury_cr = (
        turn_events_sorted[0].payload.get("treasury_before_cr", 0)
        if turn_events_sorted else 0
    )
    ending_treasury_cr = (
        turn_events_sorted[-1].payload.get("treasury_after_cr", campaign.budget_cr)
        if turn_events_sorted else (campaign.budget_cr if year + 1 == campaign.current_year else 0)
    )

    # Deliveries from acquisition_delivery events
    acquisitions_delivered = [
        e.payload.get("platform_id", "unknown")
        for e in events if e.event_type == "acquisition_delivery"
    ]

    # R&D milestones from rd_milestone + rd_completed events
    rd_milestones = [
        e.payload.get("program_id", "unknown")
        for e in events if e.event_type in ("rd_milestone", "rd_completed")
    ]

    # Vignette counts — resolved and actually won (objective_met)
    resolved_vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign.id,
        Vignette.year == year,
        Vignette.status == "resolved",
    ).all()
    vignettes_resolved = len(resolved_vigs)
    vignettes_won = sum(
        1 for v in resolved_vigs
        if (v.outcome or {}).get("objective_met", False)
    )

    # Adversary shifts from roadmap + doctrine events
    adv_shift_types = ("adversary_roadmap_event_applied", "adversary_doctrine_shifted")
    notable_adversary_shifts = []
    for e in events:
        if e.event_type in adv_shift_types:
            faction = e.payload.get("faction", "")
            description = e.payload.get("description") or e.payload.get("event_id", "")
            shift = f"{faction}: {description}".strip(": ")
            if shift:
                notable_adversary_shifts.append(shift)

    return {
        "year": year,
        "starting_treasury_cr": starting_treasury_cr,
        "ending_treasury_cr": ending_treasury_cr,
        "acquisitions_delivered": acquisitions_delivered,
        "rd_milestones": rd_milestones,
        "vignettes_resolved": vignettes_resolved,
        "vignettes_won": vignettes_won,
        "notable_adversary_shifts": notable_adversary_shifts,
    }


def generate_year_recap(db: Session, campaign: Campaign, year: int) -> tuple[str, bool]:
    if year >= campaign.current_year:
        raise NarrativeIneligibleError(f"year {year} is not yet closed")
    subject_id = f"year-{year}"
    existing = find_narrative(db, campaign.id, "year_recap", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = _enrich_year_recap_inputs(db, campaign, year)
    ihash = year_recap_v2.build_input_hash(inputs)
    ckey = make_cache_key(year_recap_v2.KIND, year_recap_v2.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=year_recap_v2.KIND,
        prompt_version=year_recap_v2.VERSION,
        build_messages=lambda: year_recap_v2.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="year_recap",
        year=year, quarter=4, subject_id=subject_id, text=text,
        prompt_version=year_recap_v2.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Retrospective -----------------------------------------------------

def _q40_completed(campaign: Campaign) -> bool:
    return campaign.current_year > 2036 or (
        campaign.current_year == 2036 and campaign.current_quarter > 1
    )


_FIFTH_GEN_PLATFORM_IDS = {"amca_mk1", "amca_mk2"}

_SQUADRONS_START_APPROX = 31  # Historical snapshot unavailable; IAF ~31 sq in 2026


def _evaluate_objective(obj_id: str, squadrons: list, resolved_vigs: list) -> str:
    """Return 'pass' or 'fail' for a known objective id, else 'unknown'."""
    if obj_id == "amca_operational_by_2035":
        return "pass" if any(s.platform_id in _FIFTH_GEN_PLATFORM_IDS for s in squadrons) else "fail"
    if obj_id == "maintain_42_squadrons":
        return "pass" if len(squadrons) >= 42 else "fail"
    if obj_id == "no_territorial_loss":
        # Fail if ANY resolved vignette had objective not met
        any_lost = any(not (v.outcome or {}).get("objective_met", True) for v in resolved_vigs)
        return "fail" if any_lost else "pass"
    return "unknown"


def generate_retrospective(db: Session, campaign: Campaign) -> tuple[str, bool]:
    if not _q40_completed(campaign):
        raise NarrativeIneligibleError("Q40 (2036-Q1) not yet completed")
    subject_id = "campaign"
    existing = find_narrative(db, campaign.id, "retrospective", subject_id)
    if existing is not None:
        return existing.text, True

    from app.content.registry import objectives as objectives_reg

    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
    ace_count = db.query(Squadron).filter(
        Squadron.campaign_id == campaign.id, Squadron.ace_name.isnot(None)
    ).count()
    squadrons = db.query(Squadron).filter(Squadron.campaign_id == campaign.id).all()
    squadrons_end = len(squadrons)

    fifth_gen_count = sum(1 for s in squadrons if s.platform_id in _FIFTH_GEN_PLATFORM_IDS)

    # Resolved vignettes for notable_engagements + objective evaluation
    resolved_vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign.id,
        Vignette.status == "resolved",
    ).all()

    notable_engagements = [
        {
            "scenario_name": v.planning_state.get("scenario_name", v.scenario_id),
            "year": v.year,
            "quarter": v.quarter,
            "won": bool((v.outcome or {}).get("objective_met", False)),
        }
        for v in resolved_vigs
    ]

    # Budget efficiency: derived from turn_advanced events
    turn_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.event_type == "turn_advanced",
    ).all()
    total_grants = sum(e.payload.get("budget_grant_cr", 0) for e in turn_events)
    spent = total_grants - campaign.budget_cr
    if total_grants > 0:
        budget_efficiency_pct = max(0, min(100, round(100 * spent / total_grants)))
    else:
        budget_efficiency_pct = 0

    # Objective scorecard
    obj_registry = objectives_reg()
    obj_ids: list[str] = campaign.objectives_json or []
    objectives_scorecard = []
    for obj_id in obj_ids:
        spec = obj_registry.get(obj_id)
        name = spec.title if spec else obj_id
        status = _evaluate_objective(obj_id, squadrons, resolved_vigs)
        objectives_scorecard.append({"id": obj_id, "name": name, "status": status, "detail": ""})

    inputs = {
        "final_year": campaign.current_year, "final_quarter": campaign.current_quarter,
        "objectives_scorecard": objectives_scorecard,
        "force_structure_delta": {
            "squadrons_start": _SQUADRONS_START_APPROX,
            "squadrons_end": squadrons_end,
            "fifth_gen_squadrons_end": fifth_gen_count,
        },
        "budget_efficiency_pct": budget_efficiency_pct,
        "ace_count": ace_count,
        "notable_engagements": notable_engagements,
        "adversary_final_state": {r.faction: dict(r.state) for r in adv_rows},
    }
    ihash = retrospective_v2.build_input_hash(inputs)
    ckey = make_cache_key(retrospective_v2.KIND, retrospective_v2.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=retrospective_v2.KIND,
        prompt_version=retrospective_v2.VERSION,
        build_messages=lambda: retrospective_v2.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="retrospective",
        year=campaign.current_year, quarter=campaign.current_quarter,
        subject_id=subject_id, text=text,
        prompt_version=retrospective_v2.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached
