# HillStreet Agency production setup

Verified October 26, 2026 (Asia/Manila).

## Live website and repository

- Website: https://hillstreet.space/
- www redirects to the HTTPS apex, preserving paths and query strings.
- Private organization repository: https://github.com/hillstreet-ph/hillstreet
- Cloudflare Pages project: hillstreet, production branch main, output site, root functions directory.
- Production build command: npm test && npm run build. Automatic production deployments are enabled. The deployment-check branch supports preview builds.
- Verified application commit: 57bb6a5928212e2d1a2fdd81b0b02c80c9dff06e. Production deployment ID: 2f47f281-ab0e-4bf1-9c89-f9664358c12f.

The website is separate from Open-Connect. No marketplace resources or unrelated app services are included.

## Application integrations

Supabase: open-platform / huadtiuuoiriqrjpjxhr. The dedicated public.hillstreet_website_inquiries table has RLS enabled and no anonymous read/write or submission RPC access. The Cloudflare contact endpoint validates fields, enforces the 16 KiB request size limit and applies an atomic limit of three inquiries per IP hash per ten minutes. Request IDs prevent duplicate submissions. The encrypted Supabase server key is bound only to Pages Functions, not shipped in browser code.

Sentry: hillstreet organization, hillstreet project. Browser error reporting is configured for production and preview. Contact form values are not deliberately attached to events. Session replay and performance tracing are not enabled. Sentry ingestion was verified earlier with HTTP 200.

Inquiries are stored in Supabase for review. Automatic email delivery is not configured; Google Workspace Admin is intentionally pending at the user's request.

## Cloudflare security

- Apex and www are proxied CNAME records to hillstreet.pages.dev. Both Pages custom domains are active with active validation and verification.
- SSL mode: Full (strict); minimum TLS 1.2; TLS 1.3 remains enabled.
- Always Use HTTPS enabled. Development Mode disabled.
- Cloudflare Free Managed Ruleset executes for the apex and www hosts.
- Two host-scoped custom firewall rules block secret/admin probes and restrict methods to GET, HEAD, OPTIONS, plus POST /api/contact.
- Canonical-host redirect sends www to https://hillstreet.space.
- The site build generates CSP hashes for inline scripts, disallows arbitrary scripts and framing, and restricts network connections to the site and Sentry. HSTS covers the hostname without preload or includeSubDomains. MIME sniffing is disabled. API responses are not cached.
- Existing platform DDoS protection is enabled; no paid security plan was purchased.

Ruleset IDs for maintenance:

- Custom firewall: f816d42c454a4c9d8162efaa0182932e
- Managed firewall entrypoint: 982ce693814042f09090c8ae44fa1aae
- Canonical-host redirect: 498f23f616fd4948803d80437c4acc23

Inspect the current rules before future updates; do not overwrite unrelated rules. The general list-zones connector call returned an invalid-token error, but targeted domain DNS, Pages, zone settings and ruleset operations succeeded using the renewed HillStreet connection.

## Verification

- Seven automated tests, local build and GitHub CI passed.
- Production apex HTTP 200, HTTP-to-HTTPS 301, and www-to-apex 301 with path/query preservation.
- Production contact request HTTP 201, exactly one confirmed database record, synthetic record deleted after verification.
- Earlier idempotency and atomic rate-limit tests passed.
- Secret-path probe and disallowed HTTP method returned 403.
- Privacy page HTTP 200 and unknown page HTTP 404.
- Browser at 390px: hero rendered, zero broken images, video readyState 4, privacy link present, mobile menu opened and closed, Contact navigation scrolled to the section. No page errors or console errors were reported by the final browser checks.
- All original MX, SPF, DMARC and verification TXT records were re-read and preserved. Only the two website DNS records were changed.

## Pending work deliberately separated from the launch

Google Workspace Admin remains deferred. Current mail DNS still contains Google MX plus registrar forwarding MX records, SPF for both providers, monitoring-only DMARC, and no TXT at the default google._domainkey selector. Confirm actual mail routing and the intended DKIM selector/key in Google Admin before changing these records or enforcing DMARC rejection.

DNSSEC is disabled. Registrar-side DS configuration must be arranged and validated before treating DNSSEC as complete. No registrar credentials were used or nameservers changed.

The captured core application remains compiled React code; the original editable React source components and source maps were not exposed by the source website. Integration code, contact backend, tests and build configuration are editable in this repository.
