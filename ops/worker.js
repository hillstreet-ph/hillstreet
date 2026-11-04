import { createHash } from 'node:crypto';
const TABLE = 'hillstreet_website_inquiries';
const MONITOR = 'hillstreet-daily-backup';
const response = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(x => x.toString(16).padStart(2,'0')).join('');
const SOURCE_REPOSITORY = 'https://github.com/hillstreet-ph/hillstreet';
const SOURCE_TAG_PREFIX = 'source-recovery-';
const SOURCE_PART_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024;
const KEEP_SOURCE_BUNDLES = 3;
const SUBPAGES = ['/agency','/influencers','/cooperation'];
async function readCapped(response, limit) {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error(`Download exceeds ${Math.floor(limit/1048576)} MiB`); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
// The published bundle is larger than a Worker isolate can hold in memory, so the mirror
// streams it straight into an R2 multipart upload while hashing each chunk as it passes.
async function mirrorBundle(env, url, key, expected, tag) {
  const source = await fetch(url, { headers: { 'User-Agent': 'hillstreet-ops-source-sync' }, signal: AbortSignal.timeout(600000) });
  if (!source.ok || !source.body) throw new Error(`Source download failed: HTTP ${source.status}`);
  const upload = await env.BACKUPS.createMultipartUpload(key, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { sha256: expected, origin: `github-release:${tag}` },
  });
  const hash = createHash('sha256');
  const reader = source.body.getReader();
  const parts = [];
  let part = new Uint8Array(SOURCE_PART_BYTES);
  let filled = 0;
  let total = 0;
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SOURCE_BYTES) throw new Error(`Source bundle exceeds ${Math.floor(MAX_SOURCE_BYTES / 1073741824)} GiB`);
      hash.update(value);
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(SOURCE_PART_BYTES - filled, value.length - offset);
        part.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === SOURCE_PART_BYTES) {
          parts.push(await upload.uploadPart(parts.length + 1, part));
          part = new Uint8Array(SOURCE_PART_BYTES);
          filled = 0;
        }
      }
    }
    if (!total) throw new Error('Source bundle is empty');
    if (filled) parts.push(await upload.uploadPart(parts.length + 1, part.subarray(0, filled)));
    const sha256 = hash.digest('hex');
    if (sha256 !== expected) throw new Error('Source bundle checksum mismatch');
    const stored = await upload.complete(parts);
    completed = true;
    if (!stored || stored.size !== total) { await env.BACKUPS.delete(key); throw new Error('Source bundle read-back verification failed'); }
    return total;
  } catch (error) {
    if (!completed) await upload.abort();
    throw error;
  }
}

