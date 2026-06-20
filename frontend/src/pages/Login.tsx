import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { Capacitor } from "@capacitor/core";
import { NativeGoogleButton } from "../components/auth/NativeGoogleButton";

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
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Chakravyuh</h1>
          <p className="text-sm text-slate-400">Sign in with Google to continue</p>
        </div>

        {Capacitor.isNativePlatform()
          ? <NativeGoogleButton onCredential={onGoogle} />
          : <GoogleSignInButton onCredential={onGoogle} />}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
