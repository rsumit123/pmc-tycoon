import { useEffect, useRef } from "react";

interface Props {
  onCredential: (idToken: string) => void;
}

export function GoogleSignInButton({ onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    const g = (window as unknown as { google?: any }).google;
    if (!g || !clientId || !ref.current) return;
    g.accounts.id.initialize({
      client_id: clientId,
      callback: (resp: { credential?: string }) => {
        if (resp.credential) onCredential(resp.credential);
      },
    });
    g.accounts.id.renderButton(ref.current, {
      type: "standard", theme: "outline", size: "large", text: "continue_with", width: 280,
    });
  }, [clientId, onCredential]);

  if (!clientId) {
    return <p className="text-xs text-slate-400">Google Sign-In unavailable (no client ID configured).</p>;
  }
  return <div ref={ref} />;
}
