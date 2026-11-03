# Reusable domain and Pages security baseline

Verified October 26, 2026 (Asia/Manila).

## Scope and current rollout

The user authorized applying a consistent baseline across owned Cloudflare domains and Pages projects. HillStreet's apex/www, operations Worker and Zero Trust enrollment domain are verified. An account-wide Worker-domain inventory returned only ops.hillstreet.space. The Pages-project inventory failed with provider error 8000000 (HTTP 500); complete account-wide Pages/domain coverage could not be verified. The earlier general zone inventory also failed authentication. Do not represent this baseline as applied to undiscovered projects.

## Common requirements and service-specific checks

| Area | Shared baseline | Per-service validation |
| --- | --- | --- |
| TLS | HTTPS, TLS 1.2 minimum, TLS 1.3 | Confirm valid edge and origin certificates before Full strict |
| Headers | HSTS and nosniff where HTTPS is permanent | Preserve tested CSP; no unverified includeSubDomains or preload |
| DNS | Proxied web records where supported | Preserve MX/TXT and non-web protocols; each zone needs its own DNSSEC DS |
| WAF | Managed threat rules and relevant method/path restrictions | Match actual hosts and API methods; do not copy HillStreet-only expressions globally |
| Public websites | Public website access and tested contact/API behavior | Never copy operations service-token authentication onto public pages |
| Private operations | Access policies, server secrets, private storage | Separate applications, tokens and audience values |
| Deployments | Versioned source, test/build gates, successful release verification | Retain each project's framework, build output and runtime |
| Recovery | Private backups, verification, documented retention and restore | Export only the app's scoped data, never duplicate shared-project exports |
| Monitoring | Error reporting and operational checks | Separate project identifiers; redact query strings and customer data |

HillStreet currently meets its applicable domain/Worker baseline, including validated DNSSEC, edge HSTS, private R2 storage, scoped WAF, tested Android inspection pilot, backup checks and source recovery. This does not install or enable every Cloudflare product; enable D1, KV, queues, Vectorize or paid services only when an application actually needs them. Never copy database keys, Sentry DSNs, Worker bearer tokens, Access audiences or DNSSEC digests between projects.

## GitHub branch protection policy

The hillstreet-ph organization reports the Free plan, and the hillstreet repository is public, so protected branches are available without a billing change. Protection is applied and read back from `main`:

| Setting | Live value |
| --- | --- |
| Required status check | `check` (the Validate website job) with strict up-to-date |
| Restrict pushes that update | administrators enabled |
| Linear history | required |
| Force pushes / deletions | disabled |
| Conversation resolution | required |
| Approving reviews | zero |
| Auto-merge | squash merge, enabled per pull request |

`ops/github-main-protection.json` is the payload that produced this state. The classic branch-protection endpoint rejects `required_status_checks.checks` for this repository and accepts `contexts`, so the file uses `contexts: ["check"]`.

CodeQL and the third-party review bots are deliberately not required checks. On this plan CodeQL posts `Analyze (actions)`, `Analyze (javascript-typescript)` and a `CodeQL (skipping)` check; making them required would block every merge without adding a gate that can actually pass. Zero approving reviews is not independent review enforcement, because the organization currently reports one occupied seat. Raise `required_approving_review_count` to one as soon as a second eligible reviewer joins, then re-read the protection to confirm.

```bash
gh api repos/hillstreet-ph/hillstreet/branches/main/protection
gh api --method PUT repos/hillstreet-ph/hillstreet/branches/main/protection --input ops/github-main-protection.json
```

Sources:
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- https://docs.github.com/en/rest/branches/branch-protection
