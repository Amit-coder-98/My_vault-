import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { labels, refreshLabels, useLibrary } from "../../data/library";
import { api, notify } from "../../lib/api";
import { useTask } from "../../hooks/useResource";
import type { Label } from "../../types/api";
import {
  FormError,
  ManagementDialog,
} from "../../components/ui/ManagementDialog";
export function AdminLabels() {
  useLibrary();
  const [kind, setKind] = useState<Label["kind"]>("mood");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Label | null>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);
  const task = useTask();
  return (
    <>
      <div inert={!!deleting}>
        <section className="admin-surface">
          <span className="eyebrow">A LANGUAGE FOR YOUR LIBRARY</span>
          <h2>Give every song a place.</h2>
          <p>
            Create the feelings, styles and languages your collection needs. The
            same song can have more than one feeling.
          </p>
          <form
            className="inline-form label-create"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await api(
                  editing ? `/admin/labels/${editing.id}` : "/admin/labels",
                  { method: editing ? "PATCH" : "POST", json: { kind, name } },
                );
                await refreshLabels();
                setName("");
                setEditing(null);
                notify(editing ? "Label updated." : "New label added.");
              });
            }}
          >
            <select
              aria-label="Label type"
              value={kind}
              disabled={!!editing}
              onChange={(e) => setKind(e.target.value as Label["kind"])}
            >
              <option value="mood">Mood / feeling</option>
              <option value="genre">Genre / style</option>
              <option value="language">Language</option>
            </select>
            <input
              aria-label="Label name"
              placeholder="e.g. Road trip, Rap or English"
              value={name}
              maxLength={60}
              required
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary-button" disabled={task.busy}>
              <Plus size={15} />
              {editing ? "Save label" : "Create label"}
            </button>
            {editing && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setName("");
                }}
              >
                Cancel
              </button>
            )}
          </form>
          <FormError message={task.error} />
        </section>
        <div className="label-groups">
          {(["mood", "genre", "language"] as const).map((type) => (
            <section className="admin-surface" key={type}>
              <h2>
                {type === "mood"
                  ? "Moods & feelings"
                  : type === "genre"
                    ? "Genres & styles"
                    : "Languages"}
              </h2>
              {labels
                .filter((l) => l.kind === type)
                .map((label) => (
                  <div className="label-row" key={label.id}>
                    <div>
                      <strong>{label.name}</strong>
                      <small>{label.count ?? 0} published songs</small>
                    </div>
                    <button
                      aria-label={`Rename ${label.name}`}
                      className="icon-button"
                      onClick={() => {
                        setEditing(label);
                        setKind(label.kind);
                        setName(label.name);
                        window.scrollTo({ top: 0, behavior: "instant" });
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label={`Remove ${label.name}`}
                      className="icon-button"
                      onClick={() => {
                        task.clear();
                        setDeleting(label);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </div>
      {deleting && (
        <ManagementDialog
          title={`Remove ${deleting.name}?`}
          onClose={() => setDeleting(null)}
        >
          <p>A label can be removed when no songs or smart playlists use it.</p>
          <FormError message={task.error} />
          <div className="form-actions">
            <button
              className="secondary-button"
              onClick={() => setDeleting(null)}
            >
              Keep label
            </button>
            <button
              className="danger-button"
              disabled={task.busy}
              onClick={() => {
                void task.run(async () => {
                  await api(`/admin/labels/${deleting.id}`, {
                    method: "DELETE",
                  });
                  await refreshLabels();
                  setDeleting(null);
                });
              }}
            >
              Remove label
            </button>
          </div>
        </ManagementDialog>
      )}
    </>
  );
}
