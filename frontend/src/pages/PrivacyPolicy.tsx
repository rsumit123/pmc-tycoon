import { Link } from "react-router-dom";

export function PrivacyPolicy() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.1em]">Privacy Policy</h1>
        <Link to="/" className="text-sm text-amber-400 underline">← Back</Link>
      </div>

      <p className="font-tech mb-6 text-xs uppercase tracking-wider text-slate-500">
        Effective 2026-06-24
      </p>

      <div className="space-y-6 text-sm leading-relaxed text-slate-300">
        <section>
          <p>
            Chakravyuh is a single-player strategy game. This policy explains what we collect
            and how we use it.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Account info from Google Sign-In: your email address, name, and profile picture URL.
              (Or, if you use email/password — currently disabled in the app — an email and a
              password hash.)
            </li>
            <li>Gameplay data you create: campaigns, decisions, and game progress.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">How we use it</h2>
          <p>
            We use your information to authenticate you, save and load your campaigns, and operate
            the game. We do not sell your data or use it for advertising. There are no third-party
            ad or analytics SDKs in the app.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Third-party services</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-slate-100">Google Sign-In</strong> — for authentication
              (Google's privacy policy applies to their processing).
            </li>
            <li>
              <strong className="text-slate-100">OpenRouter</strong> — to generate the game's
              AI-written after-action reports and intelligence briefs, we send abstract gameplay
              state (e.g., combat outcomes, force composition, campaign events) to OpenRouter,
              which routes it to a large-language-model provider. We do not send your email or
              personal identity in these requests.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Data storage &amp; retention</h2>
          <p>
            Your account and campaign data are stored on our server and retained until you delete
            your account.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Deleting your data</h2>
          <p>
            You can permanently delete your account and all associated data at any time, in-app via
            Menu → Delete Account, or by emailing{" "}
            <a href="mailto:thetinkerer018@gmail.com" className="text-amber-400 underline">
              thetinkerer018@gmail.com
            </a>
            . See the{" "}
            <Link to="/account-deletion" className="text-amber-400 underline">
              Account Deletion
            </Link>{" "}
            page.
          </p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Children</h2>
          <p>The game is not directed to children under 13.</p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Changes</h2>
          <p>We may update this policy; the effective date will change.</p>
        </section>

        <section>
          <h2 className="font-display mb-2 text-lg font-semibold text-amber-400">Contact</h2>
          <p>
            <a href="mailto:thetinkerer018@gmail.com" className="text-amber-400 underline">
              thetinkerer018@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
