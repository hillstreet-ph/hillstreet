import { build } from 'esbuild';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { navBlock } from '../src/site-nav.mjs';
import { scriptElements } from '../src/html-scripts.mjs';
await build({ entryPoints: ['src/website.js'], bundle: true, minify: true, format: 'iife', target: ['es2022'], outfile: 'site/assets/website.js', sourcemap: false });
for (const path of ['site/index.html','site/assets/index-D4yBHoPu.js','site/assets/index-DwciAvas.css','site/images/business-meeting-proof.mp4']) await access(path);

// Agency sub-pages are same-origin, script-free static routes under the shared CSP.
const agencySlugs = ['agency', 'influencers', 'cooperation'];
for (const slug of agencySlugs) {
  const path = `site/${slug}/index.html`;
  const page = await readFile(path, 'utf8');
  if (page.includes('canva.site')) throw new Error(`${path} still points at the retired Canva host`);
  if (/MKasino/i.test(page.replace(/<a\b[^>]*href="[^"]*mkasino[^"]*"[^>]*>[\s\S]*?<\/a>/gi, ''))) throw new Error(`${path} still presents the retired MKasino brand`);
  const blocked = scriptElements(page)
    .filter(match => !/\bsrc\s*=/.test(match[1]) && !/application\/ld\+json/.test(match[1]) && match[2].trim());
  if (blocked.length) throw new Error(`${path} has an inline script that the Content-Security-Policy would block`);
  if (!page.includes(`https://hillstreet.space/${slug}`)) throw new Error(`${path} is missing its canonical URL`);
  const normalise = value => value.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  const pageNav = /<nav aria-label="Site">[\s\S]*?<\/nav>/.exec(page)?.[0];
  if (!pageNav) throw new Error(`${path} is missing its Site nav`);
  if (normalise(pageNav) !== normalise(navBlock(`/${slug}`))) {
    throw new Error(`${path} has drifted from the SITE_NAV authority in src/site-nav.mjs`);
  }
  const homeButtons = [...page.matchAll(/<a\b[^>]*href="\/"[^>]*>(?:Go back home|Back to HillStreet Agency)<\/a>/g)];
  if (homeButtons.length) throw new Error(`${path} repeats a redundant home button; the Site nav and footer already route back`);
  for (const ref of new Set([...page.matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map(match => match[1]))) {
    const candidates = [ref, `${ref}.html`, `${ref.replace(/\/$/, '')}/index.html`].map(value => `site${value}`);
    if (!(await Promise.all(candidates.map(async file => { try { await access(file); return true; } catch { return false; } })).then(found => found.some(Boolean)))) {
      throw new Error(`${path} links to ${ref}, which does not exist in site/`);
    }
  }
}
// Cloudflare Pages stamps the commit that triggered the build, so the live deployment can
// be matched to the exact merged commit by scripts/verify-live.mjs.
await writeFile('site/build-info.json', JSON.stringify({ project: 'hillstreet', commit: process.env.CF_PAGES_COMMIT_SHA || 'local', built_at: new Date().toISOString() }) + '\n');
const html = await readFile('site/index.html', 'utf8');
if (!html.includes('/assets/website.js')) throw new Error('Website integration entry is missing');
const hashes = scriptElements(html)
  .filter(match => !/\bsrc\s*=/.test(match[1]) && match[2].trim())
  .map(match => "'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
const policy = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  "script-src 'self' " + hashes.join(' '), "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "font-src 'self' data:", "media-src 'self'", "connect-src 'self' https://o4512041160015872.ingest.us.sentry.io",
  'upgrade-insecure-requests'
].join('; ');
await writeFile('site/_headers', `/*\n  Content-Security-Policy: ${policy}\n  Strict-Transport-Security: max-age=31536000\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/assets/*\n  Cache-Control: public, max-age=3600\n`);
console.log('HillStreet website build passed. Deploy site/ with root functions/.');
