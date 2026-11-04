import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { scriptElements } from '../src/html-scripts.mjs';

const retiredRoutes = { mkasino: '/agency', aboutinfluencers: '/influencers', payment: '/cooperation' };
const slugs = Object.values(retiredRoutes).map(route => route.slice(1));
const pages = Object.fromEntries(await Promise.all(slugs.map(async slug => [slug, await readFile(`site/${slug}/index.html`, 'utf8')])));

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

// MKasino account handles are real external destinations, not the site's brand.
function withoutExternalHandles(html) {
  return html.replace(/<a\b[^>]*href="[^"]*mkasino[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');
}

test('agency pages replace the Canva host with same-origin routes', async () => {
  const source = await readFile('src/website.js', 'utf8');
  // Compare the whole declared origin instead of testing whether the URL appears as a
  // substring: a substring match also succeeds on a host that merely ends with the retired
  // one, which is exactly the ambiguity a rewriter must not have.
  const declared = /const DECK_HOST = '([^']+)';/.exec(source)?.[1];
  assert.ok(declared, 'src/website.js no longer declares the DECK_HOST constant the deck links are rewritten from');
  const deckOrigin = new URL(declared);
  assert.equal(deckOrigin.origin, 'https://masterkanortv.my.canva.site', 'the integration layer must know the retired host');
  assert.equal(deckOrigin.pathname, '/', `${declared} must name the bare deck origin, not a deep link into it`);
  for (const [retired, route] of Object.entries(retiredRoutes)) {
    assert.ok(source.includes(`${retired}: '${route}'`), `src/website.js does not route ${retired} to ${route}`);
    assert.ok(pages[route.slice(1)].includes(`rel="canonical" href="https://hillstreet.space${route}"`));
  }
  for (const slug of slugs) assert.ok(!pages[slug].includes('canva.site'), `site/${slug}/index.html still references Canva`);
  const bundle = await readFile('site/assets/index-D4yBHoPu.js', 'utf8');
  assert.ok(bundle.includes('masterkanortv.my.canva.site'), 'the recovered bundle is the source of the outbound links the integration layer rewrites');
});

test('HillStreet is the only brand the agency pages present', async () => {
  for (const slug of slugs) {
    const html = withoutExternalHandles(pages[slug]);
    assert.ok(!/MKasino|MKASINO/i.test(html), `site/${slug}/index.html still presents the retired MKasino brand`);
    assert.ok(!/class="eyebrow"[^>]*>\s*Legacy/i.test(html), `site/${slug}/index.html still labels itself legacy`);
  }
  const source = await readFile('src/website.js', 'utf8');
  assert.ok(source.includes('MKasino Marketing Agency'), 'the integration layer relabels the deck card the recovered bundle renders');
  assert.ok(source.includes('Agency Services and Work'), 'the deck card must read as the HillStreet agency page');
  const home = await readFile('site/index.html', 'utf8');
  const bundle = await readFile('site/assets/index-D4yBHoPu.js', 'utf8');
  assert.ok(home.includes('/assets/website.js'), 'the brand patch ships with the homepage integration entry');
  assert.ok(bundle.includes('From MKasino to HillStreet'), 'the brand history section stays as history, not as a second live brand');
});

test('retired pre-merge routes redirect to the single-brand routes', async () => {
  const redirects = await readFile('site/_redirects', 'utf8');
  for (const [retired, route] of Object.entries(retiredRoutes)) {
    const line = redirects.split('\n').find(entry => entry.trim().startsWith(`/${retired} `));
    assert.ok(line, `/${retired} has no redirect`);
    assert.ok(line.includes(route), `/${retired} does not redirect to ${route}`);
    assert.match(line, /308/, `/${retired} must redirect permanently`);
  }
  const sitemap = await readFile('site/sitemap.xml', 'utf8');
  for (const [retired, route] of Object.entries(retiredRoutes)) {
    assert.ok(!sitemap.includes(`hillstreet.space${`/${retired}`}<`), `sitemap still advertises ${`/${retired}`}`);
    assert.ok(sitemap.includes(`https://hillstreet.space${route}`), `${route} is missing from sitemap.xml`);
  }
  const notFound = await readFile('site/404.html', 'utf8');
  for (const slug of slugs) assert.ok(notFound.includes(`href="/${slug}"`), `404 page does not offer /${slug}`);
});

