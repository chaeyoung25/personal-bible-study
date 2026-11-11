const path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const initializeSQL=require('../docs/vendor/sql-wasm.js');
(async()=>{
 const SQL=await initializeSQL({locateFile:f=>path.resolve(__dirname,'../docs/vendor',f)});
 const db=new SQL.Database();db.run('CREATE TABLE Bible(book INTEGER,chapter INTEGER,verse INTEGER,btext TEXT)');
 for(const [verse,text] of [[1,'침례를 설명하는 기록.'],[2,'세례에 관한 기록.'],[3,'An English example.']])db.run('INSERT INTO Bible VALUES(43,3,?,?)',[verse,text]);
 const bible=Buffer.from(db.export());db.close();
 const research=new SQL.Database();research.run('CREATE TABLE Bible(book INTEGER,chapter INTEGER,verse INTEGER,btext TEXT)');
 research.run('INSERT INTO Bible VALUES(43,3,1,?)',['[예시] (기본 <WG907> [예시] 발음)@동사# 침례*']);
 const commentary=Buffer.from(research.export());research.close();
 const hymns=new SQL.Database();hymns.run('CREATE TABLE hymnal(chapter INTEGER,title TEXT,htext TEXT)');
 hymns.run('INSERT INTO hymnal VALUES(50,?,?)',['침례의 의미','침례를 설명합니다.<br>침례의 기록']);
 const hymnFile=Buffer.from(hymns.export());hymns.close();
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8806');
  await page.locator('#localFiles').setInputFiles([{name:'표현검사.bdb',mimeType:'application/octet-stream',buffer:bible},{name:'원전분해.sdb',mimeType:'application/octet-stream',buffer:commentary},{name:'새찬송가.hdb',mimeType:'application/octet-stream',buffer:hymnFile}]);
  await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('3개 파일'));
  await page.locator('#openReader').click();
  try {await page.locator('#cloudDialog').waitFor({state:'hidden',timeout:15000});}
  catch(error){throw Error(await page.locator('#cloudStatus').textContent());}
  const check=await page.evaluate(async()=>{
   const version='표현검사.bdb';
   const passage=await BrowserBible.api('/api/passage?versions='+encodeURIComponent(version)+'&book=43&chapter=3');
   const search=await BrowserBible.api('/api/search?version='+encodeURIComponent(version)+'&q=세례');
   const oldSearch=await BrowserBible.api('/api/search?version='+encodeURIComponent(version)+'&q=침례');
   const songs=await BrowserBible.api('/api/hymns?q=세례');
   const original=await BrowserBible.api('/api/concordance?strong=G907&version='+encodeURIComponent(version));
   return {passage,search,oldSearch,songs,original};
  });
  assert.equal(check.passage.versions['표현검사.bdb'][0].btext,'세례를 설명하는 기록.');
  assert.equal(check.passage.versions['표현검사.bdb'][2].btext,'An English example.');
  assert.deepEqual(check.search.results.map(r=>r.verse),[1,2]);assert.deepEqual(check.search,check.oldSearch);
  assert.equal(check.songs.results[0].title,'세례의 의미');assert(!check.songs.results[0].lyrics.includes('침례'));
  assert(check.original.results[0].analysis.includes('세례'));
  await page.evaluate(()=>{
   state.versions=['표현검사.bdb'];state.book=43;state.chapter=3;
   state.notes.annotations=[{key:'43-3-1',version:'표현검사.bdb',type:'highlight',start:0,end:2,text:'침례'}];
   state.notes.notes['43-3-1']='침례 메모';state.notes.tags['43-3-1']=['침례'];
  });
  await page.evaluate(async()=>{await loadPassage(1);renderNotes();});
  assert.equal(await page.locator('.active-pane .text-highlight').first().textContent(),'세례');
  assert.equal(await page.locator('#noteText').inputValue(),'세례 메모');
  const rendered=await page.evaluate(()=>{
   document.querySelector('#savedFilter').value='all';document.querySelector('#savedQuery').value='세례';renderSaved();
   document.querySelector('#exportScope').value='notes';
   const selection=getSelection(),range=document.createRange();range.selectNodeContents(document.querySelector('.active-pane .verse-text'));selection.removeAllRanges();selection.addRange(range);
   const clipboard=new DataTransfer();document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:clipboard,bubbles:true,cancelable:true}));selection.removeAllRanges();
   return {saved:document.querySelector('#savedList').textContent,exported:researchExportText(),copy:clipboard.getData('text/plain'),raw:state.notes.notes['43-3-1']};
  });
  assert(rendered.saved.includes('세례 메모'));assert(!rendered.exported.includes('침례'));assert(rendered.copy.includes('세례'));assert.equal(rendered.raw,'침례 메모');
  const topics=await page.evaluate(()=>{
   state.topics={topics:[{id:'1',name:'침례 주제',entries:[{number:1,book:43,chapter:3,start:1,title:'침례 설명',reference:'요3:1',verses:[{verse:1,text:'침례 기록'}]}]}]};
   document.querySelector('#topicSelect').value='1';document.querySelector('#topicQuery').value='세례';renderTopics();
   return {text:document.querySelector('#topicResults').textContent,raw:state.topics.topics[0].name};
  });
  assert(topics.text.includes('세례 설명'));assert(!topics.text.includes('침례'));assert.equal(topics.raw,'침례 주제');
  const storedHash=await page.evaluate(async()=>{
   const database=await new Promise(resolve=>{const req=indexedDB.open('personal-bible-private-v1');req.onsuccess=()=>resolve(req.result);});
   const bytes=await new Promise(resolve=>{const req=database.transaction('files').objectStore('files').get('표현검사.bdb');req.onsuccess=()=>resolve(req.result);});database.close();
   return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  });
  assert.equal(storedHash,crypto.createHash('sha256').update(bible).digest('hex'));
  const injection=await page.evaluate(()=>{
   const attack='<img data-audit-probe src="data:,probe">';
   state.library.translations.push({id:'untrusted.bdb',name:'Untrusted '+attack});
   state.versions=['untrusted.bdb'];
   renderPassage({versions:{'untrusted.bdb':[{book:43,chapter:3,verse:attack,btext:'Text '+attack}]}},state.activePane);
   return {nodes:document.querySelectorAll('[data-audit-probe]').length,title:document.querySelector('.active-pane .version-title').textContent,verse:document.querySelector('.active-pane .verse-num').textContent};
  });
  assert.equal(injection.nodes,0);assert(injection.title.includes('<img'));assert(injection.verse.includes('<img'));
  console.log('PASS: preferred terminology in passages, search aliases, original analysis, hymn lyrics/title, notes/tags, selection copy and export; annotation offsets and original DB bytes retained.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
