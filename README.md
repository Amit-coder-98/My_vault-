# My Music Vault

The application is organized into two independently deployable service folders.

```text
Audio_player/
  frontend/              React + Vite + TypeScript application
    src/                 Listening, account and admin pages; API catalog and player
    public/              Static assets, album artwork, and original demo audio
    scripts/             Frontend asset helpers
    tests/               Browser integration tests
    docs/                Artwork provenance and player architecture
    package.json         Frontend scripts and dependencies
    package-lock.json    Reproducible frontend dependency installation
    vite.config.ts       Frontend build and development configuration
    README.md            Frontend architecture and feature documentation
  backend/               Python + FastAPI + MongoDB service
    app/                 Accounts, library, private audio, imports and administration
    tests/               API integration tests and browser test bootstrap
    storage/             Private managed audio/artwork; ignored local data
    requirements.txt     Pinned Python dependencies
    Dockerfile           Independent API container definition
    .env.example         Configuration template without credentials
    IMPLEMENTATION_PLAN.md Delivered milestone and future product roadmap
  Songs_data/            Owner's local source music, organized by feeling
  package.json           Independent frontend/backend convenience commands
  package-lock.json      Root command package lockfile
  .gitignore             Generated files and local data exclusions
  README.md
```

## Development

Run these commands from the project root:

```sh
npm run setup
npm run setup:backend
npm run backend:owner
npm run dev:backend
```

Keep the backend terminal running. In a second terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** and use the email/password you chose during the interactive owner setup. There are no default credentials. The initial owner can invite friends from **Manage vault → People**; public signup is disabled. If an owner already exists, skip owner setup.

Requirements: Node.js 22.12+, Python 3.10+, MongoDB running locally or a configured Atlas connection, and FFmpeg for real waveform generation. The current backend configuration uses Atlas and private Backblaze B2; disposable tests use local MongoDB. Backend environment options are documented in [backend/README.md](backend/README.md).

Your 42 MP3s have been imported into private backend storage: 27 Love, 11 Sad/Breakup, and 4 Silent. The original `Songs_data/` files are preserved. Use **Manage vault → Import** or `npm run backend:import` after adding new source files; repeated imports skip identical audio.

The existing root commands still work:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run test:accounts
npm run test:backend
npm run lint:backend
npm run preview
```

You can also work directly inside the frontend:

```sh
cd frontend
npm ci
npm run dev
```

Node.js 22.12+ is required. Browser tests currently use an installed Google Chrome; see the [frontend documentation](frontend/README.md) for Chromium setup.

## Frontend deployment

Read [the deployment guide](DEPLOYMENT.md) and [the pre-deployment audit](DEPLOYMENT_AUDIT.md)
before publishing. Production templates and independent frontend/backend Dockerfiles
are included, with a root Compose configuration for a server behind an HTTPS ingress.
For the selected Vercel hosting, follow [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).
Import the `frontend` folder into Vercel and deploy the current FastAPI backend
separately. `frontend/vercel.ts` configures the shared-origin API proxy using
the deployment environment's `VAULT_API_ORIGIN`.

Configure the hosting service to use the frontend folder:

| Setting | Value |
| --- | --- |
| Project/root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Publish/output directory | `dist` |

The output directory relative to this repository is `frontend/dist/`. The frontend has its own package manifest, lockfile, and configuration, so it can be built without the root convenience package. Its default mode requires the backend.

Serve the independently deployed frontend and API through one public HTTPS origin, forwarding `/api` to the backend and falling back to `index.html` for application routes. [frontend/deploy/nginx.conf](frontend/deploy/nginx.conf) provides security headers, SPA fallback and private streaming configuration. Configure production secrets, secure cookies, exact origins, MongoDB and private storage as described in [DEPLOYMENT.md](DEPLOYMENT.md). Container builds require verification on the deployment host because Docker is unavailable here.

## Backend

FastAPI exposes invitation-only accounts, revocable sessions, owner/admin/user permissions, a real shared catalog and protected audio with HTTP range seeking. The dashboard supports upload/edit/archive/restore/delete, import preview/progress, custom moods/genres/languages, artist/album corrections, invitations, account access, recovery links, operational counts and audit activity.

Favorites, manual/smart playlists, listening progress and preferences persist per account. The existing mini, expanded and fullscreen player remains centralized and stops on logout or removal of its playing song. See [frontend/README.md](frontend/README.md) for its behavior and browser checks.

MongoDB Atlas and private Backblaze B2 are implemented through `backend/.env`, and live connection checks pass for the configured accounts. B2 imports preserve the source folders, and admin uploads support optional covers and later artwork/details editing. Follow [the Atlas/B2 setup guide](backend/ATLAS_B2_SETUP.md), then run `npm run backend:check` and `npm run backend:import`.

Automatic email delivery remains a future integration. Signature ideas for the next milestone are mood journeys, personal song memories and quiet listening tools; friends' listening rooms can follow. The [implementation plan](backend/IMPLEMENTATION_PLAN.md) distinguishes delivered features from this roadmap.