test('agency pages stay inside the shared Content-Security-Policy', async () => {
  const allowedLinks = new Set(['t.me', 'wa.me', 'www.facebook.com', 'www.youtube.com']);
  for (const slug of slugs) {
    for (const match of scriptElements(pages[slug])) {
      if (/\bsrc\s*=/.test(match[1])) continue;
      assert.match(match[1], /application\/ld\+json/, `site/${slug}/index.html has an executable inline script`);
    }
    assert.equal(scriptElements(pages[slug]).length, (pages[slug].match(/<script\b/gi) || []).length,
      `site/${slug}/index.html holds a <script> the shared scanner cannot close, so the CSP guard would skip it`);
    assert.ok(!/(?:<a\b[^>]*href|src)="https?:\/\/(?:www\.)?hillstreet\.space/.test(pages[slug]), `site/${slug}/index.html links its own domain absolutely`);
    for (const ref of pages[slug].matchAll(/<(?:a|img|video|source)\b[^>]*?(?:href|src)="((?:https?:)?\/\/[^"]+)"/g)) {
      const url = ref[1];
      if (url.startsWith('//')) continue;
      const { protocol, host } = new URL(url);
      if (protocol === 'http:') assert.fail(`site/${slug}/index.html links ${url} over plain http`);
      assert.ok(allowedLinks.has(host), `site/${slug}/index.html links ${host}; only messaging and social profiles may leave the origin`);
    }
  }
});

