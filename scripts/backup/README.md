# Directus backup (Railway cron)

Scheduled backups of PostgreSQL and the production S3 bucket into a dedicated backup bucket.

Pushing to `main` **does not** create this service automatically. You configure AWS and Railway once; after that, both Directus and the backup service redeploy on push.

---

## Setup overview

| Step | Where | What |
|------|--------|------|
| 1 | AWS S3 | Create backup bucket `krakovanopas-bckp` |
| 2 | AWS IAM | Create user + Policy 1 + access key |
| 3 | Railway | **New** service → `Dockerfile.backup` + variables + cron |
| 4 | AWS S3 | Verify first backup run |

Directus keeps its **existing** S3 credentials on the Directus service. Only the **backup** Railway service uses the backup IAM keys.

---

## 1. AWS — backup bucket

Create a **general purpose** bucket in the **same region** as production:

- **Name:** `krakovanopas-bckp`
- **Block all public access:** on
- **Versioning:** enable
- **Default encryption:** SSE-S3
- **Object Lock:** off

Production bucket stays `krakovan-opas` (`STORAGE_S3_BUCKET` on Directus).

---

## 2. AWS — IAM user for backup

1. IAM → **Users** → **Create user** (e.g. `krakovanopas-directus-backup`). No console password needed.
2. **Permissions** → **Create inline policy** → **JSON** → paste from [`iam/directus-backup-cron.json`](iam/directus-backup-cron.json) (or below) → name `DirectusBackupCron`.
3. **Security credentials** → **Create access key** → choose **Application running outside AWS** (Railway).
4. Save **Access key ID** and **Secret access key** for Railway (backup service only).

Optional: attach **Policy 2** only on a user you use for **local file restore** (`--confirm`). Do not attach Policy 2 to the Railway cron user if you want cron read-only on production S3.

### Policy 1 — `DirectusBackupCron` (Railway cron)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListProductionBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::krakovan-opas"
    },
    {
      "Sid": "ReadProductionObjectsForCopy",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectAttributes"],
      "Resource": "arn:aws:s3:::krakovan-opas/*"
    },
    {
      "Sid": "ListBackupBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketVersions"],
      "Resource": "arn:aws:s3:::krakovanopas-bckp"
    },
    {
      "Sid": "WriteAndPruneBackupObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::krakovanopas-bckp/*"
    }
  ]
}
```

### Policy 2 — `DirectusBackupRestore` (optional, file restore)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadBackupForRestore",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject", "s3:GetObjectVersion"],
      "Resource": [
        "arn:aws:s3:::krakovanopas-bckp",
        "arn:aws:s3:::krakovanopas-bckp/*"
      ]
    },
    {
      "Sid": "OverwriteProductionFilesOnRestore",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::krakovan-opas/*"
    },
    {
      "Sid": "ListProductionForRestoreDryRun",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::krakovan-opas"
    }
  ]
}
```

---

## 3. Railway — backup cron service (manual, one time)

Git push **only** redeploys services that already exist. The backup worker is a **second** service.

1. Open your Railway project (same one as Directus).
2. **+ New** → **GitHub Repo** → select `krakovanopas-srv` (same repo as Directus).
3. Name the service e.g. `backup-cron`.
4. **Settings** → **Build**:
   - **Builder:** Dockerfile
   - **Dockerfile path:** `Dockerfile.backup` (repository root)
   - **Root directory:** `/` (repo root)
5. **Variables** on **this service only** (use backup IAM keys, not Directus production keys):

   ```env
   DB_CONNECTION_STRING=${{Postgres.DATABASE_URL}}
   # or set DATABASE_URL to the same reference — either name works
   STORAGE_S3_BUCKET=krakovan-opas
   BACKUP_S3_BUCKET=krakovanopas-bckp
   STORAGE_S3_KEY=<backup IAM access key>
   STORAGE_S3_SECRET=<backup IAM secret>
   STORAGE_S3_REGION=<e.g. eu-central-1>
   STORAGE_S3_ENDPOINT=s3.amazonaws.com
   BACKUP_RETENTION_DAYS=30
   BACKUP_FILES_ENABLED=true
   ```

   Tip: In Railway, reference the database URL from the Postgres plugin instead of pasting a rotating secret when possible.

6. **Deploy** → **Run** / trigger deploy and watch logs. The job should finish and the deployment should **exit** (success = exit code 0).
7. In S3, check `krakovanopas-bckp` for a folder like `2026-07-27T03-00-00Z/` with `manifest.json`, `database.dump`, and `files/`.
8. **Settings** → **Cron Schedule** → set in the **dashboard** (not `railway.json`): e.g. `0 3 * * *` (daily 03:00 **UTC**).

### After setup: what happens on `git push` to `main`

| Service | Dockerfile | On push |
|---------|------------|---------|
| Directus (existing) | `Dockerfile` | Rebuilds as today |
| `backup-cron` (new) | `Dockerfile.backup` | Rebuilds if this service tracks `main` |

