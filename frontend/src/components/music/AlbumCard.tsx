import { Play } from "lucide-react";
import type { Album } from "../../types/music";
import { albumTracks } from "../../data/library";
import { playerActions } from "../../lib/player-store";
import { AlbumArt } from "./AlbumArt";

export function AlbumCard({
  album,
  onOpen,
}: {
  album: Album;
  onOpen: (album: Album) => void;
}) {
  const songs = albumTracks(album.id);
  return (
    <article className="album-card">
      <div className="album-card-image">
        <button
          className="artwork-link"
          onClick={() => onOpen(album)}
          aria-label={`Open ${album.title}`}
        >
          <AlbumArt album={album} />
        </button>
        <button
          className="card-play"
          aria-label={`Play ${album.title}`}
          onClick={() =>
            playerActions.play(
              songs[0].id,
              songs.map((t) => t.id),
            )
          }
        >
          <Play size={19} fill="currentColor" />
        </button>
      </div>
      <button className="album-card-title" onClick={() => onOpen(album)}>
        {album.title}
      </button>
      <p>
        {album.artist}
        <span> · {album.year}</span>
      </p>
    </article>
  );
}
