const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require("node:path").join(require("node:os").homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  page.on("dialog",d=>d.accept());const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://accounts.google.com/gsi/client",r=>r.fulfill({contentType:"application/javascript",body:'window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:"test",expires_in:3600,scope:"openid email https://www.googleapis.com/auth/drive.file"})}),revoke:()=>{}}}};'}));
  await page.route("https://apis.google.com/js/api.js",r=>r.fulfill({contentType:"application/javascript",body:
   'window.gapi={load:(_,o)=>o.callback()}; window.pickerOptions={};'+
   'google.picker={ViewId:{DOCS:"docs"},Feature:{MULTISELECT_ENABLED:"multi"},Action:{CANCEL:"cancel",PICKED:"picked"},DocsView:class{setIncludeFolders(v){pickerOptions.folders=v;return this}setMimeTypes(v){pickerOptions.mime=v;return this}setQuery(v){pickerOptions.query=v;return this}},PickerBuilder:class{addView(){return this}setOAuthToken(){return this}setDeveloperKey(){return this}setAppId(){return this}setOrigin(){return this}enableFeature(v){pickerOptions.feature=v;return this}setCallback(cb){window.pickerCallback=cb;return this}build(){return{setVisible:v=>pickerOptions.visible=v}}}};'
  }));
  await page.route("https://www.googleapis.com/**",r=>r.fulfill({json:r.request().url().includes("userinfo")?{sub:"owner",email:"owner@example.com",email_verified:true}:{files:[]}}));
  await page.goto("http://127.0.0.1:8806");
  await page.locator("#cloudDialog").waitFor({state:"visible"});
  assert.equal(await page.locator(".cloud-folder").isVisible(),false);
  assert((await page.locator("#localFiles").getAttribute("accept")).includes(".zip"));
  await page.fill("#oauthClientId","12345-unit.apps.googleusercontent.com");await page.fill("#pickerKey","AIza-test");await page.fill("#projectNumber","12345");
  await page.locator("#connectDrive").click();
  await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("owner@example.com"));
  await page.locator("#pickDriveBundle").click();
  const options=await page.evaluate(()=>window.pickerOptions);
  assert(options.mime.includes("application/zip"));assert.equal(options.query,"성경앱-전체이전");
  assert.equal(options.feature,undefined);assert.equal(options.folders,false);assert.equal(options.visible,true);
  await page.evaluate(()=>pickerCallback({action:"cancel"}));
  await page.locator("#cloudDialog").waitFor({state:"visible"});
  await page.locator(".bulk-import").scrollIntoViewIfNeeded();
  await page.screenshot({path:"/private/tmp/bible-mobile-bulk.png"});
  assert.deepEqual(errors,[]);
  console.log("PASS: mobile ZIP entry, coarse-pointer folder hidden, regular file accepts ZIP, Drive ZIP-only single-select/search, cancel recovery; Google SDK mocked.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