Both services must be linked to the repo; Railway will not add the backup service by itself.

### Cron behaviour

- The process must **exit** when done (no HTTP server).
- If a run is still active when the next cron fires, Railway **skips** the new run.
- Schedules are evaluated in **UTC**.

### Troubleshooting “Crashed” deployments

**Build logs are not deploy logs.** A successful image build (like your `npm ci` / `image push` output) only means the Docker image was built. Open **Deployments → latest → View logs** (runtime) for JSON lines such as `Backup run failed`.

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| Red **Crashed** right after start, log shows `Missing required environment variable` | DB or S3 vars not set on **backup-cron** | Add all variables from step 5; use `${{Postgres.DATABASE_URL}}` as `DB_CONNECTION_STRING` or `DATABASE_URL` |
| `pg_dump exited with code 1` / SSL / connection refused | Postgres URL or network | Use Railway Postgres **private** URL if both services are in the same project; ensure `sslmode=require` (set automatically unless your URL already has `sslmode`) |
| `server version mismatch` / `pg_dump version: 16` vs server `17` | Client older than Railway Postgres | Use current `Dockerfile.backup` (`postgresql17-client`); redeploy backup service |
| `not authorized to perform: s3:PutObject` on `krakovanopas-bckp` | IAM policy missing or wrong bucket in JSON | On user `krakovan-opas-backup-cron`, attach **Policy 1** from below; `Resource` must include `arn:aws:s3:::krakovanopas-bckp` and `arn:aws:s3:::krakovanopas-bckp/*` |
| `Backup run completed` then service shows **Crashed** with exit **0** | Normal for a one-shot job | Set **Cron Schedule** — the container is supposed to exit. Between cron runs the service is idle, not a long-running web process |
| Crash loop (restarts every few seconds) | Exit code **1** (real failure) | Read the `error` field in deploy logs; check S3 IAM policy and bucket names |
| S3 `AccessDenied` | Wrong IAM key or policy | Backup service must use **backup IAM** keys; bucket names `krakovan-opas` / `krakovanopas-bckp` |

**Public networking** is not required for this service (no HTTP port). Outbound access to Postgres and AWS S3 is enough.

Do **not** assign a public domain or expect a health check on `PORT` — this is not a web service.

---

## 4. Verify checklist

- [ ] Backup bucket region = production bucket region  
- [ ] Backup IAM Policy 1 attached; keys on **backup-cron** service only  
- [ ] Directus service still uses **original** S3 credentials  
- [ ] Manual deploy succeeded; `manifest.json` shows `"status": "completed"`  
- [ ] Cron schedule set in Railway dashboard  

---

## Backup layout in S3

Each run creates a folder at the bucket root (no `BACKUP_S3_PREFIX`):

```text
s3://krakovanopas-bckp/<backupId>/
  manifest.json
  database.dump
  files/...
```

`backupId` format: `2026-07-27T03-00-00Z` (UTC, colons replaced with dashes).

---

## Environment variables

| Variable | Required | Example / default |
|----------|----------|-------------------|
| `DB_CONNECTION_STRING` | yes* | Railway Postgres URL |
| `DATABASE_URL` | yes* | Same as above (Railway default name; either variable works) |
| `STORAGE_S3_BUCKET` | yes | `krakovan-opas` |
| `BACKUP_S3_BUCKET` | yes | `krakovanopas-bckp` |
| `STORAGE_S3_KEY` | yes | Backup IAM access key |
| `STORAGE_S3_SECRET` | yes | Backup IAM secret |
| `STORAGE_S3_REGION` | yes | Same as both buckets |
| `STORAGE_S3_ENDPOINT` | yes | `s3.amazonaws.com` |
| `BACKUP_RETENTION_DAYS` | no | `30` |
| `BACKUP_FILES_ENABLED` | no | `true` |

\* Set at least one of `DB_CONNECTION_STRING` or `DATABASE_URL`.

Copy [`.env.example`](.env.example) to `.env` for local runs (do not commit `.env`).

---

## Local commands

From `scripts/backup/` (requires `pg_dump` / `pg_restore` on PATH):

```bash
npm install
cp .env.example .env   # fill in values
npm run backup
npm run restore:db -- --backup-id 2026-07-27T03-00-00Z
npm run restore:files -- --backup-id 2026-07-27T03-00-00Z          # dry run (default)
npm run restore:files -- --backup-id 2026-07-27T03-00-00Z --confirm
```

**Database restore:** stop or scale down Directus first so connections do not block `pg_restore`.

**File restore:** `--confirm` overwrites objects in the production bucket.

---

## Docker (local test of production image)

From repository root:

```bash
docker build -f Dockerfile.backup -t krakovanopas-backup .
docker run --rm --env-file scripts/backup/.env krakovanopas-backup
```

Build context must be the repository root.
