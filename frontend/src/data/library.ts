import { useSyncExternalStore } from "react";
import type { Album, Artist, Playlist, Track } from "../types/music";
import type { ApiPlaylist, HistoryItem, Label, Song } from "../types/api";
import * as demo from "./music";
import { api, mediaUrl } from "../lib/api";

export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
export const albums: Album[] = demoMode ? [...demo.albums] : [];
export const tracks: Track[] = demoMode ? [...demo.tracks] : [];
export const artists: Artist[] = demoMode ? [...demo.artists] : [];
export const playlists: Playlist[] = demoMode ? [...demo.playlists] : [];
export const albumById: Record<string, Album> = demoMode
  ? { ...demo.albumById }
  : {};
export const trackById: Record<string, Track> = demoMode
  ? { ...demo.trackById }
  : {};
export const albumTracks = (id: string) =>
  tracks.filter((track) => track.albumId === id);
export let labels: Label[] = [];
export let history: HistoryItem[] = [];
export let apiPlaylists: ApiPlaylist[] = [];
export let listeningPreferences = { volume: 0.7, atmosphere: false };
export const emptyAlbum: Album = {
  id: "empty",
  title: "Your music vault",
  artist: "A space for your music",
  artwork: "/artwork/between-the-tides.webp",
  genre: "",
  year: 0,
  coverStyle: "tides",
  palette: { accent: "#c3b5ee", ambient: "#504366", secondary: "#d8a99a" },
};
let revision = 0;
const listeners = new Set<() => void>();
let reconcilePlayer = () => {};
export function setCatalogReconciler(reconcile: () => void) {
  reconcilePlayer = reconcile;
}
function changed() {
  revision++;
  listeners.forEach((fn) => fn());
}
export function useLibrary() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => revision,
  );
}
export async function refreshLabels() {
  labels = await api<Label[]>("/labels");
  changed();
}
const art = [
  "/artwork/between-the-tides.webp",
  "/artwork/golden-hour.jpg",
  "/artwork/into-the-blue.jpg",
  "/artwork/a-quiet-place.jpg",
];
function index() {
  Object.keys(albumById).forEach((key) => {
    delete albumById[key];
  });
  Object.keys(trackById).forEach((key) => {
    delete trackById[key];
  });
  albums.forEach((album) => {
    albumById[album.id] = album;
  });
  tracks.forEach((track) => {
    trackById[track.id] = track;
  });
}
export async function reloadPlaylists() {
  if (demoMode) return;
  apiPlaylists = await api<ApiPlaylist[]>("/me/playlists");
  playlists.splice(
    0,
    playlists.length,
    ...apiPlaylists.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      label: p.smart ? "SMART PLAYLIST" : "MADE BY YOU",
      trackIds: p.track_ids.filter((id) => trackById[id]),
      coverAlbumId:
        trackById[p.track_ids.find((id) => trackById[id]) ?? ""]?.albumId ??
        "empty",
      color: "#c3b5ee",
    })),
  );
  changed();
}
export async function loadLibrary() {
  if (demoMode)
    return {
      favorites: tracks.filter((t) => t.favorite).map((t) => t.id),
      preferences: { volume: 0.7, atmosphere: false },
    };
  const [first, nextLabels, favorites, preferences, nextHistory] =
    await Promise.all([
      api<{ items: Song[]; total: number }>("/songs?limit=200"),
      api<Label[]>("/labels"),
      api<string[]>("/me/favorites"),
      api<{ volume: number; atmosphere: boolean }>("/me/preferences"),
      api<HistoryItem[]>("/me/history"),
    ]);
  const songs = [...first.items];
  for (let offset = 200; offset < first.total; offset += 200)
    songs.push(
      ...(await api<{ items: Song[] }>(`/songs?offset=${offset}&limit=200`))
        .items,
    );
  labels = nextLabels;
  history = nextHistory;
  listeningPreferences = preferences;
  tracks.splice(0, tracks.length);
  albums.splice(0, albums.length);
  artists.splice(0, artists.length);
  for (const song of songs) {
    // A song may have its own cover, even when album metadata is still unreviewed.
    const albumId = `cover-${song.id}`;
    const moodNames = song.mood_ids.map(
      (id) => labels.find((l) => l.id === id)?.name ?? "",
    );
    const genre = song.genre_ids
      .map((id) => labels.find((l) => l.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
    const style = moodNames.includes("Love")
      ? demo.albums[4]
      : moodNames.includes("Sad")
        ? demo.albums[0]
        : demo.albums[2];
    albums.push({
      id: albumId,
      title: song.album,
      artist: song.artist,
      artwork: song.artwork_url
        ? mediaUrl(song.artwork_url)
        : art[
            moodNames.includes("Love")
              ? 1
              : moodNames.includes("Silent")
                ? 2
                : 0
          ],
      genre,
      year: song.year,
      coverStyle: "library",
      palette: style.palette,
    });
    tracks.push({
      id: song.id,
      title: song.title,
      artist: song.artist,
      albumId,
      duration: song.duration,
      genre,
      year: song.year,
      favorite: favorites.includes(song.id),
      audioUrl: mediaUrl(song.audio_url),
      peaks: song.peaks ?? undefined,
      demo: false,
      moodIds: song.mood_ids,
      genreIds: song.genre_ids,
      languageId: song.language_id ?? undefined,
    });
  }
  index();
  albumById.empty = emptyAlbum;
  reconcilePlayer();
  const uniqueArtists = new Map<string, Artist>();
  tracks
    .filter((t) => t.artist !== "Unknown artist")
    .forEach((t) => {
      if (!uniqueArtists.has(t.artist))
        uniqueArtists.set(t.artist, {
          id: t.artist,
          name: t.artist,
          albumId: t.albumId,
          genre: t.genre,
        });
    });
  artists.push(...uniqueArtists.values());
  await reloadPlaylists();
  changed();
  return { favorites, preferences };
}
export function clearLibrary() {
  if (demoMode) return;
  tracks.splice(0);
  albums.splice(0);
  artists.splice(0);
  playlists.splice(0);
  labels = [];
  history = [];
  apiPlaylists = [];
  listeningPreferences = { volume: 0.7, atmosphere: false };
  index();
  changed();
}
