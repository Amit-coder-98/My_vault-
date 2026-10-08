import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Brand } from "../ui/Brand";
import type { View } from "../../types/music";

export function Header({
  view,
  onSearch,
  onPreferences,
  onBack,
  onForward,
  canBack,
  canForward,
  userName = "Amit",
  onProfile,
}: {
  view: View;
  onSearch: () => void;
  onPreferences: () => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  userName?: string;
  onProfile?: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="history-buttons">
          <IconButton
            icon={ChevronLeft}
            label="Go back"
            onClick={onBack}
            disabled={!canBack}
          />
          <IconButton
            icon={ChevronRight}
            label="Go forward"
            onClick={onForward}
            disabled={!canForward}
          />
        </div>
        <span className="breadcrumb">
          Your vault <span>/</span>{" "}
          <strong>
            {view === "home"
              ? "Home"
              : view === "library"
                ? "Library"
                : view === "favorites"
                  ? "Favorites"
                  : "Playlists"}
          </strong>
        </span>
        <div className="mobile-brand">
          <Brand compact />
        </div>
      </div>
      <div className="topbar-right">
        <button className="search-launcher" onClick={onSearch}>
          <Search size={16} />
          <span>Search your music</span>
          <kbd>Ctrl K</kbd>
        </button>
        <IconButton
          icon={SlidersHorizontal}
          label="Listening preferences"
          className="preferences-trigger"
          onClick={onPreferences}
        />
        <button
          className="profile-button"
          onClick={onProfile ?? onPreferences}
          aria-label={
            onProfile ? "Your account" : `${userName}'s listening preferences`
          }
        >
          <span>{userName.slice(0, 1).toUpperCase()}</span>
          <span className="profile-dot" />
        </button>
      </div>
    </header>
  );
}
