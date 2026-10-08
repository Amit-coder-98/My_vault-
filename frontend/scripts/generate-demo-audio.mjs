import { mkdirSync, writeFileSync } from "node:fs";

// Original, deterministic synthesized sketches. No third-party recordings.
// Each fictional album shares one short sketch; replace Track.audioUrl for real music.
const rate = 16000;
const albums = ["tides", "golden", "blue", "quiet", "after", "bloom"];
const roots = [174.614, 196, 146.832, 164.814, 130.813, 220];
const manifest = {};
mkdirSync("public/audio", { recursive: true });
for (let a = 0; a < albums.length; a++) {
  const duration = 24 + a * 2;
  const count = duration * rate;
  const samples = new Float32Array(count);
  let seed = 92017 + a * 511;
  let noise = 0;
  const notes = [0, 7, 12, 16, 19, 12, 7, 4];
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise = noise * 0.96 + ((seed / 4294967296) * 2 - 1) * 0.04;
    const fade = Math.min(1, t / 1.5, (duration - t) / 2);
    const root = roots[a];
    const pad =
      (Math.sin(t * root * Math.PI * 2) +
        Math.sin(t * root * 1.498 * Math.PI * 2) * 0.6 +
        Math.sin(t * root * 2.002 * Math.PI * 2) * 0.28) *
      0.12;
    const beatLength = 0.65 + a * 0.07;
    const beat = Math.floor(t / beatLength);
    const age = t % beatLength;
    const note = root * 2 ** (notes[(beat + a) % notes.length] / 12);
    const pluck =
      Math.sin(age * note * Math.PI * 2) *
      Math.exp(-age * 6) *
      Math.min(1, age * 90) *
      0.2;
    const pulse = 0.74 + 0.26 * Math.sin(t * Math.PI * 0.5 + a);
    samples[i] = (pad * pulse + pluck + noise * 0.045) * Math.max(0, fade);
  }
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + count * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    wav.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
      44 + i * 2,
    );
  const peaks = Array.from({ length: 180 }, (_, p) => {
    let max = 0;
    for (
      let i = Math.floor((p * count) / 180);
      i < Math.floor(((p + 1) * count) / 180);
      i++
    )
      max = Math.max(max, Math.abs(samples[i]));
    return Number(max.toFixed(4));
  });
  writeFileSync("public/audio/" + albums[a] + ".wav", wav);
  manifest[albums[a]] = {
    url: "/audio/" + albums[a] + ".wav",
    duration,
    peaks,
  };
}
writeFileSync("src/data/demo-audio.json", JSON.stringify(manifest));
console.log(
  "Created six original audio sketches with measured waveform peaks.",
);
