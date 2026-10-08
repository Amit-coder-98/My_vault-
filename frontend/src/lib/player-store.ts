import { useSyncExternalStore } from "react";
import { tracks, trackById, setCatalogReconciler } from "../data/library";
import type { PlaybackStatus, PlayerMode, RepeatMode } from "../types/music";
import type { AudioController } from "./audio-controller";

export interface PlayerState {
  trackId: string | null;
  status: PlaybackStatus;
  isPlaying: boolean;
  wantsPlayback: boolean;
  error: string | null;
  favorites: ReadonlySet<string>;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: readonly string[];
  queueIndex: number;
  mode: PlayerMode;
  queueOpen: boolean;
}
export interface Timeline {
  elapsed: number;
  duration: number;
  buffered: number;
}

let state: PlayerState = {
  trackId: null,
  status: "IDLE",
  isPlaying: false,
  wantsPlayback: false,
  error: null,
  favorites: new Set(tracks.filter((t) => t.favorite).map((t) => t.id)),
  volume: 0.7,
  muted: false,
  shuffle: false,
  repeat: "off",
  queue: [],
  queueIndex: -1,
  mode: "mini",
  queueOpen: false,
};
let timeline: Timeline = { elapsed: 0, duration: 0, buffered: 0 };
let engine: AudioController | null = null;
let shuffleBag: string[] = [];
let history: string[] = [];
let persistFavorite: ((id: string, active: boolean) => Promise<void>) | null =
  null;
const favoriteVersions = new Map<string, number>();
const listeners = new Set<() => void>();
const timelineListeners = new Set<() => void>();
export const subscribePlayer = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const subscribeTimeline = (fn: () => void) => {
  timelineListeners.add(fn);
  return () => {
    timelineListeners.delete(fn);
  };
};
export const getPlayer = () => state;
export const getTimeline = () => timeline;
export const getAudioElement = () => engine?.media ?? null;
export const getNextTrackId = () =>
  state.shuffle
    ? (shuffleBag[0] ?? null)
    : (state.queue[state.queueIndex + 1] ??
      (state.repeat === "all" ? (state.queue[0] ?? null) : null));
export const getUpcomingCount = () =>
  state.shuffle
    ? shuffleBag.length
    : Math.max(0, state.queue.length - state.queueIndex - 1);
const publish = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const finite = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
export const playerEvents = {
  status(status: PlaybackStatus, error: string | null = null) {
    publish({
      status,
      error,
      isPlaying: status === "PLAYING",
      ...(status === "ERROR" ? { wantsPlayback: false } : {}),
    });
  },
  timeline(next: Timeline) {
    const duration = finite(next.duration);
    const elapsed = duration ? Math.min(duration, finite(next.elapsed)) : 0;
    const buffered = duration ? Math.min(duration, finite(next.buffered)) : 0;
    if (
      timeline.elapsed === elapsed &&
      timeline.duration === duration &&
      timeline.buffered === buffered
    )
      return;
    timeline = { elapsed, duration, buffered };
    timelineListeners.forEach((fn) => fn());
  },
  ended: () => advance(1, true),
};

