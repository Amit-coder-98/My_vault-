# My Music Vault backend

Python + FastAPI, PyMongo Async, MongoDB, Argon2, Mutagen, Pillow and FFmpeg. The API serves a private shared music library and each account's own favorites, playlists, listening progress and preferences.

MongoDB Atlas and private Backblaze B2 are supported, and live connection checks pass for the configured accounts. Follow [ATLAS_B2_SETUP.md](ATLAS_B2_SETUP.md) to fill `backend/.env`, check the services, upload the 42 source songs by folder and add artwork later.

## Local setup

Requirements: Python 3.10+, Node.js 22.12+ for root convenience commands, a reachable MongoDB instance, and FFmpeg on PATH for measured waveforms. The current development configuration uses Atlas and private B2. Disposable tests use the existing local MongoDB at `127.0.0.1:27017`.

From the project root:

```powershell
npm run setup:backend
# Optional: copy backend/.env.example to backend/.env and change local settings.
npm run backend:owner
npm run dev:backend
```

In a second terminal, run `npm run dev` and open **http://127.0.0.1:5173**. Sign in with the email and password entered during owner setup. There is no default account or public administrator signup. Owner setup is interactive and refuses to create a second owner. Use the same hostname consistently when signing in and playing music.

The same service can run independently from `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.cli setup-owner
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

On Linux/macOS, use `python3` and `.venv/bin/python`. API documentation: http://127.0.0.1:8000/docs in development. `/health` checks the process; `/health/ready` checks MongoDB, the processing directory and the configured private storage provider. Startup fails clearly if MongoDB cannot be reached.

## Accounts and permissions

- Owner: manage music and invited users; grant/revoke admin access. The owner cannot be disabled, demoted or removed through the admin API.
- Admin: manage music/classifications, invite friends, disable/remove normal users, revoke their sessions and create recovery links. Admins cannot manage other admins or elevate their own role.
- User: access published music and manage their own personal library and account. Registration always creates this role.

In **Manage vault → People**, create an email-bound invitation and share its private link with that friend. Links expire after three days and can be used once. Friends choose their own passwords. Invitation delivery is manual; no email provider is configured.

Passwords use Argon2. Access tokens expire after 15 minutes and are kept in frontend memory. Rotating seven-day refresh tokens use an HttpOnly, SameSite cookie with hashed server-side session records. Origin checks protect cookie-authenticated mutations. APIs check live sessions and account status, so disabling an account or revoking a session also blocks private media requests. Native audio and cover requests use the cookie on read-only endpoints; files are never placed in frontend public assets.

Users can change their name/password and review/revoke sessions at `/account`. Password changes revoke all sessions. Admin recovery links expire in one hour and can be used once. An owner locked out of their own account can run:

```powershell
npm run backend:recovery
```

Treat invitation and recovery links as private. The provided server commands disable request access logging so URLs containing tokens are not logged.

## Music and import

The configured source root defaults to `../Songs_data`. The initial 42 MP3s were imported successfully on 2026-10-05: 27 Love, 11 Sad/Breakup, and 4 Silent. Original source files remain intact. Local-mode imports copy audio into `storage/audio`; B2-mode imports preserve source folders under `B2_PREFIX` in the private bucket. Both modes derive private cover thumbnails and real waveform peaks, and detect duplicates by SHA-256. See [ATLAS_B2_SETUP.md](ATLAS_B2_SETUP.md) for cloud configuration and migration.

On 2026-10-08, all 42 songs were also imported successfully into Atlas and private B2 with zero failures. Every cloud audio object's exact version, size and checksum metadata matches the retained local source, and all 42 songs have measured waveform peaks. Live range/HEAD checks passed. These source songs have no embedded cover images; add artwork through **Manage vault → Songs → Edit** after creating the owner account.

Use **Manage vault → Import** for a preview and progress report, or run:

```powershell
npm run backend:import
```

Re-importing identical files skips them. Browsers cannot choose arbitrary server filesystem paths. Escaping symlinks and managed-media traversal are rejected. Folder names provide mood tags; missing title/artist metadata is flagged for review rather than guessed. Review the imported songs under **Songs**.

Upload MP3, FLAC, M4A, OGG or WAV, up to 100 MB per file, with optional JPEG/PNG/WebP cover art up to 8 MB. Technical duration, size and format come from the file. Embedded artist, album and year fill blank form defaults. Multi-file uploads preserve completed files and leave the remaining files ready to retry after a failure. New moods/genres can be created directly in the song form; language is separate.

Archiving removes a song from listener catalogs and stops it if it is playing in the current administrator's player. Restore republishes it. Permanent deletion requires an archived song and removes its personal references and managed media; it never removes the original source. Artist and album names are song metadata, with bulk correction and explicit merging under **Artists & albums**.

FFmpeg waveform failure leaves a working seek-bar fallback. Native browser codec support still determines which formats can play on a device; this version does not transcode originals.

## Modules, data and API

| Module | Responsibility |
| --- | --- |
| `config.py`, `database.py` | Environment, paths, MongoDB connection and indexes |
| `security.py`, `auth.py` | Passwords, sessions, invitations, roles and recovery |
| `catalog.py`, `media.py` | Published catalog, private artwork/audio, HTTP range seeking |
| `storage.py` | Local/B2 assets, private ranged streams, exact object versions and cleanup retries |
| `imports.py`, `admin.py` | Imports, upload/metadata/labels, users, real overview and audit |
| `personal.py` | Account-scoped favorites, playlists, progress and preferences |
| `cli.py`, `main.py` | Explicit owner provisioning, operator import and service lifecycle |

MongoDB collections: `users`, `sessions`, `invitations`, `reset_tokens`, `songs`, `labels`, `favorites`, `playlists`, `history`, `preferences`, `upload_jobs`, `locks`, `audit`, `rate_limits`, and `asset_cleanup`. Labels have a typed mood/genre/language kind and normalized unique names. Favorites and progress have unique account/song indexes. Playlists use ordered, bounded arrays of at most 1,000 songs and at most 500 playlists per account. Smart playlists resolve mood/genre/language/favorite rules against currently published songs. History stores the latest position per account/song, not a complete play-event log; overview reports distinct listening records accordingly.

Versioned API groups: `/api/v1/auth`, `/api/v1/songs`, `/api/v1/labels`, `/api/v1/me`, and `/api/v1/admin`. Catalog queries are paginated (maximum 200 per request). Audio supports GET/HEAD and byte ranges with 206/416 responses. The development OpenAPI page lists complete request/response contracts.

## Validation

From the root:

```powershell
npm run lint:backend
npm run test:backend
npm run test:accounts
```

API tests use isolated temporary storage and disposable MongoDB databases with `my_music_vault_test_` names. Full-stack browser tests use a separate `my_music_vault_browser_test_` database and ports 8001/5175. Test credentials belong only to those generated databases; they are never installed in the real vault. MongoDB and Google Chrome must be available. The account test command cleans its recorded test database and private media after Playwright stops, including forced Windows server shutdown.

## Deployment

The full release procedure is in [DEPLOYMENT.md](../DEPLOYMENT.md), with audit
results in [DEPLOYMENT_AUDIT.md](../DEPLOYMENT_AUDIT.md). Use
`.env.production.example` as a template for a separate, ignored production file;
keep the working local `.env` for development. Frontend/API Dockerfiles and root
`compose.yaml` are included. Container builds still need target-host validation.

The frontend and backend build independently. Serve them through one public HTTPS origin with `/api` forwarded to the API, because native media authentication uses a same-origin cookie. See [the example nginx configuration](../frontend/deploy/nginx.conf) for SPA fallback, API forwarding and upload limits. Keep `VITE_API_ORIGIN` empty with this layout.

Set `VAULT_ENV=production`, a random `AUTH_SECRET` of at least 32 characters, `COOKIE_SECURE=true`, your HTTPS `FRONTEND_URL`, and an exact JSON `ALLOWED_ORIGINS` list. Store credentials in environment secrets or an ignored `.env`; never in `.env.example`. Set `MONGODB_URL` to an Atlas connection string and restrict database access to your API host. Atlas and private B2 connectivity have been verified from this development machine; verify access again from the deployment host.

In local storage mode, persist `STORAGE_DIR` across releases and back up it together with MongoDB. B2 mode stores permanent assets in the private bucket; `STORAGE_DIR` is writable temporary processing space, and existing local records still need their files until migrated. Mount the configured source directory read-only when folder import is needed. The included Dockerfile installs FFmpeg and runs as a non-root user; container builds were not verified here because Docker is unavailable. Provision the owner with `python -m app.cli setup-owner` inside the configured deployment environment.

Run one API worker in this version. Folder imports run in that process with persisted progress; restart marks unfinished jobs interrupted and releases the import lock for manual retry. Add a durable worker before scaling API workers. B2 assets stream through the API, so media access checks remain in one place; direct signed playback URLs, R2, automatic email delivery, friends' rooms, mood journeys, memories and offline audio remain follow-ups.
