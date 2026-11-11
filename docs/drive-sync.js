/* Immutable Drive event files avoid read-modify-write races between devices. */
window.createDriveNotesSync = async function(io){
  const Engine=window.BibleSyncEngine;
  let model=await io.get("sync-state"),enabled=(await io.get("auto-sync"))!==false;
  if(!model){
    model=Engine.capture(Engine.fresh(crypto.randomUUID()),await io.get("notes")||io.empty());
    await io.commit(model,Engine.materialize(model).notes);
  }
  let queue=Promise.resolve(),timer,pollTimer,inFlight=false,stopped=false,backoff=0,nextAttempt=0,editContext=null;
  const serialized=task=>{const result=queue.then(task);queue=result.catch(()=>{});return result;};
  function report(text){io.report(text,Engine.materialize(model).conflicts,model.outbox.length);}
  async function persist(next,paint=false){
    const notes=io.validate(Engine.materialize(next).notes);
    await io.commit(next,notes);model=next;
    if(paint)io.paint(notes);
    report(model.outbox.length?"기기 저장됨 · Drive 전송 대기":"기기 저장됨");
  }
  function schedule(delay=5000){clearTimeout(timer);if(enabled&&!stopped)timer=setTimeout(()=>sync(),delay);}
  async function upload(operations){
    const payload={format:"personal-bible-sync",schema:1,operations};
    const boundary="pbs_"+crypto.randomUUID().replaceAll("-","");
    const metadata={name:"pbs-sync-v1-"+crypto.randomUUID()+".json",mimeType:"application/json",appProperties:{application:"personal-bible-study",kind:"sync-v1"}};
    const body="--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(payload)+"\r\n--"+boundary+"--";
    return io.fetch("upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body}).then(r=>r.json());
  }
  async function listFiles(){
    const files=[];let pageToken="";
    do{
      const query=new URLSearchParams({q:"trashed = false and appProperties has { key='application' and value='personal-bible-study' } and appProperties has { key='kind' and value='sync-v1' }",fields:"files(id,size),nextPageToken",pageSize:"1000"});
      if(pageToken)query.set("pageToken",pageToken);
      const page=await io.fetch("drive/v3/files?"+query).then(r=>r.json());
      if(!Array.isArray(page.files))throw Error("Drive 동기화 목록 형식 오류");
      files.push(...page.files);pageToken=page.nextPageToken||"";
      if(files.length>100000)throw Error("동기화 기록이 너무 많습니다. 수동 백업 후 정리가 필요합니다.");
    }while(pageToken);
    return files;
  }
  async function sync(force=false){
    if(stopped||(!enabled&&!force)||inFlight||(!force&&(document.hidden||Date.now()<nextAttempt)))return;
    if(!navigator.onLine){report("오프라인 · 기기에 저장됨");return;}
    if(!io.connected()){report("Google 연결 필요 · 기기에 저장됨");return;}
    inFlight=true;
    try{
      report("Drive 동기화 중");
      // Upload a fixed, durable batch. New edits during network requests remain queued.
      const batch=await serialized(async()=>model.outbox.slice(0,3000));
      if(batch.length){
        const result=await upload(batch);
        if(stopped)return;
        if(typeof result.id!=="string")throw Error("Drive 저장 응답 오류");
        await serialized(async()=>{
          const sent=new Set(batch.map(Engine.id));
          const next=structuredClone(model);
          next.outbox=next.outbox.filter(op=>!sent.has(Engine.id(op)));
          next.seen=[...new Set([...next.seen,result.id])];
          await persist(next);
        });
      }
      for(const file of await listFiles()){
        if(stopped)return;
        if(model.seen.includes(file.id))continue;
        if(typeof file.id!=="string"||Number(file.size)>8*1048576)throw Error("동기화 파일 크기 또는 ID 오류");
        const response=await io.fetch("drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media");
        const text=await response.text();
        if(stopped)return;
        if(text.length>8*1048576)throw Error("동기화 파일이 너무 큽니다.");
        const payload=JSON.parse(text);io.safe(payload);
        if(payload.format!=="personal-bible-sync"||payload.schema!==1||!Array.isArray(payload.operations)||payload.operations.length>3000)throw Error("지원하지 않는 동기화 파일");
        await serialized(async()=>{
          const next=Engine.merge(model,payload.operations);
          next.seen.push(file.id);
          // Validate before committing or marking a remote file as received.
          await persist(next,true);
        });
      }
      if(model.needsBackup&&Date.now()-model.lastBackupAt>24*60*60*1000){
        const clock=JSON.stringify(model.clock);
        await io.backup();
        await serialized(async()=>{
          const next=structuredClone(model);next.lastBackupAt=Date.now();
          if(JSON.stringify(next.clock)===clock)next.needsBackup=false;
          await persist(next);
        });
      }
      backoff=0;nextAttempt=0;
      report(Engine.materialize(model).conflicts.length?"동시 수정 확인 필요":model.outbox.length?"추가 변경 전송 대기":"동기화 완료 · "+new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}));
    }catch(error){
      backoff=Math.min(backoff+1,6);nextAttempt=Date.now()+Math.min(300000,15000*2**(backoff-1));
      report(io.connected()?"동기화 재시도 대기 · "+error.message:"Google 다시 연결 필요 · 기기에 저장됨");
    }finally{
      inFlight=false;
      if(model.outbox.length&&enabled&&io.connected())schedule(Math.max(5000,nextAttempt-Date.now()));
    }
  }
  function startPolling(){
    clearInterval(pollTimer);pollTimer=setInterval(()=>sync(),20000);
  }
  startPolling();
  window.addEventListener("online",()=>{if(enabled)sync(true);});
  window.addEventListener("focus",()=>sync());
  document.addEventListener("visibilitychange",()=>{if(enabled&&!document.hidden)sync(true);});
  window.addEventListener("pagehide",()=>{clearTimeout(timer);clearInterval(pollTimer);});
  const controller={
    async save(notes,restore=false,baseline=null){
      const capturedContext=editContext?structuredClone(editContext):null;editContext=null;
      await serialized(async()=>{
        let next=Engine.capture(model,io.validate(notes),restore?null:capturedContext,restore?null:baseline);
        if(restore)await io.put("rescue-"+Date.now(),Engine.materialize(model).notes);
        await persist(next);
      });schedule();
    },
    beginEdit(){if(!editContext)editContext=Engine.context(model);},
    async enable(value){enabled=value;await io.put("auto-sync",enabled);if(enabled)sync(true);else{clearTimeout(timer);report("자동 동기화 꺼짐 · 기기에 저장됨");}},
    connected(){schedule(0);},
    disconnected(){clearTimeout(timer);report("Google 연결 필요 · 기기에 저장됨");},
    sync:()=>sync(true),
    async resolve(key,value){
      await serialized(async()=>{const changes={};changes[key]=value;await persist(Engine.write(model,changes),true);});
      schedule();
    },
    stop(){stopped=true;clearTimeout(timer);clearInterval(pollTimer);},
    state(){return structuredClone(model);},
    get enabled(){return enabled;},
  };
  report(model.outbox.length?"Google 연결 후 자동 전송 · 기기에 저장됨":"Google 연결 필요");
  return controller;
};