async function pruneSourceBundles(env, keepKey) {
  const bundles = [];
  let cursor;
  do {
    const page = await env.BACKUPS.list({ prefix: 'source/', limit: 1000, cursor });
    bundles.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const newest = bundles.sort((a, b) => b.uploaded - a.uploaded).slice(KEEP_SOURCE_BUNDLES);
  const removed = newest.filter(object => object.key !== keepKey).map(object => object.key);
  if (removed.length) await env.BACKUPS.delete(removed);
  return removed;
}

async function sentry(env, type, payload) {
  const dsn = new URL(env.SENTRY_DSN);
  const project = dsn.pathname.slice(1);
  const envelope = [JSON.stringify({ dsn: env.SENTRY_DSN }), JSON.stringify({ type }), JSON.stringify(payload)].join('\n');
  const r = await fetch(`https://${dsn.hostname}/api/${project}/envelope/?sentry_key=${dsn.username}&sentry_version=7`, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Monitoring check-in failed');
}

// GitHub marks every release in this organisation immutable when it is created, which freezes its
// assets, and a deleted release burns its tag name forever. The archive workflow therefore publishes
// a fresh dated release each week instead of editing one, so this feed read is the only discovery
// step. Atom entries arrive newest first; sorting the tags keeps the mirror correct if that changes.
async function newestSourceRelease() {
  const feed = await fetch(`${SOURCE_REPOSITORY}/releases.atom`, { headers: { 'User-Agent': 'hillstreet-ops-source-sync' }, signal: AbortSignal.timeout(60000) });
  if (feed.status === 404) return null;
  if (!feed.ok) throw new Error(`Source release feed download failed: HTTP ${feed.status}`);
  const body = new TextDecoder().decode(await readCapped(feed, 262144));
  const tags = [];
  for (const match of body.matchAll(/\/releases\/tag\/([A-Za-z0-9._-]+)/g)) {
    if (match[1].startsWith(SOURCE_TAG_PREFIX)) tags.push(match[1]);
  }
  return tags.sort()[tags.length - 1] || null;
}

export async function sourceSync(env) {
  const tag = await newestSourceRelease();
  if (!tag) return { ok:true, deferred:true, reason:'No published recovery release yet' };
  const download = `${SOURCE_REPOSITORY}/releases/download/${tag}`;
  // The archive workflow creates a release and uploads its assets together, but a release with no
  // assets is reachable. A missing checksum is a deferral, not a failure, so the publish window
  // never raises a monitoring alert for a job that simply has nothing new to mirror.
  const probe = await fetch(`${download}/hillstreet-source.sha256`, { headers: { 'User-Agent': 'hillstreet-ops-source-sync' }, signal: AbortSignal.timeout(60000) });
  if (probe.status === 404) return { ok:true, deferred:true, reason:`Recovery release ${tag} carries no checksum asset yet` };
  if (!probe.ok) throw new Error(`Source checksum download failed: HTTP ${probe.status}`);
  const published = await readCapped(probe, 1024);
  const expected = new TextDecoder().decode(published).trim().split(/\s+/)[0] || '';
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error('Published source checksum is not a SHA-256 digest');
  const state = await env.BACKUPS.get('operations/latest-source.json');
  if (state && JSON.parse(await state.text()).sha256 === expected) return { ok:true, unchanged:true, sha256:expected, tag };
  const key = `source/${expected.slice(0,16)}.bundle`;
  const mirrored = await mirrorBundle(env, `${download}/hillstreet-source.bundle`, key, expected, tag);
  const pruned = await pruneSourceBundles(env, key);
  const result = { ok:true, tag, key, sha256:expected, bytes:mirrored, synced_at:new Date().toISOString(), pruned };
  await env.BACKUPS.put('operations/latest-source.json', JSON.stringify(result), { httpMetadata:{contentType:'application/json'} });
  return result;
}

export async function health(env) {
  const root = await fetch('https://hillstreet.space/', { signal: AbortSignal.timeout(15000), redirect: 'manual' });
  if (root.status !== 200 || !(await root.text()).includes('HillStreet Agency') || !root.headers.has('Content-Security-Policy')) throw new Error('Website health check failed: HTTP '+root.status);
  for (const path of SUBPAGES) {
    // redirect: 'manual' makes the check answer for the exact route the site links and each
    // page declares as canonical; following a 308 to a trailing-slash copy would hide the drift.
    const page = await fetch('https://hillstreet.space'+path, { signal:AbortSignal.timeout(15000), redirect:'manual' });
    const body = await page.text();
    const failure = page.status !== 200 ? 'HTTP '+page.status : !page.headers.has('Content-Security-Policy') ? 'missing Content-Security-Policy' : body.includes('canva.site') ? 'retired Canva host still referenced' : null;
    if (failure) throw new Error('Sub-page health check failed for '+path+': '+failure);
  }
  const invalid = await fetch('https://hillstreet.space/api/contact', { method:'POST', headers:{Origin:'https://hillstreet.space','Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(15000) });
  if (invalid.status !== 400) throw new Error('Contact endpoint health check failed: HTTP '+invalid.status);
  const result = { ok:true, checked_at:new Date().toISOString(), site:200, subpages:SUBPAGES, contact_validation:400 };
  await env.BACKUPS.put('operations/health.json', JSON.stringify(result), { httpMetadata:{contentType:'application/json'} });
  return result;
}

export async function backupFiles(env,stamp) {
  if (!env.FILES) return {file_count:0,configured:false};
  const files=[]; let cursor;
  do {
    const page=await env.FILES.list({limit:100,cursor});
    for (const item of page.objects) {
      const original=await env.FILES.get(item.key);
      if (!original) throw new Error('File changed during backup');
      const key=`business-files/${stamp}/objects/${item.key}`;
      const saved=await env.BACKUPS.put(key,original.body,{httpMetadata:original.httpMetadata,customMetadata:{source_etag:item.etag}});
      if (!saved || saved.size !== item.size) throw new Error('File backup size verification failed');
      files.push({source_key:item.key,backup_key:key,size:item.size,source_etag:item.etag});
    }
    cursor=page.truncated?page.cursor:undefined;
  } while(cursor);
  const manifest=`business-files/${stamp}/_manifest.json`;
  await env.BACKUPS.put(manifest,JSON.stringify({created_at:new Date().toISOString(),files}),{httpMetadata:{contentType:'application/json'}});
  return {file_count:files.length,configured:true,manifest};
}

export async function backup(env) {
  const id = crypto.randomUUID().replaceAll('-','');
  await sentry(env, 'check_in', { check_in_id:id, monitor_slug:MONITOR, status:'in_progress', environment:'production' });
  try {
    const cutoff = new Date().toISOString();
    const rows = []; let cursor = null;
    for (let page=0; page<1000; page++) {
      const url = new URL(`${env.SUPABASE_URL}/rest/v1/${TABLE}`);
      url.searchParams.set('select','*'); url.searchParams.set('order','id.asc'); url.searchParams.set('limit','1000'); url.searchParams.set('created_at','lte.'+cutoff);
      if (cursor) url.searchParams.set('id','gt.'+cursor);
      const r = await fetch(url, {headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(20000)});
      if (!r.ok) throw new Error('Database export failed');
      const batch = await r.json(); if (!Array.isArray(batch)) throw new Error('Invalid database response');
      rows.push(...batch);
      if (batch.length < 1000) break;
      cursor = batch.at(-1).id;
      if (page === 999) throw new Error('Backup row limit reached; export not complete');
    }
    const data = JSON.stringify({format_version:1,table:TABLE,created_at:cutoff,rows});
    const sha256 = await digest(data);
    const key = `inquiries/${cutoff.replaceAll(':','-')}-${id}.json`;
    await env.BACKUPS.put(key,data,{httpMetadata:{contentType:'application/json'},customMetadata:{sha256,row_count:String(rows.length)}});
    const stored = await env.BACKUPS.get(key);
    if (!stored || await digest(await stored.text()) !== sha256) throw new Error('Backup read-back checksum failed');
    const fileSnapshot=await backupFiles(env,cutoff.replaceAll(':','-')+'-'+id);
    const result = {ok:true,key,sha256,row_count:rows.length,created_at:cutoff,...fileSnapshot};
    await env.BACKUPS.put('operations/latest-backup.json',JSON.stringify(result),{httpMetadata:{contentType:'application/json'}});
    await sentry(env,'check_in',{check_in_id:id,monitor_slug:MONITOR,status:'ok',environment:'production'});
    return result;
  } catch (error) {
    await sentry(env,'check_in',{check_in_id:id,monitor_slug:MONITOR,status:'error',environment:'production'}).catch(()=>{});
    throw error;
  }
}

export default {
  async fetch(request,env) {
    if (!env.OPS_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.OPS_TOKEN}`) return response({error:'Not found'},404);
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'POST' && path === '/backup') return response(await backup(env));
      if (request.method === 'POST' && path === '/health') return response(await health(env));
      if (request.method === 'POST' && path === '/source-sync') return response(await sourceSync(env));
      if (request.method === 'POST' && path === '/source-backup') {
        const reader=request.body?.getReader(); if (!reader) return response({error:'Archive required'},400);
        const chunks=[]; let size=0;
        while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>50*1024*1024){await reader.cancel();return response({error:'Archive exceeds 50 MiB'},413);}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
        const sha256=await digest(bytes);
        if (!size || sha256 !== request.headers.get('X-Backup-Sha256')) return response({error:'Archive checksum mismatch'},400);
        const key=`source/${new Date().toISOString().replaceAll(':','-')}-${crypto.randomUUID()}.bundle`;
        await env.BACKUPS.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{sha256}});
        return response({ok:true,key,sha256,bytes:size},201);
      }
      if (request.method === 'GET' && path === '/status') {
        const object = await env.BACKUPS.get('operations/latest-backup.json');
        return response({ok:true,backup:object?JSON.parse(await object.text()):null});
      }
      if (request.method === 'GET' && path === '/export') {
        const key = new URL(request.url).searchParams.get('key') || '';
        if (!key.startsWith('inquiries/') || key.includes('..')) return response({error:'Invalid backup key'},400);
        const object = await env.BACKUPS.get(key);
        if (!object) return response({error:'Not found'},404);
        return new Response(object.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Content-Disposition':'attachment; filename="hillstreet-inquiries.json"'}});
      }
      return response({error:'Not found'},404);
    } catch (error) { console.error(error.message); return response({ok:false,error:error.message},500); }
  },
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      const job = event.cron === '25 18 * * *' ? ['backup job',() => backup(env)] : event.cron === '43 * * * *' ? ['source bundle sync',() => sourceSync(env)] : ['hourly health check',() => health(env)];
      try { return await job[1](); }
      catch (error) { await sentry(env,'event',{event_id:crypto.randomUUID().replaceAll('-',''),timestamp:Date.now()/1000,platform:'javascript',level:'error',message:`HillStreet ${job[0]} failed`,environment:'production'}).catch(()=>{}); throw error; }
    })());
  }
};
