import { useState } from "react";
import { Archive, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { useResource, useTask } from "../../hooks/useResource";
import { api, notify } from "../../lib/api";
import { labels, loadLibrary } from "../../data/library";
import { playerActions } from "../../lib/player-store";
import type { Song } from "../../types/api";
import { SongEditor } from "../../components/admin/SongEditor";
import {
  FormError,
  ManagementDialog,
} from "../../components/ui/ManagementDialog";
import { formatTime } from "../../lib/format";
export function AdminSongs() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Song | "new" | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMood, setBulkMood] = useState("");
  const resource = useResource<{ items: Song[]; total: number }>(
    `/admin/songs?limit=50&offset=${offset}&q=${encodeURIComponent(search)}&status=${status}`,
    { items: [], total: 0 },
  );
  const task = useTask();
  async function refresh() {
    await loadLibrary();
    playerActions.reconcileCatalog();
    resource.reload();
    setSelected([]);
  }
  return (
    <>
      <div inert={!!editing || !!deleting}>
        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={16} />
            <input
              aria-label="Search managed songs"
              placeholder="Find a song, artist or album"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <select
            aria-label="Song status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button className="primary-button" onClick={() => setEditing("new")}>
            <Plus size={16} /> Add music
          </button>
        </div>
        <FormError message={resource.error || task.error} />
        {resource.loading && <p role="status">Loading songs…</p>}
        {selected.length > 0 && (
          <div className="bulk-bar">
            <strong>{selected.length} selected</strong>
            <select
              aria-label="Bulk mood"
              value={bulkMood}
              onChange={(e) => setBulkMood(e.target.value)}
            >
              <option value="">Choose a mood</option>
              {labels
                .filter((l) => l.kind === "mood")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            <button
              className="secondary-button"
              disabled={!bulkMood || task.busy}
              onClick={() => {
                void task.run(async () => {
                  await api("/admin/songs/bulk-moods", {
                    method: "POST",
                    json: { song_ids: selected, mood_ids: [bulkMood] },
                  });
                  await refresh();
                  notify("Selected songs now use this mood.");
                });
              }}
            >
              Replace moods
            </button>
            <small>Replaces the selected songs’ mood tags.</small>
          </div>
        )}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Select</span>
                </th>
                <th>Song / artist</th>
                <th>Feelings</th>
                <th>Length</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((song) => (
                <tr key={song.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${song.title}`}
                      checked={selected.includes(song.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, song.id]
                            : selected.filter((id) => id !== song.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{song.title}</strong>
                    <small>
                      {song.artist} · {song.album}
                    </small>
                    {song.metadata_review && (
                      <span className="metadata-hint">
                        Metadata needs review
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="table-tags">
                      {song.mood_ids.map((id) => (
                        <span key={id}>
                          {labels.find((l) => l.id === id)?.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatTime(song.duration)}</td>
                  <td>
                    <span className={`status-pill ${song.status}`}>
                      {song.status}
                    </span>
                    {song.featured && <small>Featured</small>}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        title="Edit song"
                        aria-label={`Edit ${song.title}`}
                        onClick={() => setEditing(song)}
                      >
                        <Pencil size={16} />
                      </button>
                      {song.status !== "archived" ? (
                        <button
                          aria-label={`Archive ${song.title}`}
                          disabled={task.busy}
                          onClick={() => {
                            void task.run(async () => {
                              await api(`/admin/songs/${song.id}`, {
                                method: "DELETE",
                              });
                              await refresh();
                              notify(
                                "Song archived. You can restore it anytime.",
                              );
                            });
                          }}
                        >
                          <Archive size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            aria-label={`Restore ${song.title}`}
                            disabled={task.busy}
                            onClick={() => {
                              void task.run(async () => {
                                const {
                                  title,
                                  artist,
                                  album,
                                  mood_ids,
                                  genre_ids,
                                  language_id,
                                  year,
                                  description,
                                  featured,
                                } = song;
                                await api(`/admin/songs/${song.id}`, {
                                  method: "PATCH",
                                  json: {
                                    title,
                                    artist,
                                    album,
                                    mood_ids,
                                    genre_ids,
                                    language_id,
                                    year,
                                    description,
                                    featured,
                                    status: "published",
                                  },
                                });
                                await refresh();
                              });
                            }}
                          >
                            <Undo2 size={16} />
                          </button>
                          <button
                            aria-label={`Permanently delete ${song.title}`}
                            onClick={() => setDeleting(song)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!resource.loading && !resource.data.items.length && (
            <div className="admin-empty">
              <h2>{search ? "No songs found." : "A little room for music."}</h2>
              <p>
                {search
                  ? "Try another title or artist."
                  : "Upload recordings or import your folders."}
              </p>
            </div>
          )}
        </div>
        <div className="admin-pagination">
          <span>{resource.data.total} songs</span>
          <button
            className="secondary-button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <button
            className="secondary-button"
            disabled={offset + 50 >= resource.data.total}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </div>
      </div>
      {editing && (
        <SongEditor
          song={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={resource.reload}
        />
      )}
      {deleting && (
        <ManagementDialog
          title="Permanently remove this song?"
          onClose={() => setDeleting(null)}
        >
          <p>
            “{deleting.title}” will be removed from the vault, favorites and
            playlists. Its managed audio file will be deleted. Your original
            source file stays in your folder.
          </p>
          <FormError message={task.error} />
          <div className="form-actions">
            <button
              className="secondary-button"
              onClick={() => setDeleting(null)}
            >
              Keep song
            </button>
            <button
              className="danger-button"
              disabled={task.busy}
              onClick={() => {
                void task.run(async () => {
                  await api(`/admin/songs/${deleting.id}?permanent=true`, {
                    method: "DELETE",
                  });
                  await refresh();
                  setDeleting(null);
                  notify("Song permanently removed.");
                });
              }}
            >
              Delete permanently
            </button>
          </div>
        </ManagementDialog>
      )}
    </>
  );
}
