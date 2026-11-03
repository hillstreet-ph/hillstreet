# HillStreet operations and recovery

This setup belongs only to the HillStreet Agency website. The website remains public at https://hillstreet.space/ . Operational controls are private at https://ops.hillstreet.space/ and are intended for service automation, not public browsing.

## Service and data map

| Component | Purpose | Access |
| --- | --- | --- |
| hillstreet-ph/hillstreet | Source, tests, dependency updates, CI and recovery workflow | Public GitHub repository; each archive run publishes a dated `source-recovery-<UTC timestamp>` release and keeps the two newest |
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
| Website, sub-page and contact validation health check | Every hour at :17 | Worker cron 17 * * * * UTC | Latest status in R2; errors in Sentry |
| Source bundle mirror into private R2 | Every hour at :43, only writes when the published digest changes | Worker cron 43 * * * * UTC | Three newest bundles kept; 90-day lifecycle prefix |
| Full Git recovery bundle | Mondays 2:40 AM, also manually runnable | GitHub Actions Source recovery archive | Newest two dated `source-recovery-*` releases; 30-day GitHub artifact |
| Production deployment verification | Every push to main, also manually runnable | GitHub Actions Verify production deployment | Run history only |
| Old-backup janitor | Provider lifecycle processing | R2 prefix lifecycle rules | Only inquiries/, business-files/ and source/ snapshots expire |
| Dependency updates | Weekly | Dependabot | Pull requests, subject to validation |

No live customer inquiries or original business files are automatically deleted. The janitor expires backup copies only. New private business files are copied into dated R2 backup snapshots; empty storage was confirmed during setup.

## Backup verification

Inquiry exports include the table name, format version, timestamp and rows. The Worker reads the saved object back and verifies SHA-256 before reporting success. File snapshots copy object bodies, verify saved sizes, and record a manifest. GitHub creates and verifies a full Git bundle, computes SHA-256, publishes both assets to a fresh dated `source-recovery-<UTC timestamp>` release, and confirms the two asset URLs answer 200 before declaring the run green. Dated releases are used because this organization marks every release immutable at creation: an asset edit is rejected with HTTP 422, deleting the release is allowed, and a deleted release burns its tag name permanently, so a single rolling tag cannot be republished. The workflow skips publishing only when the newest dated release already carries both the same bundle digest and the same checksum-asset digest, retires anything older than the two newest, and the Worker discovers the current tag by reading the public `releases.atom` feed, which needs no token and no rate-limited API call. The bundle is created after deleting any fetched `source-recovery*` tag refs — one refname per `git update-ref`, because a second argument is read as the expected object and a batch therefore deletes nothing — so its digest tracks commits only and an unchanged repository cannot look like a new archive. The Worker then re-downloads that bundle, hashes every chunk while streaming it into an R2 multipart upload, aborts the upload when the recomputed digest does not match the published one, and only then records `operations/latest-source.json`. A runner never posts the archive to the operations endpoint, because Free-plan Bot Fight Mode on hillstreet.space challenges every GitHub Actions request to that zone.

The same health cron now also fetches `/agency`, `/influencers` and `/cooperation` and fails the check if any of them loses its 200 status, its Content-Security-Policy header, or still references the retired Canva host. Every push to main runs Verify production deployment, which waits for `build-info.json` on `hillstreet.pages.dev` to report the merged commit before it asserts the routes, headers, navigation and contact endpoint, so a green merge cannot be reported as deployed without a live check. That gate first ran on 2026-11-04 after its invalid `when:` step key was repaired, and it asserted what the runner could reach; the assertions themselves then needed the split the live data demanded: `/sitemap.xml` and `/robots.txt` carry the canonical `hillstreet.space` host rather than the wordmark, and `/assets/website.js` must keep exactly one copy of the retired deck host because that string is the selector the deck relink uses, so a second copy is the regression the check looks for.

