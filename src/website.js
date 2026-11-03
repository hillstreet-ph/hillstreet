import * as Sentry from '@sentry/browser';
import { SITE_NAV } from './site-nav.mjs';

Sentry.init({
  dsn: 'https://a6de033c24b5114420e12ac732439c25@o4512041160015872.ingest.us.sentry.io/4512318811668480',
  environment: ['hillstreet.space','www.hillstreet.space','hillstreet.pages.dev'].includes(location.hostname) ? 'production' : 'preview',
  release: 'hillstreet-website@1.0.0',
  sendDefaultPii: false,
  autoSessionTracking: false,
  integrations: defaults => defaults.filter(i => i.name !== 'Breadcrumbs'),
  beforeSend(event) {
    delete event.user; delete event.extra; delete event.breadcrumbs;
    if (event.request) event.request = { url: location.origin + location.pathname };
    return event;
  }
});

function enhanceContact() {
  const form = document.querySelector('form:has([name="message"])');
  if (!form) return false;
  for (const [name, max] of Object.entries({name:120,email:254,company:200,message:5000})) {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) { field.maxLength = max; field.required = name !== 'company'; }
  }
  if (!form.querySelector('[data-privacy-notice]')) {
    const notice = document.createElement('p'); notice.dataset.privacyNotice = ''; notice.className = 'text-xs text-muted-foreground';
    notice.append('Your inquiry is stored so our team can respond. ');
    const link = document.createElement('a'); link.href = '/privacy'; link.textContent = 'How we use your data'; link.className = 'underline'; notice.append(link); form.append(notice);
  }
  return true;
}

// The agency decks are now hosted here; the recovered bundle still points at them off-site.
const DECK_HOST = 'https://masterkanortv.my.canva.site';
const DECK_ROUTES = { mkasino: '/agency', aboutinfluencers: '/influencers', payment: '/cooperation' };

// The bundle ships the pre-merge card copy, so the deck cards are relabelled at
// runtime. Rules match whole text nodes, which keeps sibling icons in place and
// leaves the "From MKasino to HillStreet" history section untouched.
const BRAND_TEXT = [
  { is: t => t.trim() === 'MKasino Marketing Agency', apply: () => 'Agency Services and Work' },
  { is: t => t.trim() === 'Visit MKasino Agency', apply: () => 'Agency services and work' },
  { is: t => t.trim().startsWith('Our original agency brand.'),
    apply: () => 'The full agency record: influencer marketing, general agent management, digital marketing, social media management, graphic design, video editing, live customer support, and chatbot automation.' },
  { is: t => t.includes('for MKasino Agency campaigns'),
    apply: t => t.replace('for MKasino Agency campaigns', 'for HillStreet Agency campaigns') },
];

function unifyBrand() {
  let done = false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const rule = BRAND_TEXT.find(entry => entry.is(node.textContent));
    if (rule) hits.push([node, rule]);
  }
  for (const [node, rule] of hits) {
    node.textContent = rule.apply(node.textContent);
    done = true;
  }
  return done;
}

function relinkDeck() {
  let done = false;
  for (const anchor of document.querySelectorAll(`a[href^="${DECK_HOST}"]`)) {
    const slug = anchor.href.slice(DECK_HOST.length).replace(/^\/+|\/+$/g, '');
    const route = DECK_ROUTES[slug];
    if (!route) continue;
    anchor.setAttribute('href', route);
    anchor.removeAttribute('target');
    anchor.dataset.deckRoute = route;
    done = true;
  }
  return done;
}

