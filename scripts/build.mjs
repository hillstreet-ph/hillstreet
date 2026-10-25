import { build } from 'esbuild';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await build({ entryPoints: ['src/website.js'], bundle: true, minify: true, format: 'iife', target: ['es2022'], outfile: 'site/assets/website.js', sourcemap: false });
for (const path of ['site/index.html','site/assets/index-D4yBHoPu.js','site/assets/index-DwciAvas.css','site/images/business-meeting-proof.mp4']) await access(path);
const html = await readFile('site/index.html', 'utf8');
if (!html.includes('/assets/website.js')) throw new Error('Website integration entry is missing');
const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
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
