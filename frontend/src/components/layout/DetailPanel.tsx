import { Headphones, Play, Sparkles, X } from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import {
  albums,
  albumById,
  albumTracks,
  tracks,
  trackById,
  demoMode,
  apiPlaylists,
  playlists,
} from "../../data/library";
import type { Album, Playlist, Track } from "../../types/music";
import { playerActions } from "../../lib/player-store";
import { useDialog } from "../../hooks/useDialog";
import { AlbumArt } from "../music/AlbumArt";
import { TrackList } from "../music/TrackList";
import { revealTransition } from "../../animations/config";
import { useAuth } from "../../lib/auth-store";

export type Panel =
  | { kind: "album"; album: Album }
  | { kind: "playlist"; playlist: Playlist }
  | { kind: "artist"; artist: string }
  | { kind: "preferences" };

export function DetailPanel({
  panel,
  onClose,
  atmosphere,
  onAtmosphere,
  onEditPlaylist,
}: {
  panel: Panel;
  onClose: () => void;
  atmosphere: boolean;
  onAtmosphere: (enabled: boolean) => void;
  onEditPlaylist?: (id: string) => void;
}) {
  const isPresent = useIsPresent();
  const { user } = useAuth();
  const ref = useDialog(onClose, isPresent);
  let songs: Track[] = [],
    title = "",
    description = "",
    art: Album | undefined;
  if (panel.kind === "album") {
    songs = albumTracks(panel.album.id);
    title = panel.album.title;
    description = `${panel.album.artist} · ${panel.album.year} · ${panel.album.genre}`;
    art = panel.album;
  }
  if (panel.kind === "playlist") {
    const playlist =
      playlists.find((p) => p.id === panel.playlist.id) ?? panel.playlist;
    songs = playlist.trackIds.map((id) => trackById[id]).filter(Boolean);
    title = playlist.title;
    description = playlist.description;
    art = albumById[playlist.coverAlbumId];
  }
  if (panel.kind === "artist") {
    songs = tracks.filter((t) =>
      t.artist.toLowerCase().includes(panel.artist.toLowerCase()),
    );
    title = panel.artist;
    description = `${songs.length} songs in your vault`;
    art = albumById[songs[0]?.albumId] ?? albums[0];
  }

  if (panel.kind === "preferences") {
    title = "Make yourself at home";
    description = "A few things to set the mood.";
  }
  return (
    <motion.div
      className="dialog-backdrop panel-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={revealTransition}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        className="detail-panel"
        ref={ref}
        role={isPresent ? "dialog" : undefined}
        aria-modal={isPresent}
        aria-hidden={!isPresent || undefined}
        inert={!isPresent}
        aria-labelledby="panel-title"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={revealTransition}
        data-lenis-prevent
      >
        <header className="panel-header">
          <span className="eyebrow">
            {panel.kind === "preferences"
              ? "YOUR LISTENING SPACE"
              : "FROM YOUR COLLECTION"}
          </span>
          <button
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="panel-content">
          {art && (
            <div className="detail-artwork">
              <AlbumArt album={art} priority />
            </div>
          )}
          <h2 id="panel-title">{title}</h2>
          <p className="panel-description">{description}</p>
          {panel.kind === "preferences" ? (
            <div className="preferences-content">
              <div className="preferences-profile">
                <span className="profile-avatar">
                  {(user?.name ?? "Amit").slice(0, 1)}
                </span>
                <span>
                  <strong>{user?.name ?? "Amit"}'s vault</strong>
                  <small>Your personal music universe</small>
                </span>
              </div>
              <div className="preference-row">
                <span>
                  <strong>
                    <Sparkles size={17} /> Ambient particles
                  </strong>
                  <small>
                    A little depth in the immersive player.
                    <br />
                    Available on capable desktop devices.
                  </small>
                </span>
                <button
                  className={`toggle ${atmosphere ? "toggle-on" : ""}`}
                  role="switch"
                  aria-checked={atmosphere}
                  aria-label="Ambient particles"
                  onClick={() => onAtmosphere(!atmosphere)}
                >
                  <span />
                </button>
              </div>
              <div className="preference-info">
                <Headphones size={20} />
                <div>
                  <strong>
                    {demoMode
                      ? "A preview of your music world"
                      : "Your own little music universe"}
                  </strong>
                  <p>
                    {demoMode
                      ? "Listen to six original demo recordings in a fictional library. Your music and preferences stay in this session."
                      : "A shared collection, with favorites, playlists and listening preferences that belong to you."}
                  </p>
                </div>
              </div>
              <div className="keyboard-help">
                <span className="eyebrow">LITTLE SHORTCUTS</span>
                <p>
                  <span>Play / pause</span>
                  <kbd>SPACE</kbd>
                </p>
                <p>
                  <span>Find your music</span>
                  <kbd>CTRL / ⌘ K</kbd>
                </p>
                <p>
                  <span>Close player or panel</span>
                  <kbd>ESC</kbd>
                </p>
                <p>
                  <span>Previous / next track</span>
                  <kbd>P / N</kbd>
                </p>
                <p>
                  <span>Seek backward / forward</span>
                  <kbd>← / →</kbd>
                </p>
                <p>
                  <span>Mute / favorite</span>
                  <kbd>M / F</kbd>
                </p>
              </div>
            </div>
          ) : (
            <>
              {panel.kind === "playlist" &&
                apiPlaylists.some((p) => p.id === panel.playlist.id) && (
                  <button
                    className="secondary-button playlist-edit"
                    onClick={() => onEditPlaylist?.(panel.playlist.id)}
                  >
                    Edit playlist
                  </button>
                )}
              {songs.length > 0 && (
                <>
                  <div className="panel-play-row">
                    <button
                      className="primary-button"
                      onClick={() =>
                        playerActions.play(
                          songs[0].id,
                          songs.map((t) => t.id),
                        )
                      }
                    >
                      <Play size={16} fill="currentColor" />
                      Play collection
                    </button>
                    <span>{songs.length} songs</span>
                  </div>
                  <TrackList songs={songs} compact />
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
