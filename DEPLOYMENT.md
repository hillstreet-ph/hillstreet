# HillStreet deployment verification

Verified October 26, 2026 (Asia/Manila).

- Repository: https://github.com/hillstreet-ph/hillstreet (private organization repository).
- Cloudflare Pages project: hillstreet, linked to this repository.
- Verified preview: https://4c1118ff.hillstreet.pages.dev
- Production branch: main. Automatic production deployments remain disabled. No production deployment or custom-domain change was performed.
- Build: npm run build; output: site; Pages Functions: functions at repository root; Node 22 or later.
- Supabase: open-platform / huadtiuuoiriqrjpjxhr; public.hillstreet_website_inquiries.
- Sentry: hillstreet organization / hillstreet project; JavaScript error reporting configured, test ingestion HTTP 200.

## Verified

Local automated tests: 5 passed. Production dependency audit: 0 vulnerabilities. GitHub CI passed: https://github.com/hillstreet-ph/hillstreet/actions/runs/40232508533 . Cloudflare preview build and deployment succeeded. Main HTML, scripts, stylesheet and logo returned HTTP 200. Browser observed 0 broken images and loaded video readyState 4.

The deployed contact endpoint rejected invalid fields with HTTP 400. A valid API request returned HTTP 201 and saved exactly one database record. The browser form also returned HTTP 201, showed Message received, and produced a confirmed database record. All synthetic inquiry records were deleted afterward. Duplicate request retries produced only one row. Rate limiting accepted three requests and blocked the fourth within 10 minutes.

Database RLS is enabled; anonymous users cannot SELECT, INSERT or execute the submission RPC. Cloudflare holds the Supabase service key only as an encrypted server environment variable in preview and production. No server key is in GitHub or browser code.

The mobile 390 x 844 hero screenshot was visually reviewed and displayed correctly. Full mobile interactions remain unverified: the interaction service kept a 1920px viewport. External social links and third-party destinations were preserved rather than exhaustively tested.

## Deploy production

In Cloudflare Pages > hillstreet, deploy the main branch after reviewing the verified preview. Build command npm run build; output site; environment values are already configured. Enable production deployments if future main-branch commits should deploy automatically. The preview branch deployment-check is enabled for test builds. No account-level DNS changes are required for the pages.dev address.

Inquiries are saved to Supabase for manual review; email delivery is not configured. The original site remains recovered compiled React code. New integration source, backend route, tests and configuration are editable in this repository; original React components and source maps were not available.
