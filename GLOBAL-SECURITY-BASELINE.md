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

## GitHub protection blocker and prepared policy

The hillstreet-ph organization reports the Free plan. The private hillstreet repository reports main protected=false. The branch-protection read endpoint returns HTTP 403 with: "Upgrade to GitHub Pro or make this repository public to enable this feature."

For this organization-owned private repository, GitHub Team or Enterprise is the supported route. No billing change, repository visibility change, token replacement or alternate identity was used.

Prepared payload: ops/github-main-protection.json. It requires PRs, up-to-date check and CodeQL results, resolved conversations and linear history; disables force pushes/deletion; and enforces restrictions for administrators. Approval count is zero because the organization currently reports one occupied seat; this avoids requiring an independent reviewer who has not been added. Raise it to one after a second eligible reviewer joins. This is not independent review enforcement.

After an owner upgrades the organization and confirms the connected app has repository Administration write permission, inspect current protection first and apply the reviewed payload:

```bash
gh api --method PUT repos/hillstreet-ph/hillstreet/branches/main/protection --input ops/github-main-protection.json
gh api repos/hillstreet-ph/hillstreet/branches/main/protection
```

This command is a future activation procedure, not evidence protection is enabled. Do not apply after a denial or entitlement failure without resolving that prerequisite. Existing Pages build tests remain active but do not provide GitHub protected-branch enforcement.

Sources:
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- https://docs.github.com/en/rest/branches/branch-protection
