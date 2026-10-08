# My Music Vault: backend and account milestone

Status: the accounts, real library, administration and personal library milestone was implemented on 2026-10-05. MongoDB Atlas configuration and private Backblaze B2 storage are implemented on 2026-10-08. The delivered table below is the current status; the broader planning sections retain future product targets. Setup and deployment requirements are in [README.md](README.md) and [ATLAS_B2_SETUP.md](ATLAS_B2_SETUP.md).

## Current project

- `frontend/` contains the React + Vite + TypeScript music application, real API-backed music, login/invitation registration, account pages, and admin management. Original demos remain opt-in for regression checks.
- Backend integration retains the single audio controller and shared mini/expanded/fullscreen state; logout and catalog removals clear unavailable playback safely.
- `backend/` contains modular FastAPI routes, PyMongo Async connection/indexes, explicit owner setup, role/session authorization, private audio, imports and personal persistence.
- The source library is `F:\project\Audio_player\Songs_data`, outside the frontend's public assets. Inventory on 2026-10-05: 42 MP3 files, approximately 230.7 MiB.

| Source folder | Initial user-facing collection | Files |
| --- | --- | ---: |
| `Love Songs` | Love | 27 |
| `Sad_breckup songs` | Sad / Breakup | 11 |
| `Silent songs` | Silent | 4 |

Keep the existing folders and filenames intact. Folder names provide initial labels, not verified musical metadata. Actual title, artist, album, language, and genre must be extracted from tags where available and reviewed when missing.

## Delivered milestone

| Area | Implemented behavior |
| --- | --- |
| Accounts | Invitation-only signup; email-bound one-use three-day links; login/logout; profile/password; revocable sessions; owner/admin/user roles |
| Security | Argon2; 15-minute memory access tokens; rotating HttpOnly refresh cookies; exact origins; live role/status checks; private read-only media authorization |
| Real library | All 42 sources imported into Atlas and private B2 with preserved source folders; metadata/artwork/duration extraction; real waveform peaks; duplicate hashing; range seeking |
| Discovery | Mood collections, search, separate mood/genre/language filters, recent songs, real greeting and continue listening |
| Admin | Real counts and operational health; upload/progress; edit/artwork; draft/publish/archive/restore/permanent removal; bulk moods |
| Organization | Create/rename/safe removal of labels; custom mood/genre creation in upload form; bulk artist/album name correction and explicit merging |
| People | Invite/revoke invitations; disable/remove normal accounts; revoke sessions; owner-only admin roles; protected owner; manual recovery links |
| Personal library | Persisted favorites, ordered playlists, smart playlists, latest song progress, volume and atmosphere preferences; account isolation |
| Verification | Disposable real-Mongo API tests; full-stack account/admin/media browser checks; retained player suite; lint, type checking and production build |
| Deployment foundation | Separate manifests, cross-platform root commands, environment templates, API Dockerfile and shared-origin nginx example |
| Atlas and B2 | Atlas SRV/TLS configuration; private B2 folder-based audio/artwork uploads; authenticated ranged streaming; exact object versions; migration and retry commands |
| Later song editing | Search and edit existing songs; add or replace optional artwork; preserve audio, song IDs and folder references; retry failed old artwork cleanup |

No real owner password has been chosen on behalf of the user. Run `npm run backend:owner` once per new database, then use that account to invite friends. The current database is Atlas and the 42-song library is stored in private B2. Local originals and the earlier local vault remain intact; switching databases does not automatically migrate existing users or their personal data.

V1 implementation choices differ from some longer-term targets below: one `labels` collection distinguishes kinds; artists/albums are descriptive song fields rather than separate entities; private files and embedded storage references live in the songs collection; playlists use bounded ordered arrays (1,000 songs each); history stores latest account/song progress. Import processing runs in one API worker, persists progress and permits manual retry after interruption. The dashboard reports listening records, not an invented play count. Upload forms currently omit track/disc numbers.

Remaining roadmap: R2 storage and direct signed playback URLs, automatic email delivery, durable processing workers, label ordering/hiding/merge, independent artist/album artwork/entities, shared editorial playlists and featured mood configuration, play-event analytics, mood journeys, memories, sleep/focus tools, friends' rooms and offline/PWA support. These are not represented as working features in the app. B2 currently streams through the API to retain private account/session checks.

Verification on 2026-10-05: 13 API integration tests passed; all 12 full-stack account/admin browser checks passed. All 27 original player cases passed across the full run and an isolated rerun: the concurrent browser run had one overall 30-second repeat/shuffle timeout, which passed in 14 seconds when rerun alone. Frontend lint/type checking/build and backend Ruff passed. Vite reports large JavaScript chunks; the Three.js ambience is already loaded separately. Re-importing the real collection skipped all 42 files with zero failures; all 42 managed audio files and measured waveforms are present. Test databases were removed. Docker and Atlas deployment remain unverified.

