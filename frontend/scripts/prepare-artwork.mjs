import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const artworkDirectory = fileURLToPath(
  new URL("../public/artwork/", import.meta.url),
);
await mkdir(artworkDirectory, { recursive: true });
const source = process.argv[2];
if (source)
  await sharp(source)
    .resize(800, 800, { fit: "cover" })
    .webp({ quality: 86 })
    .toFile(resolve(artworkDirectory, "between-the-tides.webp"));
const artwork = [
  ["golden-hour", "photo-1509316785289-025f5b846b35"],
  ["into-the-blue", "photo-1518837695005-2083093ee35b"],
  ["a-quiet-place", "photo-1441974231531-c6227db76b6e"],
  ["after-hours", "photo-1519608487953-e999c86e7455"],
  ["slow-bloom", "photo-1490750967868-88aa4486c946"],
];
const results = await Promise.allSettled(
  artwork.map(async ([name, id]) => {
    const response = await fetch(
      `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&h=700&q=85`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const image = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(700, 700)
      .jpeg({ quality: 85 })
      .toBuffer();
    await writeFile(resolve(artworkDirectory, `${name}.jpg`), image);
    return { name, bytes: image.length };
  }),
);
results.forEach((result) =>
  console.log(
    result.status === "fulfilled" ? result.value : String(result.reason),
  ),
);
if (results.some((result) => result.status === "rejected"))
  process.exitCode = 1;
