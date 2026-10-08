# Pre-deployment audit

Audited on **2026-10-08**. The application passes the local release checks after
the fixes below. It is ready for deployment configuration and target-host
verification. It has **not been published**, and the current `backend/.env`
remains configured for local development.

## Findings addressed

| Finding | Impact | Resolution |
| --- | --- | --- |
| Request limits trusted `Content-Length` | Chunked/understated requests could bypass the early upload limit; JSON routes also accepted unnecessarily large bodies | Count actual body bytes, cap ordinary requests at 128 KiB, and apply separate audio/artwork multipart limits before parsing |
| Multipart parsing preceded authorization | Guests or listeners could make the API spool upload files before being rejected | Verify the live session and admin role before reading any upload body; retain normal route authorization |
| Older recovery links survived password changes/resets | A previously issued link could change a password again | The newest recovery link replaces earlier links; password changes/resets revoke every outstanding recovery link and all sessions |
| Validation errors included rejected inputs | Responses could echo password/token values | Return field locations, messages and error types without input values |
| Production configuration lacked strict origin checks | HTTP/wildcard/mismatched origins could produce insecure or broken deployments | Fail startup for unsafe HTTPS origins, insecure cookies, missing/short secrets and invalid environment names; bound upload settings |
| Production disabled Swagger but retained the schema | API schema remained publicly accessible | Disable `/docs`, `/redoc` and `/openapi.json` in production |
| Proxy lacked verified client-IP forwarding and streaming settings | Shared proxy IP could throttle all friends; audio could be buffered to disk | Overwrite forwarded client IP, disable media response buffering/cache, preserve range traffic, document trusted ingress configuration |
| Frontend lacked production security headers | Browser policy and invitation/recovery referrer protection were absent | Add tested CSP, no-referrer, anti-framing, MIME and browser permission headers; disable Nginx access logs |
| Public readiness performed cloud operations | Anyone could trigger Atlas/B2 checks | Publish inexpensive `/health` only; keep `/health/ready` internal |
| Container builds lacked secret/context exclusions | Local `.env`, private storage or test artifacts could enter build contexts | Add per-service `.dockerignore`, a separate production template, a frontend Dockerfile and a Compose definition with a private API |
| Queued artwork cleanup survived asset reuse | An old cleanup job could remain indefinitely after its asset became referenced again | Remove the obsolete cleanup job while preserving referenced artwork |
| Shared-asset deletion ignored B2 versions | Another record using a different version of the same key could prevent cleanup of the owned version | Compare bucket, key and exact version before treating an asset as shared |
| Image validation accepted formats outside the advertised list | Unexpected image formats and over-limit pixel counts could enter processing | Require JPEG/PNG/WebP and reject images above 20 megapixels before decoding |

Expired invitation/recovery records now have TTL indexes. Password changes and
recovery-link creation also have rate limits. Production defaults are explicit
in the API Dockerfile, so missing production settings stop startup instead of
attempting to generate a development secret in a protected application folder.

The request limits use [Starlette's documented body-limit middleware](https://starlette.dev/middleware/),
which counts received bytes. Proxy trust follows [Uvicorn's deployment guidance](https://uvicorn.dev/deployment/).
Disabling buffering follows [Nginx's proxy buffering documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).

## Verification

| Check | Result |
| --- | --- |
| Backend API/security/storage tests | 42 passed; isolated local MongoDB databases and fake B2 |
| Account/admin full-stack browser tests | 13 passed; upload/edit checks rerun after the final authorization safeguard |
| Player/library browser suite | 27 passed, including responsive layouts, keyboard controls, reduced motion, seeking, errors and optional WebGL |
| Frontend lint | Passed |
| Backend Ruff lint | Passed |
| TypeScript and production Vite build | Passed |
| Frontend npm dependency audit | 0 known vulnerabilities, including development dependencies |
| Pinned backend `pip-audit` scan | 0 known vulnerabilities |
| Python dependency compatibility (`pip check`) | No broken requirements |
| Built frontend credential scan | No configured Atlas/B2/auth secret found in public JS/CSS/HTML |
| Existing source archive review | No `.env`, runtime-secret or owner-setup entries; archives excluded from deployment source |
| Nginx 1.30.5 configuration validation | Passed with local root/upstream/port substitutions |
| Built frontend through Nginx | Login, session restoration, admin/account deep links, logout, private playback and 100-byte HTTP 206 seeking passed |
| Production frontend CSP | No observed policy violations or page errors; WaveSurfer, Motion and lazy 3D worked |
| Nginx boundary checks | Security headers present; readiness and dotfile requests rejected with 404 |
| Live Atlas/B2 check | Connected; bucket private; 42 audio objects verified by exact version, size, hash metadata and MIME type |

The live catalog references **241,898,115 bytes** of audio, with **zero local
storage records**, zero pending artwork cleanup jobs and exactly one active
owner. No live artwork objects are referenced yet. Live cloud checks did not
upload or delete media or change real account passwords. Normal startup/index
reconciliation applies the new expiry indexes in Atlas.

The built frontend check used Windows, installed Chrome, a disposable local
database/API and production Nginx headers over localhost HTTP. Production
`Secure` cookie emission and configuration were checked separately by API
tests. Real-domain HTTPS, ingress behavior and production cookie transport
still require deployment verification.

## Release items still required

1. Choose the hosting service and HTTPS domain; configure routing through one
   origin and set the proxy's trusted ingress addresses.
2. Fill a separate production configuration with the existing Atlas/B2 values,
   a new stable random auth secret, secure cookies and exact HTTPS origins.
   Add the API host's outbound IP to Atlas access rules.
3. Build and start the containers on the deployment host. Docker is unavailable
   on this machine, so the Linux images/Compose startup have not been executed.
4. Verify login, refresh, invitations, upload/artwork editing and private audio
   seeking on the real HTTPS domain. Keep readiness internal and redact token
   query strings in any hosting/ingress/error-monitoring logs.
5. Configure Atlas backups and perform an isolated restore/playback check.
   Retain the B2 object versions referenced by song records; do not apply a
   lifecycle rule that removes those versions. Review the chosen host's audio
   bandwidth limits/costs.

Use [DEPLOYMENT.md](DEPLOYMENT.md) for the configuration template, container
commands, proxy setup and release checks. Reuse the existing Atlas owner.

## Known non-blocking limits

- The production build warns about large bundles: initial JS about 586 kB
  (186 kB gzip), optional 3D about 884 kB (237 kB gzip). 3D stays lazy until a
  capable desktop opts in; it stops on mobile/reduced-motion paths. Further
  bundle work is an optimization follow-up. The local login screen was ready
  in approximately 0.53 seconds during the built-frontend smoke check; this is
  a localhost measurement, not an internet performance benchmark.
- Starlette emits a deprecation warning about the test client's `httpx`
  integration. Tests pass; this concerns test tooling, not production requests.
- V1 supports one API process/instance. Background folder import processing
  must move to a durable worker before scaling to multiple API instances.
- Invitations/recovery links are manually shared; automatic transactional
  email delivery is a future feature.

This report covers source review, dependency advisories and the checks above.
Target-host image scanning, production infrastructure tests and a backup
restore exercise remain part of the release process.
