import { useState } from "react";
import { Copy, KeyRound, Link2, Shield, Trash2, UserPlus } from "lucide-react";
import { api, notify } from "../../lib/api";
import { useAuth } from "../../lib/auth-store";
import { useResource, useTask } from "../../hooks/useResource";
import type { Invitation, User } from "../../types/api";
import {
  FormError,
  ManagementDialog,
} from "../../components/ui/ManagementDialog";
export function AdminUsers() {
  const { user: actor } = useAuth();
  const users = useResource<User[]>("/admin/users", []);
  const invites = useResource<Invitation[]>("/admin/invitations", []);
  const [email, setEmail] = useState("");
  const [clock] = useState(() => Date.now());
  const [link, setLink] = useState("");
  const [deleting, setDeleting] = useState<User | null>(null);
  const task = useTask();
  return (
    <>
      <div inert={!!deleting}>
        <section className="admin-surface invite-surface">
          <span className="eyebrow">GOOD MUSIC. GOOD COMPANY.</span>
          <h2>Make a little room for a friend.</h2>
          <p>
            Create a private invitation. Your friend chooses their own password;
            the link works once and expires in three days.
          </p>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                const result = await api<{ url: string }>(
                  "/admin/invitations",
                  { method: "POST", json: { email } },
                );
                setLink(result.url);
                invites.reload();
                setEmail("");
              });
            }}
          >
            <input
              type="email"
              required
              aria-label="Friend's email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="primary-button" disabled={task.busy}>
              <UserPlus size={16} /> Invite friend
            </button>
          </form>
          {link && (
            <div className="private-link">
              <Link2 size={17} />
              <input
                readOnly
                aria-label="Private account link"
                value={link}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="secondary-button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(link)
                    .then(() =>
                      notify(
                        "Private link copied. Share it with the intended person.",
                      ),
                    )
                    .catch(() => notify("Select and copy the link above."));
                }}
              >
                <Copy size={15} /> Copy
              </button>
            </div>
          )}
          <FormError message={task.error} />
        </section>
        <FormError message={users.error || invites.error} />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Access</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const protectedUser =
                  user.role === "owner" ||
                  user.id === actor?.id ||
                  (user.role === "admin" && actor?.role !== "owner");
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      {actor?.role === "owner" && !protectedUser ? (
                        <select
                          aria-label={`Role for ${user.name}`}
                          value={user.role}
                          disabled={task.busy}
                          onChange={(e) => {
                            void task.run(async () => {
                              await api(`/admin/users/${user.id}`, {
                                method: "PATCH",
                                json: { role: e.target.value },
                              });
                              users.reload();
                            });
                          }}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="role-label">
                          <Shield size={13} />
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${user.active ? "published" : "archived"}`}
                      >
                        {user.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {protectedUser ? (
                        <small>Protected account</small>
                      ) : (
                        <div className="table-actions">
                          <button
                            disabled={task.busy}
                            onClick={() => {
                              void task.run(async () => {
                                await api(`/admin/users/${user.id}`, {
                                  method: "PATCH",
                                  json: { active: !user.active },
                                });
                                users.reload();
                              });
                            }}
                          >
                            {user.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            disabled={task.busy}
                            aria-label={`Recovery link for ${user.name}`}
                            onClick={() => {
                              void task.run(async () => {
                                const result = await api<{ url: string }>(
                                  `/admin/users/${user.id}/recovery`,
                                  { method: "POST" },
                                );
                                setLink(result.url);
                                notify(
                                  "Recovery link created. It expires in one hour.",
                                );
                                window.scrollTo({
                                  top: 0,
                                  behavior: "instant",
                                });
                              });
                            }}
                          >
                            <KeyRound size={16} />
                          </button>
                          <button
                            disabled={task.busy}
                            onClick={() => {
                              void task.run(async () => {
                                await api(
                                  `/admin/users/${user.id}/revoke-sessions`,
                                  { method: "POST" },
                                );
                                notify(`${user.name}'s sessions were revoked.`);
                              });
                            }}
                          >
                            Sign out
                          </button>
                          <button
                            aria-label={`Remove ${user.name}`}
                            onClick={() => {
                              task.clear();
                              setDeleting(user);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="admin-surface">
          <h2>Invitations</h2>
          {invites.data.length ? (
            invites.data.map((invite) => (
              <div className="invitation-row" key={invite.id}>
                <div>
                  <strong>{invite.email}</strong>
                  <small>
                    Expires {new Date(invite.expires_at).toLocaleString()}
                  </small>
                </div>
                <span className="status-pill">
                  {invite.used
                    ? "Accepted"
                    : new Date(invite.expires_at).getTime() < clock
                      ? "Expired"
                      : "Pending"}
                </span>
                {!invite.used && (
                  <button
                    className="secondary-button"
                    disabled={task.busy}
                    onClick={() => {
                      void task.run(async () => {
                        await api(`/admin/invitations/${invite.id}`, {
                          method: "DELETE",
                        });
                        invites.reload();
                      });
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>No invitations yet.</p>
          )}
        </section>
      </div>
      {deleting && (
        <ManagementDialog
          title={`Remove ${deleting.name}?`}
          onClose={() => setDeleting(null)}
        >
          <p>
            This removes the account, their personal playlists, favorites and
            history, and signs them out. Shared songs stay in your library.
          </p>
          <FormError message={task.error} />
          <div className="form-actions">
            <button
              className="secondary-button"
              onClick={() => setDeleting(null)}
            >
              Keep account
            </button>
            <button
              className="danger-button"
              disabled={task.busy}
              onClick={() => {
                void task.run(async () => {
                  await api(`/admin/users/${deleting.id}`, {
                    method: "DELETE",
                  });
                  users.reload();
                  setDeleting(null);
                  notify("Account removed.");
                });
              }}
            >
              Remove account
            </button>
          </div>
        </ManagementDialog>
      )}
    </>
  );
}
