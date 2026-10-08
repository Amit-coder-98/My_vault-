# MongoDB Atlas and private Backblaze B2

Atlas stores accounts, song details, labels, favorites and playlists. B2 stores audio and cover images. Audio is streamed through the authenticated API with HTTP byte-range support; the bucket remains private, and credentials never go into the frontend.

The integration is implemented. Run `npm run backend:check` to verify your configured accounts before importing. Changing `.env` does not automatically transfer songs or existing accounts. The 42 original songs remain in `F:\project\Audio_player\Songs_data` and the existing local vault remains available.

Live validation on 2026-10-08: Atlas and private B2 are connected, and all 42 source songs were uploaded successfully with zero failures. Their original folders, file sizes, checksum metadata, exact object versions and measured waveforms were verified. The owner account is created and working; reuse that account when deploying the same database. The sources have no embedded cover images; images can be added later through the admin editor.

## 1. Create Atlas database access

Create an Atlas Free cluster, create a **database user** with read/write access to your vault database, and add your development machine's public IP to the project's Network Access list. Your Atlas website login is separate from the database user. For deployment, allow the API host's outgoing IP.

In **Connect → Drivers → Python**, copy the `mongodb+srv://` connection string. Replace the placeholder database username/password. Percent-encode special password characters such as `@`, `:`, `/`, `#` and `%` in the URI. Set `DATABASE_NAME=my_music_vault`; the backend selects that database explicitly and creates the required indexes. SRV connections use TLS and a certificate trust bundle.

