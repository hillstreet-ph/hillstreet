const TABLE = 'hillstreet_website_inquiries';
const MONITOR = 'hillstreet-daily-backup';
const response = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2,'0')).join('');

async function sentry(env, type, payload) {
  const dsn = new URL(env.SENTRY_DSN);
  const project = dsn.pathname.slice(1);
  const envelope = [JSON.stringify({ dsn: env.SENTRY_DSN }), JSON.stringify({ type }), JSON.stringify(payload)].join('\n');
  const r = await fetch(`https://${dsn.hostname}/api/${project}/envelope/?sentry_key=${dsn.username}&sentry_version=7`, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Monitoring check-in failed');
}

export async function health(env) {
  const root = await fetch('https://hillstreet.space/', { signal: AbortSignal.timeout(15000), redirect: 'manual' });
  if (root.status !== 200 || !(await root.text()).includes('HillStreet Agency') || !root.headers.has('Content-Security-Policy')) throw new Error('Website health check failed: HTTP '+root.status);
  const invalid = await fetch('https://hillstreet.space/api/contact', { method:'POST', headers:{Origin:'https://hillstreet.space','Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(15000) });
  if (invalid.status !== 400) throw new Error('Contact endpoint health check failed: HTTP '+invalid.status);
  const result = { ok:true, checked_at:new Date().toISOString(), site:200, contact_validation:400 };
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
      if (request.method === 'POST' && path === '/source-backup') {
        const reader=request.body?.getReader(); if (!reader) return response({error:'Archive required'},400);
        const chunks=[]; let size=0;
        while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>50*1024*1024){await reader.cancel();return response({error:'Archive exceeds 50 MiB'},413);}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
        const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
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
      try { return event.cron === '25 18 * * *' ? await backup(env) : await health(env); }
      catch (error) { await sentry(env,'event',{event_id:crypto.randomUUID().replaceAll('-',''),timestamp:Date.now()/1000,platform:'javascript',level:'error',message:event.cron === '25 18 * * *'?'HillStreet backup job failed':'HillStreet hourly health check failed',environment:'production'}).catch(()=>{}); throw error; }
    })());
  }
};
