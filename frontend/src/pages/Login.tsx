import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { NativeGoogleButton } from "../components/auth/NativeGoogleButton";

// The chakravyuh — concentric defensive formation rings — as an ambient backdrop.
function ChakravyuhRings() {
  const markers = [0, 60, 120, 180, 240, 300];
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[150vw] max-w-[680px] -translate-x-1/2 -translate-y-1/2 select-none"
    >
      <defs>
        <radialGradient id="cvGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#0a0f1c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="195" fill="url(#cvGlow)" />
      <g className="cv-spin-slow">
        <circle cx="200" cy="200" r="186" fill="none" stroke="#22d3ee" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 11" />
        <circle cx="200" cy="200" r="168" fill="none" stroke="#22d3ee" strokeOpacity="0.08" strokeWidth="1" />
      </g>
      <g className="cv-spin-med">
        <circle cx="200" cy="200" r="138" fill="none" stroke="#f59e0b" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="34 18" />
        {markers.map((a) => {
          const rad = (a * Math.PI) / 180;
          return <circle key={a} cx={200 + 138 * Math.cos(rad)} cy={200 + 138 * Math.sin(rad)} r="2.5" fill="#fbbf24" />;
        })}
      </g>
      <g className="cv-spin-fast">
        <circle cx="200" cy="200" r="100" fill="none" stroke="#f59e0b" strokeOpacity="0.32" strokeWidth="1" strokeDasharray="11 8" />
      </g>
      <g className="cv-pulse">
        <circle cx="200" cy="200" r="58" fill="none" stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="200" cy="200" r="3" fill="#f59e0b" />
      </g>
      <g stroke="#f59e0b" strokeOpacity="0.25" strokeWidth="1">
        <line x1="200" y1="6" x2="200" y2="22" />
        <line x1="200" y1="378" x2="200" y2="394" />
        <line x1="6" y1="200" x2="22" y2="200" />
        <line x1="378" y1="200" x2="394" y2="200" />
      </g>
    </svg>
  );
}

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