test('every same-origin reference on an agency page resolves in site/', async () => {
  for (const slug of slugs) {
    const refs = new Set([...pages[slug].matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map(match => match[1]));
    for (const ref of refs) {
      const found = await Promise.all([`site${ref}`, `${ref}.html`, `${ref.replace(/\/$/, '')}/index.html`]
        .map(value => exists(value.startsWith('site') ? value : `site${value}`)));
      assert.ok(found.some(Boolean), `site/${slug}/index.html links ${ref}, which is missing`);
    }
  }
});

test('agency media is self-hosted and declares its intrinsic size', async () => {
  for (const slug of slugs) {
    for (const img of pages[slug].matchAll(/<img\b([^>]*)>/g)) {
      const attrs = img[1];
      const src = /src="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(src?.startsWith('/'), `site/${slug}/index.html loads remote image ${src}`);
      assert.ok(/alt="[^"]+"/.test(attrs), `${src} needs a non-empty alt description`);
      assert.match(attrs, /width="\d+"/, `${src} needs a width`);
      assert.match(attrs, /height="\d+"/, `${src} needs a height`);
      assert.ok(await exists(`site${src}`), `${src} is not present in site/`);
    }
    for (const video of pages[slug].matchAll(/<video\b([^>]*)>/g)) {
      assert.match(video[1], /controls/, 'video needs native controls');
      assert.match(video[1], /preload="none"/, 'video must not download before playback');
    }
  }
});

test('one contact authority serves every agency page', async () => {
  const primary = { telegram: 'https://t.me/Alextzy31', whatsapp: 'https://wa.me/639271985750', email: 'contact@hillstreet.space' };
  for (const slug of slugs) {
    const html = pages[slug];
    for (const btn of html.matchAll(/<a class="btn[^"]*" href="([^"]+)"/g)) {
      if (btn[1].startsWith('https://t.me/')) assert.equal(btn[1], primary.telegram, `site/${slug}/index.html sends a button to ${btn[1]}`);
    }
    const body = /<main[\s\S]*<\/main>/.exec(html)[0];
    for (const route of [primary.whatsapp, primary.email, primary.telegram]) {
      assert.ok(body.includes(route), `site/${slug}/index.html body is missing ${route}`);
    }
    assert.equal([...body.matchAll(/href="\/"[^>]*>(?:Go back home|Back to HillStreet Agency)</g)].length, 0,
      `site/${slug}/index.html repeats the home link the header nav already carries`);
    // Archived deck routes stay as records only: outside .deck-record they would read as live contacts.
    const withoutRecords = body.replace(/<div class="deck-record">[\s\S]*?<\/div>/g, '');
    for (const retired of ['945 263 9539', 'masterkanortv@gmail.com']) {
      assert.ok(!new RegExp(retired, 'i').test(withoutRecords), `site/${slug}/index.html presents ${retired} as a live contact`);
    }
    // The eight-team Telegram table is published routing; retired handles may appear there, nowhere else in the body.
    const outsideTables = withoutRecords.replace(/<table[\s\S]*?<\/table>/g, '').replace(/<a class="btn[^>]*>[\s\S]*?<\/a>/g, '');
    for (const retired of ['MasterkanorSupport', 'mksupport143']) {
      assert.ok(!new RegExp(retired, 'i').test(outsideTables), `site/${slug}/index.html offers ${retired} outside the published team table`);
    }
    assert.match(body, /deck-record/, `site/${slug}/index.html must keep the archived deck record`);
  }
});

test('every archived agency asset is published somewhere', async () => {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir('site/images/agency', { withFileTypes: true });
  const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  const posters = (await readdir('site/images/agency/posters')).map(name => `posters/${name}`);
  const all = slugs.map(slug => pages[slug]).join('') + await readFile('site/index.html', 'utf8');
  for (const file of [...files, ...posters]) {
    assert.ok(all.includes(`/images/agency/${file}`), `site/images/agency/${file} is captured but never published`);
  }
});

const pngSize = buffer => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];

// Canvas writes baseline JPEG, so the first start-of-frame segment carries the size.
const jpegSize = buffer => {
  for (let i = 2; i < buffer.length - 9; i += 2 + buffer.readUInt16BE(i + 2)) {
    if (buffer[i] !== 0xff) throw new Error('broken JPEG segment');
    const marker = buffer[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return [buffer.readUInt16BE(i + 7), buffer.readUInt16BE(i + 5)];
  }
  throw new Error('no start-of-frame marker found');
};

test('one identity set serves every page', async () => {
  const home = await readFile('site/index.html', 'utf8');
  const notFound = await readFile('site/404.html', 'utf8');
  const privacy = await readFile('site/privacy.html', 'utf8');
  const every = { index: home, '404': notFound, privacy, ...pages };

  for (const [name, html] of Object.entries(every)) {
    assert.match(html, /rel="icon"[^>]*href="\/images\/brand\/icon-32\.png"/, `${name} has no HillStreet favicon`);
    assert.match(html, /rel="apple-touch-icon" href="\/images\/brand\/apple-touch-icon\.png"/, `${name} has no touch icon`);
    assert.ok(!html.includes('7e41651900-app-c409skgy6hhd_web_1792959368853'), `${name} still uses the Canva app export as its identity image`);
    assert.equal([...html.matchAll(/<title>/g)].length, 1, `${name} declares more than one title`);
    assert.ok(!/<\/title>\|/.test(html), `${name} carries a stray deck import artefact after the title`);
    assert.equal([...html.matchAll(/property="og:title"/g)].length, [...html.matchAll(/property="og:image"/g)].length,
      `${name} shares social cards unevenly`);
  }
  for (const name of ['index', ...slugs]) {
    assert.match(every[name], /rel="manifest" href="\/manifest\.webmanifest"/, `${name} is not wired to the app manifest`);
    assert.match(every[name], /property="og:image" content="https:\/\/hillstreet\.space\/images\/brand\/og-hillstreet\.png"/, `${name} has no brand card`);
    assert.match(every[name], /name="twitter:card" content="summary_large_image"/, `${name} has no twitter card`);
  }

  const shapes = {
    'icon-32.png': [32, 32], 'icon-48.png': [48, 48], 'icon-192.png': [192, 192], 'icon-512.png': [512, 512],
    'apple-touch-icon.png': [180, 180], 'maskable-512.png': [512, 512], 'brand-mark-128.png': [128, 128],
    'og-hillstreet.png': [1200, 630],
  };
  for (const [file, size] of Object.entries(shapes)) {
    assert.deepEqual(pngSize(await readFile(`site/images/brand/${file}`)), size, `site/images/brand/${file} is not ${size.join('x')}`);
  }
  const manifest = JSON.parse(await readFile('site/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.ok(await exists(`site${icon.src}`), `the manifest points at ${icon.src}, which is missing`);
  }
  // The header mark is the tight crop, not the padded export it was cut from.
  for (const slug of slugs) {
    assert.match(pages[slug], /<img src="\/images\/brand\/brand-mark-128\.png" alt="HillStreet Agency logo" width="32" height="32">/,
      `site/${slug}/index.html still renders the padded logo in the header`);
  }
  const integration = await readFile('src/website.js', 'utf8');
  assert.ok(integration.includes('img[src="/images/logo-hillstreet.png"]'), 'the home bundle logo is swapped at runtime');
});

test('every video ships a poster and reserves its box', async () => {
  const css = await readFile('site/assets/agency.css', 'utf8');
  const videoRule = /\nvideo\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(videoRule, 'the base video rule is missing from agency.css');
  assert.ok(!/aspect-ratio/.test(videoRule), 'a blanket video aspect would letterbox the vertical reels');
  for (const slug of slugs) {
    for (const video of pages[slug].matchAll(/<video\b([^>]*)>/g)) {
      const attrs = video[1];
      const src = /src="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(src, `site/${slug}/index.html has a video with no source`);
      const poster = /poster="(\/[^"]+)"/.exec(attrs)?.[1];
      assert.ok(poster, `site/${slug}/index.html plays ${src} with no poster`);
      assert.ok(await exists(`site${poster}`), `${poster} is not present in site/`);
      const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(attrs);
      const [pw, ph] = jpegSize(await readFile(`site${poster}`));
      assert.ok(Math.abs(pw / ph - w / h) < 0.01, `${poster} is a different shape than ${src} declares`);
    }
    for (const [, cls, tileAttrs] of pages[slug].matchAll(/<figure(?: class="([^"]*)")?>\s*<video\b([^>]*)>/g)) {
      const [, tw, th] = /width="(\d+)" height="(\d+)"/.exec(tileAttrs);
      const file = /src="([^"]+)"/.exec(tileAttrs)[1];
      if (+tw < +th) assert.ok(/media-tall/.test(cls || ''), `${file} is vertical and needs the tall frame`);
      else assert.ok(!/media-tall/.test(cls || ''), `${file} is landscape and must stay full-width`);
    }
  }
  const integration = await readFile('src/website.js', 'utf8');
  assert.ok(integration.includes('/images/posters/business-meeting-proof.jpg'), 'the home video keeps a hero illustration instead of its own frame');
  assert.ok(await exists('site/images/posters/business-meeting-proof.jpg'), 'the home video poster is missing');
});

