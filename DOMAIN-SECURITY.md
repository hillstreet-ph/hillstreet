# HillStreet domain security

Verified October 26, 2026 (Asia/Manila). This audit covers hillstreet.space, www.hillstreet.space, ops.hillstreet.space and open-hillstreet.cloudflareaccess.com.

## Applied fixes and verified state

Cloudflare edge HSTS is now enabled with max-age 31536000, without includeSubDomains or preload, and with nosniff enabled. HTTPS apex responses, www redirects and Access-denied operations responses were checked for these headers. The website already sent HSTS; the edge configuration now also covers responses generated before the website application.

Full strict SSL, minimum TLS 1.2, TLS 1.3, HTTP/2, HTTP/3, Always Use HTTPS, automatic HTTPS rewrites and Browser Integrity Check are enabled. Development Mode is off. Existing host-scoped WAF rules and operations Access protection are preserved. Both Pages domains are active with active verification and validation.

Public apex returns 200, HTTP redirects to HTTPS, www redirects to apex, unauthenticated operations returns 403 and authenticated operations health returns 200 with site 200 and contact validation 400. The Zero Trust enrollment URL redirects to the current open-hillstreet login.

## DNSSEC: active and publicly validated

Cloudflare reports DNSSEC active. The registry publishes the exact matching DS record, and both Cloudflare and Google public resolvers return authenticated A-record answers (AD=true, status 0). Public signatures and DNSKEY records are visible. The domain's DNSSEC chain is validated.

The owner published the following DS at Namecheap. These values are retained for recovery; do not create a duplicate or change the current record:

| Field | Value |
| --- | --- |
| Key tag | 2371 |
| Algorithm | 13 — ECDSAP256SHA256 |
| Digest type | 2 — SHA-256 |
| Digest | 691373E48E49A4F07F0E2B9958DF8B69EE6DF52AF2295B5D0A8AE03C3AE453F2 |

Full DS record:

```text
hillstreet.space. 3600 IN DS 2371 13 2 691373E48E49A4F07F0E2B9958DF8B69EE6DF52AF2295B5D0A8AE03C3AE453F2
```

The DS belongs at the registrar, not as an ordinary Cloudflare DNS record. Preserve the current Cloudflare nameservers. The owner's manual registrar update was verified through the registry and public validation; no agent registrar credentials were used. Refresh DS details from Cloudflare before any future registrar changes if signing keys have changed.

Registrar guide: https://www.namecheap.com/support/knowledgebase/article.aspx/9722/2232/managing-dnssec-for-domains-pointed-to-custom-dns/
Cloudflare DNSSEC states: https://developers.cloudflare.com/dns/dnssec/dnssec-states/

## Preserved mail routing and remaining limits

Google Workspace Admin remains deferred. Existing Google SMTP MX and registrar forwarding MX, SPF and monitoring-only DMARC were preserved. No guessed DKIM key or mail-routing change was applied. Resolve the intended mail provider and inspect Google Admin before cleaning up these records or enforcing DMARC rejection.

GitHub branch protection on `main` was applied and read back on 2026-11-04 after the repository became public, so the previously reported HTTP 403 no longer applies (settings and re-apply commands are in OPERATIONS.md). BrowserAct invocation through Open-Connect remains blocked by an internal route error. Android HTTPS inspection was verified for the HillStreet pilot only; broader application compatibility and local Always-on VPN/lockdown settings are separate checks. These limits prevent an honest claim of universal 100% completion.
