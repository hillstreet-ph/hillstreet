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
const fakeStore=()=>{const objects=new Map();const uploads=[];const sizeOf=v=>v instanceof Uint8Array?v.byteLength:String(v).length;
  const store={objects,uploads,corruptSize:false,
    seed:(k,v,uploadedAt)=>objects.set(k,{value:v,uploadedAt:uploadedAt||new Date()}),
    put:async(k,v)=>{store.seed(k,v);return {size:sizeOf(v)};},
    get:async k=>objects.has(k)?{size:sizeOf(objects.get(k).value),text:async()=>{const v=objects.get(k).value;return typeof v==='string'?v:new TextDecoder().decode(v);}}:null,
    delete:async k=>{const keys=[].concat(k);if(!keys.length||keys.length>1000)throw new Error('delete: The number of keys in the request must be between 1 and 1000 inclusive. (10027)');for(const key of keys)objects.delete(key);},
    list:async({prefix=''}={})=>({objects:[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,record])=>({key,size:sizeOf(record.value),uploadedAt:record.uploadedAt})),truncated:false}),
    createMultipartUpload:async key=>{const upload={key,parts:new Map(),aborted:false,completed:false};uploads.push(upload);
      return {uploadPart:async(number,value)=>{upload.parts.set(number,value.slice(0));return {partNumber:number,etag:`${number}-etag`};},
        abort:async()=>{upload.aborted=true;},
        complete:async parts=>{upload.completed=true;const chunks=parts.map(part=>upload.parts.get(part.partNumber));
          const total=chunks.reduce((sum,chunk)=>sum+chunk.length,0);const bytes=new Uint8Array(total);let offset=0;
          for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}store.seed(key,bytes);
          return {key,size:store.corruptSize?total-1:total};}};}};
  return store;};
const MiB=1024*1024;
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
test('source sync streams a bundle larger than the isolate can hold in uniform parts',async()=>{
  const original=globalThis.fetch;
  const pattern=new Uint8Array(64*MiB);for(let i=0;i<pattern.length;i++)pattern[i]=i%251;
  const bundle=pattern.subarray(0,17*MiB+300*1024);
  const sha256=await digestOf(bundle);
  globalThis.fetch=async url=>{
    if(String(url).endsWith('.sha256'))return new Response(`${sha256}  hillstreet-source.bundle\n`);
    const stream=new ReadableStream({start(controller){let offset=0;
      while(offset<bundle.length){const take=Math.min(offset===0?9*MiB:1*MiB+4096,bundle.length-offset);
        controller.enqueue(bundle.subarray(offset,offset+take).slice(0));offset+=take;}
      controller.close();}});
    return new Response(stream);};
  const store=fakeStore();
  try{
    const result=await sourceSync({BACKUPS:store});
    assert.equal(result.bytes,bundle.byteLength);assert.equal(result.sha256,sha256);
    const parts=[...store.uploads[0].parts.values()];
    assert.deepEqual(parts.map(part=>part.length),[8*MiB,8*MiB,1*MiB+300*1024]);
    assert.equal(store.objects.get(`source/${sha256.slice(0,16)}.bundle`).value.byteLength,bundle.byteLength);
  }
  finally{globalThis.fetch=original;}
});
test('source sync keeps the newest bundles and prunes the rest',async()=>{
  const original=globalThis.fetch;const bundle=new TextEncoder().encode('fresh git recovery bundle');const sha256=await digestOf(bundle);
  globalThis.fetch=async url=>String(url).endsWith('.sha256')?new Response(`${sha256}  hillstreet-source.bundle\n`):new Response(bundle);
  const store=fakeStore();const old=day=>new Date(Date.UTC(2026,9,day));
  store.seed('source/aaaa111122223333.bundle','old one',old(1));
  store.seed('source/bbbb111122223333.bundle','old two',old(2));
  store.seed('source/cccc111122223333.bundle','old three',old(3));
  store.seed('source/dddd111122223333.bundle','old four',old(4));
  try{
    const result=await sourceSync({BACKUPS:store});
    assert.deepEqual(result.pruned.sort(),['source/aaaa111122223333.bundle','source/bbbb111122223333.bundle']);
    assert.ok(store.objects.has('source/cccc111122223333.bundle'));
    assert.ok(store.objects.has(`source/${sha256.slice(0,16)}.bundle`));
  }
  finally{globalThis.fetch=original;}
});
test('source sync skips pruning when the bundle set is still within retention',async()=>{
  const original=globalThis.fetch;const bundle=new TextEncoder().encode('only bundle in the store');const sha256=await digestOf(bundle);
  globalThis.fetch=async url=>String(url).endsWith('.sha256')?new Response(`${sha256}  hillstreet-source.bundle\n`):new Response(bundle);
  const store=fakeStore();const old=day=>new Date(Date.UTC(2026,9,day));
  store.seed('source/aaaa111122223333.bundle','old one',old(1));
  store.seed('source/bbbb111122223333.bundle','old two',old(2));
  try{
    const result=await sourceSync({BACKUPS:store});
    assert.equal(result.ok,true);assert.deepEqual(result.pruned,[]);
    assert.ok(store.objects.has('operations/latest-source.json'));
    assert.ok(store.objects.has('source/aaaa111122223333.bundle'));
    assert.ok(store.objects.has(`source/${sha256.slice(0,16)}.bundle`));
  }
  finally{globalThis.fetch=original;}
});
test('source sync refuses a bundle that does not match the published checksum',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).endsWith('.sha256')?new Response(`${'0'.repeat(64)}  hillstreet-source.bundle\n`):new Response(new TextEncoder().encode('tampered bundle'));
  const store=fakeStore();
  try{
    await assert.rejects(sourceSync({BACKUPS:store}),/checksum mismatch/);
    assert.equal(store.objects.size,0);assert.equal(store.uploads[0].aborted,true);assert.equal(store.uploads[0].completed,false);
  }
  finally{globalThis.fetch=original;}
});
test('source sync deletes the mirror when the stored size does not match',async()=>{
  const original=globalThis.fetch;const bundle=new TextEncoder().encode('git recovery bundle');const sha256=await digestOf(bundle);
  globalThis.fetch=async url=>String(url).endsWith('.sha256')?new Response(`${sha256}  hillstreet-source.bundle\n`):new Response(bundle);
  const store=fakeStore();store.corruptSize=true;
  try{await assert.rejects(sourceSync({BACKUPS:store}),/read-back verification failed/);assert.equal(store.objects.size,0);}
  finally{globalThis.fetch=original;}
});
test('source sync refuses a checksum file that is not a SHA-256 digest',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('<!doctype html><title>Just a moment</title>');
  try{await assert.rejects(sourceSync({BACKUPS:fakeStore()}),/SHA-256 digest/);}
  finally{globalThis.fetch=original;}
});
test('source sync defers while the archive workflow republishes the release',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('Not Found',{status:404});
  const store=fakeStore();
  try{
    const result=await sourceSync({BACKUPS:store});
    assert.equal(result.ok,true);assert.equal(result.deferred,true);
    assert.equal(store.objects.size,0);assert.equal(store.uploads.length,0);
  }
  finally{globalThis.fetch=original;}
});
test('source sync reports a checksum download that fails for a reason other than a missing bundle',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('rate limited',{status:403});
  try{await assert.rejects(sourceSync({BACKUPS:fakeStore()}),/checksum download failed: HTTP 403/);}
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
