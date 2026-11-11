const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
global.fflate=require('../docs/vendor/fflate.min.js');
const migration=require('../source/migration.js');
(async()=>{
 for(const filename of ['../bad.bdb','/bad.bdb','folder\\bad.bdb','folder/../bad.bdb']){
  const bytes=fflate.zipSync({[filename]:new Uint8Array([1,2,3])});
  let writes=0;
  const io={safe:()=>{},prepare:async()=>{},importFile:async()=>{writes++;},archiveFile:async()=>{writes++;},commitGeneric:async()=>{writes++;},status:()=>{}};
  await assert.rejects(migration.importArchive(new Response(bytes).body,io));
  assert.equal(writes,0,'unsafe archive wrote data');
 }
 const root=path.resolve(__dirname,'../docs'),manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor-integrity.json')));
 for(const [name,value] of Object.entries(manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'vendor',name))).digest('hex'),value.sha256);
 console.log('PASS: ZIP traversal paths rejected before data writes; vendored dependency bytes match locked hashes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
