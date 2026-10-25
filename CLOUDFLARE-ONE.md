# HillStreet Cloudflare One enrollment

Verified October 26, 2026 (Asia/Manila).

## Account-side configuration

The existing shared Zero Trust team is **open-hillstreet** at https://open-hillstreet.cloudflareaccess.com. The team name and authentication domain were renamed at the user's request; existing applications and policies were preserved. Cloudflare account two-factor authentication is enabled.

- Enrollment app: 56e1729f-6498-4327-9533-ee5debcc8694, type warp.
- Enrollment policy: 458c9bae-859d-4a0a-ab73-a546fa8bea72. Only tanauancharles1@gmail.com may enroll.
- Login uses the existing Cloudflare identity provider, restricted to account members. Sign in with the owner's Cloudflare account and complete its MFA.
- Device profile: 6aef0403-1787-4d2b-bbda-350106fd111a, HillStreet owner secure internet. Matches only the owner's email.
- DNS and traffic mode (warp), MASQUE tunnel, 60-second automatic reconnect, automatic client updates allowed, mode switching disabled, automatic unprotected fallback disabled, 180-second captive portal detection.
- Disconnect and leave-organization controls remain available for owner recovery. Existing private/LAN split-tunnel exclusions and local DNS fallback remain. This is not a full-tunnel guarantee for excluded local networks.
- DNS rule: 338a38b8-ce9f-43a2-8fa8-ef9505cce885. Owner-scoped blocking of recommended security categories: 68 178 80 83 176 175 117 131 134 151 153.
- Automatic root certificate installation is enabled at account level. No devices were enrolled when changed.
- Existing Gateway managed CA 3018b194-b373-408b-ba99-e0de19376aa4 expires July 4, 2031. SHA-256 fingerprint: F7:A6:70:8D:7D:D3:AA:53:14:48:2C:EE:5A:12:A0:50:68:F3:D8:C5:D5:86:F7:41:7F:EA:35:41:70:5B:E5:C3.
- Temporary owner-scoped Do Not Inspect safeguard 5e549062-5c36-4ec6-814c-6b33c621a817 remains enabled until the first device's certificate trust and application compatibility are verified. DNS threat filtering and tunnel encryption remain configured. HTTPS content inspection, antivirus and DLP are not claimed active or validated.

The shared default profile, existing pinned-app bypass and private-network rule were preserved. WARP enrollment does not grant human access to the service-token-only HillStreet operations application.

The Cloudflare identity-provider callback and WARP app domain were read back with the new team domain. The new /warp login redirects successfully, the new signing-certificate endpoint returns 200, and authenticated HillStreet operations health remains successful. Zero devices were enrolled at rename time, so no registered devices required migration. Any client manually configured with another team must be updated to **open-hillstreet** and authenticated again.

## Enroll your device

1. Install the official Cloudflare One Client for your operating system: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/downloads/
2. Open the client, choose **Log in to Cloudflare Zero Trust** (desktop: Settings > Preferences > Account), and enter team name **open-hillstreet**.
3. Authenticate as **tanauancharles1@gmail.com** with the existing Cloudflare login and MFA. Approve the operating system's VPN permission, then connect.
4. Confirm the client shows the correct organization and connected DNS-and-traffic mode. Verify the device appears in the Cloudflare One Devices dashboard.
5. Check https://help.teams.cloudflare.com/ for Gateway connectivity and https://www.cloudflare.com/cdn-cgi/trace for tunnel status.
6. On supported Windows, macOS and Debian/Ubuntu clients, allow up to ten minutes for CA installation. macOS may require manually trusting the CA in System Keychain. iOS, Android, ChromeOS, Red Hat and applications using separate trust stores need manual certificate deployment as applicable.
7. Validate ordinary browsing, HillStreet contact form, GitHub, Supabase, Sentry and any pinned-certificate applications. Test a Cloudflare documented security-category test domain from the enrolled device and confirm its Gateway block log.
8. Only after trust and compatibility testing, review and disable the temporary owner TLS inspection safeguard. Add scoped HTTP threat/antivirus policies, preserve pinned-app exclusions, then retest. Never declare endpoint security complete from API configuration alone.

No device was connected during verification. Installation, local certificate trust, tunnel routing, real device DNS blocks, disk encryption, host firewall and endpoint posture remain unverified. This service does not replace endpoint antivirus, operating-system updates or device management. No paid plan was purchased.

## Website verification

All 13 tests and production build passed again. The production Pages deployment b5a23ba7-7ab5-41ba-895c-7d87e364e5ba at commit c3983a89ecbdaf330f8148df9322eecb2dfe8947 succeeded. Public home/privacy returned 200, www preserved path/query in its 301 redirect, secret-path probes returned 403 and unauthenticated operations returned 403. Authenticated operations health returned 200 with site 200 and contact validation 400. Website edge certificate packs are active; SSL mode is strict. No open PRs existed before this documentation change.

Google Workspace Admin/email delivery remain deferred. Registrar DNSSEC and previously denied GitHub branch protection remain pending. Do not represent this as 100% security.

## References

- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/device-enrollment/
- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/automated-deployment/
- https://developers.cloudflare.com/cloudflare-one/traffic-controls/get-started/dns/
