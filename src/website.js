import * as Sentry from '@sentry/browser';

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
if (!enhanceContact()) {
  const observer = new MutationObserver(() => { if (enhanceContact()) observer.disconnect(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
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
