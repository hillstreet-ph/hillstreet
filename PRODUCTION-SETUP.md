# HillStreet Agency production setup

This is the standalone HillStreet Agency business website. It has no runtime dependency on Open-Connect and must not be combined with that application's marketplace or database resources.

## Configured and verified previously

- Organization repository: https://github.com/hillstreet-ph/hillstreet (private).
- Cloudflare Pages project: hillstreet, main production branch, site output, root functions directory.
- Verified earlier preview: https://4c1118ff.hillstreet.pages.dev . This preview predates the security changes in this document.
- Supabase open-platform: dedicated hillstreet_website_inquiries table, private server RPC, validation, atomic rate limit, and idempotent submissions.
- Sentry hillstreet project: browser error reporting; server keys are not present in the client.
- Earlier browser contact submission returned 201 and its database record was confirmed, then deleted.

## Added for the business domain

Canonical URL, sitemap, robots.txt and organization structured data now target https://hillstreet.space/ . A data-use notice is linked from the contact form. The build generates a Content Security Policy with hashes for the captured inline scripts, allows only the site's own scripts, blocks framing and objects, and restricts outgoing connections to the site and Sentry. HSTS covers the current hostname, without includeSubDomains or preload. API responses disable caching and MIME sniffing. Dependabot updates cover npm and GitHub Actions.

Seven local automated tests and the build pass. These latest changes are not verified on a new Cloudflare deployment because the current Cloudflare token is invalid.

## Live configuration blocked on credentials

Cloudflare zone access returned HTTP 403 / Invalid access token on October 26, 2026. Reconnect the HillStreet Cloudflare account before changing DNS, TLS, WAF or Pages settings. Google Workspace Admin has no authenticated connection and requires an authentication configuration before connection.

Public DNS observed on October 26, 2026:

- Nameservers: gigi.ns.cloudflare.com and evan.ns.cloudflare.com.
- MX: smtp.google.com at priority 1, plus five registrar forwarding MX records.
- SPF includes both _spf.google.com and spf.efwd.registrar-servers.com, with ~all.
- DMARC: p=none; pct=100; adkim=s; aspf=s.
- No TXT record at google._domainkey.hillstreet.space. Other DKIM selectors were not enumerated; the actual selector and key must be confirmed in Google Admin.

Do not remove forwarding MX/SPF records or enforce DMARC rejection until the mail routing, sender inventory and DKIM state are confirmed. Existing email DNS was not changed.

## Finish after access is restored

1. Inspect all zone records and existing Pages domain associations; preserve email, verification and unrelated service records.
2. Build and test the latest commit in a preview, checking CSP, real contact submission, mobile menu, images, video, privacy page, and Sentry delivery.
3. Attach hillstreet.space and www.hillstreet.space to the Pages project. Update only confirmed website DNS records after the custom-domain association is created. Verify certificate issuance and HTTPS before cutover.
4. Configure a single canonical hostname with HTTPS redirect, TLS 1.2 or later and Full (strict) origin validation where applicable. Inspect existing zone rules before adding hostname-scoped WAF, method protections, bot controls or rate limits. Avoid overlapping rules and account-wide changes.
5. Check DNSSEC at both Cloudflare and the registrar before enabling or changing DS records; never publish a guessed DS record.
6. Confirm Workspace domain ownership, Gmail activation and mail routing. Obtain the exact DKIM selector/key from Google Admin. Validate SPF and DKIM alignment before increasing DMARC enforcement.
7. Deploy the reviewed main commit, verify both apex and www routing, then enable automatic production deploys if desired.

Inquiries are stored for review in Supabase. Automatic email delivery and Google Workspace administration are not configured yet. Original React development sources remain unavailable; the captured application is compiled code plus the editable integration code added here.