Verification on 2026-10-08: all 22 backend tests and all 13 full-stack account/admin browser checks passed. Cloud tests use S3-shaped clients and an actual boto3 SDK stub, covering private folder uploads, initial and later artwork, cover refresh, range seeking/HEAD, account revocation, migration preserving personal data, deletion failures and cleanup retries. Browser checks confirm song search, metadata/artwork persistence after reload and private image rendering. Local service checks still report 42 songs. Live Atlas/B2 transfer awaits credentials; test databases and media were removed.

Live cloud verification on 2026-10-08: the corrected application-key pair connects to the private B2 bucket, and Atlas is reachable. All 42 songs were imported with zero failures: 27 Love, 11 Sad/Breakup and 4 Silent. Exact B2 object versions, sizes and SHA-256 metadata match the retained originals; all 42 songs have measured waveform peaks. The source collection totals 241,898,115 bytes and has no embedded covers, so artwork can be added later through the admin editor. The real B2 media route returned matching first/middle byte ranges (206), correct HEAD size (200), and rejected unauthenticated access (401). The authorized range check used a process-local dependency override; it created no real users or sessions. Live owner login remains an interactive user setup step. Backend readiness, frontend login delivery and the frontend API proxy return 200.

Repeating the live cloud import skipped all 42 existing songs with zero failures and no new song records or media uploads. The final service check reports Atlas connected, private B2 connected and a 42-song catalog.

## Product direction

A private music library for the owner and invited friends, with a premium player and browsing centered on feelings. Songs are shared library records; favorites, history, preferences, and personal playlists belong to individual accounts.

Confirmed access policy: invitation-only registration, selected by the owner on 2026-10-05 and consistent with the original personal/friends brief. Admins create expiring, one-use invitation links; invited users choose their own passwords. New accounts receive the normal user role.

Recommended signature experience: select a feeling, choose a listening session, and enjoy a curated sequence through the existing immersive player. Start with explicit tags and simple rules rather than a recommendation model.

## Technology and deployment

| Responsibility | Choice |
| --- | --- |
| Frontend language | TypeScript, retaining React + Vite and the existing animation stack |
| API language and framework | Python + FastAPI + Pydantic |
| Database | MongoDB Atlas for the active vault; local MongoDB for disposable integration tests and the preserved earlier vault |
| MongoDB driver | PyMongo Async (`AsyncMongoClient`) |
| Local audio storage | Private files in a configured backend-managed directory |
| Production audio and artwork | Private Backblaze B2 with folder prefixes and exact version references; persistent private disk remains a supported local mode |
| Audio inspection | Mutagen for supported file tags and technical metadata |
| Waveform processing | A separate processing function with a later worker option |

Use a versioned `/api/v1` API and independently deployable frontend and backend folders. Configure database credentials, allowed origins, authentication secrets, source directory, and storage through backend environment variables. The frontend only receives its public API base URL.

Local playback authenticates a streaming request and delivers a file with HTTP byte-range support, so seeking does not require downloading the whole file. B2 playback authenticates the same API request, reads the specific private object version, and streams only the requested range through the API. Bucket URLs and application keys stay on the backend. Direct short-lived signed playback URLs are a future deployment optimization.

Use MongoDB indexes and pagination in the first version. Introduce Redis or a durable processing queue only when an observed processing or concurrency requirement warrants it.

## Account experience

Routes to add:

- `/login`: email and password, accessible errors, password visibility, and a remembered safe destination.
- `/register`: name, email, password, confirmation, and invitation validation under the confirmed policy.
- `/forgot-password` and `/reset-password`: one-use, expiring recovery tokens. Email delivery requires provider configuration; recovery must not be represented as working before that exists.
- `/account`: display name, password change, preferences, and active sessions.
- `/admin`: role-protected management shell, separate from the listening pages but using the same design tokens.

Recommended authentication: Argon2 password hashes; short-lived access tokens held in memory; rotating refresh tokens in HttpOnly cookies; server-side session records for revocation. Cookie-backed mutations require CSRF protection and origin checks. Deployment must define cookie domain, SameSite, HTTPS, CORS, and refresh behavior together.

Check the current user's status and permission on backend requests. Disabling an account or changing its role must revoke or invalidate its sessions. Registration can only create a normal user. Provision the initial owner through an explicit setup command, never through a client-supplied role or the first public signup.

| Role | Permissions |
| --- | --- |
| Owner | All management; grant/revoke admin access; configure access policy; protected from accidental removal |
| Admin | Upload, edit, archive, restore, and organize songs; invite and disable normal users; view operational statistics |
| User | Listen, browse, search, manage own favorites/playlists/history/preferences |

