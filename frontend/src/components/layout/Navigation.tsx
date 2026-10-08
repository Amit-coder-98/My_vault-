import { Disc3, Heart, Home, Library, ListMusic, Search } from "lucide-react";
import { motion } from "motion/react";
import type { View } from "../../types/music";
import { revealTransition } from "../../animations/config";

const items = [
  { id: "home", label: "Home", icon: Home },
  { id: "library", label: "Your library", icon: Library },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "favorites", label: "Favorites", icon: Heart },
] as const;

export function Navigation({
  view,
  onNavigate,
  onSearch,
  mobile = false,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={`navigation ${mobile ? "mobile-navigation" : ""}`}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${view === item.id ? "nav-active" : ""}`}
          onClick={() => onNavigate(item.id)}
          aria-current={view === item.id ? "page" : undefined}
        >
          {view === item.id && (
            <motion.span
              className="nav-indicator"
              layoutId={
                mobile ? "mobile-navigation-indicator" : "navigation-indicator"
              }
              transition={revealTransition}
            />
          )}
          <item.icon size={19} strokeWidth={view === item.id ? 2 : 1.65} />
          <span>
            {mobile && item.id === "library" ? "Library" : item.label}
          </span>
        </button>
      ))}
      <button className="nav-item nav-search" onClick={onSearch}>
        <Search size={19} strokeWidth={1.65} />
        <span>Search</span>
      </button>
    </nav>
  );
}

export function VaultNote() {
  return (
    <div className="vault-note">
      <Disc3 size={20} strokeWidth={1.4} />
      <span>
        Good music.
        <br />
        <strong>Better company.</strong>
      </span>
      <p>
        Your own little corner
        <br />
        of the music universe.
      </p>
    </div>
  );
}
