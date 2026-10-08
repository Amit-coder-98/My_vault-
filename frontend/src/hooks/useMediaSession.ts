import { useEffect } from "react";
import { albumById, trackById } from "../data/library";
import {
  getPlayer,
  getTimeline,
  playerActions,
  subscribePlayer,
  subscribeTimeline,
} from "../lib/player-store";

export function useMediaSession() {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: playerActions.resume,
      pause: playerActions.pause,
      previoustrack: playerActions.previous,
      nexttrack: playerActions.next,
      seekbackward: (details) =>
        playerActions.seekRelative(-(details.seekOffset ?? 5)),
      seekforward: (details) =>
        playerActions.seekRelative(details.seekOffset ?? 5),
      seekto: (details) => {
        if (details.seekTime !== undefined)
          playerActions.seek(details.seekTime);
      },
      stop: playerActions.pause,
    };
    const installed: MediaSessionAction[] = [];
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
        installed.push(action as MediaSessionAction);
      } catch {
        /* Unsupported browser action. */
      }
    }
    let lastTrack: string | null | undefined;
    const update = () => {
      const player = getPlayer();
      const track = player.trackId ? trackById[player.trackId] : null;
      if (lastTrack !== player.trackId) {
        lastTrack = player.trackId;
        if (track && typeof MediaMetadata !== "undefined") {
          const album = albumById[track.albumId];
          session.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: album.title,
            artwork: [{ src: new URL(album.artwork, location.href).href }],
          });
        } else session.metadata = null;
      }
      session.playbackState = player.isPlaying
        ? "playing"
        : track
          ? "paused"
          : "none";
    };
    let lastPosition = -1;
    const updatePosition = () => {
      if (!session.setPositionState) return;
      const { elapsed, duration } = getTimeline();
      if (!duration || !Number.isFinite(duration)) {
        if (lastPosition !== -1) {
          try {
            session.setPositionState();
          } catch {
            /* Optional API. */
          }
          lastPosition = -1;
        }
        return;
      }
      if (Math.abs(elapsed - lastPosition) < 0.5) return;
      try {
        session.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(elapsed, duration)),
        });
        lastPosition = elapsed;
      } catch {
        /* Some browsers expose an incomplete API. */
      }
    };
    update();
    updatePosition();
    const removePlayer = subscribePlayer(update);
    const removeTimeline = subscribeTimeline(updatePosition);
    return () => {
      removePlayer();
      removeTimeline();
      installed.forEach((action) => {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* Optional action. */
        }
      });
      session.metadata = null;
      session.playbackState = "none";
      try {
        session.setPositionState?.();
      } catch {
        /* Optional API. */
      }
    };
  }, []);
}
