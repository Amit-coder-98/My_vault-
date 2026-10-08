import { ArrowUpRight, Play } from "lucide-react";
import type { Playlist } from "../../types/music";
import { albumById } from "../../data/library";
import { playerActions } from "../../lib/player-store";

export function PlaylistCard({
  playlist,
  onOpen,
}: {
  playlist: Playlist;
  onOpen: (playlist: Playlist) => void;
}) {
  return (
    <article
      className="playlist-card"
      style={{ "--playlist-color": playlist.color } as React.CSSProperties}
    >
      <button
        className="playlist-open"
        aria-label={`Open ${playlist.title}`}
        onClick={() => onOpen(playlist)}
      >
        <img
          src={
            albumById[playlist.coverAlbumId]?.artwork ??
            "/artwork/between-the-tides.webp"
          }
          alt=""
          loading="lazy"
        />
        <span className="playlist-tint" />
        <span className="playlist-label">{playlist.label}</span>
        <span className="playlist-card-name">{playlist.title}</span>
        <span className="playlist-count">
          {playlist.trackIds.length} songs <span> · </span> Made by you
        </span>
        <ArrowUpRight className="playlist-arrow" size={20} />
      </button>
      <button
        className="playlist-play"
        disabled={!playlist.trackIds.length}
        aria-label={`Play ${playlist.title}`}
        onClick={() =>
          playerActions.play(playlist.trackIds[0], playlist.trackIds)
        }
      >
        <Play size={17} fill="currentColor" />
      </button>
    </article>
  );
}
