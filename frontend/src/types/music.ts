export type View = "home" | "library" | "playlists" | "favorites";
export type LibraryCategory = "songs" | "albums" | "artists" | "playlists";
export type RepeatMode = "off" | "all" | "one";
export type PlaybackStatus =
  | "IDLE"
  | "LOADING"
  | "PLAYING"
  | "PAUSED"
  | "BUFFERING"
  | "ERROR";
export type PlayerMode = "mini" | "expanded" | "fullscreen";

export interface Palette {
  accent: string;
  ambient: string;
  secondary: string;
}
export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  genre: string;
  year: number;
  palette: Palette;
  coverStyle: string;
}
export interface Track {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  duration: number;
  genre: string;
  year: number;
  favorite: boolean;
  audioUrl?: string;
  peaks?: number[];
  demo?: boolean;
  moodIds?: string[];
  genreIds?: string[];
  languageId?: string;
}
export interface Artist {
  id: string;
  name: string;
  albumId: string;
  genre: string;
}
export interface Playlist {
  id: string;
  title: string;
  description: string;
  label: string;
  coverAlbumId: string;
  trackIds: string[];
  color: string;
}
