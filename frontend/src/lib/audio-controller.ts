import type { PlaybackStatus, Track } from "../types/music";
import type { Timeline } from "./player-store";

interface Events {
  status: (status: PlaybackStatus, error?: string | null) => void;
  timeline: (timeline: Timeline) => void;
  ended: () => void;
}

/** The only audible element. All transport commands and media events cross this boundary. */
export class AudioController {
  readonly media: HTMLAudioElement;
  private generation = 0;
  private playAttempt = 0;
  private intent = false;
  private source = "";
  private pendingSeek: number | null = null;
  private frame = 0;
  private lastFrame = 0;
  private destroyed = false;
  private failed = false;
  private cleanup: (() => void)[] = [];
  private events: Events;

  constructor(events: Events) {
    this.events = events;
    this.media = document.createElement("audio");
    this.media.dataset.vaultAudio = "true";
    this.media.preload = "metadata";
    this.media.hidden = true;
    document.body.append(this.media);
    this.on("loadedmetadata", () => {
      if (this.pendingSeek !== null) {
        this.media.currentTime = this.pendingSeek;
        this.pendingSeek = null;
      }
      this.updateTimeline();
      if (!this.intent) this.events.status("PAUSED");
    });
    this.on("durationchange", () => this.updateTimeline());
    this.on("timeupdate", () => this.updateTimeline());
    this.on("progress", () => this.updateTimeline());
    this.on("canplay", () => {
      if (!this.intent) this.events.status("PAUSED");
    });
    this.on("playing", () => {
      if (this.intent && !this.media.paused) {
        this.events.status("PLAYING");
        this.tick();
      } else if (!this.intent) this.media.pause();
    });
    this.on("pause", () => {
      if (!this.media.paused) return;
      this.cancelTick();
      if (!this.intent && !this.media.ended && !this.failed)
        this.events.status("PAUSED");
    });
    this.on("waiting", () => {
      if (this.intent) {
        this.cancelTick();
        this.events.status(this.media.readyState ? "BUFFERING" : "LOADING");
      }
    });
    this.on("stalled", () => {
      if (this.intent && this.media.readyState < 3)
        this.events.status(this.media.readyState ? "BUFFERING" : "LOADING");
    });
    this.on("ended", () => {
      this.cancelTick();
      this.updateTimeline();
      this.events.ended();
    });
    this.on("error", () => {
      if (this.media.error) this.fail();
    });
  }
  private on(name: keyof HTMLMediaElementEventMap, fn: () => void) {
    const handler = () => {
      if (
        this.destroyed ||
        !this.source ||
        (this.media.currentSrc && this.media.currentSrc !== this.source)
      )
        return;
      fn();
    };
    this.media.addEventListener(name, handler);
    this.cleanup.push(() => this.media.removeEventListener(name, handler));
  }
  load(track: Track, autoplay: boolean, position = 0) {
    this.generation++;
    this.intent = autoplay;
    this.failed = false;
    this.source = "";
    this.cancelTick();
    this.media.pause();
    this.pendingSeek = position || null;
    this.events.status("LOADING");
    if (!track.audioUrl) {
      this.events.status(
        "ERROR",
        "This song has no audio source. Choose another song.",
      );
      return;
    }
    this.source = new URL(track.audioUrl, window.location.href).href;
    this.media.src = this.source;
    this.media.load();
    if (autoplay) this.play();
  }
  play() {
    if (!this.source || this.destroyed) return;
    this.intent = true;
    const request = this.generation;
    const attempt = ++this.playAttempt;
    if (this.media.readyState < 3) this.events.status("LOADING");
    void this.media.play().catch((error: DOMException) => {
      if (
        this.destroyed ||
        request !== this.generation ||
        attempt !== this.playAttempt ||
        !this.intent ||
        error.name === "AbortError"
      )
        return;
      this.intent = false;
      this.failed = true;
      this.events.status(
        "ERROR",
        error.name === "NotAllowedError"
          ? "Your browser paused playback. Tap Retry to start listening."
          : error.name === "NotSupportedError"
            ? "This audio format is not supported by your browser. Try another song."
            : "We couldn't play this song. Check your connection and try again.",
      );
    });
  }
  pause() {
    this.intent = false;
    this.playAttempt++;
    this.media.pause();
    this.cancelTick();
  }
  seek(seconds: number) {
    if (!this.media.readyState) {
      this.pendingSeek = seconds;
      return;
    }
    this.media.currentTime = seconds;
    this.updateTimeline();
  }
  setVolume(volume: number, muted: boolean) {
    this.media.volume = volume;
    this.media.muted = muted;
  }
  stop() {
    this.generation++;
    this.intent = false;
    this.source = "";
    this.pendingSeek = null;
    this.media.pause();
    this.cancelTick();
    this.media.removeAttribute("src");
    this.media.load();
  }
  private fail() {
    this.intent = false;
    this.failed = true;
    this.cancelTick();
    const code = this.media.error?.code;
    this.events.status(
      "ERROR",
      code === 4
        ? "This audio format is not supported by your browser. Try another song."
        : code === 3
          ? "This audio file couldn't be decoded. Try another song."
          : "We couldn't load this song. Check your connection and try again.",
    );
  }
  private updateTimeline() {
    const duration = Number.isFinite(this.media.duration)
      ? this.media.duration
      : 0;
    let buffered = 0;
    for (let i = 0; i < this.media.buffered.length; i++) {
      if (this.media.buffered.start(i) <= this.media.currentTime + 0.1)
        buffered = this.media.buffered.end(i);
    }
    this.events.timeline({
      elapsed: this.media.currentTime,
      duration,
      buffered,
    });
  }
  private tick = () => {
    this.cancelTick();
    const step = (now: number) => {
      if (this.destroyed || this.media.paused || !this.intent) return;
      if (now - this.lastFrame >= 80) {
        this.updateTimeline();
        this.lastFrame = now;
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  };
  private cancelTick() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  destroy() {
    this.destroyed = true;
    this.cleanup.forEach((fn) => fn());
    this.stop();
    this.media.remove();
  }
}
