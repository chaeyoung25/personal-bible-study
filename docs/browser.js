/* Private content lives in IndexedDB or Google Drive, never in the public build. */
window.BrowserBible = (() => {
  "use strict";
  const DB_NAME = "personal-bible-private-v1";
  const BASE = new URL("./", document.currentScript.src);
  const PUBLISHED = "https://chaeyoung25.github.io/personal-bible-study/";
  const $c = id => document.getElementById(id);
  const emptyNotes = () => ({bookmarks:[],notes:{},tags:{},highlights:{},underlines:{},updated:{},annotations:[]});
  let db, worker, requestId = 0, token = "", tokenExpires = 0, running = false, busy = false;
  let readerInit, catalog = [], books = [], identity = null;
  let notesSync=null,presentedNotes=null,conflictSignature="",sessionController=new AbortController();
  const pending = new Map(), imageUrls = new Map();
  const settingsPrefix = "pbs-pages-v1:";
  const settings = {
    getItem: key => localStorage.getItem(settingsPrefix + key),
    setItem: (key,value) => localStorage.setItem(settingsPrefix + key,value),
    removeItem: key => localStorage.removeItem(settingsPrefix + key),
  };
  const status = text => { $c("cloudStatus").textContent = text; };
  const openDB = () => new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => { for (const store of ["kv","files","meta"]) req.result.createObjectStore(store); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; db.onversionchange = () => { db.close(); status("자료가 다른 탭에서 변경되었습니다. 이 탭을 새로고침해 주세요."); }; resolve(db); };
  });
  function storeGet(store,key) {
    return new Promise((resolve,reject) => {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  function storePut(store,key,value) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite"); tx.objectStore(store).put(value,key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error("저장 중단"));
    });
  }
  function commitSyncedNotes(model,notes){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction("kv","readwrite"),store=tx.objectStore("kv");
      store.put(model,"sync-state");store.put(notes,"notes");
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  function paintSyncedNotes(notes){
    presentedNotes=structuredClone(notes);
    if(!running)return;
    const buffers=[];
    for(const id of ["noteText","noteTags","markTags"]){
      const element=$c(id);
      if(element&&!element.closest("[hidden]"))buffers.push([element,element.value,element.selectionStart,element.selectionEnd]);
    }
    state.notes=notes;renderNotes();if(state.passage)renderPassage(state.passage);refreshPassagePanes();
    for(const [element,value,start,end] of buffers){element.value=value;if(element.setSelectionRange&&start!==null)element.setSelectionRange(start,end);}
  }
  function reportSync(text,conflicts,pendingCount){
    $c("syncStatus").textContent=text+(pendingCount?" · "+pendingCount+"건 대기":"");
    if($c("compactCloud")){$c("compactCloud").title=text;$c("compactCloud").setAttribute("aria-label","Drive · "+text);}
    if($c("openSyncStatus"))$c("openSyncStatus").textContent=conflicts.length?"동시 수정 "+conflicts.length+"건 · 확인":text;
    const signature=JSON.stringify(conflicts);
    if(signature===conflictSignature)return;
    conflictSignature=signature;
    const target=$c("syncConflicts");
    const drafts=new Map([...target.querySelectorAll(".sync-conflict")].map(section=>[section.dataset.register,section.querySelector("textarea")?.value]));
    target.replaceChildren();
    for(const conflict of conflicts){
      const key=JSON.parse(conflict.key),section=document.createElement("section");section.className="sync-conflict";
      section.dataset.register=conflict.key;
      const heading=document.createElement("strong");heading.textContent=(key[1]||"북마크")+" · "+({notes:"메모",tags:"태그",highlights:"형광펜",underlines:"밑줄",annotations:"선택 표시"}[key[0]]||key[0])+" 동시 수정";
      section.append(heading);
      for(const choice of conflict.choices){
        const content=document.createElement("pre");content.textContent=choice.value===null?"[삭제됨]":typeof choice.value==="string"?choice.value:JSON.stringify(choice.value,null,2);
        const use=document.createElement("button");use.textContent="이 내용 사용";
        use.onclick=()=>notesSync.resolve(conflict.key,choice.value).catch(error=>status(error.message));
        section.append(content,use);
      }
      if(key[0]==="notes"){
        const merged=document.createElement("textarea");merged.setAttribute("aria-label","충돌 메모 합치기");
        merged.value=drafts.get(conflict.key)??conflict.choices.filter(c=>typeof c.value==="string").map(c=>c.value).join("\n\n");
        const save=document.createElement("button");save.textContent="합친 메모 저장";
        save.onclick=()=>notesSync.resolve(conflict.key,merged.value).catch(error=>status(error.message));
        section.append(merged,save);
      }
      target.append(section);
    }
  }
  async function inventory() {
    catalog = await new Promise((resolve,reject) => {
      const req = db.transaction("meta").objectStore("meta").getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    $c("localInventory").textContent = catalog.map(file => file.id + " · " + (file.size/1048576).toFixed(1) + " MB").join("\n") || "저장된 자료가 없습니다.";
    return catalog;
  }
  function callWorker(action,params={},buffer) {
    return new Promise((resolve,reject) => {
      const id = ++requestId; pending.set(id,{resolve,reject});
      worker.postMessage({id,action,params,buffer},buffer ? [buffer] : []);
    });
  }
  function initializeWorker() {
    worker = new Worker(new URL("db-worker.js",BASE));
    worker.onmessage = ({data}) => {
      const task = pending.get(data.id); if (!task) return;
      pending.delete(data.id); data.error ? task.reject(Error(data.error)) : task.resolve(data.result);
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(Error("검색 작업을 실행하지 못했습니다. 새로고침해 주세요."));
      pending.clear();
    };
  }
  function assertSafeObject(value,depth=0) {
    if (depth>15) throw Error("자료 구조가 너무 복잡합니다.");
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      if (["__proto__","prototype","constructor"].includes(key)) throw Error("허용되지 않는 자료 키입니다.");
      assertSafeObject(value[key],depth+1);
    }
  }
  function validateNotes(payload) {
    assertSafeObject(payload);
    if (payload?.format === "personal-bible-study" && payload.schema === 1) payload = payload.data;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.notes || typeof payload.notes !== "object") throw Error("성경 앱 메모 형식이 아닙니다.");
    const result = emptyNotes();
    for (const key of ["notes","tags","highlights","underlines","updated"]) {
      const collection = payload[key] || {};
      if (typeof collection !== "object" || Array.isArray(collection)) throw Error("메모 자료 형식 오류");
      for (const [ref,value] of Object.entries(collection)) {
        if (!/^(?:[1-9]|[1-5][0-9]|6[0-6])-\d+(?:-\d+)?$/.test(ref)) throw Error("구절 번호 오류");
        if (key === "notes" && typeof value !== "string") throw Error("메모 본문 오류");
        if (key === "tags" && (!Array.isArray(value) || !value.every(v=>typeof v==="string"))) throw Error("태그 오류");
        if (["highlights","underlines"].includes(key) && (!value || typeof value.text !== "string")) throw Error("표시 오류");
        if (key === "updated" && !Number.isFinite(value)) throw Error("수정 시각 오류");
      }
      result[key] = collection;
    }
    if (!Array.isArray(payload.annotations || [])) throw Error("표시 목록 오류");
    result.annotations = (payload.annotations || []).map(mark => {
      if (!mark || !/^(?:[1-9]|[1-5][0-9]|6[0-6])-\d+-\d+$/.test(mark.key) ||
          typeof mark.version !== "string" || typeof mark.text !== "string" ||
          !["highlight","underline"].includes(mark.type) || !Number.isInteger(mark.start) || !Number.isInteger(mark.end) ||
          mark.start<0 || mark.end<=mark.start) throw Error("선택 표시 오류");
      return {...mark,version:mark.version.normalize("NFC")};
    });
    result.bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    return result;
  }
  async function withBusy(task) {
    if (busy) throw Error("진행 중인 작업이 끝난 뒤 다시 눌러주세요.");
    busy = true;
    try { return await task(); } finally { busy = false; }
  }
  async function importOne(name,buffer) {
    const id = name.normalize("NFC");
    if (id.includes("/") || id.includes("\\") || buffer.byteLength>128*1048576) throw Error("허용되지 않는 파일 또는 너무 큰 파일입니다.");
    const ext = id.split(".").pop().toLowerCase();
    if (ext === "json") {
      if (buffer.byteLength>8*1048576) throw Error("메모 파일이 너무 큽니다.");
      const notes = validateNotes(JSON.parse(new TextDecoder().decode(buffer)));
      if (!confirm("선택한 백업으로 메모를 복원할까요? 현재 메모는 기기에 복구용으로 보존됩니다. 자동 동기화가 켜져 있으면 이 복원 결과가 다른 기기에도 반영됩니다.")) return;
      await restoreNotes(notes); return;
    }
    let kind;
    if (["bdb","sdb","cdb","hdb"].includes(ext)) {
      if (new TextDecoder().decode(buffer.slice(0,16)) !== "SQLite format 3\0") throw Error("SQLite 자료가 아닙니다: " + id);
      kind = ext==="bdb" ? "translation" : ext==="hdb" ? "hymns" : "commentary";
      await callWorker("validate",{kind},buffer.slice(0));
    } else if (["jpg","jpeg","png"].includes(ext) && /^new_\d+\.(?:jpe?g|png)$/i.test(id)) {
      const bytes = new Uint8Array(buffer);
      if (buffer.byteLength>10*1048576 || !(bytes[0]===255&&bytes[1]===216 || bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)) throw Error("잘못된 악보 이미지");
      kind = "image";
    } else return;
    const tx = db.transaction(["files","meta"],"readwrite");
    tx.objectStore("files").put(buffer,id);
    tx.objectStore("meta").put({id,name:id.replace(/\.[^.]+$/,"").replaceAll("_"," "),kind,size:buffer.byteLength},id);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    await callWorker("reset");
    if (imageUrls.has(id)) { URL.revokeObjectURL(imageUrls.get(id)); imageUrls.delete(id); }
  }
  async function importFiles(files) {
    return withBusy(async()=>{
      let count=0;
      for (const file of files) {
        if (!/\.(?:bdb|sdb|cdb|hdb|json|jpe?g|png)$/i.test(file.name)) continue;
        if (file.webkitRelativePath && /\.json$/i.test(file.name) && file.name!=="notes.json") continue;
        status("불러오는 중: " + file.name);
        await importOne(file.name,await file.arrayBuffer()); count++;
      }
      await inventory(); await navigator.storage?.persist?.();
      status(count + "개 파일 처리가 완료됐습니다. 성경 열기를 눌러주세요.");
    });
  }
  async function restoreNotes(notes) {
    await notesSync.save(notes,true);
    if (running) { state.notes=notes; renderNotes(); if(state.passage)renderPassage(state.passage); refreshPassagePanes(); }
  }
  const snapshot = data => ({format:"personal-bible-study",schema:1,savedAt:new Date().toISOString(),data});
  async function api(path,options={}) {
    const url = new URL(path,"https://local.invalid");
    const q = url.searchParams, route = url.pathname;
    if (route==="/api/library") return {books,translations:catalog.filter(f=>f.kind==="translation"),commentaries:catalog.filter(f=>f.kind==="commentary")};
    if (route==="/topics.json") {
      const data = await fetch(new URL("topics.json",BASE)).then(r=>r.json());
      const version = catalog.find(f=>f.kind==="translation")?.id;
      if (version) {
        const rows = await callWorker("topicTexts",{version});
        const texts = new Map(rows.map(r=>[[r.book,r.chapter,r.verse].join("-"),r.btext]));
        for (const topic of data.topics) for(const entry of topic.entries) for(const verse of entry.verses) verse.text=texts.get(verse.key)||"";
      }
      return data;
    }
    if (route==="/api/passage") {
      const versions={};
      for(const version of [...new Set(q.get("versions").split(","))]) versions[version]=await callWorker("passage",{version,book:Number(q.get("book")),chapter:Number(q.get("chapter"))});
      return {book:Number(q.get("book")),chapter:Number(q.get("chapter")),versions};
    }
    if (route==="/api/search") return {results:await callWorker("search",{version:q.get("version"),query:q.get("q")})};
    if (route==="/api/concordance") {
      const source=catalog.find(f=>f.name.normalize("NFC")==="원전분해");
      if(!source)throw Error("원전분해.sdb 파일을 추가해 주세요.");
      return {results:await callWorker("concordance",{source:source.id,strong:q.get("strong"),translation:q.get("version")})};
    }
    if (route==="/api/resolve") {
      const text=(q.get("q")||"").replace(/\s/g,"").normalize("NFC"); let reference=null;
      for(const book of [...books].sort((a,b)=>b.name.length-a.name.length)) for(const name of [book.name,book.short]) {
        if(!text.startsWith(name))continue;
        const match=text.slice(name.length).match(/^(\d+)(?::(\d+))?$/);
        if(match&&Number(match[1])>=1&&Number(match[1])<=book.chapters)reference={book:book.id,chapter:Number(match[1]),verse:Number(match[2]||1)};
      }
      return {reference};
    }
    if(route==="/api/notes"){
      if(options.method==="POST"){
        await notesSync.save(validateNotes(JSON.parse(options.body)),false,presentedNotes);
        const current=await storeGet("kv","notes");presentedNotes=structuredClone(current);
        if(running)state.notes=current;
        return {ok:true};
      }
      const notes=await storeGet("kv","notes")||emptyNotes();
      presentedNotes=structuredClone(notes);return notes;
    }
    if(route==="/api/research-backup") return withBusy(()=>backupDrive());
    if(route==="/api/research-restore-latest"){
      await pickFiles(true);
      return {ok:true,data:await storeGet("kv","notes")||emptyNotes(),file:"Drive에서 선택한 백업"};
    }
    if(route==="/api/hymns"){
      const source=catalog.find(f=>f.kind==="hymns"&&f.name==="새찬송가")||catalog.find(f=>f.kind==="hymns");
      if(!source)throw Error("새찬송가.hdb 파일을 추가해 주세요.");
      const rows=await callWorker("hymns",{source:source.id});
      const parser=new DOMParser(),query=(q.get("q")||"").normalize("NFC");
      const results=rows.map(row=>{
        const lyrics=parser.parseFromString((row.htext||"").replace(/<br\s*\/?>/gi,"\n"),"text/html").body.textContent.trim();
        return {number:row.chapter,title:row.title,lyrics,images:catalog.filter(f=>f.kind==="image"&&f.id.match(/^new_(\d+)\./)?.[1]===String(row.chapter)).map(f=>f.id)};
      }).filter(h=>!query||(h.title+h.lyrics).normalize("NFC").includes(query)||query.replace(/장$/,"")===String(h.number));
      return {results};
    }
    throw Error("지원하지 않는 요청입니다.");
  }
  async function image(name){
    name=name.normalize("NFC");
    if(imageUrls.has(name))return imageUrls.get(name);
    const file=await storeGet("files",name); if(!file)return null;
    const url=URL.createObjectURL(new Blob([file],{type:/\.png$/i.test(name)?"image/png":"image/jpeg"}));
    imageUrls.set(name,url);return url;
  }
  async function loadScript(url) {
    await new Promise((resolve,reject)=>{
      const script=document.createElement("script");script.src=url;script.onload=resolve;script.onerror=()=>reject(Error("Google 연결 스크립트를 불러오지 못했습니다."));document.head.append(script);
    });
  }
  async function ensureGoogle(){
    if(!window.google?.accounts)await loadScript("https://accounts.google.com/gsi/client");
    if(!window.gapi)await loadScript("https://apis.google.com/js/api.js");
    await new Promise((resolve,reject)=>gapi.load("picker",{callback:resolve,onerror:reject}));
  }
  function config(){
    const value={clientId:$c("oauthClientId").value.trim(),pickerKey:$c("pickerKey").value.trim(),project:$c("projectNumber").value.trim()};
    if(!/^[a-zA-Z0-9.-]+\.apps\.googleusercontent\.com$/.test(value.clientId)||!/^AIza[\w-]+$/.test(value.pickerKey)||!/^\d+$/.test(value.project))throw Error("Google 설정 3가지를 확인해 주세요. 클라이언트 보안 비밀은 입력하지 않습니다.");
    const clientProject=value.clientId.match(/^(\d+)-/)?.[1];
    if(clientProject && clientProject!==value.project)throw Error("OAuth 클라이언트 ID와 프로젝트 번호가 서로 다릅니다. 같은 Google Cloud 프로젝트의 번호를 입력해 주세요.");
    return value;
  }
  function needToken(){
    if(!token||Date.now()>=tokenExpires){token="";throw Error("Google 연결이 필요하거나 만료됐습니다. Google 연결을 다시 눌러주세요.");}
    return token;
  }
  async function connect(){
    const settings=config(); await ensureGoogle();
    await new Promise((resolve,reject)=>{
      identity=google.accounts.oauth2.initTokenClient({
        client_id:settings.clientId,scope:"openid email https://www.googleapis.com/auth/drive.file",include_granted_scopes:false,
        callback:response=>{
          if(response.error)return reject(Error("Google 접근 허용이 완료되지 않았습니다."));
          if(!(response.scope||"").split(/\s+/).includes("https://www.googleapis.com/auth/drive.file"))return reject(Error("선택한 Drive 파일 접근 권한이 허용되지 않았습니다. Google 연결에서 해당 권한을 허용해 주세요."));
          token=response.access_token;tokenExpires=Date.now()+Number(response.expires_in||3600)*1000-30000;resolve();
        },error_callback:()=>reject(Error("Google 연결 창이 닫혔거나 차단됐습니다.")),
      });identity.requestAccessToken({prompt:"select_account"});
    });
    try {
      const account=await driveFetch("oauth2/v3/userinfo").then(r=>r.json());
      if(!account.sub || !account.email_verified)throw Error("Google 계정을 확인할 수 없습니다.");
      const owner=await storeGet("kv","drive-owner");
      if(owner && owner!==account.sub)throw Error("이 기기는 다른 Google 계정에 연결돼 있습니다. 자료를 백업하고 이 기기 자료를 삭제한 뒤 다시 연결해 주세요.");
      if(!owner && !confirm(account.email+" 계정을 이 기기의 자료와 연결할까요?"))throw Error("계정 연결을 취소했습니다.");
      await storePut("kv","drive-owner",account.sub);
      status("Google 연결 완료: "+account.email+". 선택한 파일에만 접근합니다.");
      notesSync?.connected();
    } catch(error) {token="";tokenExpires=0;throw error;}
  }
  async function driveFetch(path,options={}){
    const response=await fetch("https://www.googleapis.com/"+path,{...options,signal:options.signal||sessionController.signal,headers:{...options.headers,Authorization:"Bearer "+needToken()},cache:"no-store",referrerPolicy:"no-referrer"});
    if(response.status===401){token="";throw Error("Google 연결이 만료되었습니다.");}
    if(!response.ok)throw Error("Drive 작업 실패 ("+response.status+"). 접근 권한·용량·네트워크를 확인해 주세요.");
    return response;
  }
  async function backupDrive(){
    needToken();
    const data=validateNotes(await storeGet("kv","notes")||emptyNotes());
    const name="bible-study-"+new Date().toISOString().replaceAll(":","-")+"-"+crypto.randomUUID()+".json";
    const boundary="bible_"+crypto.randomUUID().replaceAll("-","");
    const metadata={name,mimeType:"application/json",appProperties:{application:"personal-bible-study",schema:"1"}};
    // New immutable snapshots avoid silent multi-device overwrites and deletion conflicts.
    const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(snapshot(data))+"\r\n--"+boundary+"--";
    await driveFetch("upload/drive/v3/files?uploadType=multipart&fields=id,name",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
    status("Drive에 새 백업을 저장했습니다: "+name);
    return {ok:true,file:name};
  }
  async function pickFiles(restore=false){
    const settings=config();needToken();await ensureGoogle();
    if(!restore&&running&& !confirm("자료를 추가한 뒤 성경을 다시 열면 읽기 화면이 새로고침됩니다. 계속할까요?"))return;
    $c("cloudDialog").close();
    await new Promise((resolve,reject)=>{
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true);
      const builder=new google.picker.PickerBuilder().addView(view).setOAuthToken(needToken()).setDeveloperKey(settings.pickerKey).setAppId(settings.project).setOrigin(location.origin);
      if(!restore)builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      const picker=builder.setCallback(async data=>{
        if(data.action===google.picker.Action.CANCEL){resolve();return;}
        if(data.action!==google.picker.Action.PICKED)return;
        try {
          await withBusy(async()=>{
            for(const file of data.docs){
              const metadata=await driveFetch("drive/v3/files/"+encodeURIComponent(file.id)+"?fields=id,name,size,mimeType").then(r=>r.json());
              if(Number(metadata.size)>128*1048576)throw Error("128MB 이하의 개별 파일을 선택해 주세요.");
              if(restore&&!/\.json$/i.test(metadata.name))throw Error("메모 백업 JSON을 선택해 주세요.");
              if(!/\.(bdb|sdb|cdb|hdb|json|jpe?g|png)$/i.test(metadata.name))continue;
              status("Drive 다운로드: "+metadata.name);
              const buffer=await driveFetch("drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media").then(r=>r.arrayBuffer());
              await importOne(metadata.name,buffer);
            }
            await inventory();status("선택한 자료 처리가 완료됐습니다.");
          });resolve();
        }catch(error){reject(error);}
      }).build();
      picker.setVisible(true);
    }).finally(()=>showCloud());
  }
  function showCloud(){ if(!$c("cloudDialog").open)$c("cloudDialog").showModal(); }
  function downloadNotes(){
    storeGet("kv","notes").then(data=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(data||emptyNotes()),null,2)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="bible-study-"+Date.now()+".json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }).catch(error=>status(error.message));
  }
  async function forgetDevice(){
    if(busy)throw Error("진행 중인 작업이 끝난 뒤 삭제해 주세요.");
    if(!confirm("이 기기의 성경·찬송가·메모·백업·설정을 모두 삭제할까요? 드라이브 원본은 삭제하지 않습니다. 저장하지 않은 메모는 복구할 수 없습니다."))return;
    notesSync?.stop();sessionController.abort();token="";tokenExpires=0;worker.terminate();
    for(const url of imageUrls.values())URL.revokeObjectURL(url);
    db.close();
    await new Promise((resolve,reject)=>{
      const req=indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess=resolve;req.onerror=()=>reject(req.error);
      req.onblocked=()=>{status("다른 성경 앱 탭을 닫아야 삭제가 완료됩니다.");};
    });
    for(const key of Object.keys(localStorage))if(key.startsWith(settingsPrefix))localStorage.removeItem(key);
    for(const key of await caches.keys())if(key.startsWith("bible-shell-"))await caches.delete(key);
    for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope===BASE.href)await registration.unregister();
    location.reload();
  }
  async function start(init){
    let transferredSettings=null;
    if(location.hash.startsWith("#setup=")){
      const raw=location.hash.slice(7);
      history.replaceState(null,"",location.pathname+location.search);
      try {
        if(raw.length>8000)throw Error("설정 링크가 너무 깁니다.");
        transferredSettings=JSON.parse(decodeURIComponent(raw));
        assertSafeObject(transferredSettings);
        if(!transferredSettings || Object.keys(transferredSettings).some(key=>!["clientId","pickerKey","project"].includes(key)))throw Error("설정 링크 형식 오류");
      }catch(error){transferredSettings=null;status("잘못된 연결설정 링크입니다. 직접 설정을 입력해 주세요.");}
    }
    addEventListener("pageshow",event=>{if(event.persisted)location.reload();});
    readerInit=init;await openDB();
    if(navigator.locks) {
      const ownsLock=await new Promise(resolve=>{
        navigator.locks.request("personal-bible-private-writer",{ifAvailable:true},lock=>{
          resolve(Boolean(lock));
          if(lock)return new Promise(release=>addEventListener("pagehide",release,{once:true}));
        });
      });
      if(!ownsLock){
        status("이 앱은 다른 탭에서 열려 있습니다. 자료 충돌을 방지하기 위해 그 탭을 닫은 후 새로고침해 주세요.");
        $c("cloudDialog").querySelectorAll("button,input").forEach(node=>node.disabled=true);
        $c("cloudDialog").addEventListener("cancel",event=>event.preventDefault());showCloud();return;
      }
    }
    initializeWorker();
    notesSync=await createDriveNotesSync({
      get:key=>storeGet("kv",key),put:(key,value)=>storePut("kv",key,value),
      commit:commitSyncedNotes,empty:emptyNotes,validate:validateNotes,safe:assertSafeObject,
      fetch:driveFetch,connected:()=>Boolean(token&&Date.now()<tokenExpires&&!busy),
      paint:paintSyncedNotes,report:reportSync,backup:backupDrive,
    });
    $c("autoSyncEnabled").checked=notesSync.enabled;
    $c("autoSyncEnabled").onchange=()=>notesSync.enable($c("autoSyncEnabled").checked).catch(error=>status(error.message));
    $c("syncNow").onclick=()=>notesSync.sync();
    $c("openSyncStatus").onclick=showCloud;
    document.addEventListener("focusin",event=>{if(["noteText","noteTags","markTags"].includes(event.target.id))notesSync.beginEdit();});
    books=await fetch(new URL("books.json",BASE)).then(r=>r.json());
    await inventory();
    const settings=await storeGet("kv","public-config")||{};
    $c("oauthClientId").value=settings.clientId||"";$c("pickerKey").value=settings.pickerKey||"";$c("projectNumber").value=settings.project||"";
    if(transferredSettings && confirm("전달받은 Google 연결설정을 이 기기에 저장할까요? 로그인 권한이나 개인 자료는 전달되지 않습니다.")){
      $c("oauthClientId").value=transferredSettings.clientId||"";
      $c("pickerKey").value=transferredSettings.pickerKey||"";
      $c("projectNumber").value=transferredSettings.project||"";
      try{await storePut("kv","public-config",config());status("연결설정을 가져왔습니다. Google 연결을 눌러 본인 계정으로 로그인해 주세요.");}
      catch(error){status(error.message);}
    }
    const action=(id,fn)=>{$c(id).onclick=()=>Promise.resolve().then(fn).catch(error=>{status(error.message);showCloud();});};
    action("openCloud",showCloud);action("compactCloud",showCloud);
    action("closeCloud",()=>{if(!running)return status("성경 자료를 추가하고 성경 열기를 눌러주세요.");$c("cloudDialog").close();});
    action("saveCloudConfig",async()=>{await storePut("kv","public-config",config());status("공개 클라이언트 설정을 이 기기에 저장했습니다.");});
    action("connectDrive",connect);
    action("disconnectDrive",()=>{if(token&&window.google?.accounts)google.accounts.oauth2.revoke(token,()=>{});sessionController.abort();sessionController=new AbortController();token="";tokenExpires=0;notesSync?.disconnected();status("연결을 해제했습니다. 기기 자료는 남아 있습니다.");});
    action("pickDriveFiles",()=>pickFiles());action("cloudRestore",()=>pickFiles(true));action("cloudBackup",()=>withBusy(backupDrive));
    const setupLink=()=>PUBLISHED+"#setup="+encodeURIComponent(JSON.stringify(config()));
    action("openPublished",()=>{location.assign(setupLink());});
    action("copySetupLink",async()=>{
      await navigator.clipboard.writeText(setupLink());
      status("본인 기기로 전달할 연결설정 링크를 복사했습니다. 공개 게시하지 마세요. 토큰과 개인 자료는 들어 있지 않습니다.");
    });
    action("downloadNotes",downloadNotes);action("forgetDevice",forgetDevice);
    for(const id of ["localFiles","localFolder"])$c(id).onchange=()=>importFiles($c(id).files).catch(error=>status(error.message));
    action("openReader",async()=>{
      if(!catalog.some(f=>f.kind==="translation"))throw Error("성경 역본 .bdb 파일을 하나 이상 선택해 주세요.");
      if(running){location.reload();return;}
      await readerInit();running=true;$c("cloudDialog").close();
    });
    $c("cloudDialog").addEventListener("cancel",event=>{if(!running)event.preventDefault();});
    if("serviceWorker" in navigator) {
      let updateRequested=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(updateRequested)location.reload();});
      navigator.serviceWorker.register(new URL("sw.js",BASE)).then(registration=>{
        const offer=()=>{$c("applyAppUpdate").hidden=!registration.waiting;};
        offer();registration.addEventListener("updatefound",()=>registration.installing?.addEventListener("statechange",offer));
        $c("applyAppUpdate").onclick=()=>{
          if(!registration.waiting)return;
          if(!confirm("입력 중인 메모를 먼저 저장해 주세요. 새 버전을 적용하고 화면을 다시 열까요?"))return;
          updateRequested=true;registration.waiting.postMessage({type:"PBS_ACTIVATE"});
        };
      }).catch(()=>status("오프라인 앱 설치는 지원되지 않는 환경입니다."));
    }
    if(catalog.some(f=>f.kind==="translation")){await readerInit();running=true;}
    else showCloud();
  }
  return {api,image,start,validateNotes,showCloud,settings};
})();