// Control and timeline projections share one store. Only timeline consumers render on ticks.
export function bindAudioController(controller: AudioController) {
  engine = controller;
  engine.setVolume(state.volume, state.muted);
  if (state.trackId)
    engine.load(
      trackById[state.trackId],
      state.wantsPlayback,
      timeline.elapsed,
    );
  return () => {
    if (engine === controller) engine = null;
  };
}
function select(id: string, wantsPlayback = true, position = 0) {
  if (!trackById[id]) return;
  publish({
    trackId: id,
    queueIndex: state.queue.indexOf(id),
    status: "LOADING",
    error: null,
    isPlaying: false,
    wantsPlayback,
  });
  playerEvents.timeline({ elapsed: 0, duration: 0, buffered: 0 });
  engine?.load(trackById[id], wantsPlayback, position);
}
function fillShuffleBag() {
  shuffleBag = state.queue.filter((id) => id !== state.trackId);
  for (let i = shuffleBag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
  }
}
function advance(direction: 1 | -1, automatic = false) {
  if (!state.trackId || !state.queue.length) return;
  if (automatic && state.repeat === "one") {
    playerActions.seek(0);
    playerActions.resume();
    return;
  }
  const playing = automatic || state.wantsPlayback || state.status === "ERROR";
  let next: string | undefined;
  if (state.shuffle) {
    if (direction === -1) {
      next = history.pop();
      if (next && state.trackId !== next) shuffleBag.push(state.trackId);
    } else {
      if (!shuffleBag.length && (!automatic || state.repeat === "all"))
        fillShuffleBag();
      next = shuffleBag.shift();
      if (next) history.push(state.trackId);
    }
  } else {
    next = state.queue[state.queueIndex + direction];
    if (!next && state.repeat === "all")
      next = state.queue[direction === 1 ? 0 : state.queue.length - 1];
  }
  if (next) {
    select(next, playing);
    if (state.shuffle && state.repeat === "all" && !shuffleBag.length)
      fillShuffleBag();
  } else if (automatic) playerActions.pause();
  else if (direction === -1) playerActions.seek(0);
}
function stop() {
  engine?.stop();
  publish({
    trackId: null,
    queue: [],
    queueIndex: -1,
    status: "IDLE",
    isPlaying: false,
    wantsPlayback: false,
    error: null,
    mode: "mini",
  });
  playerEvents.timeline({ elapsed: 0, duration: 0, buffered: 0 });
  shuffleBag = [];
  history = [];
}
export const playerActions = {
  reset() {
    stop();
    persistFavorite = null;
    favoriteVersions.clear();
    publish({
      favorites: new Set(),
      volume: 0.7,
      muted: false,
      shuffle: false,
      repeat: "off",
      queueOpen: false,
    });
    engine?.setVolume(0.7, false);
  },
  hydrate(
    favorites: string[],
    volume = 0.7,
    persistence?: typeof persistFavorite,
  ) {
    publish({ favorites: new Set(favorites), volume });
    engine?.setVolume(volume, state.muted);
    persistFavorite = persistence ?? null;
  },
  reconcileCatalog() {
    if (state.trackId && !trackById[state.trackId]) stop();
    publish({
      queue: state.queue.filter((id) => trackById[id]),
      favorites: new Set([...state.favorites].filter((id) => trackById[id])),
    });
    publish({
      queueIndex: state.trackId ? state.queue.indexOf(state.trackId) : -1,
    });
    shuffleBag = shuffleBag.filter((id) => trackById[id]);
    history = history.filter((id) => trackById[id]);
  },
  play(trackId: string, queue?: readonly string[], position = 0) {
    if (!trackById[trackId]) return;
    const safeQueue = [
      ...new Set((queue ?? state.queue).filter((id) => trackById[id])),
    ];
    if (!safeQueue.includes(trackId)) safeQueue.push(trackId);
    publish({ queue: safeQueue });
    history = [];
    select(trackId, true, position);
    fillShuffleBag();
  },
  playQueued(index: number) {
    const id = state.queue[index];
    if (id) {
      select(id);
      fillShuffleBag();
      history = [];
    }
  },
  resume() {
    if (!state.trackId) return;
    if (state.status === "ERROR") {
      playerActions.retry();
      return;
    }
    if (timeline.duration && timeline.elapsed >= timeline.duration - 0.02)
      playerActions.seek(0);
    publish({ wantsPlayback: true });
    engine?.play();
  },
  pause() {
    publish({ wantsPlayback: false });
    engine?.pause();
    playerEvents.status(state.trackId ? "PAUSED" : "IDLE");
  },
  toggle() {
    if (state.wantsPlayback) playerActions.pause();
    else playerActions.resume();
  },
  retry() {
    if (state.trackId) select(state.trackId);
  },
  next: () => advance(1),
  previous() {
    if (timeline.elapsed > 3) playerActions.seek(0);
    else advance(-1);
  },
  seek(seconds: number) {
    if (state.trackId && timeline.duration && Number.isFinite(seconds))
      engine?.seek(Math.max(0, Math.min(timeline.duration, seconds)));
  },
  seekRelative(seconds: number) {
    playerActions.seek(timeline.elapsed + seconds);
  },
  toggleFavorite(id: string) {
    if (!trackById[id]) return;
    const favorites = new Set(state.favorites);
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    publish({ favorites });
    const version = (favoriteVersions.get(id) ?? 0) + 1;
    favoriteVersions.set(id, version);
    const persistence = persistFavorite;
    if (persistence)
      void persistence(id, favorites.has(id)).catch(() => {
        if (
          favoriteVersions.get(id) !== version ||
          persistFavorite !== persistence
        )
          return;
        const restored = new Set(state.favorites);
        if (favorites.has(id)) restored.delete(id);
        else restored.add(id);
        publish({ favorites: restored });
      });
  },
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const volume = Math.min(1, Math.max(0, value));
    publish({ volume, muted: volume > 0 ? false : state.muted });
    engine?.setVolume(volume, state.muted);
  },
  toggleMute() {
    publish({ muted: !state.muted });
    engine?.setVolume(state.volume, state.muted);
  },
  toggleShuffle() {
    publish({ shuffle: !state.shuffle });
    history = [];
    fillShuffleBag();
  },
  cycleRepeat: () =>
    publish({
      repeat:
        state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off",
    }),
  setMode(mode: PlayerMode) {
    publish({ mode: state.trackId ? mode : "mini" });
  },
  openQueue: () => publish({ queueOpen: true }),
  closeQueue: () => publish({ queueOpen: false }),
  removeFromQueue(id: string) {
    const index = state.queue.indexOf(id);
    const queue = state.queue.filter((item) => item !== id);
    shuffleBag = shuffleBag.filter((item) => item !== id);
    history = history.filter((item) => item !== id);
    if (!queue.length) {
      stop();
      return;
    }
    publish({ queue, queueIndex: queue.indexOf(state.trackId ?? "") });
    if (id === state.trackId)
      select(queue[Math.min(index, queue.length - 1)], state.wantsPlayback);
  },
  clearQueue() {
    if (!state.trackId) {
      stop();
      return;
    }
    publish({ queue: [state.trackId], queueIndex: 0 });
    shuffleBag = [];
    history = [];
  },
};
export function usePlayer() {
  return useSyncExternalStore(subscribePlayer, getPlayer);
}
setCatalogReconciler(() => playerActions.reconcileCatalog());
export function useTimeline() {
  return useSyncExternalStore(subscribeTimeline, getTimeline);
}
export function useProgress() {
  return useSyncExternalStore(subscribeTimeline, () => timeline.elapsed);
}
