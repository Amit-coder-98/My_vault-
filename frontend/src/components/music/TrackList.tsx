import { Heart, Pause, Play } from "lucide-react";
import type { Track } from "../../types/music";
import { albumById } from "../../data/library";
import { formatTime } from "../../lib/format";
import { playerActions, usePlayer } from "../../lib/player-store";
import { AlbumArt } from "./AlbumArt";

export function TrackList({
  songs,
  compact = false,
}: {
  songs: Track[];
  compact?: boolean;
}) {
  const player = usePlayer();
  return (
    <div className={`track-list ${compact ? "track-list-compact" : ""}`}>
      {!compact && (
        <div className="track-list-head">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span>Time</span>
          <span />
        </div>
      )}
      {songs.map((track, index) => {
        const current = player.trackId === track.id;
        return (
          <div
            className={`track-row ${current ? "current-track" : ""}`}
            key={track.id}
          >
            <button
              className="track-number"
              aria-label={`${current && player.wantsPlayback ? "Pause" : "Play"} ${track.title}`}
              onClick={() =>
                current
                  ? playerActions.toggle()
                  : playerActions.play(
                      track.id,
                      songs.map((t) => t.id),
                    )
              }
            >
              <span className="row-index">
                {current && player.isPlaying ? (
                  <span className="tiny-equalizer" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <span className="row-play">
                {current && player.wantsPlayback ? (
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
              </span>
            </button>
            <button
              className="track-info"
              onClick={() =>
                current
                  ? playerActions.toggle()
                  : playerActions.play(
                      track.id,
                      songs.map((t) => t.id),
                    )
              }
              aria-label={`Select ${track.title}`}
            >
              <AlbumArt album={albumById[track.albumId]} lettering={false} />
              <span>
                <strong>{track.title}</strong>
                <small>{track.artist}</small>
              </span>
            </button>
            {!compact && (
              <span className="track-album">
                {albumById[track.albumId].title}
              </span>
            )}
            <span className="track-duration">{formatTime(track.duration)}</span>
            <button
              className={`track-favorite icon-button ${player.favorites.has(track.id) ? "is-active" : ""}`}
              aria-label={`${player.favorites.has(track.id) ? "Remove" : "Add"} ${track.title} ${player.favorites.has(track.id) ? "from" : "to"} favorites`}
              aria-pressed={player.favorites.has(track.id)}
              onClick={() => playerActions.toggleFavorite(track.id)}
            >
              <Heart
                size={16}
                fill={player.favorites.has(track.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
