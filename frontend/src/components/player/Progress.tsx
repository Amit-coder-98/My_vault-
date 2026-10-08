import { useState } from "react";
import { useTimeline, playerActions } from "../../lib/player-store";
import { formatTime } from "../../lib/format";

export function Progress({ fullscreen = false }: { fullscreen?: boolean }) {
  const { elapsed, duration, buffered } = useTimeline();
  const [hover, setHover] = useState<number | null>(null);
  const percent = duration ? (elapsed / duration) * 100 : 0;
  return (
    <div
      className={`player-progress ${fullscreen ? "player-progress-full" : ""}`}
    >
      <span>{formatTime(elapsed)}</span>
      <div className="progress-hit-area">
        <input
          className="range-input progress-range"
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(elapsed, duration)}
          disabled={!duration}
          onChange={(e) => playerActions.seek(Number(e.target.value))}
          onPointerMove={(e) => {
            if (e.pointerType === "touch" || !duration) return;
            const box = e.currentTarget.getBoundingClientRect();
            setHover(
              Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
            );
          }}
          onPointerLeave={() => setHover(null)}
          aria-label="Playback position"
          aria-valuetext={
            duration
              ? `${formatTime(elapsed)} of ${formatTime(duration)}`
              : "Duration unavailable"
          }
          style={
            {
              "--range-progress": `${percent}%`,
              "--range-buffered": `${duration ? (buffered / duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
        />
        {hover !== null && (
          <span className="seek-tooltip" style={{ left: `${hover * 100}%` }}>
            {formatTime(hover * duration)}
          </span>
        )}
      </div>
      <span>{duration ? formatTime(duration) : "--:--"}</span>
    </div>
  );
}
