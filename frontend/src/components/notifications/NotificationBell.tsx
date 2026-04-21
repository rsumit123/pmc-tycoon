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
        <span
          className={[
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
            unreadWarnings > 0 ? "bg-rose-500 text-white" : "bg-amber-500 text-slate-900",
          ].join(" ")}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
