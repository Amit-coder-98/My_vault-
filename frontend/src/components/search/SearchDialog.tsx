import { Search, X } from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import { useState } from "react";
import { albums, albumById, playlists, tracks } from "../../data/library";
import type { Album, Playlist } from "../../types/music";
import { useDialog } from "../../hooks/useDialog";
import { TrackList } from "../music/TrackList";
import { AlbumArt } from "../music/AlbumArt";
import { revealTransition } from "../../animations/config";
import { usePlayer } from "../../lib/player-store";

export function SearchDialog({
  onClose,
  onAlbum,
  onPlaylist,
  initialQuery = "",
}: {
  onClose: () => void;
  onAlbum: (album: Album) => void;
  onPlaylist: (playlist: Playlist) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const { favorites } = usePlayer();
  const isPresent = useIsPresent();
  const ref = useDialog(onClose, isPresent);
  const needle = query.trim().toLowerCase();
  const songs = tracks.filter((track) =>
    `${track.title} ${track.artist} ${albumById[track.albumId].title} ${track.genre}`
      .toLowerCase()
      .includes(needle),
  );
  const matchingAlbums = albums.filter((album) =>
    `${album.title} ${album.artist}`.toLowerCase().includes(needle),
  );
  const matchingPlaylists = playlists.filter((playlist) =>
    `${playlist.title} ${playlist.description}`.toLowerCase().includes(needle),
  );
  return (
    <motion.div
      className="dialog-backdrop search-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={revealTransition}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={ref}
        className="search-dialog"
        role={isPresent ? "dialog" : undefined}
        aria-modal={isPresent}
        aria-hidden={!isPresent || undefined}
        inert={!isPresent}
        aria-labelledby="search-title"
        initial={{ opacity: 0, scale: 0.97, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={revealTransition}
        data-lenis-prevent
      >
        <div className="search-dialog-input">
          <Search size={21} />
          <label className="sr-only" htmlFor="music-search" id="search-title">
            Search your music
          </label>
          <input
            id="music-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A song, an artist, a feeling…"
            autoComplete="off"
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="search-results">
          <div className="search-results-heading">
            <span className="eyebrow">
              {needle ? "IN YOUR VAULT" : "A GOOD PLACE TO START"}
            </span>
            <span className="search-result-count" aria-live="polite">
              {needle
                ? `${songs.length + matchingAlbums.length + matchingPlaylists.length} results`
                : "Your collection"}
            </span>
          </div>
          {!needle ? (
            <>
              <div className="search-suggestions">
                {albums.slice(0, 3).map((album) => (
                  <button key={album.id} onClick={() => onAlbum(album)}>
                    <AlbumArt album={album} lettering={false} />
                    <strong>{album.title}</strong>
                    <span>{album.artist}</span>
                  </button>
                ))}
              </div>
              <h3>Something you love</h3>
              <TrackList
                songs={tracks
                  .filter((track) => favorites.has(track.id))
                  .slice(0, 4)}
                compact
              />
            </>
          ) : songs.length +
            matchingAlbums.length +
            matchingPlaylists.length ? (
            <>
              {songs.length > 0 && (
                <>
                  <h3>Songs</h3>
                  <TrackList songs={songs} compact />
                </>
              )}
              {matchingAlbums.length > 0 && (
                <>
                  <h3>Albums</h3>
                  <div className="search-album-results">
                    {matchingAlbums.map((album) => (
                      <button key={album.id} onClick={() => onAlbum(album)}>
                        <AlbumArt album={album} lettering={false} />
                        <span>
                          <strong>{album.title}</strong>
                          <small>{album.artist} · Album</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {matchingPlaylists.length > 0 && (
                <>
                  <h3>Playlists</h3>
                  <div className="search-album-results">
                    {matchingPlaylists.map((playlist) => (
                      <button
                        key={playlist.id}
                        onClick={() => onPlaylist(playlist)}
                      >
                        <img
                          src={albumById[playlist.coverAlbumId].artwork}
                          alt=""
                        />
                        <span>
                          <strong>{playlist.title}</strong>
                          <small>
                            {playlist.trackIds.length} songs · Playlist
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h3>No music found for “{query}”</h3>
              <p>Try a different title, artist, or mood.</p>
            </div>
          )}
        </div>
        <div className="search-footer">
          <span>Find your next favorite moment.</span>
          <kbd>ESC TO CLOSE</kbd>
        </div>
      </motion.div>
    </motion.div>
  );
}
