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
2. **Permissions** → **Create inline policy** → paste **Policy 1** below → name `DirectusBackupCron`.
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
   DB_CONNECTION_STRING=<Railway Postgres URL — use variable reference to Postgres if available>
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
| `DB_CONNECTION_STRING` | yes | Railway Postgres URL |
| `STORAGE_S3_BUCKET` | yes | `krakovan-opas` |
| `BACKUP_S3_BUCKET` | yes | `krakovanopas-bckp` |
| `STORAGE_S3_KEY` | yes | Backup IAM access key |
| `STORAGE_S3_SECRET` | yes | Backup IAM secret |
| `STORAGE_S3_REGION` | yes | Same as both buckets |
| `STORAGE_S3_ENDPOINT` | yes | `s3.amazonaws.com` |
| `BACKUP_RETENTION_DAYS` | no | `30` |
| `BACKUP_FILES_ENABLED` | no | `true` |

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