test('settlement channels are native components that link to their proof', async () => {
  const html = pages.cooperation;
  const channels = [...html.matchAll(/<article class="channel">([\s\S]*?)<\/article>/g)];
  assert.equal(channels.length, 5, 'the cooperation deck publishes five settlement routes');
  for (const [, block] of channels) {
    assert.match(block, /<svg viewBox="0 0 24 24"/, 'each channel needs its own inline icon');
    assert.match(block, /<h3>[^<]+<\/h3>/, 'each channel names the route it settles through');
  }
  for (const route of ['GCash', 'Bank transfer', 'Binance TRC20', 'Platform wallet', 'Game account']) {
    assert.ok(html.includes(route), `the ${route} route is missing from the settlement channels`);
  }
  for (const link of html.matchAll(/class="record" href="#([^"]+)"/g)) {
    assert.ok(html.includes(`id="${link[1]}"`), `the ${link[1]} record link has no target on the page`);
  }
  assert.ok(html.includes('/images/agency/cooperation-channels.png'), 'the deck graphic stays as the source record');
  const proof = /id="proof"[\s\S]*?<\/section>/.exec(html)[0];
  assert.match(proof, /Platform to agency/);
  assert.match(proof, /Agency to influencer/);
});

test('agency pages keep one document outline and a route back to HillStreet', async () => {
  for (const slug of slugs) {
    const html = pages[slug];
    assert.match(html, /<html lang="en"/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `site/${slug}/index.html needs exactly one h1`);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /<header class="site-header"/);
    assert.match(html, /<nav aria-label="Site"/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /href="\/assets\/agency\.css"/);
    assert.match(html, /href="\/vendor\/e8f8e5801b-css2\.css"/, 'pages must use the locally hosted fonts');
    assert.match(html, /href="\/"/);
    assert.match(html, /contact@hillstreet\.space/);
    assert.match(html, /href="\/privacy"/);
    for (const other of slugs) assert.ok(html.includes(`href="/${other}"`), `site/${slug}/index.html should link /${other}`);
  }
});

