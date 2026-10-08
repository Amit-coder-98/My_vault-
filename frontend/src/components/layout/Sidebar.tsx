import { ArrowUpRight, Headphones, ListMusic, ShieldCheck } from "lucide-react";
import type { Playlist, View } from "../../types/music";
import { playlists } from "../../data/library";
import { Brand } from "../ui/Brand";
import { Navigation, VaultNote } from "./Navigation";
import { useAuth } from "../../lib/auth-store";
import { navigate } from "../../lib/router";

export function Sidebar({
  view,
  onNavigate,
  onSearch,
  onPlaylist,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  onPlaylist: (playlist: Playlist) => void;
}) {
  const { user } = useAuth();
  return (
    <aside className="sidebar">
      <button
        className="brand-button"
        aria-label="My Music Vault home"
        onClick={() => onNavigate("home")}
      >
        <Brand />
      </button>
      <div className="sidebar-nav-label eyebrow">YOUR SPACE</div>
      <Navigation view={view} onNavigate={onNavigate} onSearch={onSearch} />
      {user && user.role !== "user" && (
        <button className="admin-nav-link" onClick={() => navigate("/admin")}>
          <ShieldCheck size={17} /> Manage vault <ArrowUpRight size={14} />
        </button>
      )}
      <div className="sidebar-playlists">
        <div className="sidebar-section-label">
          <span className="eyebrow">YOUR PLAYLISTS</span>
          <ListMusic size={14} />
        </div>
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            className="sidebar-playlist"
            onClick={() => onPlaylist(playlist)}
          >
            <span
              className="playlist-dot"
              style={{ backgroundColor: playlist.color }}
            />
            {playlist.title}
            <ArrowUpRight size={13} />
          </button>
        ))}
        <button
          className="text-link sidebar-browse"
          onClick={() => onNavigate("playlists")}
        >
          View all playlists <ArrowUpRight size={12} />
        </button>
      </div>
      <VaultNote />
      <div className="sidebar-footer">
        <span className="private-status">
          <span />
          PRIVATE LIBRARY
        </span>
        <Headphones size={15} />
      </div>
    </aside>
  );
}
