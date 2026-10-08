# Player implementation

## State and ownership

```text
UI / keyboard / Media Session
              ↓
        playerActions
              ↓
      AudioController (one audio element)
              ↓ actual browser events
      centralized player store
              ↓
 control subscribers + timeline subscribers
```

Playback statuses are `IDLE`, `LOADING`, `PLAYING`, `PAUSED`, `BUFFERING`, and `ERROR`. Modes are `mini`, `expanded`, and `fullscreen`. Playback intent is tracked separately from actual playing so loading/buffering can still be cancelled with Pause. Waiting before metadata stays LOADING; waiting after metadata becomes BUFFERING.

Selecting a collection replaces the queue. Selecting a row inside the queue preserves it. Previous restarts after three seconds; at the first song it restarts rather than silently wrapping. Next at the last song stays there when repeat is off; automatic completion pauses at the end. Repeat all wraps and repeat one restarts on automatic completion. Manual Next still changes songs under repeat one. Paused skips stay paused; selecting a new collection starts playback.

Shuffle uses a bag excluding the current song and a history stack. Each remaining queued song is consumed once before a manual/new repeat-all cycle is generated. Removal also removes stale shuffle/history entries. The queue's Up next marker uses the actual shuffle candidate.

Clear up next leaves the active song in the queue. Removing the active row selects its successor (or last remaining predecessor); removing the final row stops and returns to the idle mini player.

## Browser audio and source integration

All controls call store actions. Only `AudioController` performs load/play/pause/seek/volume operations and handles browser audio events. Strict Mode lifecycle cleanup removes the element and every listener/animation frame. Track generations and play-attempt guards discard stale promises. The source is checked when processing events.

The demo generator produces six original mono PCM WAV sketches and measured peaks. Fictional library tracks reference their album's sketch and its real duration.

For the real vault, upload through **Manage vault → Songs** or import the configured private source folder. The API catalog supplies authorized audio URLs, extracted duration and measured peaks; do not put private recordings into `public/audio/`. That directory contains only the original demo sketches used by explicit demo mode. Actual time/duration remain authoritative in the existing audio controller, with no additional audio element or mock clock.

WaveSurfer is created only after metadata is available. It observes the same media element with interaction disabled. An accessible range overlay sends all seeks through the store. Precomputed peaks avoid fetching/decoding the entire source again. Renderer teardown does not stop the external media.

The small visualizer uses deterministic peak/time modulation as a decorative amplitude simulation; it is not a Web Audio frequency analyzer. It settles when paused and under reduced motion. Buffer indicators are derived from the browser's actual buffered ranges.

## Animation and dialogs

The root player surface stays mounted. Motion layout projection handles geometry; artwork and metadata reuse layout IDs across modes. Track-keyed coordinated fades settle on the latest selection. Artwork gestures alone have touch-action disabled; scrolling and range controls retain their native behavior.

Fullscreen ambience combines enlarged blurred artwork, palette glow, gradients, and grain. The optional R3F scene is a lazy enhancement. Shared timings are centralized; CSS uses corresponding duration tokens. The reduced-motion hook responds to live preference changes: page movement is skipped, player transitions use short fades, shared projection/float/glow are disabled, and particles are omitted.

Dialog locks are reference counted, and only the top dialog traps Tab or handles Escape. Lenis listens for lock changes. Nested queue dismissal retains the large player lock and restores its focus. Closing the last dialog restores original body styles and page context.

Layer order: navigation → mini player → scrim → large player → search/details → queue → notifications. Account and admin operations use accessible dismissible status notices at the notification layer.

## Verification and current limits

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` from either the frontend or repository root.

Chrome integration tests exercise real audio and native inputs. Controlled media events cover stalled/unknown-duration conditions that short local clips otherwise cannot reproduce. Malformed audio/image responses exercise actual browser decode errors and fallback/retry. The suite checks focus, body-lock release, one audible element, continuous position, and relevant console warnings/errors.

Media Session uses feature detection, catches unsupported actions, reports finite position, and clears handlers/metadata on cleanup. Mobile browsers may require user activation and may reserve volume control for the device buttons. The default app now integrates authenticated range streaming, a real shared library, uploads and account-scoped favorites/playlists/progress/preferences. Queue and player mode remain local to the session. Drag queue reordering, signed cloud URLs and offline downloads remain future work; see [the backend documentation](../../backend/README.md).

Official implementation references: [HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play), [Media Session actions](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler), [Motion shared layout](https://motion.dev/docs/react-layout-animations), and [WaveSurfer options](https://wavesurfer.xyz/docs/types/wavesurfer.WaveSurferOptions).
