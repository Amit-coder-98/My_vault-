import { useEffect, useRef, useState } from "react";
import { albumById, trackById } from "../../data/library";
import {
  getAudioElement,
  playerActions,
  usePlayer,
  useTimeline,
} from "../../lib/player-store";
import { createAudioWaveform } from "../../lib/wavesurfer-adapter";
import { formatTime } from "../../lib/format";
import type WaveSurfer from "wavesurfer.js";

export function Waveform() {
  const { trackId } = usePlayer();
  const { elapsed, duration } = useTimeline();
  const track = trackId ? trackById[trackId] : null;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const album = track ? albumById[track.albumId] : null;
  useEffect(() => {
    const media = getAudioElement();
    if (!container.current || !media || !track?.peaks || !album || !duration)
      return;
    let cancelled = false;
    const abort = new AbortController();
    let waveform: WaveSurfer | null = null;
    void createAudioWaveform(
      container.current,
      media,
      { duration, peaks: track.peaks },
      album.palette.accent,
      abort.signal,
    )
      .then((instance) => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        waveform = instance;
        instance.on("error", () => {
          if (!cancelled) setReady(false);
        });
        instance.on("ready", () => {
          if (!cancelled) setReady(true);
        });
        if (instance.getDecodedData()) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
      abort.abort();
      waveform?.destroy();
      setReady(false);
    };
  }, [track, album, duration]);
  if (!track) return null;
  return (
    <div className="waveform-seek">
      <div
        className="waveform-renderer"
        ref={container}
        aria-hidden="true"
        style={{ opacity: ready ? 1 : 0 }}
      />
      {!ready && (
        <div className="waveform-fallback" aria-hidden="true">
          {(
            track.peaks ??
            Array.from(
              { length: 90 },
              (_, i) => 0.1 + Math.abs(Math.sin(i * 1.7)) * 0.6,
            )
          )
            .filter((_, i) => i % 2 === 0)
            .map((value, i) => (
              <span
                key={i}
                style={{
                  height: `${Math.max(5, value * 140)}%`,
                  backgroundColor:
                    duration && i / 90 < elapsed / duration
                      ? "var(--accent)"
                      : undefined,
                }}
              />
            ))}
        </div>
      )}
      <input
        type="range"
        className="waveform-range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(elapsed, duration)}
        disabled={!duration}
        aria-label="Waveform position"
        aria-valuetext={
          duration
            ? `${formatTime(elapsed)} of ${formatTime(duration)}`
            : "Duration unavailable"
        }
        onChange={(e) => playerActions.seek(Number(e.target.value))}
        onPointerMove={(e) => {
          if (e.pointerType === "touch" || !duration) return;
          const box = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
          );
        }}
        onPointerLeave={() => setHover(null)}
      />
      {hover !== null && (
        <span className="seek-tooltip" style={{ left: `${hover * 100}%` }}>
          {formatTime(hover * duration)}
        </span>
      )}
    </div>
  );
}