// src/site-nav.mjs is the single menu authority for the recovered home bundle, the
// three sub-pages and this check; a page with its own private menu fails here.
test('every sub-page renders the shared SITE_NAV list', async () => {
  const { SITE_NAV, navBlock } = await import('../src/site-nav.mjs');
  const css = await readFile('site/assets/agency.css', 'utf8');
  const trimLines = value => value.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  assert.match(css, /\.nav-check:checked ~ \.nav/, 'agency.css is missing the script-free menu disclosure');
  for (const slug of slugs) {
    const nav = /<nav aria-label="Site">[\s\S]*?<\/nav>/.exec(pages[slug])?.[0];
    assert.ok(nav, `site/${slug}/index.html has no Site nav`);
    assert.equal(trimLines(nav), trimLines(navBlock(`/${slug}`)), `site/${slug}/index.html drifted from src/site-nav.mjs`);
    // The sub-pages ship no scripts, so the mobile menu opens with a CSS-only checkbox.
    assert.match(pages[slug], /<input class="nav-check"[^>]*id="nav-toggle">/);
    assert.match(pages[slug], /<label class="nav-fold" for="nav-toggle">Menu<\/label>/);
    for (const { href, label } of SITE_NAV)
      assert.ok(nav.includes(`href="${href}"`), `${label} is missing from the site/${slug}/index.html header menu`);
  }
});

test('footers carry the same site map and the home integration follows SITE_NAV', async () => {
  const { SITE_NAV } = await import('../src/site-nav.mjs');
  const integration = await readFile('src/website.js', 'utf8');
  assert.match(integration, /from '\.\/site-nav\.mjs'/, 'the home integration must read the shared nav list');
  assert.match(integration, /nav:not\(\.hs-nav\), button/, 'the bundle button menu must be replaced with real links');
  assert.match(integration, /a\[href="#"\]/, 'dead brand links must be pointed at the top of the site');
  assert.match(integration, /function landHash\(\)/, 'section links arriving from the sub-pages must re-apply the hash after the bundle mounts');
  for (const slug of slugs) {
    assert.match(pages[slug], /<h4>Explore<\/h4>/, `site/${slug}/index.html footer lost the shared site map`);
    const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(pages[slug])?.[0];
    assert.ok(footer, `site/${slug}/index.html lost its footer`);
    for (const { href, label } of SITE_NAV)
      assert.ok(footer.includes(`href="${href}"`), `${label} is missing from the site/${slug}/index.html footer`);
  }
});

// One site: the same route is presented under the same button wording everywhere,
// and no page keeps a third copy of the same call-to-action.
test('cross-page buttons use one label each and never triple up', async () => {
  const wording = {
    '/agency': 'Agency services and work',
    '/influencers': 'Influencer rates and formats',
    '/cooperation': 'Payment &amp; cooperation terms',
  };
  const every = { ...pages, '404': await readFile('site/404.html', 'utf8') };
  for (const [name, html] of Object.entries(every)) {
    const pairs = new Map();
    for (const match of html.matchAll(/<a class="(?:btn|underline)[^"]*" href="(\/(?:agency|influencers|cooperation))">([^<]+)<\/a>/g)) {
      assert.equal(match[2], wording[match[1]], `site/${name} calls ${match[1]} "${match[2]}"`);
      const key = `${match[1]}|${match[2]}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    for (const [key, count] of pairs)
      assert.ok(count <= 2, `site/${name} renders the same ${key} button ${count} times`);
  }
});

test('cross-page deep links land on real sections', async () => {
  for (const slug of slugs) {
    for (const [, route, anchor] of pages[slug].matchAll(/href="\/(influencers|cooperation)#([^"]+)"/g))
      assert.ok(pages[route].includes(`id="${anchor}"`), `/${slug} links /${route}#${anchor}, which has no target`);
  }
});
