# HillStreet operations and recovery

This setup belongs only to the HillStreet Agency website. The website remains public at https://hillstreet.space/ . Operational controls are private at https://ops.hillstreet.space/ and are intended for service automation, not public browsing.

## Service and data map

| Component | Purpose | Access |
| --- | --- | --- |
| hillstreet-ph/hillstreet | Source, tests, dependency updates, CI and recovery workflow | Private GitHub repository |
| Cloudflare Pages hillstreet | Website and contact API deployment from main | Public website; server-only database key |
| Pages Functions /api/contact | Validation, duplicate protection and database submission | Same-origin POST; database RPC is server-only |
| Supabase open-platform | Dedicated hillstreet_website_inquiries table | RLS; anonymous reads, writes and RPC execution denied |
| R2 hillstreet-business-files | Private business files | Cloudflare administrators and operations binding; no public bucket URL |
| R2 hillstreet-website-backups | Inquiry exports, file snapshots, source bundles | Private; no public bucket URL |
| Worker hillstreet-ops | Backup, health checks and private recovery export | workers.dev disabled; custom domain protected by Access service authentication plus Worker bearer credential |
| Cloudflare Access HillStreet Operations | Restricts ops.hillstreet.space | Dedicated service-token-only policy |
| Sentry hillstreet | Browser errors, operations failures, daily backup monitor | Existing HillStreet organization |
| Supabase Vault | Encrypted recovery credentials | Anonymous and authenticated roles cannot select decrypted_secrets |

R2 supplies S3-compatible object storage; a separate AWS S3 deployment is not required. Website images and video stay versioned with the source and are deployed through Pages. No public file-upload endpoint was added.

## Schedules and retention

| Job | Manila schedule | Owner | Retention |
| --- | --- | --- | --- |
| Inquiry and private-file backup | Daily 2:25 AM | Worker cron 25 18 * * * UTC | 90 days in private R2 |
| Website and contact validation health check | Every hour at :17 | Worker cron 17 * * * * UTC | Latest status in R2; errors in Sentry |
| Full Git recovery bundle | Mondays 2:40 AM, also manually runnable | GitHub Actions Source recovery archive | 90 days in R2; 30-day GitHub artifact |
| Old-backup janitor | Provider lifecycle processing | R2 prefix lifecycle rules | Only inquiries/, business-files/ and source/ snapshots expire |
| Dependency updates | Weekly | Dependabot | Pull requests, subject to validation |

No live customer inquiries or original business files are automatically deleted. The janitor expires backup copies only. New private business files are copied into dated R2 backup snapshots; empty storage was confirmed during setup.

## Backup verification

Inquiry exports include the table name, format version, timestamp and rows. The Worker reads the saved object back and verifies SHA-256 before reporting success. File snapshots copy object bodies, verify saved sizes, and record a manifest. GitHub creates and verifies a full Git bundle, computes SHA-256, and uploads through the protected operations endpoint; uploads with a mismatched checksum are rejected.

An actual restore drill exported a synthetic inquiry, retrieved the private backup, restored its row with PostgreSQL jsonb_populate_recordset into an isolated temporary table, verified one row, rolled the transaction back, and removed the production fixture. A fresh post-cleanup backup succeeded. This verifies the website table recovery path, not every schema in the shared Supabase project. These are periodic logical backups, not point-in-time recovery.

Backup schedules are registered. Manual executions passed during setup; future scheduled executions must be checked through Sentry and Actions history.

## Recovery credentials

Cloudflare Worker secret bindings: SUPABASE_SERVICE_ROLE_KEY and OPS_TOKEN. The public DSN and project URL are ordinary configuration. No credential values are in this repository.

Encrypted Supabase Vault entries:

- hillstreet_website_ops_token
- hillstreet_website_access_client_id
- hillstreet_website_access_client_secret

Encrypted GitHub repository secrets for the source-backup workflow:

- HILLSTREET_OPS_CLIENT_ID
- HILLSTREET_OPS_CLIENT_SECRET
- HILLSTREET_OPS_TOKEN

The Access service token expires October 26, 2027 (Manila). Rotate it before expiry and update the three relevant vault/Actions values and Access policy together. Rotating the Worker bearer credential also requires a new Worker secret binding. Never print decrypted vault values or include them in issue bodies, logs or source files.

## Recovery procedure

