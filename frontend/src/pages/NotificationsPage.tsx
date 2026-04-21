import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import type { Notification } from "../lib/types";

type Filter = "all" | "warnings" | "info" | "read";

const KIND_ICON: Record<string, string> = {
  low_stock: "📦",
  empty_stock: "📦",
  empty_ad: "🛡",
  rd_completed: "🔬",
  acquisition_completed: "✈",
  acquisition_slipped: "⏳",
  pending_vignette: "⚠",
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
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">
          Map
        </Link>
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
            {filter === "read"
              ? "No read notifications yet."
              : "All caught up. Nothing needs your attention right now."}
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