Admins cannot promote themselves or remove the owner. Protect owner invariants in backend operations. Audit administrative mutations without recording passwords, tokens, or other credentials.

## Song organization and upload form

Keep three independent classifications:

| Classification | Examples | Input |
| --- | --- | --- |
| Mood / feeling | Love, Sad, Breakup, Calm, Focus, Energetic, Party | Multiple selectable chips; admin can create a new mood |
| Genre / style | Rap, Pop, Classical, Dance, DJ Mix | Multiple selectable chips; admin can create a new genre |
| Language | Hindi, Punjabi, English, Instrumental | Selectable values, including unknown |

Do not put English and Love into a single category enum. One song can be English, Rap, and tagged both Energetic and Party. New labels should be normalized, checked for duplicate names, and immediately available in the appropriate user-facing filters after publication.

Upload form fields:

- Audio file, title, artist(s), album, and optional cover image.
- Moods, genres, language, year, track/disc number, and optional description.
- Publication state: draft, ready/published, archived.
- Optional admin-controlled featured placement.

Extract duration, format, file size, embedded tags, and embedded art automatically. Allow corrections to descriptive metadata. Do not accept a user-entered duration as authoritative.

Validate supported audio by decoding/inspection, not filename extension alone. Use bounded file sizes, generated storage names, streamed hashing, and image validation. Hash-based duplicate detection prevents storing identical audio twice; identical titles are not enough to identify duplicates.

## Local folder import

1. An owner/admin runs an import of the configured `Songs_data` directory. The API must not accept arbitrary filesystem paths from a browser.
2. Resolve every source path under the configured root; reject traversal and symlinks that escape it.
3. Present a preview with filename, readable metadata, inferred mood, duplicates, and validation errors.
4. Read embedded metadata, artwork, duration, size, and content hash. If a title is missing, propose a cleaned filename for review. Do not guess artist credits from long video filenames as established fact.
5. Map the three existing folders to the initial mood collections. Preserve the source folder as import provenance.
6. Copy accepted originals into backend-managed storage. Leave source files intact.
7. Create/update records idempotently, calculate display artwork and waveform data where available, and report imported, skipped, and failed counts.
8. Publish validated songs. Show actionable failures in the admin panel with retry support.

A repeated import must not create duplicate songs or files. A failed or interrupted import must not publish a record pointing to missing audio. Song import should remain usable if waveform generation fails; a seek bar is an acceptable fallback.

## Admin panel roadmap

This table preserves the full product target. The delivered milestone above lists the working V1 subset.

| Area | First version capabilities |
| --- | --- |
| Overview | Total published/draft/archived songs; active accounts; actual media bytes; recent uploads; import failures; aggregate plays over a selected period |
| Songs | Search and filters; add/upload; preview playback; edit metadata/artwork; bulk mood/genre assignment; archive and restore |
| Import / uploads | Folder-import preview; multi-file upload; per-file progress and validation; duplicate report; processing errors and retry |
| Moods, genres, languages | Create, rename, order, hide, and safely merge labels; show usage before removal |
| Artists and albums | Edit names/artwork; attach songs; merge duplicate records without losing references |
| Users and invitations | Invite/add users; search; change account status; revoke sessions; remove accounts; owner-only admin role management |
| Featured content | Pick featured songs and mood collections; manage shared editorial playlists |
| Activity | Who uploaded, edited, archived, restored, or changed access; timestamp and outcome |
| System | API/database/storage health; failed processing; aggregate storage usage and configured upload limits |

Use archive/restore as the ordinary song removal flow. Permanent deletion is a separate explicit action that deletes owned media only if it has no remaining references, then removes database references. A failed cloud deletion retains the archived record for retry. Never delete the original source folder through an admin action. When a song disappears, playlists should omit or mark it unavailable and the player should handle it cleanly.

User removal should define what happens to owned playlists and personal history; it must not delete shared music. Provide a visible confirmation describing affected user data. Keep detailed listening history private to its user; admin statistics should be aggregated unless an explicit product need justifies more access.

## Listener screens

- Home: a real greeting, Feel like listening to..., Love / Sad / Breakup / Silent cards, recently added, personal favorites, and continue listening.
- Mood collection: title, mood description, artwork, real song count, play all/shuffle, filters, and paginated songs.
- Library/search: songs, albums, artists, playlists, plus mood, genre, and language filters.
- Favorites and playlists: persisted per user, with creation, rename, add/remove, and ordering.
- Account: personal preferences, password change, session management, and logout.

The audio engine must remain mounted once while browsing listener pages. Replace static lookups in `src/data/music.ts` with an API-backed library store/cache before wiring real song IDs into the player. Components currently assume every track and album exists synchronously; add loading, empty, missing-item, and deleted-song handling.