// The recovered bundle renders its header menu as buttons that only scroll, and the
// mobile burger opens nothing. The site-wide nav is injected from the same authority
// the static sub-pages ship, so home and the agency pages share one menu. The mobile
// disclosure is the same CSS-only checkbox as agency.css, restyled for the bundle.
const NAV_CSS = `
section[id] { scroll-margin-top: 6rem; }
.hs-nav { position: relative; display: flex; align-items: center; }
.hs-nav ul { display: flex; flex-wrap: wrap; align-items: center; gap: 2rem; list-style: none; margin: 0; padding: 0; }
.hs-nav li { list-style: none; }
.hs-nav a { font-size: .875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; color: #a3a3a3; text-decoration: none; transition: color .2s ease; }
.hs-nav a:hover, .hs-nav a:focus-visible { color: #ccff00; }
.hs-nav a[aria-current="page"] { color: #ccff00; }
.hs-nav-check { position: absolute; opacity: 0; pointer-events: none; }
.hs-nav-fold { display: none; }
@media (max-width: 767px) {
  .hs-nav ul { display: none; position: absolute; top: calc(100% + .75rem); right: 0; z-index: 60; flex-direction: column; align-items: flex-start; gap: 0; min-width: 15rem; max-height: 70vh; overflow: auto; background: #0d0d0d; border: 2px solid #333; padding: .75rem 1.25rem; }
  .hs-nav-check:checked ~ ul { display: flex; }
  .hs-nav a { display: block; min-height: 2.75rem; padding-block: .625rem; }
  .hs-nav-fold { display: flex; align-items: center; min-height: 2.5rem; padding-inline: 1rem; border: 2px solid #333; color: #a3a3a3; font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; cursor: pointer; transition: color .2s ease, border-color .2s ease; }
  .hs-nav-fold:hover { color: #ccff00; border-color: #ccff00; }
  .hs-nav-check:focus-visible ~ .hs-nav-fold { outline: 2px solid #ccff00; outline-offset: 2px; }
}`;

function unifyNav() {
  const header = document.querySelector('header');
  if (!header) return false;
  if (!document.getElementById('site-nav-style')) {
    const style = document.createElement('style');
    style.id = 'site-nav-style';
    style.textContent = NAV_CSS;
    document.head.append(style);
  }
  // Retire the bundle's scroll-buttons and the dead burger; the injected menu replaces them.
  for (const node of header.querySelectorAll('nav:not(.hs-nav), button')) {
    node.dataset.hsRetired = 'true';
    node.style.setProperty('display', 'none', 'important');
  }
  if (!header.querySelector('.hs-nav')) {
    const nav = document.createElement('nav');
    nav.className = 'hs-nav';
    nav.setAttribute('aria-label', 'Site');
    const check = document.createElement('input');
    check.type = 'checkbox'; check.className = 'hs-nav-check'; check.id = 'hs-nav-toggle';
    const fold = document.createElement('label');
    fold.className = 'hs-nav-fold'; fold.htmlFor = 'hs-nav-toggle'; fold.textContent = 'Menu';
    const list = document.createElement('ul');
    for (const { href, label } of SITE_NAV) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (href === '/') link.setAttribute('aria-current', 'page');
      li.append(link); list.append(li);
    }
    nav.append(check, fold, list);
    (header.querySelector('div') || header).append(nav);
  }
  // Dead brand links from the bundle resolve to the top of the site.
  for (const anchor of document.querySelectorAll('a[href="#"]')) anchor.setAttribute('href', '/');
  // The bundle ships a second self-link to the live domain labelled "Portfolio"; the
  // hosted agency record is the portfolio now.
  for (const anchor of document.querySelectorAll('a[href^="https://hillstreet.space"], a[href^="https://www.hillstreet.space"]')) {
    if (/portfolio/i.test(anchor.textContent)) {
      anchor.setAttribute('href', '/agency');
      anchor.removeAttribute('target');
      anchor.dataset.deckRoute = '/agency';
    }
  }
  const footer = document.querySelector('footer');
  if (!footer) return false;
  const heading = [...footer.querySelectorAll('h4')].find(h => h.textContent.trim() === 'Navigation');
  const footerList = heading?.nextElementSibling;
  if (!footerList || !footerList.querySelector('a[href="/agency"]')) {
    if (!footerList) return false;
    const contactItem = [...footerList.children].find(li => li.querySelector('a[href="#contact"], a[href="/#contact"]'));
    for (const { href, label } of SITE_NAV.filter(entry => !entry.href.includes('#'))) {
      if (href === '/' || footerList.querySelector(`a[href="${href}"]`)) continue;
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.className = 'text-sm text-muted-foreground hover:text-primary transition-colors';
      link.textContent = label;
      li.append(link);
      if (contactItem) footerList.insertBefore(li, contactItem); else footerList.append(li);
    }
  }
  return true;
}

// The recovered bundle ships the padded deck-era exports: a logo with heavy dark
// padding rendered at 36px and a wide letterbox around a portrait meeting video.
// The identity assets are generated from that same mark, so the bundle is pointed
// at the tight crops and at real frames instead of a hero illustration.
const TIGHT_MARK = '/images/brand/brand-mark-128.png';
const VIDEO_POSTERS = { 'business-meeting-proof': '/images/posters/business-meeting-proof.jpg' };

