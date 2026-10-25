# HillStreet website frontend backup

Source: https://app-c409skgy6hhd.appmedo.com/
Captured on October 26, 2026 (Asia/Manila).

This repository contains the recovered production frontend, plus editable Cloudflare Pages Functions, a working Supabase contact backend, and Sentry monitoring. It does not contain the original React development project. Firecrawl found one indexed public page, with About, Services, Network, Contact and other sections on that page. Linked external websites are links only and are not cloned.

## Run locally

```sh
python3 -m http.server 8080 --directory site
```

Open http://localhost:8080. Serve over HTTP rather than opening the HTML file directly. No Node installation or build step is required for the deployed JavaScript bundle.

## Upload to GitHub

Extract this archive, create an empty GitHub repository, and run these commands inside this folder, replacing the example URL:

```sh
git init
git add .
git commit -m "Archive public HillStreet frontend"
git branch -M main
git remote add origin https://github.com/hillstreet-ph/hillstreet.git
git push -u origin main
```

For GitHub Pages, open Settings > Pages, choose GitHub Actions, and run the included deployment workflow. The workflow publishes only `site/`. Root-relative image paths require hosting at a domain root; the included workflow rewrites these paths for repository Pages hosting during deployment.

## Included files

- `site/index.html`: standalone entry point with downloaded script, stylesheet and media references.
- `site/assets/`: original compiled production JavaScript and CSS.
- `site/images/`: publicly referenced images and business meeting video.
- `site/vendor/`: downloaded fonts and supporting assets.
- `capture.json`: Firecrawl rendered HTML, raw HTML, content, metadata and links.
- `content.md`: extracted page text.
- `original-index.html`: unchanged HTTP entry point for reference.
- `manifest.json`: retrieved URLs, download errors, sizes and original download hashes. Rewritten CSS files may differ from their original download hashes.

## Limits and known behavior

The original React/TypeScript components, package manifest, lockfile, development configuration, backend source, database and private data were not recovered. The bundle contains no source-map reference. Obtain an authorized project export from Medo for the editable original codebase.

The recovered contact form has been upgraded to POST /api/contact. Cloudflare validates and saves inquiries to open-platform through a server-only Supabase RPC. Success appears only after a confirmed database write. Requests are idempotent and limited to three per IP hash per 10 minutes. Public roles cannot read or write the inquiries table. No email delivery is configured; review inquiries in the Supabase dashboard.

The Medo runtime injection is omitted from the standalone entry point to avoid coupling the copy to the original hosted app. It remains preserved in the original capture. External social, portfolio, Canva and contact destinations remain external. Platform font-catalog assets may remain remote; the site's requested Google font files are downloaded when available.

Validation covers downloaded file presence and local HTML/CSS/media references. Browser appearance, interactive behavior and external integrations have not been fully tested. This is a frontend recovery archive, not a verified full application clone.

Only publish code and media you have permission to use. Original ownership and licensing remain with their respective owners.


## Cloudflare Pages, Supabase and Sentry

Repository: https://github.com/hillstreet-ph/hillstreet

Cloudflare Pages project: `hillstreet`. Production branch: `main`. Build command: `npm run build`. Output directory: `site`. Functions directory: root `functions/`. Node.js 22 or later. Run `npm ci`, `npm test`, and `npm run build` before deployment.

Supabase project: `open-platform` (`huadtiuuoiriqrjpjxhr`). Dedicated table: `public.hillstreet_website_inquiries`. Applied schema is tracked in `supabase/website-inquiries.sql`; do not reapply this non-idempotent initial schema. Existing project tables are untouched. RLS is enabled, with no public table access or public RPC execution. The service-role key is stored only as a Cloudflare encrypted variable for preview and production. Do not put it in static files, GitHub, or client code.

Sentry: organization `hillstreet`, project `hillstreet`. Browser errors use the public DSN. Session tracking, replay and performance tracing are not enabled. Request query strings and contact form values are excluded from the configured event pipeline. No original React source maps were available.

Use a preview deployment to verify navigation, mobile layout, contact submission and Sentry errors before promoting production. Production automatic deployments are initially disabled. No custom domain or DNS was changed.
