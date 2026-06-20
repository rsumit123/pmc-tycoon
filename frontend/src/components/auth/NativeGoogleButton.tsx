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
    try {
      const result = await GoogleAuth.signIn();
      const idToken = (result as { authentication?: { idToken?: string } })?.authentication?.idToken;
      if (!idToken) throw new Error("No ID token from Google");
      onCredential(idToken);
    } catch {
      setError("Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handle} disabled={busy}
              className="w-full rounded bg-white py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
