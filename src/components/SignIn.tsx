import { useAuthActions } from "@convex-dev/auth/react";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { oakridgeLogoUrl } from "../lib/assets";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", mode);
      await signIn("password", formData);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sign-in did not work.";
      setError(message.replace(/^\[CONVEX[^\]]*\]\s*/, ""));
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Oakridge Operations introduction">
        <div className="brand-lockup brand-lockup--light">
          <span className="brand-mark"><img src={oakridgeLogoUrl} alt="" /></span>
          <span><strong>Oakridge MUN</strong><small>Operations</small></span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow eyebrow--light">One calm workspace</p>
          <h1>Write. Allocate. Check.</h1>
          <p>Email delegates, compare preferences, and catch spreadsheet problems without hunting through five different tools.</p>
        </div>
        <ul className="auth-promises">
          <li><ShieldCheck aria-hidden="true" /> Private contact data</li>
          <li><LockKeyhole aria-hidden="true" /> Passwords stay encrypted</li>
        </ul>
      </section>

      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <p className="step-kicker">Private admin access</p>
          <h2>{mode === "signIn" ? "Welcome back" : "Create your workspace password"}</h2>
          <p className="form-intro">
            {mode === "signIn"
              ? "Use the private password you created for this app."
              : "Use 12+ characters. This password is only for Oakridge Operations."}
          </p>
          <label>
            Admin email
            <input name="email" type="email" defaultValue="nagapranayimmadi@gmail.com" autoComplete="username" required />
          </label>
          <label>
            Workspace password
            <span className="password-field">
              <input name="password" type={showPassword ? "text" : "password"} minLength={12} autoComplete={mode === "signIn" ? "current-password" : "new-password"} required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                <span>{showPassword ? "Hide" : "Show"}</span>
              </button>
            </span>
          </label>
          {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
          <button className="button button--primary button--large" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signIn" ? "Open workspace" : "Create private workspace"}
            {!busy && <ArrowRight aria-hidden="true" />}
          </button>
          <button className="button button--secondary button--full auth-alternate" type="button" onClick={() => { setMode((value) => value === "signIn" ? "signUp" : "signIn"); setError(""); }}>
            {mode === "signIn" ? "First time? Create a workspace password" : "I already have a workspace password"}
          </button>
          <p className="microcopy"><strong>Private access only.</strong> Use the approved Gmail or Oakridge admin address. Password-reset email is not connected yet.</p>
        </form>
      </section>
    </main>
  );
}
