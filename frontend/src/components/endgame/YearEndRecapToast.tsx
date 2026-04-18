import { useEffect } from "react";
import { useCampaignStore } from "../../store/campaignStore";
import { playYearEndDrum } from "../../lib/audio";

export function YearEndRecapToast() {
  const toast = useCampaignStore((s) => s.yearRecapToast);
  const dismiss = useCampaignStore((s) => s.dismissYearRecapToast);

  useEffect(() => {
    if (!toast) return;
    playYearEndDrum();
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      onClick={dismiss}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-lg px-5 py-3 bg-amber-600/90 text-slate-900 text-sm font-semibold rounded-xl shadow-lg cursor-pointer"
    >
      {toast}
    </div>
  );
}
