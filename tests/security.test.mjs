import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('CSP permits captured inline scripts only by matching hashes', async () => {
  const html = await readFile('site/index.html','utf8');
  const headers = await readFile('site/_headers','utf8');
  const scriptPolicy = headers.match(/script-src ([^;]+)/)?.[1] || '';
  assert.ok(scriptPolicy.includes("'self'"));
  assert.ok(!scriptPolicy.includes('unsafe-inline') && !scriptPolicy.includes('unsafe-eval'));
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
    assert.ok(scriptPolicy.includes(createHash('sha256').update(match[2]).digest('base64')));
  }
  assert.ok(headers.includes("frame-ancestors 'none'"));
  assert.ok(headers.includes("object-src 'none'"));
});

test('production identity and contact notice use the HillStreet domain', async () => {
  const html = await readFile('site/index.html','utf8');
  assert.ok(html.includes('rel="canonical" href="https://hillstreet.space/"'));
  assert.ok(!html.includes('open-connect.site'));
  assert.ok((await readFile('site/privacy.html','utf8')).includes('contact@hillstreet.space'));
});