The apex check depends on the egress, not the site. From this operator Mac, Cloudflare WARP performs Gateway TLS decryption and re-signs `hillstreet.space` with a leaf issued by "Gateway CA - Cloudflare Managed G1 <account id>", which curl and Node reject as a self-signed chain even though the zone reports `ssl: strict` with `certificate_status: active` and no validation errors. The GitHub runner reaches the apex over a verified TLS session and is then answered with the Bot Fight Mode challenge. The gate therefore records a transport problem on the apex as a note naming its two authorities — the zone's Cloudflare SSL status and the Worker health cron that runs inside Cloudflare hourly — and still fails on any unexpected HTTP status. It never treats an egress artifact as a production outage, and never treats an unreachable apex as a pass.

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
5. For source loss, open the repository releases page, take the newest `source-recovery-<timestamp>` release, and clone from its `hillstreet-source.bundle` after checking it against the sibling `hillstreet-source.sha256`; alternatively download a `source/*.bundle` archive from private R2 or an Actions recovery artifact. Run git bundle verify, clone into a new directory, run npm ci, npm test and npm run build, then reconnect or restore the organization repository.
6. Roll back a bad website release through Cloudflare Pages to a known successful production deployment. Restore secrets through their secure configuration surfaces separately; source archives intentionally exclude them.
7. The manual source upload endpoint is bounded at 50 MiB, but the scheduled mirror is not: it streams the release bundle into R2 in 8 MiB parts because the published bundle is larger than a Worker isolate can hold. The mirror keeps three bundles and relies on the 90-day prefix lifecycle after that. Inquiry exports run in Worker memory. Reassess backup architecture if data growth approaches Worker memory, execution or request limits; a failed export must never be counted as a valid backup.

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

This 403 was recorded while the repository was private. It is superseded on 2026-11-04 by the public-repository protection state below.


## October 26 Cloudflare audit (Asia/Manila)

Worker hillstreet-ops serves 100% version 5085af8a-a8de-41b8-9d72-29c91a411452. Both hourly health and daily backup cron schedules were read back. Both R2 buckets remain private, and only scoped backup prefixes expire after 90 days. A fresh manual inquiry/private-file backup succeeded at 08:16 Manila with SHA-256 readback verification; the table and business-files bucket were empty (zero rows and zero files). This validates the configured path on empty current data; earlier recovery-fixture testing is documented above. Authenticated operations health passed. DNSSEC is now active and authenticated through both checked public resolvers. No Worker code change or redeployment was needed in this audit.

## GitHub protection and automation state (2026-11-04)

The organization still reports GitHub Free, and the repository is now public, which is what makes protected branches available on that plan. No paid plan was purchased from this session. Protection is applied to `main` and read back as: required check `check` with strict up-to-date, administrators restricted, linear history required, force pushes and deletions disabled, conversation resolution required, and zero approving reviews. `allow_auto_merge` is enabled, and squash auto-merge was exercised end to end by PR #14, which `master-kanor` enabled and GitHub merged once the required check passed.

The workflow set on `main` is now: `ci.yml` (the required `check`), `source-backup.yml` (weekly bundle plus release publish and reachability confirmation), and `verify-production.yml` (every push to main waits for the Pages deployment carrying that commit, then probes routes, headers, navigation and the contact endpoint). CodeQL and the third-party review bots post checks but are not required, because CodeQL reports a `skipping` check on this plan. Zero approving reviews is a seat limit, not independent review; raise the count to one when a second reviewer joins. See GLOBAL-SECURITY-BASELINE.md.

The gap that closed on 2026-11-04: the `hillstreet-ops` Worker was still running the pre-dated-release revision while `ops/worker.js` carried the streaming mirror and sub-page health checks. It has now been published twice in sequence, and the current build is version `c9812ab0-121b-44b1-aabe-513e6a00047e` (number 13, serving 100%). The deployed module body was read back with SHA-256 `3a3a8e8173d75b15e4edfb612f7a0848d7bc15bdff539b54852bd1508dc1ad93`, which is exactly `ops/worker.js` at main commit `2b1a9c5`. The publish used the API directly with `force_keep_secret_bindings: true`, so `OPS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` were never handled in the clear, and the read-back confirms `BACKUPS` and `FILES` on their private buckets, the two plain-text settings, `compatibility_date` 2026-10-25, `usage_model` standard, workers.dev still disabled with no custom route, Observability with query-string redaction, and all three crons (`17 * * * *`, `25 18 * * *`, `43 * * * *`). Registering a schedule is not evidence that it ran, so the mirror was checked after the fact: the `43 * * * *` tick at 23:43:31Z on 2026-11-03 wrote `operations/latest-source.json` reporting tag `source-recovery-20261103T232412Z`, SHA-256 `1107dea72418625e52b45420f112b1678ec8eb4873b4664028d43037fe2db057`, 85,899,309 bytes mirrored to `source/1107dea72418625e.bundle`, and two stale bundles pruned. The hourly health cron was read back too, at `operations/health.json` with `checked_at` 23:17:19Z, site 200, all three sub-pages and the 400 contact validation.

Publishing this Worker by hand has one trap worth recording: the module part of the multipart upload must be typed `application/javascript+module`. With plain `application/javascript` the API rejects the script with error 10021 ("Cannot use import statement outside a module"), because `ops/worker.js` is an ES module, and a rejected upload creates no version. A `PUT` also reverts the script settings, so Observability is reapplied in the same request payload and read back afterwards rather than patched later.
