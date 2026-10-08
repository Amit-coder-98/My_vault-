import type WaveSurfer from "wavesurfer.js";

// External media stays owned by AudioController. Destroying the renderer cannot pause it.
export async function createAudioWaveform(
  container: HTMLElement,
  media: HTMLAudioElement,
  source: { duration: number; peaks: number[] },
  accent: string,
  signal: AbortSignal,
): Promise<WaveSurfer> {
  const { default: WaveSurfer } = await import("wavesurfer.js");
  if (signal.aborted || media.currentSrc !== media.src)
    throw new DOMException("Waveform view superseded", "AbortError");
  return WaveSurfer.create({
    container,
    media,
    peaks: [source.peaks],
    duration: source.duration,
    height: 56,
    waveColor: "#ffffff30",
    progressColor: accent,
    cursorWidth: 0,
    barWidth: 2,
    barGap: 3,
    barRadius: 2,
    barMinHeight: 3,
    normalize: true,
    interact: false,
    dragToSeek: false,
    hideScrollbar: true,
    autoScroll: false,
  });
}
