import { useState } from "react";
import { labels, loadLibrary } from "../../data/library";
import { api, notify } from "../../lib/api";
import { uploadFile } from "../../lib/upload";
import { playerActions } from "../../lib/player-store";
import type { Song } from "../../types/api";
import { useTask } from "../../hooks/useResource";
import { FormError, ManagementDialog } from "../ui/ManagementDialog";
import { TagPicker } from "./TagPicker";

export function SongEditor({
  song,
  onClose,
  onSaved,
}: {
  song?: Song;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [album, setAlbum] = useState(song?.album ?? "");
  const [year, setYear] = useState(song?.year ?? 0);
  const [moods, setMoods] = useState(song?.mood_ids ?? []);
  const [genres, setGenres] = useState(song?.genre_ids ?? []);
  const [language, setLanguage] = useState(song?.language_id ?? "");
  const [status, setStatus] = useState(song?.status ?? "published");
  const [featured, setFeatured] = useState(song?.featured ?? false);
  const [description, setDescription] = useState(song?.description ?? "");
  const [storageFolder, setStorageFolder] = useState(
    song?.storage_folder ?? "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState("");
  const task = useTask();
  const metadata = {
    title,
    artist: artist || "Unknown artist",
    album: album || "Singles",
    year,
    mood_ids: moods,
    genre_ids: genres,
    language_id: language || null,
    status,
    featured,
    description,
    storage_folder: storageFolder,
  };
  return (
    <ManagementDialog
      title={song ? "Edit song" : "Add your music"}
      onClose={onClose}
    >
      <form
        className="vault-form"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            if (song) {
              await api(`/admin/songs/${song.id}`, {
                method: "PATCH",
                json: metadata,
              });
              if (cover) {
                const body = new FormData();
                body.append("cover", cover);
                await uploadFile(
                  `/admin/songs/${song.id}/artwork`,
                  body,
                  setProgress,
                );
              }
            } else {
              if (!files.length)
                throw new Error("Choose at least one audio file.");
              const saved: File[] = [];
              for (const file of files) {
                setUploading(file.name);
                setProgress(0);
                const body = new FormData();
                body.append("audio", file);
                body.append(
                  "metadata",
                  JSON.stringify({
                    ...metadata,
                    title:
                      files.length === 1 && title
                        ? title
                        : file.name.replace(/\.[^.]+$/, "").slice(0, 200),
                  }),
                );
                if (cover) body.append("cover", cover);
                try {
                  await uploadFile<Song>(
                    "/admin/songs/upload",
                    body,
                    setProgress,
                  );
                  saved.push(file);
                } catch (error) {
                  setFiles(files.filter((item) => !saved.includes(item)));
                  if (saved.length) {
                    await loadLibrary();
                    playerActions.reconcileCatalog();
                    onSaved();
                    notify(
                      `${saved.length} songs saved. The remaining files are ready to retry.`,
                    );
                  }
                  throw error;
                }
              }
            }
            await loadLibrary();
            playerActions.reconcileCatalog();
            onSaved();
            notify(
              song
                ? "Song updated."
                : `${files.length} ${files.length === 1 ? "song added" : "songs added"} to your vault.`,
            );
            onClose();
          });
        }}
      >
        {!song && (
          <label className="file-drop">
            Audio files
            <span>MP3, FLAC, M4A, OGG or WAV · up to 100 MB each</span>
            <input
              type="file"
              accept=".mp3,.flac,.m4a,.ogg,.wav"
              multiple
              required
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                setFiles(selected);
                if (selected.length === 1 && !title)
                  setTitle(
                    selected[0].name.replace(/\.[^.]+$/, "").slice(0, 200),
                  );
              }}
            />
            <small>
              {files.length
                ? `${files.length} selected`
                : "Choose your recordings"}
            </small>
          </label>
        )}
        <label>
          Song title
          <input
            value={title}
            required={!!song || files.length === 1}
            disabled={files.length > 1}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          {files.length > 1 && (
            <small className="form-hint">
              Each file gets its own title. You can edit titles after upload.
            </small>
          )}
        </label>
        <div className="form-two">
          <label>
            Artist
            <input
              value={artist}
              maxLength={200}
              placeholder="Extracted when available"
              onChange={(e) => setArtist(e.target.value)}
            />
          </label>
          <label>
            Album
            <input
              value={album}
              maxLength={200}
              placeholder="Singles"
              onChange={(e) => setAlbum(e.target.value)}
            />
          </label>
        </div>
        <TagPicker kind="mood" value={moods} onChange={setMoods} />
        <TagPicker kind="genre" value={genres} onChange={setGenres} />
        <label>
          Storage folder
          <input
            value={storageFolder}
            maxLength={240}
            readOnly={!!song}
            placeholder="Uses the first feeling, or Uploads"
            onChange={(e) => setStorageFolder(e.target.value)}
          />
          <small className="form-hint">
            {song
              ? "Artwork is saved beside this song. Editing details keeps its folder."
              : "Optional. For example Love Songs, Silent songs or Rap."}
          </small>
        </label>
        <div className="form-two">
          <label>
            Language
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="">Unknown / not set</option>
              {labels
                .filter((l) => l.kind === "language")
                .map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min={0}
              max={2200}
              value={year || ""}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          Cover image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
          />
          <small className="form-hint">
            {song
              ? "Add or replace the cover here. The audio stays the same."
              : "Optional. You can add a cover later from Edit song."}
          </small>
        </label>
        <label>
          Description
          <textarea
            value={description}
            maxLength={2000}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-two">
          <label>
            Visibility
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Song["status"])}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />{" "}
            Feature on Home
          </label>
        </div>
        {task.busy && !song && (
          <div className="upload-progress" role="status">
            <span>{uploading}</span>
            <progress value={progress} max={100} />
            <small>
              {progress < 100
                ? `Uploading ${progress}%`
                : "Processing audio and artwork…"}
            </small>
          </div>
        )}
        <FormError message={task.error} />
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={task.busy}>
            {task.busy ? "Saving…" : song ? "Save changes" : "Upload music"}
          </button>
        </div>
      </form>
    </ManagementDialog>
  );
}
