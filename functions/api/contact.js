const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Strict-Transport-Security': 'max-age=31536000', ...extra } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ ok: false, error: 'Origin not allowed.' }, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'JSON required.' }, 415);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'Contact service is temporarily unavailable. Please use our direct contact links.' }, 503);
  let body;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    const chunks = []; let length = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 16384) { await reader.cancel(); return json({ ok: false, error: 'Message is too large.' }, 413); } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ ok: false, error: 'Invalid request.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'Invalid request.' }, 400);
  const data = {};
  for (const field of ['name','email','company','message']) {
    if (body[field] != null && typeof body[field] !== 'string') return json({ ok: false, error: 'Invalid fields.' }, 400);
    data[field] = (body[field] || '').trim();
  }
  if (!data.name || data.name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254 || data.company.length > 200 || !data.message || data.message.length > 5000 || !uuid.test(body.request_id || '')) return json({ ok: false, error: 'Please check your name, email and message (maximum 5,000 characters).' }, 400);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY + ':' + ip));
  const ipHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  try {
    const response = await fetch(env.SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/rpc/submit_hillstreet_website_inquiry', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_request_id: body.request_id, p_name: data.name, p_email: data.email, p_company: data.company, p_message: data.message, p_ip_hash: ipHash })
    });
    if (!response.ok) return json({ ok: false, error: 'Your message could not be saved. Please try again or use our direct contact links.' }, 502);
    const result = await response.json();
    if (result?.rate_limited) return json({ ok: false, error: 'Too many messages. Please try again in 10 minutes.' }, 429, { 'Retry-After': '600' });
    if (result?.ok !== true) throw new Error('Invalid backend response');
    return json({ ok: true }, 201);
  } catch { return json({ ok: false, error: 'Contact service is temporarily unavailable. Please try again.' }, 502); }
}
