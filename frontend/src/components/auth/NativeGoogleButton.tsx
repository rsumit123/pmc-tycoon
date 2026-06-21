import { useEffect, useState } from "react";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";

interface Props {
  onCredential: (idToken: string) => void;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Native (Capacitor) Google Sign-In. Mirrors the chillbill app pattern:
// initialize once, then GoogleAuth.signIn() yields an ID token whose audience
// is the web client id — the same /api/auth/google endpoint verifies it.
export function NativeGoogleButton({ onCredential }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    GoogleAuth.initialize({ clientId: CLIENT_ID, scopes: ["profile", "email"], grantOfflineAccess: false });
  }, []);

  async function handle() {
    setBusy(true);
    setError(null);
    if (!CLIENT_ID) {
      setError("Sign-in failed: VITE_GOOGLE_CLIENT_ID missing from build");
      setBusy(false);
      return;
    }
    try {
      const result = await GoogleAuth.signIn();
      const idToken = (result as { authentication?: { idToken?: string } })?.authentication?.idToken;
      if (!idToken) throw new Error("no ID token returned (check serverClientId)");
      onCredential(idToken);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string | number };
      let detail: string;
      try {
        detail = err?.message || (err?.code != null ? `code ${err.code}` : JSON.stringify(e));
      } catch {
        detail = String(e);
      }
      // eslint-disable-next-line no-console
      console.error("[GoogleAuth] native sign-in failed", e);
      setError(`Sign-in failed: ${detail}`);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handle} disabled={busy}
              className="w-full rounded bg-white py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-red-400 break-words">{error}</p>}
    </div>
  );
}
