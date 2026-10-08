import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  ListMusic,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Users,
} from "lucide-react";
import { useRef } from "react";
import { motion } from "motion/react";
import {
  albums,
  albumById,
  playlists,
  trackById,
  tracks,
  artists,
  demoMode,
  labels,
  history,
} from "../data/library";
import { greeting } from "../lib/format";
import { playerActions, usePlayer } from "../lib/player-store";
import type { Album, LibraryCategory, Playlist } from "../types/music";
import { AlbumArt } from "../components/music/AlbumArt";
import { AlbumCard } from "../components/music/AlbumCard";
import { PlaylistCard } from "../components/music/PlaylistCard";
import { FavoriteButton } from "../components/player/PlayerControls";
import { Progress } from "../components/player/Progress";
import { IconButton } from "../components/ui/IconButton";

const getCollections = () =>
  [
    { id: "songs", label: "Songs", icon: Music2, count: tracks.length },
    { id: "albums", label: "Albums", icon: Disc3, count: albums.length },
    { id: "artists", label: "Artists", icon: Users, count: artists.length },
    {
      id: "playlists",
      label: "Playlists",
      icon: ListMusic,
      count: playlists.length,
    },
  ] as const;

export function HomePage({
  onAlbum,
  onPlaylist,
  onLibrary,
  onAllPlaylists,
  userName = "Amit",
}: {
  onAlbum: (album: Album) => void;
  onPlaylist: (playlist: Playlist) => void;
  onLibrary: (category: LibraryCategory) => void;
  onAllPlaylists: () => void;
  userName?: string;
}) {
  const player = usePlayer();
  const recentId = history.find((item) => trackById[item.song_id])?.song_id;
  const track = trackById[player.trackId ?? recentId ?? tracks[0]?.id],
    album = track ? albumById[track.albumId] : null;
  const shelf = useRef<HTMLDivElement>(null);
  const collections = getCollections();
  if (!track || !album)
    return (
      <div className="empty-vault">
        <span className="eyebrow">YOUR PERSONAL MUSIC UNIVERSE</span>
        <h1>
          {greeting()}, {userName}
          <span className="heading-dot">.</span>
        </h1>
        <p>
          Your vault is ready for its first song. The owner can upload music or
          import the collection.
        </p>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow greeting-label">
            A SPACE THAT SOUNDS LIKE YOU
          </div>
          <h1>
            {greeting()}, {userName}
            <span className="heading-dot">.</span>
          </h1>
          <p>Pick up where you left off. Or find a new feeling.</p>
        </div>
        <span className="home-date">
          <span className="small-orbit" />
          Your personal soundtrack
        </span>
      </div>
      <section className="featured" aria-label="Featured listening">
        <div
          className="featured-ambient"
          style={{
            background: `radial-gradient(ellipse at 75% 50%, ${album.palette.ambient}80, transparent 70%)`,
          }}
        />
        <div className="featured-copy">
          <span className="featured-eyebrow">
            <span />{" "}
            {player.isPlaying
              ? "NOW IN YOUR ROTATION"
              : "A MOMENT FOR YOURSELF"}
          </span>
          <h2>
            Somewhere,
            <br />a little <span>slower.</span>
          </h2>
          <p className="featured-description">
            Let the world wait.
            <br />
            Your next favorite moment is right here.
          </p>
          <div className="featured-track">
            <strong>{track.title}</strong>
            <span>
              {track.artist} <span> · </span> {album.title}
            </span>
          </div>
          <div className="featured-actions">
            <motion.button
              className="primary-button"
              whileTap={{ scale: 0.97 }}
              onClick={() =>
                player.trackId
                  ? playerActions.toggle()
                  : playerActions.play(
                      track.id,
                      tracks.map((song) => song.id),
                      history.find(
                        (item) =>
                          item.song_id === track.id &&
                          item.elapsed < track.duration * 0.95,
                      )?.elapsed ?? 0,
                    )
              }
            >
              {player.wantsPlayback ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
              {player.wantsPlayback
                ? "Pause listening"
                : player.trackId
                  ? "Continue listening"
                  : "Start listening"}
            </motion.button>
            <FavoriteButton trackId={track.id} />
            <div className="hero-skip">
              <IconButton
                icon={SkipBack}
                label="Previous featured track"
                onClick={playerActions.previous}
              />
              <IconButton
                icon={SkipForward}
                label="Next featured track"
                onClick={playerActions.next}
              />
            </div>
          </div>
          <div className="featured-progress">
            <Progress />
          </div>
        </div>
        <div className="featured-art">
          <div className="vinyl-record" aria-hidden="true">
            <span />
          </div>
          <button
            aria-label={`Explore ${album.title}`}
            onClick={() => onAlbum(album)}
          >
            <AlbumArt album={album} priority />
          </button>
          <div className="featured-art-caption">
            <span>{album.genre}</span>
            <span>
              {album.year}
              <ArrowUpRight size={13} />
            </span>
          </div>
        </div>
        <span className="featured-edition">
          THE VAULT SESSIONS &nbsp; / &nbsp; 001
        </span>
      </section>
      {!demoMode && (
        <section className="home-section feeling-section">
          <div className="section-heading">
            <div>
              <h2>How does today feel?</h2>
              <p>A little music for whatever you’re carrying.</p>
            </div>
          </div>
          <div className="feeling-grid">
            {labels
              .filter(
                (label) => label.kind === "mood" && (label.count ?? 0) > 0,
              )
              .map((label, i) => {
                const moodTracks = tracks.filter((song) =>
                  song.moodIds?.includes(label.id),
                );
                return (
                  <button
                    key={label.id}
                    className={`feeling-card feeling-${i % 4}`}
                    onClick={() =>
                      onPlaylist({
                        id: `mood-${label.id}`,
                        title: label.name,
                        description: `Music for your ${label.name.toLowerCase()} moments.`,
                        label: "YOUR FEELING, YOUR SOUNDTRACK",
                        coverAlbumId: moodTracks[0]?.albumId ?? "empty",
                        trackIds: moodTracks.map((song) => song.id),
                        color: "#c3b5ee",
                      })
                    }
                  >
                    <span className="feeling-orbit" aria-hidden="true" />
                    <span className="eyebrow">A MOMENT OF</span>
                    <strong>{label.name}</strong>
                    <small>
                      {moodTracks.length} songs <ArrowUpRight size={16} />
                    </small>
                  </button>
                );
              })}
          </div>
        </section>
      )}
      <section
        className="home-section recently-section"
        aria-labelledby="recent-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="recent-heading">
              {demoMode || history.length
                ? "Back in rotation"
                : "Fresh in your vault"}
            </h2>
            <p>
              {demoMode || history.length
                ? "Some favorites deserve another listen."
                : "Your latest additions, ready for a moment."}
            </p>
          </div>
          <div className="shelf-actions">
            <IconButton
              icon={ChevronLeft}
              label="Scroll albums left"
              onClick={() =>
                shelf.current?.scrollBy({
                  left: -360,
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                })
              }
            />
            <IconButton
              icon={ChevronRight}
              label="Scroll albums right"
              onClick={() =>
                shelf.current?.scrollBy({
                  left: 360,
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                })
              }
            />
          </div>
        </div>
        <div className="album-shelf" ref={shelf} data-lenis-prevent>
          {(history.length
            ? history
                .map((item) => trackById[item.song_id])
                .filter(Boolean)
                .map((track) => albumById[track.albumId])
            : albums
          )
            .slice(0, demoMode ? 6 : 12)
            .map((item) => (
              <AlbumCard album={item} onOpen={onAlbum} key={item.id} />
            ))}
        </div>
      </section>
      <section
        className="home-section moments-section"
        aria-labelledby="moments-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="moments-heading">Made for your moments</h2>
            <p>A mood, a memory, a little escape.</p>
          </div>
          <button className="text-link" onClick={onAllPlaylists}>
            All playlists <ArrowRight size={15} />
          </button>
        </div>
        <div className="playlist-grid">
          {playlists.slice(0, 3).map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onOpen={onPlaylist}
            />
          ))}
        </div>
      </section>
      <section
        className="home-section library-section"
        aria-labelledby="library-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="library-heading">Collected by you</h2>
            <p>All the music that makes you, you.</p>
          </div>
          <Heart size={17} className="muted-icon" />
        </div>
        <div className="collection-grid">
          {collections.map((collection) => (
            <button
              key={collection.id}
              onClick={() => onLibrary(collection.id)}
              className="collection-link"
            >
              <span className={`collection-icon collection-${collection.id}`}>
                <collection.icon size={21} strokeWidth={1.5} />
              </span>
              <span>
                <strong>{collection.label}</strong>
                <small>{collection.count} in your vault</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <footer className="page-footer">
        <span>YOUR MUSIC. YOUR WORLD.</span>
        <span>
          Made for listening, not scrolling.
          <span className="footer-star">✳</span>
        </span>
      </footer>
    </>
  );
}
