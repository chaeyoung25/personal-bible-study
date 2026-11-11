const {chromium}=require(process.env.PLAYWRIGHT_MODULE || require("node:path").join(require("node:os").homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const source=path.resolve(__dirname,"../..");
const fixtures=path.join(source,"data/bethlehem");
const find=name=>path.join(fixtures,fs.readdirSync(fixtures).find(file=>file.normalize("NFC")===name));
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",d=>d.accept());
  await page.goto("http://127.0.0.1:8806");
  await page.locator("#cloudDialog").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>localStorage.getItem("access_token")),null);
  await page.locator("#localFiles").setInputFiles([
    find("개역개정.bdb"),find("원전분해.sdb"),find("성경관주.cdb"),find("새찬송가.hdb"),
    path.join(source,"data/hymn_scores/new_50.jpg")
  ]);
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("5개 파일"),{timeout:120000});
  await page.locator("#openReader").click();
  await page.waitForSelector(".original-word",{timeout:60000});
  assert((await page.locator(".active-pane .verse-text").first().textContent()).length>10);
  const search=await page.evaluate(()=>BrowserBible.api("/api/search?version="+encodeURIComponent("개역개정.bdb")+"&q="+encodeURIComponent("사랑")));
  assert(search.results.length>0);
  const found=await page.evaluate(()=>BrowserBible.api("/api/concordance?strong=H8085&version="+encodeURIComponent("개역개정.bdb")));
  assert.equal(found.results.length,1070);
  const hymns=await page.evaluate(()=>BrowserBible.api("/api/hymns?q=50"));
  assert(hymns.results.some(h=>h.number===50&&h.images.includes("new_50.jpg")));
  await page.locator("#openHymns").click();
  await page.fill("#hymnSearch","50");
  await page.waitForFunction(()=>[...document.querySelectorAll("#hymnScore img")].some(img=>img.complete&&img.naturalWidth>0));
  await page.locator("#closeHymns").click();
  const changed=await page.evaluate(async()=>{
    const data=await BrowserBible.api("/api/notes");
    data.notes["19-121-3"]="<img src=x onerror=alert(1)> private test";
    data.tags["19-121-3"]=["보호"];data.updated["19-121-3"]=Date.now();
    await BrowserBible.api("/api/notes",{method:"POST",body:JSON.stringify(data)});
    return data;
  });
  assert.equal(await page.evaluate(()=>BrowserBible.validateNotes({notes:[],annotations:[]}).notes).catch(()=>"rejected"),"rejected");
  assert.equal(await page.evaluate(()=>BrowserBible.validateNotes(JSON.parse('{"notes":{},"__proto__":{"polluted":true}}'))).catch(()=>"rejected"),"rejected");
  const bad=await page.evaluate(()=>BrowserBible.api("/api/concordance?strong="+encodeURIComponent("H8085' OR 1=1--")+"&version="+encodeURIComponent("개역개정.bdb")).then(()=>"bad",()=>"rejected"));
  assert.equal(bad,"rejected");
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector(".original-word");
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector(".original-word",{timeout:60000});
  assert.equal((await page.evaluate(()=>BrowserBible.api("/api/notes"))).notes["19-121-3"],changed.notes["19-121-3"]);
  await context.setOffline(false);
  const second=await context.newPage();
  await second.goto("http://127.0.0.1:8806");
  await second.waitForFunction(()=>document.querySelector("#cloudStatus")?.textContent.includes("다른 탭"));
  assert(await second.locator("#openReader").isDisabled());
  await second.close();
  await page.setViewportSize({width:390,height:844});
  await page.locator("#compactCloud").click();
  await page.screenshot({path:"/private/tmp/bible-pages-mobile.png"});
  // Mock Google's browser SDK/API; no production OAuth credentials or live uploads.
  await page.route("https://accounts.google.com/gsi/client",route=>route.fulfill({contentType:"application/javascript",body:
    'window.google={accounts:{oauth2:{initTokenClient: options=>({requestAccessToken:()=>options.callback({access_token:"test-access-memory-only",expires_in:3600,scope:"openid email https://www.googleapis.com/auth/drive.file"})}),revoke:()=>{}}}};'
  }));
  await page.route("https://apis.google.com/js/api.js",route=>route.fulfill({contentType:"application/javascript",body:'window.gapi={load:(_,o)=>o.callback()};'}));
  let uploads=0,account="account-one";
  await page.route("https://www.googleapis.com/**",async route=>{
    assert.equal(route.request().headers().authorization,"Bearer test-access-memory-only");
    assert(!route.request().url().includes("test-access-memory-only"));
    if(route.request().url().includes("userinfo"))return route.fulfill({json:{sub:account,email:"tester@example.com",email_verified:true}});
    if(route.request().url().includes("upload/")){
      const body=route.request().postData();
      assert(!body.includes('"permissions"'));
      assert(!body.includes('"parents"'));
      assert(body.includes("personal-bible-study"));
      uploads++;return route.fulfill({json:{id:"mock-backup",name:"mock.json"}});
    }
    return route.fulfill({status:400,json:{}});
  });
  await page.fill("#oauthClientId","12345-unit.apps.googleusercontent.com");
  await page.fill("#pickerKey","AIza-test-picker-key");
  await page.fill("#projectNumber","12345");
  await page.locator("#connectDrive").click();
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("tester@example.com"));
  await page.locator("#cloudBackup").click();
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("새 백업"));
  assert.equal(uploads,1);
  assert(!JSON.stringify(await page.evaluate(()=>({...localStorage}))).includes("test-access-memory-only"));
  account="account-two";
  await page.locator("#disconnectDrive").click();await page.locator("#connectDrive").click();
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("다른 Google 계정"));
  await page.locator("#cloudBackup").click();
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("Google 연결이 필요"));
  assert.equal(uploads,1);
  const urls=await page.evaluate(async()=>{const output=[];for(const key of await caches.keys())for(const r of await (await caches.open(key)).keys())output.push(r.url);return output;});
  assert(urls.every(url=>url.startsWith("http://127.0.0.1:8806/")));
  assert(urls.every(url=>!url.includes("notes.json")&&!url.includes("hymn-score")&&!url.includes("googleapis")));
  await page.evaluate(()=>localStorage.setItem("unrelated-app-setting","keep"));
  await page.locator("#forgetDevice").click();
  await page.waitForFunction(()=>document.querySelector("#localInventory")?.textContent.includes("저장된 자료가 없습니다"));
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith("pbs-pages-v1:")).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem("unrelated-app-setting")),"keep");
  assert.deepEqual(errors,[]);
  console.log("PASS: real SQLite passage/search, H8085=1070, lyrics/images, persistent notes, offline reload, malicious input rejection, mocked OAuth/backup/account isolation, no tokens/private data in cache, wipe, mobile; LIVE Google authorization remains unverified");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
