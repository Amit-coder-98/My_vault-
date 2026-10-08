import { Disc3, Heart, Search, Plus } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import type { Album, LibraryCategory, Playlist, View } from "../types/music";
import {
  albums,
  albumById,
  artists,
  playlists,
  tracks,
  demoMode,
  labels,
} from "../data/library";
import { usePlayer } from "../lib/player-store";
import { AlbumCard } from "../components/music/AlbumCard";
import { AlbumArt } from "../components/music/AlbumArt";
import { PlaylistCard } from "../components/music/PlaylistCard";
import { TrackList } from "../components/music/TrackList";
import { revealTransition } from "../animations/config";
import { PlaylistEditor } from "../components/music/PlaylistEditor";

export function CollectionPage({
  view,
  category,
  onCategory,
  onAlbum,
  onPlaylist,
  onArtist,
}: {
  view: Exclude<View, "home">;
  category: LibraryCategory;
  onCategory: (category: LibraryCategory) => void;
  onAlbum: (album: Album) => void;
  onPlaylist: (playlist: Playlist) => void;
  onArtist: (name: string) => void;
}) {
  const player = usePlayer();
  const [filter, setFilter] = useState("");
  const [mood, setMood] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [creating, setCreating] = useState(false);
  const songs = (
    view === "favorites"
      ? tracks.filter((t) => player.favorites.has(t.id))
      : tracks
  )
    .filter(
      (t) =>
        (!mood || t.moodIds?.includes(mood)) &&
        (!genre || t.genreIds?.includes(genre)) &&
        (!language || t.languageId === language),
    )
    .filter((t) =>
      `${t.title} ${t.artist} ${albumById[t.albumId].title}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={revealTransition}
    >
      <div className="page-heading collection-heading">
        <div>
          <span className="eyebrow">ALL YOUR FAVORITE FEELINGS</span>
          <h1>
            {view === "library"
              ? "Your library"
              : view === "favorites"
                ? "A little closer to heart"
                : "Your moments, on repeat"}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {view === "library"
              ? "A collection that could only be yours."
              : view === "favorites"
                ? `${player.favorites.size} songs you keep coming back to.`
                : "The right music, for whatever the day brings."}
          </p>
        </div>
        <span className="collection-heading-icon">
          {view === "favorites" ? (
            <Heart size={36} strokeWidth={1} />
          ) : (
            <Disc3 size={36} strokeWidth={1} />
          )}
        </span>
      </div>
      {view === "library" && (
        <div
          className="collection-tabs"
          role="tablist"
          aria-label="Library categories"
        >
          {(["songs", "albums", "artists", "playlists"] as const).map(
            (item) => (
              <button
                key={item}
                role="tab"
                id={`tab-${item}`}
                aria-controls="collection-content"
                aria-selected={category === item}
                onClick={() => {
                  onCategory(item);
                  setFilter("");
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                    return;
                  event.preventDefault();
                  const items: LibraryCategory[] = [
                    "songs",
                    "albums",
                    "artists",
                    "playlists",
                  ];
                  const next =
                    items[
                      (items.indexOf(item) +
                        (event.key === "ArrowRight" ? 1 : 3)) %
                        4
                    ];
                  onCategory(next);
                  setFilter("");
                  document.getElementById(`tab-${next}`)?.focus();
                }}
                tabIndex={category === item ? 0 : -1}
                className={category === item ? "selected" : ""}
              >
                {category === item && (
                  <motion.span
                    layoutId="collection-tab"
                    transition={revealTransition}
                  />
                )}
                {item}
              </button>
            ),
          )}
        </div>
      )}
      <div
        id="collection-content"
        role={view === "library" ? "tabpanel" : undefined}
        aria-labelledby={view === "library" ? `tab-${category}` : undefined}
      >
        {view === "playlists" ||
        (view === "library" && category === "playlists") ? (
          <>
            <div className="playlist-tools">
              {!demoMode && (
                <button
                  className="secondary-button"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={16} /> Create playlist
                </button>
              )}
            </div>
            <div className="playlist-grid collection-playlists">
              {playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  onOpen={onPlaylist}
                />
              ))}
            </div>
            {!playlists.length && (
              <div className="empty-state">
                <h2>Your moments start here.</h2>
                <p>
                  Create a playlist or let a smart playlist follow your favorite
                  feelings.
                </p>
              </div>
            )}
            {creating && <PlaylistEditor onClose={() => setCreating(false)} />}
          </>
        ) : view === "library" && category === "albums" ? (
          <div className="album-grid">
            {albums.map((album) => (
              <AlbumCard album={album} key={album.id} onOpen={onAlbum} />
            ))}
          </div>
        ) : view === "library" && category === "artists" ? (
          <div className="artist-grid">
            {artists.map((artist) => (
              <button
                className="artist-card"
                key={artist.id}
                onClick={() => onArtist(artist.name)}
              >
                <AlbumArt album={albumById[artist.albumId]} lettering={false} />
                <strong>{artist.name}</strong>
                <span>{artist.genre}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="list-toolbar">
              <span>
                {songs.length} {songs.length === 1 ? "song" : "songs"}
              </span>
              <label className="list-filter">
                <Search size={15} />
                <input
                  placeholder="Filter this collection"
                  aria-label="Filter this collection"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
            </div>
            {!demoMode && (
              <div className="library-filters">
                {(
                  [
                    {
                      kind: "mood",
                      value: mood,
                      change: setMood,
                      title: "feeling",
                    },
                    {
                      kind: "genre",
                      value: genre,
                      change: setGenre,
                      title: "style",
                    },
                    {
                      kind: "language",
                      value: language,
                      change: setLanguage,
                      title: "language",
                    },
                  ] as const
                ).map((field) => (
                  <select
                    aria-label={`Filter by ${field.title}`}
                    key={field.kind}
                    value={field.value}
                    onChange={(e) => field.change(e.target.value)}
                  >
                    <option value="">Any {field.title}</option>
                    {labels
                      .filter((l) => l.kind === field.kind)
                      .map((label) => (
                        <option value={label.id} key={label.id}>
                          {label.name}
                        </option>
                      ))}
                  </select>
                ))}
              </div>
            )}
            {songs.length ? (
              <TrackList songs={songs} />
            ) : (
              <div className="empty-state">
                <Heart size={28} />
                <h2>
                  {filter ? "No songs found" : "Your favorites start here"}
                </h2>
                <p>
                  {filter
                    ? "Try another title, artist, or album."
                    : "Tap a heart on a song to keep it close."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
