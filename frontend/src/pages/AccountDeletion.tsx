import { Link } from "react-router-dom";

export function AccountDeletion() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.1em]">Delete Your Account</h1>
        <Link to="/" className="text-sm text-amber-400 underline">← Back</Link>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-slate-300">
        <section>
          <p>
            Deleting your Chakravyuh account permanently removes your account and{" "}
            <strong className="text-rose-400">all</strong> associated data (campaigns, progress)
            from our servers. This cannot be undone.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">In-app</h2>
          <p>
            Sign in, open the Menu (☰), and tap <strong className="text-slate-100">Delete Account</strong>{" "}
            under Settings; confirm.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">By email</h2>
          <p>
            Email{" "}
            <a href="mailto:thetinkerer018@gmail.com" className="text-amber-400 underline">
              thetinkerer018@gmail.com
            </a>{" "}
            from your account's email address requesting deletion.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">What's deleted</h2>
          <p>
            Your user record (email, name, avatar) and every campaign plus its game data.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">What's retained</h2>
          <p>
            Nothing tied to your account. Server logs may transiently contain request metadata,
            but these are not linked to your identity after deletion.
          </p>
        </section>
      </div>
    </div>
  );
}
