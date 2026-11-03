import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {backup,health,backupFiles,sourceSync} from '../ops/worker.js';
const env={OPS_TOKEN:'test-token',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SENTRY_DSN:'https://public@example.invalid/1'};
test('file backups copy private files and verify stored sizes',async()=>{
  const saved=new Map();
  const FILES={list:async()=>({objects:[{key:'brief.pdf',size:4,etag:'source-etag'}],truncated:false}),get:async()=>({body:'test',httpMetadata:{contentType:'application/pdf'}})};
  const BACKUPS={put:async(k,v)=>{saved.set(k,v);return {size:typeof v==='string'?v.length:4};}};
  const result=await backupFiles({FILES,BACKUPS},'test-snapshot');
  assert.equal(result.file_count,1);assert.equal(saved.get('business-files/test-snapshot/objects/brief.pdf'),'test');assert.ok(saved.has(result.manifest));
});
test('health check accepts a valid site and contact validation response',async()=>{
  const original=globalThis.fetch;const visited=[];let stored=false;
  globalThis.fetch=async(url,options)=>{
    visited.push(String(url));
    if(String(url).endsWith('/api/contact'))return new Response('{}',{status:400});
    if(String(url)==='https://hillstreet.space/')assert.equal(options.redirect,'manual');
    return new Response('HillStreet Agency',{headers:{'Content-Security-Policy':"default-src 'self'"}});
  };
  try{
    const result=await health({BACKUPS:{put:async()=>{stored=true;}}});
    assert.equal(result.ok,true);assert.equal(stored,true);
    for(const path of ['/agency','/influencers','/cooperation'])assert.ok(visited.includes('https://hillstreet.space'+path),`health check skipped ${path}`);
  }
  finally{globalThis.fetch=original;}
});
test('health check fails when an agency sub-page is missing',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).endsWith('/influencers')
    ?new Response('not found',{status:404})
    :new Response('HillStreet Agency',{headers:{'Content-Security-Policy':"default-src 'self'"}});
  try{await assert.rejects(health({BACKUPS:{put:async()=>{}}}),/\/influencers/);}
  finally{globalThis.fetch=original;}
});
test('operations endpoint denies unauthenticated requests',async()=>{
  const res=await worker.fetch(new Request('https://ops.example.invalid/status'),env);
  assert.equal(res.status,404);
});
test('source recovery upload requires a matching checksum',async()=>{
  const bytes=new TextEncoder().encode('synthetic git recovery bundle');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');let written=false;
  const BACKUPS={put:async()=>{written=true;}};
  const req=value=>new Request('https://ops.example.invalid/source-backup',{method:'POST',headers:{Authorization:'Bearer test-token','X-Backup-Sha256':value},body:bytes});
  assert.equal((await worker.fetch(req('wrong'),{...env,BACKUPS})).status,400);assert.equal(written,false);
  assert.equal((await worker.fetch(req(hash),{...env,BACKUPS})).status,201);assert.equal(written,true);
});
const digestOf=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fakeStore=()=>{const objects=new Map();const size=v=>v instanceof Uint8Array?v.byteLength:String(v).length;
  return {objects,put:async(k,v)=>{objects.set(k,v);return {size:size(v)};},get:async k=>objects.has(k)?{size:size(objects.get(k)),text:async()=>typeof objects.get(k)==='string'?objects.get(k):new TextDecoder().decode(objects.get(k))}:null};};
test('source sync mirrors the published release bundle into R2 and skips unchanged work',async()=>{
  const original=globalThis.fetch;const bundle=new TextEncoder().encode('synthetic git recovery bundle');const sha256=await digestOf(bundle);const downloads=[];
  globalThis.fetch=async url=>{const key=String(url);downloads.push(key);
    if(key.endsWith('.sha256'))return new Response(`${sha256}  hillstreet-source.bundle\n`);
    if(key.endsWith('.bundle'))return new Response(bundle);
    return new Response('missing',{status:404});};
  const store=fakeStore();
  try{
    const result=await sourceSync({BACKUPS:store});
    assert.equal(result.ok,true);assert.equal(result.sha256,sha256);assert.equal(result.bytes,bundle.byteLength);
    assert.ok(store.objects.has(`source/${sha256.slice(0,16)}.bundle`));assert.ok(store.objects.has('operations/latest-source.json'));
    const again=await sourceSync({BACKUPS:store});
    assert.equal(again.unchanged,true);assert.equal(downloads.filter(url=>url.endsWith('.bundle')).length,1);
  }
  finally{globalThis.fetch=original;}
});
test('source sync refuses a bundle that does not match the published checksum',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).endsWith('.sha256')?new Response(`${'0'.repeat(64)}  hillstreet-source.bundle\n`):new Response(new TextEncoder().encode('tampered bundle'));
  const store=fakeStore();
  try{await assert.rejects(sourceSync({BACKUPS:store}),/checksum mismatch/);assert.equal(store.objects.size,0);}
  finally{globalThis.fetch=original;}
});
test('source sync refuses a checksum file that is not a SHA-256 digest',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('<!doctype html><title>Just a moment</title>');
  try{await assert.rejects(sourceSync({BACKUPS:fakeStore()}),/SHA-256 digest/);}
  finally{globalThis.fetch=original;}
});
test('the source cron routes to the release mirror',async()=>{
  const original=globalThis.fetch;const urls=[];
  globalThis.fetch=async url=>{urls.push(String(url));return String(url).includes('/envelope/')?new Response('{}'):new Response('<!doctype html><title>Just a moment</title>');};
  const pending=[];
  try{
    await worker.scheduled({cron:'43 * * * *'},{...env,BACKUPS:fakeStore()},{waitUntil:task=>pending.push(task)});
    await assert.rejects(pending[0],/SHA-256 digest/);
    assert.ok(urls.some(url=>url.endsWith('/releases/download/source-recovery/hillstreet-source.sha256')));
  }
  finally{globalThis.fetch=original;}
});
test('backup paginates and verifies object checksum before declaring success',async()=>{
  const original=globalThis.fetch;const objects=new Map();let databaseReads=0;const checkins=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/envelope/')){checkins.push(JSON.parse(options.body.split('\n')[2]).status);return new Response('{}');}
    databaseReads++;return Response.json(databaseReads===1?Array.from({length:1000},(_,i)=>({id:String(i).padStart(6,'0')})):[{id:'999999'}]);
  };
  const store={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
  try{const result=await backup({...env,BACKUPS:store});assert.equal(result.row_count,1001);assert.equal(databaseReads,2);assert.deepEqual(checkins,['in_progress','ok']);assert.ok(objects.has('operations/latest-backup.json'));}
  finally{globalThis.fetch=original;}
});
test('backup does not report success after database failure',async()=>{
  const original=globalThis.fetch;const checkins=[];
  globalThis.fetch=async(url,options)=>{if(String(url).includes('/envelope/')){checkins.push(JSON.parse(options.body.split('\n')[2]).status);return new Response('{}');}return new Response('error',{status:500});};
  try{await assert.rejects(backup({...env,BACKUPS:{put:async()=>assert.fail('must not write a failed export')}}));assert.deepEqual(checkins,['in_progress','error']);}
  finally{globalThis.fetch=original;}
});
