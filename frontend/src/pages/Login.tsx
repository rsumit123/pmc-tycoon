import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { NativeGoogleButton } from "../components/auth/NativeGoogleButton";
import { ChakravyuhRings } from "../components/brand/ChakravyuhRings";

export function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  async function onGoogle(idToken: string) {
    setError(null);
    try {
      const resp = await api.loginGoogle(idToken);
      setAuth(resp);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Google sign-in failed");
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0a0f1c] text-slate-100">
      {/* tactical grid + vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(125% 80% at 50% 28%, transparent 38%, #0a0f1c 92%)" }}
      />
      <ChakravyuhRings />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-9">
        <div className="cv-rise font-tech text-[11px] tracking-[0.3em] text-amber-500/80">
          IAF · DEFENSE INTEGRATION COMMAND
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="cv-rise" style={{ animationDelay: "80ms" }}>
            <div className="font-display text-2xl leading-none text-amber-400/70">चक्रव्यूह</div>
            <h1 className="font-display mt-1 text-5xl font-bold uppercase tracking-[0.12em] text-slate-50">
              Chakravyuh
            </h1>
          </div>
          <p className="cv-rise font-tech mt-3 text-xs text-slate-400" style={{ animationDelay: "160ms" }}>
            Hold the formation. <span className="text-amber-500/90">2026–2036.</span>
          </p>
          <p className="cv-rise mt-4 text-sm leading-relaxed text-slate-300/90" style={{ animationDelay: "220ms" }}>
            You are India's <span className="font-medium text-slate-100">Head of Defense Integration</span>.
            Out-procure, out-research, and out-fly your adversaries across 40 quarters of air power.
          </p>
          <div className="cv-rise mt-4 flex gap-2" style={{ animationDelay: "280ms" }}>
            {["PLAAF", "PAF", "PLAN"].map((a) => (
              <span
                key={a}
                className="font-tech rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[10px] tracking-widest text-rose-300/80"
              >
                {a}
              </span>
            ))}
          </div>
        </div>

        <div className="cv-rise mb-2 mt-8" style={{ animationDelay: "360ms" }}>
          <div className="font-tech mb-2 text-[10px] tracking-[0.25em] text-slate-500">
            ▸ AUTHENTICATE TO ASSUME COMMAND
          </div>
          <p className="sr-only">Sign in with Google to continue</p>
          {Capacitor.isNativePlatform() ? (
            <NativeGoogleButton onCredential={onGoogle} />
          ) : (
            <GoogleSignInButton onCredential={onGoogle} />
          )}
          {error && <p className="mt-2 break-words text-sm text-red-400">{error}</p>}
        </div>

        <div className="cv-rise font-tech mt-4 flex items-center justify-between text-[10px] tracking-widest text-slate-600" style={{ animationDelay: "440ms" }}>
          <span>EYES ONLY</span>
          <span>NEW DELHI</span>
        </div>
      </div>
    </div>
  );
}
