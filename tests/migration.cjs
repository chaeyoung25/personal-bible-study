const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require("node:path").join(require("node:os").homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../.."),exportsDir=path.join(root,"migration_exports");
const archive=fs.readdirSync(exportsDir).filter(name=>name.endsWith(".zip")).sort().at(-1);
const report=JSON.parse(fs.readFileSync(path.join(exportsDir,archive.replace(/\.zip$/,".report.json"))));
const original=JSON.parse(fs.readFileSync(path.join(root,"user_data/notes.json")));
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(120000);const errors=[];
  page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
  await page.goto("http://127.0.0.1:8806");
  await page.locator("#cloudDialog").waitFor({state:"visible"});
  await page.evaluate(async()=>{
    const notes=await BrowserBible.api("/api/notes");
    notes.notes["43-3-16"]="Existing web note: preserve";notes.tags["43-3-16"]=["web"];
    await BrowserBible.api("/api/notes",{method:"POST",body:JSON.stringify(notes)});
  });
  await page.locator("#"+(process.env.BIBLE_BULK_INPUT||"migrationFile")).setInputFiles(path.join(exportsDir,archive));
  await page.waitForFunction(()=>/전체 이전 완료|이전 미완료/.test(document.querySelector("#migrationStatus").textContent),{timeout:600000});
  const message=await page.locator("#migrationStatus").textContent();
  assert(message.includes("전체 이전 완료"),message);
  const notes=await page.evaluate(()=>BrowserBible.api("/api/notes"));
  for(const [key,value] of Object.entries(original.notes))assert(notes.notes[key].includes(value),"missing original memo "+key);
  assert(notes.notes["43-3-16"].includes("Existing web note"));
  for(const key of Object.keys(original.highlights))assert(notes.highlights[key],"missing highlight "+key);
  for(const [key,tags] of Object.entries(original.tags))for(const tag of tags)assert(notes.tags[key].includes(tag));
  assert.equal(notes.topics.topics.length,20);assert.equal(notes.topics.topics.reduce((sum,t)=>sum+t.entries.length,0),1000);
  const library=await page.evaluate(()=>BrowserBible.api("/api/library"));
  assert.equal(library.translations.length,90);
  assert.equal(library.commentaries.length,5);
  const count=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open("personal-bible-private-v1");r.onsuccess=()=>{const db=r.result,q=db.transaction("meta").objectStore("meta").count();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=reject;};}));
  assert.equal(count,report.counts.files-2);
  const concordance=await page.evaluate(()=>BrowserBible.api("/api/concordance?strong=H8085&version="+encodeURIComponent("개역개정.bdb")));
  assert.equal(concordance.results.length,1070);
  const hymns=await page.evaluate(()=>BrowserBible.api("/api/hymns?q=50"));
  assert(hymns.results.some(h=>h.number===50&&h.images.includes("new_50.jpg")));
  assert.equal(await page.evaluate(()=>document.querySelector("#topicSelect").options.length),21);
  await page.screenshot({path:"/private/tmp/bible-full-migration.png"});
  await page.reload();await page.waitForSelector(".original-word",{state:"attached"});
  assert((await page.evaluate(()=>BrowserBible.api("/api/notes"))).notes["43-3-16"].includes("Existing web note"));
  assert.deepEqual(errors,[]);
  console.log("PASS: full private archive imported and verified; original notes/marks/tags/topics retained; existing web memo retained; 90 versions, 5 research DBs, hymn scores, historical/other data, reload persistence; original source untouched.");
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
