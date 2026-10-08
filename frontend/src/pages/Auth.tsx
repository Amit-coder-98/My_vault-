import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { motion } from "motion/react";
import { Brand } from "../components/ui/Brand";
import { api } from "../lib/api";
import { authActions } from "../lib/auth-store";
import { navigate } from "../lib/router";

export function AuthPage({ route }: { route: string }) {
  const pathname = route.split("?")[0];
  const params = new URLSearchParams(route.split("?")[1]);
  const invitation = params.get("invite") ?? "";
  const token = params.get("token") ?? "";
  const register = pathname === "/register";
  const reset = pathname === "/reset-password";
  const forgot = pathname === "/forgot-password";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteReady, setInviteReady] = useState(false);
  useEffect(() => {
    if (!register || !invitation) return;
    let cancelled = false;
    api<{ email: string }>(
      `/auth/invitation?token=${encodeURIComponent(invitation)}`,
      { anonymous: true },
    )
      .then((data) => {
        if (!cancelled) {
          setEmail(data.email);
          setInviteReady(true);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [invitation, register]);
  const title = forgot
    ? "Find your way back."
    : reset
      ? "A fresh start."
      : register
        ? "Your invitation to listen."
        : "Welcome to your vault.";
  const blocked = forgot || (register && !inviteReady) || (reset && !token);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if ((register || reset) && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (reset) {
        await api("/auth/reset-password", {
          method: "POST",
          anonymous: true,
          json: { token, password },
        });
        navigate("/login?reset=success", true);
      } else {
        if (register)
          await authActions.register(name, email, password, invitation);
        else await authActions.login(email, password);
        const destination = params.get("next");
        navigate(
          destination?.startsWith("/") && !destination.startsWith("//")
            ? destination
            : "/",
          true,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-atmosphere" aria-hidden="true" />
      <header className="auth-header">
        <Brand />
        <span>YOUR MUSIC. YOUR WORLD.</span>
      </header>
      <main className="auth-layout">
        <div className="auth-story">
          <span className="eyebrow">A SPACE THAT SOUNDS LIKE YOU</span>
          <h2>
            Every feeling.
            <br />A soundtrack.
          </h2>
          <p>
            A private collection. Your favorite people.
            <br />
            Music that means something.
          </p>
          <div className="auth-covers">
            <img src="/artwork/between-the-tides.webp" alt="" />
            <img src="/artwork/golden-hour.jpg" alt="" />
            <img src="/artwork/into-the-blue.jpg" alt="" />
          </div>
          <span className="auth-private">
            <LockKeyhole size={14} /> A private music library
          </span>
        </div>
        <motion.section
          className="auth-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <span className="eyebrow">
            {register
              ? "BY INVITATION"
              : reset || forgot
                ? "ACCOUNT RECOVERY"
                : "COME ON IN"}
          </span>
          <h1>{title}</h1>
          <p>
            {register
              ? "A little space for all the songs you love."
              : reset
                ? "Choose a new password for your account."
                : forgot
                  ? "Your vault owner can help you recover your account."
                  : "Sign in and pick up where you left off."}
          </p>
          {params.get("reset") === "success" && (
            <p className="form-success" role="status">
              Password updated. Sign in with your new password.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {forgot ? (
            <div className="auth-guidance">
              <p>
                Ask the owner or an administrator for a private recovery link.
                The link lets you choose a new password and expires after one
                hour.
              </p>
              <button className="text-link" onClick={() => navigate("/login")}>
                <ArrowLeft size={15} /> Back to sign in
              </button>
            </div>
          ) : blocked ? (
            <div className="auth-guidance">
              <p>
                {register
                  ? invitation
                    ? "Checking your invitation… If it has expired, ask the owner for a new link."
                    : "Ask the owner for an invitation link to create your account."
                  : "Open the recovery link provided by your vault owner."}
              </p>
              <button className="text-link" onClick={() => navigate("/login")}>
                Back to sign in <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="vault-form">
              {register && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {!reset && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    readOnly={register}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              <label>
                {reset ? "New password" : "Password"}
                <div className="password-field">
                  <input
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      register || reset ? "new-password" : "current-password"
                    }
                    required
                    minLength={register || reset ? 10 : 1}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {(register || reset) && (
                <>
                  <small className="form-hint">
                    Use at least 10 characters.
                  </small>
                  <label>
                    Confirm password
                    <input
                      name="confirm-password"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                </>
              )}
              {!register && !reset && (
                <button
                  className="text-link auth-forgot"
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot your password?
                </button>
              )}
              <button className="primary-button auth-submit" disabled={busy}>
                {busy
                  ? "One moment…"
                  : reset
                    ? "Update password"
                    : register
                      ? "Create your account"
                      : "Sign in"}
                <ArrowRight size={17} />
              </button>
              {register && (
                <button
                  className="text-link"
                  type="button"
                  onClick={() => navigate("/login")}
                >
                  Already a member? Sign in
                </button>
              )}
            </form>
          )}
          {!register && !reset && !forgot && (
            <div className="auth-invite-note">
              <LockKeyhole size={14} />
              <span>New here? Accounts are created by invitation.</span>
            </div>
          )}
        </motion.section>
      </main>
      <footer className="auth-footer">A quieter place for your music.</footer>
    </div>
  );
}