1. Pause website writes if restoring production inquiry data. Preserve a fresh backup of the current state first.
2. Download the required inquiry snapshot from the private R2 dashboard, or call the authenticated GET /export?key=inquiries/... endpoint using the Access client headers and Worker bearer credential. Verify its recorded SHA-256.
3. Compare its format and columns with supabase/website-inquiries.sql. Load into a temporary table first, validate row counts and constraints, then prepare an explicit reviewed insert/merge. Do not overwrite live rows automatically.
4. For private files, select the dated business-files snapshot, inspect _manifest.json, and restore its objects/ paths into the private business-files bucket. Preserve current versions before replacing them.
5. For source loss, download a source/*.bundle archive from private R2 or an Actions recovery artifact. Run git bundle verify, clone into a new directory, run npm ci, npm test and npm run build, then reconnect or restore the organization repository.
6. Roll back a bad website release through Cloudflare Pages to a known successful production deployment. Restore secrets through their secure configuration surfaces separately; source archives intentionally exclude them.
7. The source upload endpoint is bounded at 50 MiB. Inquiry exports run in Worker memory. Reassess backup architecture if data growth approaches Worker memory, execution or request limits; a failed export must never be counted as a valid backup.

## Development and agent boundaries

Agents should work on scoped branches, run tests and build, open a reviewable PR, inspect CI, and merge only within the user's authorization. Main automatically deploys through Cloudflare after its tests pass. Dependency updates do not receive automatic approval. GitHub's default workflow token is read-only and cannot approve PRs; individual workflows declare the minimal extra permissions they require.

The operations Worker is a separate deployed service. Its source and reproducible bindings are in ops/. Updates use the authenticated Cloudflare connector or a separately authorized Wrangler deployment; Pages builds do not redeploy this Worker automatically. Reapply all bindings when publishing a new Worker version and preserve the registered schedules. Never commit an API token to make deployment easier.

## Existing shared-platform capabilities and remaining limits

Supabase already has pg_cron, pg_net, pgcrypto, supabase_vault, vector, pgmq and pg_graphql installed. No duplicate database cron, arbitrary vector corpus, AI agent runtime, extra edge function, or public storage policy was created merely to populate a feature list. Pages Functions and the operations Worker perform the website's edge work. This repository's AGENTS.md supplies agent operating instructions; it is not an always-running autonomous AI service.

The shared Supabase advisor report contains 399 warnings on the wider platform. HillStreet's dedicated table has an informational RLS-without-policies finding, consistent with its server-only access. Direct PostgreSQL SSL enforcement is disabled at the shared-project level; this website uses HTTPS REST. Changing project-wide enforcement or unrelated schemas requires checking their other consumers first.

Google Workspace Admin and inquiry email delivery remain deferred. DNSSEC is active; the matching registry DS and authenticated answers from Cloudflare and Google public resolvers were verified. See DOMAIN-SECURITY.md. No paid plan upgrades were purchased. The Zero Trust organization team name is open-hillstreet, with authentication domain https://open-hillstreet.cloudflareaccess.com. The team was renamed at the user's request; existing applications and policies were preserved. HillStreet has its own scoped Access application and policy. See CLOUDFLARE-ONE.md for enrollment.


## Final setup evidence

Thirteen automated tests and the production build passed. GitHub CI run 40237018380 passed. The initial Source recovery archive run 40237020444 succeeded, including full bundle verification, private offsite R2 upload, and GitHub artifact creation. Production deployment 5116e470-838a-4869-ae60-d0a7de0b9d8b succeeded for the operations commit. Sentry backup check-ins returned status ok. Both private buckets have public access disabled; Vault decrypted-secrets access is denied to anon and authenticated roles. Unauthenticated operations requests returned 403, and an Access-authenticated request without the Worker bearer credential returned 404.

GitHub returned HTTP 403 for the requested main-branch protection update. Protected-branch enforcement is therefore not configured; it requires the appropriate repository/organization authorization or entitlement. No alternate identity or transport was used to bypass that refusal. Tests still gate Cloudflare Pages builds, and agents should use reviewed branches and PRs.


## October 26 Cloudflare audit (Asia/Manila)

Worker hillstreet-ops serves 100% version 5085af8a-a8de-41b8-9d72-29c91a411452. Both hourly health and daily backup cron schedules were read back. Both R2 buckets remain private, and only scoped backup prefixes expire after 90 days. A fresh manual inquiry/private-file backup succeeded at 08:16 Manila with SHA-256 readback verification; the table and business-files bucket were empty (zero rows and zero files). This validates the configured path on empty current data; earlier recovery-fixture testing is documented above. Authenticated operations health passed. DNSSEC is now active and authenticated through both checked public resolvers. No Worker code change or redeployment was needed in this audit.