On logout or account change, stop playback and clear the previous account's queue, favorites, library cache, and sensitive UI state. Do not silently fall back to demo songs when a real library request fails.

## Long-term data and API outline

The delivered schema and actual route names are documented in [README.md](README.md#modules-data-and-api). The following entity separation is a future scaling target.

Shared collections: `songs`, `artists`, `albums`, `moods`, `genres`, `languages`, `media_assets`, `upload_jobs`, and editorial playlists.

Account collections: `users`, `sessions`, `invitations`, `password_reset_tokens`, `favorites`, `playlists`, `playlist_items`, `listening_history`, `user_settings`, and `audit_events`.

Store mood/genre IDs on songs; separate storage asset identity from song metadata. Store user favorites as `(user_id, song_id)` associations with a unique index. Keep history and playlist items as separate records rather than unbounded arrays in user documents. Store UTC timestamps; render them in the user's timezone.

Key route groups:

| Route group | Responsibility |
| --- | --- |
| `/api/v1/auth` | Register, login, refresh, logout, recovery, current session |
| `/api/v1/songs` | Paginated library queries, song detail, authorized playback access |
| `/api/v1/moods`, `/genres`, `/languages` | Available classifications and counts |
| `/api/v1/me` | Profile, preferences, favorites, playlists, history, sessions |
| `/api/v1/admin` | Songs, imports, labels, users/invitations, featured content, statistics, audit |
| `/health` | Liveness; a separate readiness check covers dependencies |

All personal queries must be scoped to the authenticated account. Apply role authorization and input validation on the server, including media access. Use consistent errors, pagination limits, unique indexes, and safe duplicate/conflict handling.

## Features that give the vault its own identity

| Feature | Example | Priority |
| --- | --- | --- |
| Mood sessions | Choose Love or Calm, then listen to a curated session from your own library | First version |
| Smart playlists | Hindi + Love + favorites; contents update as qualifying songs are added | After persisted library and favorites |
| Mood journeys | Start with Sad, transition through Calm, finish with Uplifting using reviewed tags | Next product milestone |
| Personal song memories | A private note such as a place, date, or memory attached to a song | Next product milestone |
| Quiet listening tools | Sleep timer, focus mode, and a session that ends naturally | Next product milestone |
| Friends' listening rooms | Invite a few friends, share a queue, vote on what plays next | Later; requires synchronization and presence |
| Installable app | Mobile installation and a cached application shell | Later; downloaded audio needs an explicit offline feature |

Prioritize the first three music ideas over additional decorative effects. Recommendation rules should explain why a song appears and work only from the available library and user-approved tags.

## Delivery order and acceptance criteria

Core work for phases 1–4, smart playlists, private B2 object storage and live cloud import/stream verification is delivered. The pre-deployment audit adds upload/recovery/configuration safeguards, production templates, independent Dockerfiles and a shared-origin proxy. See [the audit report](../DEPLOYMENT_AUDIT.md). Phase 5 backup restore drills, target-host/TLS deployment verification and additional signature features remain follow-up work. Detailed planned criteria below guide expansion beyond V1.

1. **API and accounts:** modular FastAPI service, environment configuration, MongoDB connection/indexes, owner setup, register/login/logout, session handling, backend roles, frontend account routes. Verify normal users cannot call admin operations or read another user's personal data.
2. **Real library:** folder-import preview and idempotent import, initial mood collections, authenticated playback with seeking, API-backed frontend catalog, empty/error states. Verify all 42 sources receive an import result and valid songs play in the existing player.
3. **Admin management:** overview, upload/edit/archive/restore, classification management, users/invitations, processing status, and audit. Verify ordinary removal preserves source files, duplicates are rejected correctly, and disabling a user revokes access.
4. **Personal library:** persisted favorites, playlists and order, history, continue listening, preferences, and account cleanup. Verify account isolation and state after reload/logout.
5. **Signature features and deployment:** smart playlists/mood journeys, production private storage, deployment configuration, backups, and observed performance improvements. Add friends' rooms separately when the core experience is stable.

Run API tests against a real disposable MongoDB instance for persistence and index behavior, plus browser integration tests for login, role-protected routes, uploads, classification creation, authenticated seeking, personal data isolation, and mobile account/admin forms. Preserve the existing player checks and run frontend lint, type checking, and production build.

## Current technical references

- FastAPI's [security tutorial](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) recommends Argon2 password hashing and describes signed, expiring access tokens. The session rotation/revocation design above is an application decision.
- MongoDB's [PyMongo Async migration guide](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/) describes `AsyncMongoClient` and use with async frameworks such as FastAPI.
- Starlette's [response documentation](https://starlette.dev/responses/) describes `FileResponse` byte ranges and 206/416 responses for local streaming.
