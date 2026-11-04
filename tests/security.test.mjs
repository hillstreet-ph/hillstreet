import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { scriptElements } from '../src/html-scripts.mjs';

test('CSP permits captured inline scripts only by matching hashes', async () => {
  const html = await readFile('site/index.html','utf8');
  const headers = await readFile('site/_headers','utf8');
  const scriptPolicy = headers.match(/script-src ([^;]+)/)?.[1] || '';
  assert.ok(scriptPolicy.includes("'self'"));
  assert.ok(!scriptPolicy.includes('unsafe-inline') && !scriptPolicy.includes('unsafe-eval'));
  for (const match of scriptElements(html)) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
    assert.ok(scriptPolicy.includes(createHash('sha256').update(match[2]).digest('base64')));
  }
  assert.ok(headers.includes("frame-ancestors 'none'"));
  assert.ok(headers.includes("object-src 'none'"));
});

test('the script scanner matches every end-tag form a browser honours', () => {
  // `</script >` and its variants close a script in a real parser. A scanner that demands
  // the exact `</script>` form reports no element for them, so an inline script would
  // escape both the build guard and the CSP hash that whitelists it.
  for (const form of ['</script>', '</script >', '</script\t>', '</script\n>', '</script/>', '</script  />']) {
    const page = `<html><body><script>fetch('/api')${form}</body></html>`;
    const found = scriptElements(page);
    assert.equal(found.length, 1, `a script closed with ${JSON.stringify(form)} hid from the scanner`);
    assert.equal(found[0][2], "fetch('/api')", `${JSON.stringify(form)} did not bound the captured body`);
  }
  // A tag that merely starts with the name is not an end tag and must not cut the body short.
  const decoy = scriptElements('<script>var a = "</scripts>";</script>');
  assert.equal(decoy.length, 1, 'a non-end tag opened a second element');
  assert.equal(decoy[0][2], 'var a = "</scripts>";', 'a non-end tag truncated the body');
});

test('the home page keeps no script the scanner cannot account for', async () => {
  const html = await readFile('site/index.html', 'utf8');
  const opened = (html.match(/<script\b/gi) || []).length;
  assert.equal(scriptElements(html).length, opened,
    'a <script> element on the home page is not closed in a form the scanner recognises, so its hash is unchecked');
});

test('production identity and contact notice use the HillStreet domain', async () => {
  const html = await readFile('site/index.html','utf8');
  assert.ok(html.includes('rel="canonical" href="https://hillstreet.space/"'));
  assert.ok(!html.includes('open-connect.site'));
  assert.ok((await readFile('site/privacy.html','utf8')).includes('contact@hillstreet.space'));
});
