const path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const initializeSQL=require('../docs/vendor/sql-wasm.js'),zip=require('../docs/vendor/fflate.min.js');
const broken=name=>Buffer.from(name.normalize('NFD'),'utf8').toString('latin1');
(async()=>{
 const SQL=await initializeSQL({locateFile:f=>path.resolve(__dirname,'../docs/vendor',f)});
 const db=new SQL.Database();db.run('CREATE TABLE Bible(book INTEGER,chapter INTEGER,verse INTEGER,btext TEXT)');
 db.run('INSERT INTO Bible VALUES(43,3,1,?)',['정상적인 한글 본문입니다.']);
 const bible=Buffer.from(db.export());db.close();
 const hymns=new SQL.Database();hymns.run('CREATE TABLE hymnal(chapter INTEGER,title TEXT,htext TEXT)');
 hymns.run('INSERT INTO hymnal VALUES(50,?,?)',['예시 찬송가','예시 가사']);const hymn=Buffer.from(hymns.export());hymns.close();
 const files=[['개역개정.bdb','translation',bible],['원전분해.sdb','commentary',bible],['새찬송가.hdb','hymns',hymn]].map(([name,kind,bytes])=>({correct:name,id:broken(name),name:broken(name.slice(0,-4)),kind,bytes:[...bytes],size:bytes.length}));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:1366},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/filename-test-seed',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Test seed</title>'}));
  await page.goto('http://127.0.0.1:8806/filename-test-seed');
  await page.evaluate(async files=>{
   const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('personal-bible-private-v1',1);r.onupgradeneeded=()=>{for(const name of ['files','meta','kv'])r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const tx=database.transaction(['files','meta','kv'],'readwrite');
   for(const file of files){tx.objectStore('files').put(Uint8Array.from(file.bytes).buffer,file.id);tx.objectStore('meta').put({id:file.id,name:file.name,kind:file.kind,size:file.size},file.id);}
   tx.objectStore('kv').put({bookmarks:[],notes:{'43-3-1':'이전 메모 보존'},tags:{'43-3-1':['보호']},highlights:{},underlines:{},updated:{},annotations:[{key:'43-3-1',version:files[0].id,type:'highlight',text:'한글',start:5,end:7}]},'notes');
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});database.close();
   localStorage.setItem('pbs-pages-v1:versions',JSON.stringify([files[0].id]));
   localStorage.setItem('pbs-pages-v1:book','43');localStorage.setItem('pbs-pages-v1:chapter','3');
   localStorage.setItem('pbs-pages-v1:passagePanes',JSON.stringify([{book:43,chapter:3,versions:[files[0].id]}]));
  },files);
  await page.goto('http://127.0.0.1:8806/');
  await page.locator('.active-pane .version-title').waitFor({state:'visible'});
  assert.equal(await page.locator('.active-pane .version-title').textContent(),'개역개정');
  assert.equal(await page.locator('.active-pane .text-highlight').textContent(),'한글');
  const result=await page.evaluate(async()=>{
   const library=await BrowserBible.api('/api/library'),notes=await BrowserBible.api('/api/notes'),songs=await BrowserBible.api('/api/hymns?q=50');
   const database=await new Promise(resolve=>{const r=indexedDB.open('personal-bible-private-v1');r.onsuccess=()=>resolve(r.result);});
   const read=(store,method,key)=>new Promise(resolve=>{const r=database.transaction(store).objectStore(store)[method](key);r.onsuccess=()=>resolve(r.result);});
   const meta=await read('meta','getAll'),ids=await read('files','getAllKeys'),hashes={};
   for(const id of ids){const bytes=await read('files','get',id);hashes[id]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
   database.close();return {library,notes,songs,meta,ids,hashes};
  });
  assert.deepEqual(result.library.translations.map(f=>f.name),['개역개정']);
  assert.deepEqual(result.library.commentaries.map(f=>f.name),['원전분해']);
  assert.equal(result.songs.results[0].title,'예시 찬송가');
  assert.equal(result.notes.notes['43-3-1'],'이전 메모 보존');assert.deepEqual(result.notes.tags['43-3-1'],['보호']);
  assert.equal(result.notes.annotations[0].version,files[0].id);
  for(const file of files){assert(result.ids.includes(file.id));assert.equal(result.hashes[file.id],crypto.createHash('sha256').update(Buffer.from(file.bytes)).digest('hex'));assert.equal(result.meta.find(m=>m.id===file.id).name,file.correct.slice(0,-4));}
  assert.equal(result.ids.length,3);
  await page.reload();await page.locator('.active-pane .version-title').waitFor({state:'visible'});
  assert.equal(await page.locator('.active-pane .version-title').textContent(),'개역개정');
  await page.screenshot({path:'/private/tmp/bible-ipad-filename-repaired.png'});
  await context.close();
  // A ZIP with UTF-8/NFD filename bytes but no UTF-8 flag reproduces the iPad report.
  const archive=zip.zipSync({['자료/'+ '새번역.bdb'.normalize('NFD')]:new Uint8Array(bible),['자료/'+'새찬송가.hdb'.normalize('NFD')]:new Uint8Array(hymn)});
  const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength);
  for(let i=0;i<archive.length-10;i++){
   const magic=view.getUint32(i,true);
   if(magic===0x04034b50)view.setUint16(i+6,view.getUint16(i+6,true)&~0x800,true);
   if(magic===0x02014b50)view.setUint16(i+8,view.getUint16(i+8,true)&~0x800,true);
  }
  const fresh=await browser.newPage({viewport:{width:1024,height:1366},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  fresh.setDefaultTimeout(60000);fresh.on('dialog',d=>d.accept());
  await fresh.goto('http://127.0.0.1:8806/');
  await fresh.locator('#migrationFile').setInputFiles({name:'ipad-data.zip',mimeType:'application/zip',buffer:Buffer.from(archive)});
  await fresh.waitForFunction(()=>document.querySelector('#migrationStatus').textContent.includes('자료 가져오기 완료'));
  const imported=await fresh.evaluate(async()=>({library:await BrowserBible.api('/api/library'),songs:await BrowserBible.api('/api/hymns?q=50')}));
  assert.deepEqual(imported.library.translations.map(f=>f.id),['새번역.bdb']);assert.equal(imported.songs.results[0].number,50);
  assert.deepEqual(errors,[]);
  console.log('PASS: existing iPad mojibake labels auto-repaired on startup/reload without changing IDs, DB bytes, notes, tags or annotation links; new UTF-8/NFD ZIP without Unicode flag imports correct Korean names.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
