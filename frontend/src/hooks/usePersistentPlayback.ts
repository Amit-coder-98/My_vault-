import { useEffect } from "react";
import { demoMode } from "../data/library";
import { api, notify } from "../lib/api";
import {
  getPlayer,
  getTimeline,
  subscribePlayer,
  subscribeTimeline,
} from "../lib/player-store";
export function usePersistentPlayback(atmosphere: boolean, volume: number) {
  useEffect(() => {
    if (demoMode) return;
    const timeout = window.setTimeout(() => {
      void api("/me/preferences", {
        method: "PUT",
        json: { atmosphere, volume },
      }).catch((e: Error) => notify(e.message));
    }, 500);
    return () => clearTimeout(timeout);
  }, [atmosphere, volume]);
  useEffect(() => {
    if (demoMode) return;
    let current = getPlayer().trackId,
      elapsed = getTimeline().elapsed,
      wasPlaying = getPlayer().isPlaying;
    let failed = false;
    const save = (id: string | null, position: number) => {
      if (!id || position < 0.5) return;
      void api("/me/history", {
        method: "POST",
        json: { song_id: id, elapsed: position },
      }).catch(() => {
        if (!failed) {
          notify(
            "Listening history could not be saved. Your music can keep playing.",
          );
          failed = true;
        }
      });
    };
    const timeline = subscribeTimeline(() => {
      elapsed = getTimeline().elapsed;
    });
    const player = subscribePlayer(() => {
      const next = getPlayer();
      if (current !== next.trackId) {
        save(current, elapsed);
        current = next.trackId;
        elapsed = 0;
      }
      if (wasPlaying && !next.isPlaying && current) save(current, elapsed);
      wasPlaying = next.isPlaying;
    });
    const interval = window.setInterval(() => {
      if (getPlayer().isPlaying) save(current, elapsed);
    }, 15_000);
    return () => {
      clearInterval(interval);
      timeline();
      player();
    };
  }, []);
}
