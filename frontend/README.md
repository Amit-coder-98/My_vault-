# My Music Vault

A premium personal music frontend built with React, Vite, and strict TypeScript. The existing Home, library, search, favorites, and collection pages share a persistent animated music player.

The default application uses the FastAPI backend: invitation-only login/registration, account settings, owner/admin management, real mood collections, private audio, persisted favorites, manual/smart playlists, listening progress and preferences. Start the backend and provision an owner using [the root setup commands](../README.md#development). Queue and player mode remain local to the current session.

The original fictional library is retained only for explicit demo mode (`VITE_DEMO_MODE=true`) and player regression tests. Its eighteen fictional songs share six original synthesized sketches (24–34 seconds), labeled as demo audio. The real library never silently falls back to these recordings.

## Develop and validate

Run from `frontend/`, or use the equivalent convenience commands at the repository root.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run test:accounts
npm run preview
```

Open http://127.0.0.1:5173. Node.js 22.12+ is required. Tests use installed Google Chrome. If Chrome is unavailable, run `npx playwright install chromium` and remove `channel: "chrome"` from `playwright.config.ts`.

Deployment uses `frontend/` as the project directory and `dist/` as the output directory. Serve the frontend and API through one HTTPS origin with `/api` proxied to FastAPI; keep `VITE_API_ORIGIN` empty. The Vite development server proxies `/api` to port 8000. See [the proxy example](deploy/nginx.conf), `.env.example`, and [the root deployment instructions](../README.md).

## Player experience

- Mini player, floating expanded panel/mobile sheet, and immersive fullscreen view.
- Shared surface, artwork, and metadata transitions; coordinated song changes; artwork-derived ambience.
- Real play/pause, accurate seeking, buffered progress, WaveSurfer waveform, volume/mute, and animated favorites.
- Previous restarts the current song after three seconds; otherwise it selects the previous queued song.
- Repeat off/all/one, shuffle without immediate duplicates, and shuffle history for previous.
- Queue drawer on desktop and bottom sheet on phones. Remove individual songs, play queued songs, or clear up next while retaining the current song.
- Artwork-only horizontal skip and downward minimize gestures.
- Loading, buffering, unsupported-source errors, retry, artwork fallback, and an honest idle state.
- Media Session metadata, play/pause, previous/next, relative seek, and position reporting where the browser supports them.
- Focus traps, nested Escape dismissal, reference-counted scroll locks, focus restoration, safe areas, and reduced motion.

## Stack and boundaries

TypeScript owns application logic and contracts. CSS and Tailwind own tokens and layout. Motion owns shared layouts and player transitions. GSAP owns the initial page reveal. Lenis owns desktop wheel scrolling and stops during modal locks. WaveSurfer.js is a lazy visual observer of the controller's existing media element. React Three Fiber and Three.js supply optional ambient particles.

Particles are off by default. Enable **Listening preferences → Ambient particles** and open fullscreen on a capable desktop. The scene is lazy-loaded, rendered at pixel ratio 1, stopped while hidden/paused, and omitted on mobile, reduced motion, low-resource devices, or unavailable WebGL. CSS ambience remains visible in those cases. Three.js is pinned to r182 because the installed React Three Fiber version still constructs `THREE.Clock`, deprecated from r183 onward.

`src/lib/api.ts` handles memory access tokens, single-flight cookie refresh and readable errors; `auth-store.ts` and `router.ts` own accounts and browser routes. `src/data/library.ts` provides the API-backed catalog to the existing player. Account changes stop playback and clear private caches. `src/pages/admin` contains the management screens, and `usePersistentPlayback.ts` saves listening progress/preferences. Atlas/B2 are configured only in the backend; native media requests remain authenticated API URLs. Email delivery remains a future integration.

## Architecture

`src/lib/player-store.ts` owns the selected song, playback status/intent, queue/index, shuffle history, repeat, volume/mute, favorites, player mode, and queue visibility. It exposes control and timeline subscriptions so clock updates only render timeline consumers. Both projections belong to one centralized store.

`src/lib/audio-controller.ts` owns the single audible `HTMLAudioElement`. Browser events drive loading, playing, paused, buffering, errors, actual time/duration, and queue advancement. Playback promises have cancellation guards. No simulated clock runs alongside it.

`src/components/player/MusicPlayer.tsx` stays mounted above page navigation. Its one surface changes geometry between modes. The mini, expanded, and fullscreen compositions reuse artwork, metadata, transport, progress, waveform, and status components. Timings live in `src/animations/config.ts`; player geometry and layer tokens live in `src/styles/player.css`.

Reusable hooks own audio lifecycle, Media Session, shortcuts, live reduced-motion preference, dialogs, reveal, and scrolling. Opening the queue preserves player mode and position. Closing it restores focus to the player; closing the player restores page scrolling and the mini-player opener.

See [the player implementation notes](docs/player.md) for behavior and source integration.

## Keyboard

| Action                           | Shortcut                                   |
| -------------------------------- | ------------------------------------------ |
| Play / pause                     | Space outside a native interactive control |
| Seek backward / forward          | Left / right arrow, five seconds           |
| Next / previous                  | N / P (L / J also supported)               |
| Mute                             | M                                          |
| Favorite current song            | F                                          |
| Search                           | Ctrl / ⌘ K                                 |
| Close the top dialog or minimize | Escape                                     |

Playback shortcuts ignore text fields, editable content, native range inputs, modifier combinations, and held-key repeats. Native button and slider keyboard behavior is preserved.

## Assets and verification

Artwork is local; provenance is recorded in [docs/artwork.md](docs/artwork.md). Audio and measured waveform peaks can be regenerated deterministically:

```sh
node scripts/generate-demo-audio.mjs
```

The browser suite covers actual playback, mode continuity, queue mutations, waveform/timeline seeking, repeat/shuffle, volume/mute, shortcuts and typing, loading/buffering, decode failure/retry, artwork fallback, invalid/long duration, browser media actions, gestures, rapid interruptions, reduced motion, WebGL fallback, and navigation regression checks. Layout screenshots cover 375, 390, 430, 768, 1024, 1280, 1440, and 1920px widths. Screenshots are saved in the ignored `output/` folder; failure traces are retained in `test-results/`.

The optional Three.js scene has a large separate build chunk and is not requested during initial loading. Native hardware volume and Media Session availability depend on the browser/platform. Queue drag reordering, live broadcasts and offline downloads are future features.

`test:e2e` runs the original player suite in explicit demo mode on port 5174. `test:accounts` runs real API/MongoDB integration flows on ports 5175/8001 with isolated test users and private media. It covers invitations, role restrictions, authenticated seeking, custom categories, favorites/smart playlists, upload/archive/restore, artist/album correction, clearing an archived playing song, logout and mobile layouts. API test data is separate from the real vault.
