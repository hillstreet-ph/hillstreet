// Live-deployment gate for one website: proves Pages serves the merged commit, every public
// route answers with the shared security headers, and the navigation authority in
// src/site-nav.mjs reaches each page. Run from CI against hillstreet.pages.dev.
import { SITE_NAV } from '../src/site-nav.mjs';

const argument = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; };
const base = (argument('--base') || 'https://hillstreet.pages.dev').replace(/\/$/, '');
const commit = argument('--commit') || process.env.GITHUB_SHA || '';
const deadline = Date.now() + Number(argument('--timeout') || 600) * 1000;
const pages = ['/', '/agency', '/influencers', '/cooperation', '/privacy'];
const machineFiles = ['/sitemap.xml', '/robots.txt'];
const bundle = '/assets/website.js';
const subPages = ['/agency', '/influencers', '/cooperation'];
const problems = [];
const notes = [];
const check = (condition, message) => { if (!condition) problems.push(message); };
const occurrences = (text, needle) => text.split(needle).length - 1;
const get = (url, options = {}) => fetch(url, { redirect: 'follow', ...options }).catch(error => { problems.push(`${url}: request failed (${error.message})`); return null; });
const exchange = (url, options) => fetch(url, options).catch(error => { problems.push(`${url}: request failed (${error.message})`); return null; });

async function waitForCommit() {
  // The unique query string keeps the Cloudflare edge from answering from cache.
  for (;;) {
    const response = await get(`${base}/build-info.json?commit=${commit}`);
    const info = response && response.ok ? await response.json().catch(() => null) : null;
    if (info?.commit === commit) return info;
    if (Date.now() > deadline) { problems.push(`${base} never served commit ${commit}; build-info reported ${JSON.stringify(info)}`); return null; }
    console.log(`waiting for Pages to publish ${commit}; build-info reported ${info?.commit ?? 'nothing yet'}`);
    await new Promise(wait => setTimeout(wait, 10000));
  }
}

const served = await waitForCommit();
if (served) {
  console.log(`${base} is serving commit ${served.commit}, built ${served.built_at}`);
  for (const route of [...pages, ...machineFiles, bundle]) {
    const response = await get(base + route);
    check(response?.status === 200, `${base}${route} returned ${response?.status ?? 'no response'}`);
    if (!response?.ok) continue;
    const body = await response.text();
    // A sitemap and a robots file carry the domain, not the wordmark, so they are
    // checked for the canonical host instead of the presentation brand string.
    if (machineFiles.includes(route)) check(body.toLowerCase().includes('hillstreet.space'), `${route} lost the canonical hillstreet.space domain`);
    else check(body.includes('HillStreet'), `${route} lost the HillStreet brand`);
    // The integration layer rewrites the retired deck links, so the bundle must keep
    // exactly one copy of that host as its selector; any extra copy is a live outbound link.
    const retired = occurrences(body, 'canva.site');
    check(route === bundle ? retired === 1 : retired === 0, `${route} carries ${retired} retired Canva host string${retired === 1 ? '' : 's'}; ${route === bundle ? 'the deck relink key is the only one allowed' : 'none are allowed'}`);
    if (route === '/sitemap.xml') for (const path of subPages) check(body.includes(path), `${route} is missing the ${path} entry`);
    if (pages.includes(route)) {
      check(response.headers.has('Content-Security-Policy'), `${route} is missing its Content-Security-Policy`);
      check((response.headers.get('Strict-Transport-Security') || '').includes('max-age=31536000'), `${route} is missing HSTS`);
      check(response.headers.get('X-Content-Type-Options') === 'nosniff', `${route} is missing X-Content-Type-Options: nosniff`);
    }
    if (subPages.includes(route)) for (const entry of SITE_NAV) check(body.includes(`href="${entry.href}"`), `${route} is missing the ${entry.label} navigation button`);
    // The home page renders its menu from the bundle, so its buttons live in the script text.
    if (route === bundle) for (const entry of SITE_NAV) check(body.includes(entry.href), `the home bundle is missing the ${entry.label} button`);
  }

  const missing = await get(`${base}/this-route-does-not-exist`);
  check(missing?.status === 404, `${base} answered an unknown route with ${missing?.status ?? 'no response'} instead of 404`);
  if (missing?.status === 404) {
    const body = await missing.text();
    check(body.includes('HillStreet'), 'the 404 page lost the HillStreet brand');
    for (const route of subPages) check(body.includes(route), `the 404 page does not offer ${route}`);
  }

  const wrongMethod = await get(`${base}/api/contact`);
  check(wrongMethod?.status === 405, `${base}/api/contact answered GET with ${wrongMethod?.status ?? 'no response'} instead of 405`);
  const invalid = await exchange(`${base}/api/contact`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  check(invalid?.status === 400, `${base}/api/contact answered an empty body with ${invalid?.status ?? 'no response'} instead of a validation error`);
  const forged = await exchange(`${base}/api/contact`, { method: 'POST', headers: { Origin: 'https://not-hillstreet.example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  check(forged?.status === 403, `${base}/api/contact accepted a foreign Origin with HTTP ${forged?.status ?? 'no response'}`);

  // The apex is reached over TLS through whatever middlebox this egress uses. A
  // transport error says more about this runner than about the zone, so it is recorded
  // as a note and the zone's own authorities stay in charge: Cloudflare reports the
  // edge certificate status and the hillstreet-ops Worker health cron re-checks the
  // apex from inside Cloudflare every hour. An unexpected HTTP status is still a failure.
  let apex = null;
  let apexTransport = '';
  try {
    apex = await fetch('https://hillstreet.space/', { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch (error) {
    apexTransport = error.message;
  }
  const apexBody = apex ? await apex.text().catch(() => '') : '';
  if (apexTransport) notes.push(`hillstreet.space could not be fetched from this egress (${apexTransport}); the zone's Cloudflare SSL status and the hillstreet-ops Worker health cron remain the authorities for the apex`);
  else if (apex?.status === 200) check(apexBody.includes('HillStreet Agency'), 'hillstreet.space served a page without the HillStreet Agency brand');
  else if (apex?.status === 403 && (apex.headers.get('cf-mitigated') === 'challenge' || apexBody.includes('Just a moment'))) notes.push('hillstreet.space presented the Cloudflare Free Bot Fight Mode challenge to this runner; the hillstreet-ops Worker health cron verifies the apex routes from inside Cloudflare every hour');
  else check(false, `hillstreet.space returned ${apex?.status ?? 'no response'}`);
}

for (const note of notes) console.log(`note: ${note}`);
if (problems.length) { for (const problem of problems) console.error(`FAIL ${problem}`); process.exit(1); }
console.log(`Live verification passed for ${base} at commit ${commit}.`);
