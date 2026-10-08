import { useState } from "react";
import { ArrowDown, ArrowUp, Search, Trash2 } from "lucide-react";
import {
  apiPlaylists,
  labels,
  reloadPlaylists,
  tracks,
} from "../../data/library";
import { api, notify } from "../../lib/api";
import { useTask } from "../../hooks/useResource";
import { FormError, ManagementDialog } from "../ui/ManagementDialog";
export function PlaylistEditor({
  playlistId,
  onClose,
}: {
  playlistId?: string;
  onClose: () => void;
}) {
  const playlist = apiPlaylists.find((p) => p.id === playlistId);
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [selected, setSelected] = useState(playlist?.track_ids ?? []);
  const [smart, setSmart] = useState(playlist?.smart ?? false);
  const [mood, setMood] = useState(playlist?.mood_id ?? "");
  const [genre, setGenre] = useState(playlist?.genre_id ?? "");
  const [language, setLanguage] = useState(playlist?.language_id ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(
    playlist?.favorites_only ?? false,
  );
  const [search, setSearch] = useState("");
  const [remove, setRemove] = useState(false);
  const task = useTask();
  function move(index: number, direction: number) {
    const next = [...selected];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setSelected(next);
  }
  return (
    <ManagementDialog
      title={playlist ? "Make this moment yours" : "Create a playlist"}
      onClose={onClose}
    >
      <form
        className="vault-form"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            await api(
              playlist ? `/me/playlists/${playlist.id}` : "/me/playlists",
              {
                method: playlist ? "PATCH" : "POST",
                json: {
                  title,
                  description,
                  track_ids: smart ? [] : selected,
                  smart,
                  mood_id: mood || null,
                  genre_id: genre || null,
                  language_id: language || null,
                  favorites_only: favoritesOnly,
                },
              },
            );
            await reloadPlaylists();
            notify(
              playlist ? "Playlist updated." : "Your new playlist is ready.",
            );
            onClose();
          });
        }}
      >
        <label>
          Name
          <input
            autoFocus
            value={title}
            required
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            maxLength={1000}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={smart}
            onChange={(e) => setSmart(e.target.checked)}
          />{" "}
          Make this a smart playlist
        </label>
        {smart ? (
          <>
            <p className="form-hint">
              Songs matching these rules are added automatically as your library
              grows.
            </p>
            {(
              [
                {
                  kind: "mood",
                  title: "Feeling",
                  value: mood,
                  setter: setMood,
                },
                {
                  kind: "genre",
                  title: "Style",
                  value: genre,
                  setter: setGenre,
                },
                {
                  kind: "language",
                  title: "Language",
                  value: language,
                  setter: setLanguage,
                },
              ] as const
            ).map((field) => (
              <label key={field.kind}>
                {field.title}
                <select
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                >
                  <option value="">Any {field.title.toLowerCase()}</option>
                  {labels
                    .filter((l) => l.kind === field.kind)
                    .map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
              />{" "}
              Only my favorites
            </label>
          </>
        ) : (
          <>
            <label className="admin-search">
              <Search size={15} />
              <input
                aria-label="Find playlist songs"
                placeholder="Find songs to add"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="playlist-song-picker">
              {tracks
                .filter((t) =>
                  `${t.title} ${t.artist}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((track) => (
                  <label className="checkbox-label" key={track.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(track.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, track.id]
                            : selected.filter((id) => id !== track.id),
                        )
                      }
                    />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                  </label>
                ))}
            </div>
            {selected.length > 0 && (
              <div className="playlist-order">
                <span className="eyebrow">
                  YOUR ORDER · {selected.length} SONGS
                </span>
                {selected.map((id, index) => (
                  <div key={id}>
                    <span>
                      {tracks.find((t) => t.id === id)?.title ??
                        "Unavailable song"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Move song ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move song ${index + 1} down`}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <FormError message={task.error} />
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={task.busy}>
            {task.busy ? "Saving…" : "Save playlist"}
          </button>
        </div>
        {playlist && (
          <div className="playlist-remove">
            {remove ? (
              <>
                <p>Remove this playlist? Your songs stay in the vault.</p>
                <button
                  type="button"
                  className="danger-button"
                  disabled={task.busy}
                  onClick={() => {
                    void task.run(async () => {
                      await api(`/me/playlists/${playlist.id}`, {
                        method: "DELETE",
                      });
                      await reloadPlaylists();
                      onClose();
                      notify("Playlist removed.");
                    });
                  }}
                >
                  Remove playlist
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setRemove(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-link"
                onClick={() => setRemove(true)}
              >
                <Trash2 size={14} /> Remove playlist
              </button>
            )}
          </div>
        )}
      </form>
    </ManagementDialog>
  );
}
