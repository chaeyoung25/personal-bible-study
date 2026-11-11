const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require("node:path").join(require("node:os").homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),zip=require("../docs/vendor/fflate.min.js");
const docs=path.resolve(__dirname,"../docs"),original=path.resolve(__dirname,"../../data");
const bible=path.join(original,"bethlehem",fs.readdirSync(path.join(original,"bethlehem")).find(name=>name.normalize("NFC")==="개역개정.bdb"));
const bundle=zip.zipSync({"__MACOSX/._phone-folder":zip.strToU8("AppleDouble metadata"),"__MACOSX/phone-folder/._국한문병기.bdb":zip.strToU8("not SQLite"),"phone-folder/.DS_Store":zip.strToU8("Finder metadata"),"phone-folder/._개역개정.bdb":zip.strToU8("not SQLite"),"phone-folder/":new Uint8Array(0),"phone-folder/개역개정.bdb":new Uint8Array(fs.readFileSync(bible)),"phone-folder/new_50.jpg":new Uint8Array(fs.readFileSync(path.join(original,"hymn_scores/new_50.jpg")))});
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  page.setDefaultTimeout(60000);page.on("dialog",d=>d.accept());const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://chaeyoung25.github.io/personal-bible-study/**",route=>{
    let relative=decodeURIComponent(new URL(route.request().url()).pathname).replace("/personal-bible-study/","")||"index.html";
    const target=path.resolve(docs,relative);
    if(!target.startsWith(docs+path.sep)||!fs.existsSync(target))return route.fulfill({status:404,body:"not found"});
    const type={".js":"application/javascript",".css":"text/css",".html":"text/html",".json":"application/json",".wasm":"application/wasm"}[path.extname(target)]||"application/octet-stream";
    return route.fulfill({path:target,contentType:type});
  });
  await page.goto("https://chaeyoung25.github.io/personal-bible-study/");
  await page.locator("#cloudDialog").waitFor({state:"visible"});
  assert.equal(await page.locator("#openPublished").textContent(),"성경 본문 보기");
  assert(await page.locator("#openBulkReader").isDisabled());
  await page.locator("#migrationFile").setInputFiles([{name:"bundle.report.json",mimeType:"application/json",buffer:Buffer.from("{}")},{name:"phone-data.zip",mimeType:"application/zip",buffer:Buffer.from(bundle)}]);
  await page.waitForFunction(()=>document.querySelector("#migrationStatus").textContent.includes("자료 가져오기 완료"));
  assert.equal((await page.evaluate(()=>BrowserBible.api("/api/library"))).translations.length,1);
  assert(await page.evaluate(()=>BrowserBible.image("new_50.jpg").then(Boolean)));
  await page.evaluate(()=>{window.phoneTestMarker="preserve";});
  await page.locator("#openPublished").click();
  assert.equal(await page.locator("#cloudDialog").isVisible(),false);
  assert.equal(await page.evaluate(()=>window.phoneTestMarker),"preserve");
  assert.equal(await page.evaluate(()=>location.hash),"");
  await page.locator("#compactCloud").click();
  await page.locator("#openBulkReader").click();
  assert.equal(await page.locator("#cloudDialog").isVisible(),false);
  await page.locator("#compactCloud").click();
  const outer=zip.zipSync({"inner.zip":bundle,"report.json":zip.strToU8("{}")});
  await page.locator("#migrationFile").setInputFiles({name:"outer.zip",mimeType:"application/zip",buffer:Buffer.from(outer)});
  await page.waitForFunction(()=>document.querySelector("#migrationStatus").textContent.includes("ZIP 안에 또 ZIP"));
  assert.equal((await page.evaluate(()=>BrowserBible.api("/api/library"))).translations.length,1);
  await page.locator("#migrationFile").setInputFiles({name:"report.json",mimeType:"application/json",buffer:Buffer.from("{}")});
  await page.waitForFunction(()=>document.querySelector("#migrationStatus").textContent.includes("ZIP 파일이 선택되지"));
  await page.screenshot({path:"/private/tmp/bible-phone-import-fixed.png"});
  assert.deepEqual(errors,[]);
  console.log("PASS: mobile ZIP+JSON multiple selection, plain folder ZIP import, one Bible+score, same-site reader opens without navigation/relogin, clear nested ZIP/non-ZIP errors, existing data retained.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