function polishMedia() {
  let done = false;
  for (const img of document.querySelectorAll('img[src="/images/logo-hillstreet.png"]')) {
    img.src = TIGHT_MARK;
    done = true;
  }
  for (const video of document.querySelectorAll('video')) {
    const src = video.currentSrc || video.querySelector('source')?.src || video.src;
    const slug = /\/images\/(?:agency\/)?([^/.]+)\.mp4/.exec(src)?.[1];
    if (slug && VIDEO_POSTERS[slug] && video.getAttribute('poster') !== VIDEO_POSTERS[slug]) {
      video.setAttribute('poster', VIDEO_POSTERS[slug]);
      done = true;
    }
    if (video.videoWidth && video.videoHeight && video.videoWidth < video.videoHeight) {
      const frame = video.parentElement;
      if (frame && !frame.dataset.portraitMedia) {
        frame.dataset.portraitMedia = 'true';
        frame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        frame.style.maxWidth = '22rem';
        frame.style.marginInline = 'auto';
      }
      done = true;
    }
  }
  return done;
}

let contactReady = enhanceContact();
let deckReady = relinkDeck();
let brandReady = unifyBrand();
let mediaReady = polishMedia();
let navReady = unifyNav();
if (!contactReady || !deckReady || !brandReady || !mediaReady || !navReady) {
  const observer = new MutationObserver(() => {
    if (!contactReady) contactReady = enhanceContact();
    if (!deckReady) deckReady = relinkDeck();
    if (!brandReady) brandReady = unifyBrand();
    if (!mediaReady) mediaReady = polishMedia();
    if (!navReady) navReady = unifyNav();
    if (contactReady && deckReady && brandReady && mediaReady && navReady) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
document.addEventListener('loadedmetadata', event => {
  if (event.target instanceof HTMLVideoElement) polishMedia();
}, true);

// The bundle mounts asynchronously, so the browser's one-shot fragment scroll misses
// section links arriving from the sub-pages (/#about, /#services, /#contact).
// Re-apply the hash once the target exists.
function landHash() {
  if (!location.hash) return true;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!target) return false;
  target.scrollIntoView();
  return true;
}
if (!landHash()) {
  const hashWatcher = new MutationObserver(() => {
    if (landHash()) hashWatcher.disconnect();
  });
  hashWatcher.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => hashWatcher.disconnect(), 5000);
}

// Capture before the recovered React handler, which only simulated submission.
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.querySelector('[name="message"]')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (form.dataset.sending === 'true') return;
  const fields = new FormData(form);
  const values = Object.fromEntries(['name','email','company','message'].map(key => [key, String(fields.get(key) || '').trim()]));
  let status = form.querySelector('[data-submit-status]');
  if (!status) { status = document.createElement('p'); status.dataset.submitStatus = ''; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); form.append(status); }
  if (!values.name || !values.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) { status.textContent = 'Please enter your name, a valid email address, and a message.'; return; }
  const button = form.querySelector('button[type="submit"]');
  form.dataset.sending = 'true'; if (button) button.disabled = true;
  status.textContent = 'Sending your message…';
  // Reuse the key if a response was lost after the database accepted the inquiry.
  const fingerprint = JSON.stringify(values);
  if (form.dataset.fingerprint !== fingerprint) { form.dataset.requestId = crypto.randomUUID(); form.dataset.fingerprint = fingerprint; }
  try {
    const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, request_id: form.dataset.requestId }) });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'Your message could not be sent. Please try again.');
    const confirmation = document.createElement('div'); confirmation.setAttribute('role','status');
    const heading = document.createElement('h3'); heading.className = 'text-xl font-bold mb-3'; heading.textContent = 'Message received';
    const detail = document.createElement('p'); detail.textContent = 'Thank you. Your inquiry has been saved for our team to review.';
    confirmation.append(heading,detail); form.replaceWith(confirmation);
  } catch (error) {
    status.textContent = error.message;
    // Fixed message only; do not attach contact details to monitoring.
    Sentry.captureMessage('Contact submission failed', 'warning');
  } finally { form.dataset.sending = 'false'; if (button) button.disabled = false; }
}, true);
