const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require("node:path").join(require("node:os").homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true});
 const files=new Map();let serial=0,failUploads=false;
 try{
  const make=async()=>{
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
   await page.route("https://accounts.google.com/gsi/client",route=>route.fulfill({contentType:"application/javascript",body:'window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:"mock-session-token",expires_in:3600,scope:"openid email https://www.googleapis.com/auth/drive.file"})}),revoke:()=>{}}}};'}));
   await page.route("https://apis.google.com/js/api.js",route=>route.fulfill({contentType:"application/javascript",body:'window.gapi={load:(_,o)=>o.callback()};'}));
   await page.route("https://www.googleapis.com/**",async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(request.headers().authorization,"Bearer mock-session-token");
    if(url.pathname.endsWith("/userinfo"))return route.fulfill({json:{sub:"same-owner",email:"owner@example.com",email_verified:true}});
    if(url.pathname.includes("/upload/")){
     if(failUploads)return route.fulfill({status:503,json:{error:"retry"}});
     const boundary=request.headers()["content-type"].split("boundary=")[1];
     const parts=request.postData().split("--"+boundary).filter(p=>p.includes("Content-Type:"));
     const parse=part=>JSON.parse(part.slice(part.indexOf("\r\n\r\n")+4).trim());
     const metadata=parse(parts[0]),payload=parse(parts[1]),id="f"+(++serial);
     assert(!metadata.permissions);files.set(id,{metadata,payload});
     return route.fulfill({json:{id}});
    }
    if(url.pathname==="/drive/v3/files")return route.fulfill({json:{files:[...files].filter(([,f])=>f.metadata.appProperties.kind==="sync-v1").map(([id,f])=>({id,size:String(JSON.stringify(f.payload).length)}))}});
    const file=files.get(url.pathname.split("/").pop());
    if(file&&url.searchParams.get("alt")==="media")return route.fulfill({json:file.payload});
    return route.fulfill({status:404,json:{}});
   });
   await page.goto("http://127.0.0.1:8806");
   await page.locator("#cloudDialog").waitFor({state:"visible"});
   await page.fill("#oauthClientId","12345-unit.apps.googleusercontent.com");await page.fill("#pickerKey","AIza-unit");await page.fill("#projectNumber","12345");
   await page.locator("#connectDrive").click();
   await page.waitForFunction(()=>document.querySelector("#cloudStatus").textContent.includes("owner@example.com"));
   await page.waitForFunction(()=>document.querySelector("#syncStatus").textContent.includes("동기화 완료"));
   return {page,context,errors};
  };
  const A=await make(),B=await make();
  const save=(page,values)=>page.evaluate(async values=>{
   const notes=await BrowserBible.api("/api/notes");
   for(const [ref,value] of Object.entries(values)){if(value===null)delete notes.notes[ref];else notes.notes[ref]=value;}
   await BrowserBible.api("/api/notes",{method:"POST",body:JSON.stringify(notes)});
  },values);
  const sync=async page=>{await page.locator("#syncNow").click();await page.waitForFunction(()=>document.querySelector("#syncStatus").textContent.includes("동기화 완료")||document.querySelector("#syncStatus").textContent.includes("동시 수정"));};
  const notes=page=>page.evaluate(()=>BrowserBible.api("/api/notes"));
  await save(A.page,{"19-121-3":"A first"});
  await A.page.waitForFunction(()=>document.querySelector("#syncStatus").textContent.includes("동기화 완료"),{timeout:15000});
  await sync(B.page);
  assert.equal((await notes(B.page)).notes["19-121-3"],"A first");
  await A.page.evaluate(async()=>{
    const data=await BrowserBible.api("/api/notes");
    data.tags["19-121-4"]=["보호"];
    data.highlights["19-121-4"]={text:"표시"};
    data.underlines["19-121-4"]={text:"표시"};
    data.annotations.push({key:"19-121-4",version:"개역개정.bdb",start:0,end:2,text:"표시",type:"highlight"});
    data.topics={topics:[{id:"1",name:"이전 주제",entries:[{title:"보호",reference:"시121:4",book:19,chapter:121,start:4,verses:[{key:"19-121-4",verse:4,text:"주제 본문"}]}]}]};
    await BrowserBible.api("/api/notes",{method:"POST",body:JSON.stringify(data)});
  });
  await sync(A.page);await sync(B.page);
  let marked=await notes(B.page);
  assert.deepEqual(marked.tags["19-121-4"],["보호"]);assert(marked.highlights["19-121-4"]);assert(marked.underlines["19-121-4"]);assert.equal(marked.annotations.length,1);
  assert.equal(marked.topics.topics[0].name,"이전 주제");
  await A.page.evaluate(async()=>{
    const data=await BrowserBible.api("/api/notes");
    delete data.tags["19-121-4"];delete data.highlights["19-121-4"];delete data.underlines["19-121-4"];data.annotations=[];
    await BrowserBible.api("/api/notes",{method:"POST",body:JSON.stringify(data)});
  });
  await sync(A.page);await sync(B.page);
  marked=await notes(B.page);assert.equal(marked.tags["19-121-4"],undefined);assert.equal(marked.annotations.length,0);
  assert([...files.values()].some(f=>f.payload.format==="personal-bible-study"),"automatic recovery snapshot");
  await Promise.all([save(A.page,{"19-121-3":"A concurrent"}),save(B.page,{"19-121-3":"B concurrent","43-3-16":"B independent"})]);
  await sync(A.page);await sync(B.page);await sync(A.page);
  assert((await notes(A.page)).notes["43-3-16"]==="B independent");
  assert(await A.page.locator(".sync-conflict").count()>0);
  const choices=await A.page.locator(".sync-conflict pre").allTextContents();
  assert(choices.includes("A concurrent")&&choices.includes("B concurrent"));
  await A.page.locator(".sync-conflict textarea").fill("merged note");
  await A.page.locator(".sync-conflict button").filter({hasText:"합친 메모 저장"}).click();
  await sync(A.page);await sync(B.page);
  assert.equal((await notes(B.page)).notes["19-121-3"],"merged note");
  await save(A.page,{"19-121-3":null});await sync(A.page);await sync(B.page);
  assert.equal((await notes(B.page)).notes["19-121-3"],undefined);
  await B.context.setOffline(true);
  await save(B.page,{"18-23-11":"offline edit"});await B.page.locator("#syncNow").click();
  assert.equal((await notes(B.page)).notes["18-23-11"],"offline edit");
  await B.context.setOffline(false);
  await sync(B.page);await sync(A.page);
  assert.equal((await notes(A.page)).notes["18-23-11"],"offline edit");
  failUploads=true;await save(A.page,{"1-1-1":"retry remains"});
  await A.page.locator("#syncNow").click();
  await A.page.waitForFunction(()=>document.querySelector("#syncStatus").textContent.includes("재시도"));
  assert.equal((await notes(A.page)).notes["1-1-1"],"retry remains");
  failUploads=false;await sync(A.page);await sync(B.page);
  assert.equal((await notes(B.page)).notes["1-1-1"],"retry remains");
  await A.page.screenshot({path:"/private/tmp/bible-auto-sync.png"});
  assert.deepEqual([...A.errors,...B.errors],[]);
  console.log("PASS: two isolated devices, 5s autosave, recovery snapshot, cross-device merge, same-note conflict/resolution, deletion, offline queue/reconnect, failed upload retry, mobile UI. Google API mocked.");
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
