import { useState } from "react";
import { ArrowLeft, LogOut, Monitor, ShieldCheck } from "lucide-react";
import { api, notify } from "../lib/api";
import { authActions, expireSession, useAuth } from "../lib/auth-store";
import { navigate } from "../lib/router";
import { useResource, useTask } from "../hooks/useResource";
import type { Session, User } from "../types/api";
import { FormError } from "../components/ui/ManagementDialog";
export function AccountPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const sessions = useResource<Session[]>("/me/sessions", []);
  const profileTask = useTask(),
    passwordTask = useTask(),
    sessionTask = useTask();
  return (
    <div className="account-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>
            Your space<span className="heading-dot">.</span>
          </h1>
          <p>A few details that make this vault yours.</p>
        </div>
        <button className="text-link" onClick={() => navigate("/")}>
          <ArrowLeft size={15} /> Back to music
        </button>
      </div>
      <div className="account-grid">
        <section className="admin-surface">
          <h2>Your profile</h2>
          <form
            className="vault-form"
            onSubmit={(e) => {
              e.preventDefault();
              void profileTask.run(async () => {
                const next = await api<User>("/me", {
                  method: "PATCH",
                  json: { name },
                });
                authActions.updateUser(next);
                notify("Your profile was updated.");
              });
            }}
          >
            <label>
              Display name
              <input
                value={name}
                required
                minLength={2}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input value={user?.email ?? ""} readOnly type="email" />
            </label>
            <span className="role-label">
              <ShieldCheck size={15} />
              {user?.role}
            </span>
            {user?.role !== "user" && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate("/admin")}
              >
                Manage vault
              </button>
            )}
            <FormError message={profileTask.error} />
            <button className="primary-button" disabled={profileTask.busy}>
              Save profile
            </button>
          </form>
        </section>
        <section className="admin-surface">
          <h2>Change password</h2>
          <p>Changing your password signs out every active session.</p>
          <form
            className="vault-form"
            onSubmit={(e) => {
              e.preventDefault();
              void passwordTask.run(async () => {
                if (password !== confirm)
                  throw new Error("The passwords do not match.");
                await api("/me/password", {
                  method: "POST",
                  json: { current_password: current, password },
                });
                expireSession();
                navigate("/login?reset=success", true);
              });
            }}
          >
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                required
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={confirm}
                required
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <FormError message={passwordTask.error} />
            <button className="secondary-button" disabled={passwordTask.busy}>
              Update password
            </button>
          </form>
        </section>
      </div>
      <section className="admin-surface">
        <h2>Where you’re signed in</h2>
        <FormError message={sessions.error || sessionTask.error} />
        {sessions.data.map((session) => (
          <div className="session-row" key={session.id}>
            <Monitor size={20} />
            <div>
              <strong>
                {session.current ? "This device" : "Another device"}
              </strong>
              <small>{session.device}</small>
              <small>
                Signed in {new Date(session.created_at).toLocaleString()}
              </small>
            </div>
            <button
              className="secondary-button"
              disabled={sessionTask.busy}
              onClick={() => {
                void sessionTask.run(async () => {
                  await api(`/me/sessions/${session.id}`, { method: "DELETE" });
                  if (session.current) {
                    expireSession();
                    navigate("/login", true);
                  } else {
                    sessions.reload();
                    notify("Device signed out.");
                  }
                });
              }}
            >
              Sign out
            </button>
          </div>
        ))}
        <button
          className="danger-button account-logout"
          disabled={sessionTask.busy}
          onClick={() => {
            void sessionTask.run(async () => {
              await authActions.logout();
              navigate("/login", true);
            });
          }}
        >
          <LogOut size={16} /> Sign out of your vault
        </button>
      </section>
    </div>
  );
}
