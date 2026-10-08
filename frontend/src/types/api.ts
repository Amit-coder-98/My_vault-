export interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "user";
  active: boolean;
  created_at: string;
}
export interface AuthResponse {
  user: User;
  access_token: string;
}
export interface Label {
  id: string;
  name: string;
  kind: "mood" | "genre" | "language";
  count?: number;
}
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  year: number;
  description: string;
  mood_ids: string[];
  genre_ids: string[];
  language_id: string | null;
  status: "draft" | "published" | "archived";
  featured: boolean;
  audio_url: string;
  artwork_url: string | null;
  peaks?: number[] | null;
  file_size: number;
  filename: string;
  metadata_review: boolean;
  storage_folder?: string;
}
export interface ApiPlaylist {
  id: string;
  title: string;
  description: string;
  track_ids: string[];
  smart: boolean;
  mood_id: string | null;
  genre_id: string | null;
  language_id: string | null;
  favorites_only: boolean;
}
export interface HistoryItem {
  id: string;
  song_id: string;
  elapsed: number;
  updated_at: string;
}
export interface Session {
  id: string;
  current: boolean;
  device: string;
  created_at: string;
  expires_at: string;
}
export interface ImportRow {
  source: string;
  filename?: string;
  title?: string;
  artist?: string;
  duration?: number;
  duplicate?: boolean;
  migration_needed?: boolean;
  error?: string;
  status?: string;
  message?: string;
}
export interface ImportJob {
  id: string;
  status: string;
  total: number;
  completed: number;
  results: ImportRow[];
  message?: string;
}
export interface Invitation {
  id: string;
  email: string;
  used: boolean;
  expires_at: string;
}
export interface AuditEvent {
  id: string;
  actor_name: string;
  action: string;
  detail: string;
  created_at: string;
}
export interface Overview {
  songs: Record<string, number>;
  users: number;
  active_users: number;
  storage_bytes: number;
  listening_records: number;
  recent_songs: Song[];
  api: string;
  database: string;
  storage: string;
  max_upload_mb: number;
  pending_asset_cleanup?: number;
}
