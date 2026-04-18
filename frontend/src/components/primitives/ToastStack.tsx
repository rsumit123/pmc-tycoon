import { useCampaignStore } from "../../store/campaignStore";
import { Toast } from "./Toast";

export function ToastStack() {
  const toasts = useCampaignStore((s) => s.toasts);
  const dismiss = useCampaignStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      <div className="flex flex-col gap-2 items-center pointer-events-auto">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  );
}
