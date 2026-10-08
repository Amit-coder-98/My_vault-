import { AlertCircle } from "lucide-react";
import { playerActions, usePlayer } from "../../lib/player-store";

export function PlayerStatus({ compact = false }: { compact?: boolean }) {
  const { status, error } = usePlayer();
  return (
    <div
      className={`player-status ${compact ? "player-status-compact" : ""} ${status === "ERROR" ? "player-status-error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {status === "ERROR" ? (
        <>
          <AlertCircle size={14} aria-hidden="true" />
          <span>{error}</span>
          <button onClick={playerActions.retry}>Retry</button>
        </>
      ) : status === "LOADING" ? (
        "Getting your song ready…"
      ) : status === "BUFFERING" ? (
        "Buffering… your music will resume shortly."
      ) : compact ? null : (
        <>
          <span
            className={`status-dot ${status === "PLAYING" ? "active" : ""}`}
          />
          {status === "PLAYING" ? "Playing" : "Paused"}
          <span className="status-divider">·</span>Original demo audio
        </>
      )}
    </div>
  );
}
