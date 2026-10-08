import { trackById } from "../../data/library";
import { usePlayer, useTimeline } from "../../lib/player-store";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";

export function Visualizer() {
  const { trackId, isPlaying } = usePlayer();
  const { elapsed } = useTimeline();
  const reduced = useReducedMotionPreference();
  const peaks = trackId ? trackById[trackId]?.peaks : undefined;
  const base = Math.floor(elapsed * 6);
  return (
    <div className="player-visualizer" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const peak = peaks?.[(base + i * 7) % peaks.length] ?? 0.2;
        const amplitude =
          0.22 + Math.abs(Math.sin(elapsed * 5 + i * 1.7)) * peak * 2;
        return (
          <i
            key={i}
            style={{
              transform: `scaleY(${isPlaying && !reduced ? Math.min(1, amplitude) : 0.18})`,
            }}
          />
        );
      })}
    </div>
  );
}
