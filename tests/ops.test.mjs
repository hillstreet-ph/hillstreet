import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {backup,health,backupFiles} from '../ops/worker.js';
const env={OPS_TOKEN:'test-token',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SENTRY_DSN:'https://public@example.invalid/1'};
test('file backups copy private files and verify stored sizes',async()=>{
  const saved=new Map();
  const FILES={list:async()=>({objects:[{key:'brief.pdf',size:4,etag:'source-etag'}],truncated:false}),get:async()=>({body:'test',httpMetadata:{contentType:'application/pdf'}})};
  const BACKUPS={put:async(k,v)=>{saved.set(k,v);return {size:typeof v==='string'?v.length:4};}};
  const result=await backupFiles({FILES,BACKUPS},'test-snapshot');
  assert.equal(result.file_count,1);assert.equal(saved.get('business-files/test-snapshot/objects/brief.pdf'),'test');assert.ok(saved.has(result.manifest));
});
test('health check accepts a valid site and contact validation response',async()=>{
  const original=globalThis.fetch;let stored=false;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/api/contact'))return new Response('{}',{status:400});
    assert.equal(options.redirect,'manual');
    return new Response('HillStreet Agency',{headers:{'Content-Security-Policy':"default-src 'self'"}});
  };
  try{const result=await health({BACKUPS:{put:async()=>{stored=true;}}});assert.equal(result.ok,true);assert.equal(stored,true);}
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
