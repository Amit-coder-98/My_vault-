import { useState } from "react";
import { Pencil } from "lucide-react";
import { useResource, useTask } from "../../hooks/useResource";
import { loadLibrary } from "../../data/library";
import { api, notify } from "../../lib/api";
import {
  FormError,
  ManagementDialog,
} from "../../components/ui/ManagementDialog";
interface Group {
  name: string;
  count: number;
  published: number;
}
export function AdminCredits() {
  const [kind, setKind] = useState<"artist" | "album">("artist");
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [merge, setMerge] = useState(false);
  const resource = useResource<Group[]>(
    `/admin/metadata-groups?kind=${kind}`,
    [],
  );
  const task = useTask();
  return (
    <>
      <section className="admin-surface" inert={!!editing}>
        <div className="admin-section-heading">
          <div>
            <span className="eyebrow">THE PEOPLE & THE RECORDS</span>
            <h2>Artists and albums</h2>
          </div>
          <select
            aria-label="Manage artists or albums"
            value={kind}
            onChange={(e) => setKind(e.target.value as "artist" | "album")}
          >
            <option value="artist">Artists</option>
            <option value="album">Albums</option>
          </select>
        </div>
        <p>
          Names come from your song metadata. Correct a name across its songs,
          or combine duplicate groups.
        </p>
        <FormError message={resource.error} />
        {resource.loading && <p role="status">Loading your collection…</p>}
        {!resource.loading &&
          resource.data.map((group) => (
            <div className="label-row" key={group.name}>
              <div>
                <strong>{group.name}</strong>
                <small>
                  {group.count} songs · {group.published} published
                </small>
              </div>
              <button
                className="icon-button"
                aria-label={`Edit ${kind} ${group.name}`}
                onClick={() => {
                  setEditing(group);
                  setName(group.name);
                  setMerge(false);
                  task.clear();
                }}
              >
                <Pencil size={16} />
              </button>
            </div>
          ))}
        {!resource.loading && !resource.data.length && (
          <p>Artists and albums appear when songs are imported.</p>
        )}
      </section>
      {editing && (
        <ManagementDialog
          title={`Edit ${kind}`}
          onClose={() => setEditing(null)}
        >
          <form
            className="vault-form"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await api("/admin/metadata-groups", {
                  method: "PATCH",
                  json: { kind, name: editing.name, new_name: name, merge },
                });
                await loadLibrary();
                resource.reload();
                setEditing(null);
                notify(`${editing.count} songs updated.`);
              });
            }}
          >
            <p className="form-hint">
              This updates the {kind} name on {editing.count} songs.
            </p>
            <label>
              Name
              <input
                value={name}
                maxLength={200}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={merge}
                onChange={(e) => setMerge(e.target.checked)}
              />{" "}
              Merge if this name already exists
            </label>
            <FormError message={task.error} />
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={task.busy}>
                Save name
              </button>
            </div>
          </form>
        </ManagementDialog>
      )}
    </>
  );
}
