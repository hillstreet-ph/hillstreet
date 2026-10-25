import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/contact.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret' };
const valid = { request_id: '52d7d490-b548-4fe1-8f62-7b954cecb6e2', name: 'Test User', email: 'test@example.invalid', company: '', message: 'Deployment verification' };
const request = (body = valid, headers = {}, method = 'POST') => new Request('https://hillstreet.pages.dev/api/contact', { method, headers: { Origin: 'https://hillstreet.pages.dev', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });

test('rejects cross-origin requests before backend access', async () => {
  assert.equal((await onRequest({ request: request(valid, { Origin: 'https://evil.invalid' }), env })).status, 403);
});
test('rejects invalid inputs and oversized bodies', async () => {
  assert.equal((await onRequest({ request: request({ ...valid, email: 'invalid' }), env })).status, 400);
  assert.equal((await onRequest({ request: request({ ...valid, message: 'x'.repeat(17000) }), env })).status, 413);
  assert.equal((await onRequest({ request: request(null), env })).status, 400);
});
test('fails honestly when unconfigured and rejects other methods', async () => {
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
  assert.equal((await onRequest({ request: request(undefined, {}, 'GET'), env })).status, 405);
});
test('saves through server-only RPC without forwarding raw IP', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/submit_hillstreet_website_inquiry');
    const payload = JSON.parse(options.body);
    assert.match(payload.p_ip_hash, /^[a-f0-9]{64}$/);
    assert.ok(!options.body.includes('192.0.2.1'));
    assert.equal(payload.p_message, valid.message);
    return Response.json({ ok: true });
  };
  try { const result = await onRequest({ request: request(), env }); assert.equal(result.status, 201); assert.deepEqual(await result.json(), { ok: true }); }
  finally { globalThis.fetch = original; }
});
test('returns rate limit and backend errors without false success', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ rate_limited: true });
    const limited = await onRequest({ request: request(), env }); assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '600');
    globalThis.fetch = async () => new Response('private backend error', { status: 500 });
    const failed = await onRequest({ request: request(), env }); assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('private backend error'));
  } finally { globalThis.fetch = original; }
});
