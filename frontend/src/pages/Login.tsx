import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";

export function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = mode === "login"
        ? await api.login(email, password)
        : await api.signup(email, password, displayName || undefined);
      setAuth(resp);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

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
          <p className="text-sm text-slate-400">
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <GoogleSignInButton onCredential={onGoogle} />

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-800" /> or <span className="h-px flex-1 bg-slate-800" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="dn" className="block text-xs text-slate-400">Display name</label>
              <input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                     className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-xs text-slate-400">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs text-slate-400">Password</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                   className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy}
                  className="w-full rounded bg-amber-500 py-2 font-semibold text-slate-950 disabled:opacity-50">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                className="w-full text-xs text-slate-400 underline">
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
