import { useCallback, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import {
  albums,
  albumById,
  trackById,
  emptyAlbum,
  listeningPreferences,
  useLibrary,
} from "./data/library";
import type { Album, LibraryCategory, Playlist, View } from "./types/music";
import { playerActions, usePlayer } from "./lib/player-store";
import { useExperience } from "./hooks/useExperience";
import { revealTransition } from "./animations/config";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { Navigation } from "./components/layout/Navigation";
import { DetailPanel } from "./components/layout/DetailPanel";
import type { Panel } from "./components/layout/DetailPanel";
import { MusicPlayer } from "./components/player/MusicPlayer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useMediaSession } from "./hooks/useMediaSession";
import { usePlayerKeyboard } from "./hooks/usePlayerKeyboard";
import { useReducedMotionPreference } from "./hooks/useReducedMotionPreference";
import { SearchDialog } from "./components/search/SearchDialog";
import { HomePage } from "./pages/Home";
import { CollectionPage } from "./pages/Collection";
import { AdminPage } from "./pages/admin/Admin";
import { AccountPage } from "./pages/Account";
import { navigate as navigateRoute, useRoute } from "./lib/router";
import { useAuth } from "./lib/auth-store";
import { usePersistentPlayback } from "./hooks/usePersistentPlayback";
import { PlaylistEditor } from "./components/music/PlaylistEditor";

export default function App() {
  useLibrary();
  const route = useRoute().split("?")[0];
  const { user } = useAuth();
  const [history, setHistory] = useState<{ entries: View[]; index: number }>({
    entries: ["home"],
    index: 0,
  });
  const view = history.entries[history.index];
  const [category, setCategory] = useState<LibraryCategory>("songs");
  const [search, setSearch] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [playlistEditor, setPlaylistEditor] = useState<string | null>(null);
  const [atmosphere, setAtmosphere] = useState(listeningPreferences.atmosphere);
  const player = usePlayer();
  const selectedTrack = player.trackId ? trackById[player.trackId] : undefined;
  const album = selectedTrack
    ? (albumById[selectedTrack.albumId] ?? emptyAlbum)
    : (albums[0] ?? emptyAlbum);
  usePersistentPlayback(atmosphere, player.volume);
  const reduced = useReducedMotionPreference();
  const ref = useExperience();
  useAudioEngine();
  useMediaSession();
  const closeSearch = useCallback(() => setSearch(false), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const openSearch = useCallback(() => {
    setPanel(null);
    playerActions.setMode("mini");
    playerActions.closeQueue();
    setSearch(true);
  }, []);
  const openAlbum = useCallback((album: Album) => {
    setSearch(false);
    setPanel({ kind: "album", album });
  }, []);
  const openPlaylist = useCallback((playlist: Playlist) => {
    setSearch(false);
    setPanel({ kind: "playlist", playlist });
  }, []);
  const navigate = useCallback((next: View) => {
    if (window.location.pathname !== "/") navigateRoute("/");
    setHistory((previous) =>
      previous.entries[previous.index] === next
        ? previous
        : {
            entries: [...previous.entries.slice(0, previous.index + 1), next],
            index: previous.index + 1,
          },
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const moveHistory = (direction: number) => {
    setHistory((previous) => ({
      ...previous,
      index: Math.min(
        previous.entries.length - 1,
        Math.max(0, previous.index + direction),
      ),
    }));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openLibrary = (next: LibraryCategory) => {
    setCategory(next);
    navigate("library");
  };

  usePlayerKeyboard(
    openSearch,
    search || panel !== null || player.queueOpen || playlistEditor !== null,
  );

  const blocked =
    search ||
    player.mode !== "mini" ||
    player.queueOpen ||
    panel !== null ||
    playlistEditor !== null;
  return (
    <MotionConfig
      reducedMotion="never"
      skipAnimations={reduced}
      transition={reduced ? { duration: 0.12 } : revealTransition}
    >
      <LayoutGroup>
        <div
          className="vault-app"
          ref={ref}
          style={
            {
              "--accent": album.palette.accent,
              "--ambient": album.palette.ambient,
            } as React.CSSProperties
          }
        >
          <a href="#main-content" className="skip-link" inert={blocked}>
            Skip to music
          </a>
          <div
            className="application-shell"
            inert={blocked}
            aria-hidden={blocked || undefined}
          >
            <Sidebar
              view={view}
              onNavigate={navigate}
              onSearch={openSearch}
              onPlaylist={openPlaylist}
            />
            <div className="main-column">
              <Header
                view={view}
                onSearch={openSearch}
                onPreferences={() => setPanel({ kind: "preferences" })}
                onBack={() => moveHistory(-1)}
                onForward={() => moveHistory(1)}
                canBack={history.index > 0}
                canForward={history.index < history.entries.length - 1}
                userName={user?.name}
                onProfile={user ? () => navigateRoute("/account") : undefined}
              />
              <main id="main-content" tabIndex={-1} className="main-content">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={view}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                  >
                    {route === "/admin" ? (
                      <AdminPage />
                    ) : route === "/account" ? (
                      <AccountPage />
                    ) : view === "home" ? (
                      <HomePage
                        userName={user?.name}
                        onAlbum={openAlbum}
                        onPlaylist={openPlaylist}
                        onLibrary={openLibrary}
                        onAllPlaylists={() => navigate("playlists")}
                      />
                    ) : (
                      <CollectionPage
                        view={view}
                        category={category}
                        onCategory={setCategory}
                        onAlbum={openAlbum}
                        onPlaylist={openPlaylist}
                        onArtist={(artist) =>
                          setPanel({ kind: "artist", artist })
                        }
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
            <Navigation
              view={view}
              onNavigate={navigate}
              onSearch={openSearch}
              mobile
            />
          </div>
          <MusicPlayer
            atmosphere={atmosphere}
            blocked={search || panel !== null || playlistEditor !== null}
          />
          <AnimatePresence>
            {search && (
              <SearchDialog
                key="search"
                onClose={closeSearch}
                onAlbum={openAlbum}
                onPlaylist={openPlaylist}
              />
            )}
            {panel && (
              <DetailPanel
                key="details"
                panel={panel}
                onClose={closePanel}
                atmosphere={atmosphere}
                onAtmosphere={setAtmosphere}
                onEditPlaylist={(id) => {
                  setPanel(null);
                  setPlaylistEditor(id);
                }}
              />
            )}
          </AnimatePresence>
          {playlistEditor && (
            <PlaylistEditor
              playlistId={playlistEditor}
              onClose={() => setPlaylistEditor(null)}
            />
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {selectedTrack
              ? `${player.status.toLowerCase()}: ${selectedTrack.title} by ${selectedTrack.artist}`
              : "No song playing. Select a song to begin listening."}
          </div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