See [Atlas driver connections](https://www.mongodb.com/docs/atlas/driver-connection/) and [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## 2. Create private B2 storage

In Backblaze B2, create a **private** bucket with an S3-compatible name. Copy its **S3 Endpoint**, for example `https://s3.us-west-004.backblazeb2.com`; this differs from a public download URL. The endpoint's region, `us-west-004` in this example, is `B2_REGION`.

Create a read/write application key restricted to this bucket. Enable **Allow List All Bucket Names** for S3 SDK compatibility. It needs `listFiles`, `readFiles`, `writeFiles`, `deleteFiles`, `listBuckets` and `readBuckets` capabilities; `readBuckets` permits the private-bucket ACL check. Record the `keyID` and `applicationKey` when created; the application key is shown once. Do not use your master account key. The backend checks bucket access and rejects public buckets before importing/uploading. See [Backblaze S3 application keys](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys) and [application-key capabilities](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities).

No browser CORS changes or public ACLs are required for this implementation: browsers access your API, and the API reads B2. See [Backblaze's S3-compatible API](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api) and [boto3 integration](https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-python-with-backblaze-b2).

## 3. Fill backend/.env

The file already has these settings prepared. Replace the existing active `MONGODB_URL` line, fill the B2 fields, and set `STORAGE_BACKEND=b2`. Do not add duplicate active settings. Keep your existing authentication settings.

```dotenv
MONGODB_URL=mongodb+srv://YOUR_DB_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=my_music_vault
STORAGE_BACKEND=b2
B2_ENDPOINT_URL=https://s3.YOUR_REGION.backblazeb2.com
B2_REGION=YOUR_REGION
B2_BUCKET_NAME=YOUR_PRIVATE_BUCKET
B2_KEY_ID=YOUR_KEY_ID
B2_APPLICATION_KEY=YOUR_APPLICATION_KEY
B2_PREFIX=Songs_data
SOURCE_DIR=../Songs_data
STORAGE_DIR=./storage
```

Use the actual region in both fields; `YOUR_REGION` is a placeholder. `.env` is ignored by version control. `STORAGE_DIR` is still needed as writable temporary processing space for uploads, image validation and FFmpeg; B2-mode uploads do not create permanent local audio copies. Existing local copies are retained during migration.

Restart the API after changing `.env`. The development command watches Python code; it does not reliably reload environment-file changes.

## 4. Verify and import

From `F:\project\Audio_player`:

```powershell
npm run setup:backend
npm run backend:check
npm run backend:import
```

The check verifies MongoDB, B2 access and the private bucket without printing credentials. Import reports `imported`, `migrated`, `skipped`, and `failed`. Successful uploads are committed to MongoDB only after their media is stored. A repeated import recognizes identical audio by SHA-256. Failed transfers can be retried without creating duplicate song records.

If B2 reports `InvalidAccessKeyId`, it did not recognize the supplied key ID at the selected region's endpoint. Check that `B2_KEY_ID` is the actual `keyID` from a standard application key, paired with that same key's `applicationKey` in `B2_APPLICATION_KEY`. A key name, bucket ID, account ID or master key is not the required S3 application key. Create a new bucket-scoped key if the pair is unavailable, then rerun the check before importing.

If B2 reports `SignatureDoesNotMatch`, check that `B2_APPLICATION_KEY` contains the secret issued for that exact `B2_KEY_ID`. The key-list page shows the ID, name, bucket and permissions; the secret appears only on the creation confirmation. If you did not save it, create another application key and copy both new values together. A separate Native API authorization response of `401 unauthorized` confirms that the supplied ID/secret pair does not authenticate, independent of S3 bucket permissions. See [Backblaze authorization errors](https://www.backblaze.com/apidocs/b2-authorize-account).

The B2 object layout preserves source folders:

```text
YOUR_PRIVATE_BUCKET/
  Songs_data/
    Love Songs/
      audio/<sha256>-<original-filename>.mp3
      artwork/<audio-sha256>-<image-sha256>.webp
    Sad_breckup songs/
      audio/...
      artwork/...
    Silent songs/
      audio/...
      artwork/...
```

B2 displays these object-name prefixes as folders. Artwork folders appear when artwork is available. Original source audio is preserved, including its filename after the hash prefix. Embedded covers are extracted; missing covers can be added later.

If the selected database already contains local songs, the import copies their managed audio/current artwork to B2 while preserving IDs, corrected metadata, favorites and playlists. You can migrate **all** local songs in that database, including admin uploads outside the source directory, with:

```powershell
npm run backend:migrate-storage
```

Switching `MONGODB_URL` selects a different database; it does not copy the old database's users or personal data into Atlas. For a new Atlas database, import the source collection and create your owner account once:

```powershell
npm run backend:owner
npm run dev:backend
```

In a second terminal, `npm run dev`, then open http://127.0.0.1:5173. Local MongoDB data is left intact. Moving an existing account database into Atlas is a separate database migration.

## Admin upload and later editing

**Manage vault → Songs → Add music** accepts one or multiple audio files, optional cover image, title, artist, album, moods, genres, language, year, description and publication state. Choose an optional storage folder, such as `Love Songs` or `Rap`; otherwise, the first selected mood or `Uploads` is used.

To add an image later, search the song in **Songs**, choose **Edit**, select its cover image, change any details, and save. The audio and its folder remain unchanged. Replacing a cover creates a new private image reference and refreshes the displayed cover immediately. Images are validated and normalized to WebP.

Archive is reversible. Permanent deletion is available for archived songs and deletes the specific B2 object versions owned by that song, as well as its database references; source files remain untouched. If cloud deletion fails, the archived record is retained for retry. Old artwork deletion failures are queued and visible in the overview; retry them with:

```powershell
npm run backend:cleanup-storage
```

## Free allowances and operational limits

The initial audio collection is approximately 231 MiB, below B2's current 10 GB free storage allowance. Streaming bandwidth has a separate allowance: Backblaze currently provides free egress up to three times average monthly stored data; usage beyond the applicable allowance may be billed. Free storage is not unlimited free streaming. Check account caps, alerts and actual usage in the Backblaze console. [Backblaze pricing](https://www.backblaze.com/cloud-storage/pricing).

The dashboard's storage total measures audio referenced by song records, not the entire B2 account or historical versions. Repeated completed imports reuse existing objects and their versions. Interrupted transfers may leave reusable partial uploads; retry the failed operation and review bucket usage. Keep the same bucket/region configuration for existing B2 records; changing credentials or endpoints does not migrate uploaded objects.

Run one API worker for the current in-process import jobs. Production still requires HTTPS, secure cookies and exact origins, as documented in [README.md](README.md#deployment). Keep originals/backups alongside cloud storage.

## Verification

`npm run test:backend` uses disposable local MongoDB databases and S3-shaped test clients/SDK stubs for cloud operations. It exercises folder names, private-bucket checks, upload failures, audio ranges/HEAD, revoked sessions, migration without losing personal data, late artwork editing and exact-version deletion. These tests do not use your live Atlas or B2 account. Set `VAULT_TEST_MONGODB_URL` only if a separate MongoDB test service is intended.

`npm run test:accounts` covers the real frontend/API flow, including song search, updating details and adding missing artwork after upload. Live cloud connectivity is confirmed by `npm run backend:check` only after your credentials are supplied.
