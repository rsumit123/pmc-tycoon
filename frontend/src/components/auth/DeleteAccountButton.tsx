import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";

interface Props {
  /** Called after the menu should be dismissed (e.g. when the confirm flow opens or completes). */
  onClose?: () => void;
}

export function DeleteAccountButton({ onClose }: Props) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      useAuthStore.getState().logout();
      onClose?.();
      navigate("/login");
    } catch {
      setError("Could not delete account. Please try again or email support.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800 text-rose-400"
      >
        🗑 Delete Account
      </button>
    );
  }

  return (
    <div className="rounded border border-rose-500/40 bg-rose-950/20 px-3 py-2 space-y-2">
      <p className="text-xs text-rose-300">
        Permanently delete your account and all campaigns? This cannot be undone.
      </p>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className="flex-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setConfirming(false); setError(null); }}
          className="flex-1 rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
