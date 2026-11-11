(function(root){
  "use strict";
  function mergeNotes(current,incoming){
    const result=structuredClone(current);
    for(const field of ["notes","tags","highlights","underlines","updated"])result[field]||={};
    for(const [key,text] of Object.entries(incoming.notes||{})){
      const old=result.notes[key];
      result.notes[key]=old&&old!==text&&!old.includes(text) ? old+"\n\n[로컬에서 가져온 메모]\n"+text : old||text;
    }
    for(const [key,tags] of Object.entries(incoming.tags||{}))result.tags[key]=[...new Set([...(result.tags[key]||[]),...tags])];
    for(const field of ["highlights","underlines"])for(const [key,value] of Object.entries(incoming[field]||{})){
      const old=result[field][key];
      result[field][key]={...old,...value,text:[...new Set([old?.text,value.text].filter(Boolean))].join(" · ")};
      if(old?.topicMark||value.topicMark)result[field][key].topicMark=true;
    }
    for(const [key,value] of Object.entries(incoming.updated||{}))result.updated[key]=Math.max(result.updated[key]||0,value);
    result.annotations=[...(result.annotations||[]),...(incoming.annotations||[])].filter((value,index,all)=>
      index===all.findIndex(other=>other.key===value.key&&other.version===value.version&&other.type===value.type&&other.start===value.start&&other.end===value.end&&other.text===value.text));
    result.bookmarks=[...(result.bookmarks||[]),...(incoming.bookmarks||[])].filter((value,index,all)=>index===all.findIndex(other=>JSON.stringify(other)===JSON.stringify(value)));
    return result;
  }
  function validateTopics(value){
    if(!value||!Array.isArray(value.topics)||value.topics.length>1000)throw Error("주제 자료 형식 오류");
    let count=0;
    for(const topic of value.topics){
      if(!["string","number"].includes(typeof topic.id)||typeof topic.name!=="string"||!Array.isArray(topic.entries))throw Error("주제 항목 오류");
      for(const entry of topic.entries){
        if(++count>20000||typeof entry.title!=="string"||typeof entry.reference!=="string"||!Array.isArray(entry.verses)||
            !Number.isInteger(entry.book)||entry.book<1||entry.book>66||!Number.isInteger(entry.chapter)||entry.chapter<1||!Number.isInteger(entry.start))throw Error("주제 구절 오류");
        for(const verse of entry.verses)if(typeof verse.key!=="string"||typeof verse.text!=="string"||!Number.isInteger(verse.verse))throw Error("주제 본문 오류");
      }
    }
    return value;
  }
  function mergeTopics(a,b){
    if(!a)return structuredClone(b);
    const result=structuredClone(a);
    for(const incoming of b.topics){
      const found=result.topics.find(topic=>topic.name.normalize("NFC")===incoming.name.normalize("NFC"));
      if(!found){result.topics.push(structuredClone(incoming));continue;}
      for(const entry of incoming.entries)if(!found.entries.some(old=>old.reference===entry.reference&&old.title===entry.title))found.entries.push(structuredClone(entry));
    }
    result.topics.forEach((topic,index)=>topic.id=String(index+1));
    return result;
  }
  async function importArchive(stream,io){
    const lib=root.fflate;
    if(!lib)throw Error("이전 파일 읽기 기능을 불러오지 못했습니다. 새로고침해 주세요.");
    let manifest=null,failure=null,chain=Promise.resolve(),personal={},total=0;
    const expected=new Map(),completed=new Set(),names=new Set();
    const decoder=new TextDecoder();
    const unzip=new lib.Unzip(file=>{
      try{
        const name=file.name.normalize("NFC");
        if(name!==file.name||name.includes("\\")||name.startsWith("/")||name.split("/").some(p=>p===".."||p==="."))throw Error("안전하지 않은 이전 경로");
        if(names.has(name))throw Error("중복 파일 경로");
        names.add(name);
        if(!manifest&&name!=="migration-manifest.json")throw Error("성경 앱 전체 이전 파일을 선택해 주세요.");
        const entry=expected.get(name);
        if(name!=="migration-manifest.json"&&!entry)throw Error("목록에 없는 이전 파일");
        const limit=name==="migration-manifest.json"?2*1048576:entry.size;
        if(limit>128*1048576||(file.originalSize!==undefined&&file.originalSize>limit))throw Error("이전 파일 크기 오류");
        const chunks=[];let length=0;
        file.ondata=(error,chunk,final)=>{
          if(error){failure=error;return;}
          length+=chunk.length;
          if(length>limit){failure=Error("허용 크기를 넘는 이전 파일");file.terminate();return;}
          chunks.push(chunk);
          if(final&&name==="migration-manifest.json"){
            try{
              const bytes=new Uint8Array(length);let offset=0;
              for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
              manifest=JSON.parse(decoder.decode(bytes));io.safe(manifest);
              if(manifest.format!=="personal-bible-migration"||manifest.schema!==1||!Array.isArray(manifest.files)||manifest.files.length>10000)throw Error("지원하지 않는 이전 파일");
              for(const record of manifest.files){
                if(typeof record.path!=="string"||!Number.isSafeInteger(record.size)||record.size<0||record.size>128*1048576||!/^[a-f0-9]{64}$/.test(record.sha256)||expected.has(record.path))throw Error("이전 목록 오류");
                total+=record.size;if(total>2*1073741824)throw Error("이전 자료가 2GB를 넘습니다.");
                expected.set(record.path,record);
              }
              chain=chain.then(()=>io.prepare(total,manifest.counts)).catch(error=>{failure=error;});
            }catch(error){failure=error;}
            return;
          }
          if(final)chain=chain.then(async()=>{
            if(failure)throw failure;
            const bytes=new Uint8Array(length);let offset=0;
            for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
            if(name==="migration-manifest.json"){
              manifest=JSON.parse(decoder.decode(bytes));io.safe(manifest);
              if(manifest.format!=="personal-bible-migration"||manifest.schema!==1||!Array.isArray(manifest.files)||manifest.files.length>10000)throw Error("지원하지 않는 이전 파일");
              for(const record of manifest.files){
                if(typeof record.path!=="string"||!Number.isSafeInteger(record.size)||record.size<0||record.size>128*1048576||!/^[a-f0-9]{64}$/.test(record.sha256)||expected.has(record.path))throw Error("이전 목록 오류");
                total+=record.size;if(total>2*1073741824)throw Error("이전 자료가 2GB를 넘습니다.");
                expected.set(record.path,record);
              }
              await io.prepare(total,manifest.counts);
            }else{
              if(length!==entry.size)throw Error("이전 파일 길이 불일치");
              const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
              if(hash!==entry.sha256)throw Error("이전 파일 무결성 검사 실패: "+name);
              if(name==="personal/notes.json"||name==="personal/topics.json"){
                const value=JSON.parse(decoder.decode(bytes));io.safe(value);personal[name]=value;
              }else if(/^data\/bethlehem\/[^/]+\.(?:bdb|sdb|cdb|hdb)$/i.test(name)||/^data\/hymn_scores\/(?:new|old)_\d+\.(?:jpe?g|png)$/i.test(name)){
                await io.importFile(name.split("/").pop(),bytes.buffer,hash);
              }else await io.archiveFile(name,bytes.buffer);
              completed.add(name);
              io.progress(completed.size,expected.size,name);
            }
          }).catch(error=>{failure=error;});
        };
        file.start();
      }catch(error){failure=error;}
    });
    unzip.register(lib.UnzipInflate);
    const reader=stream.getReader();
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        unzip.push(value,false);await chain;
        if(failure)throw failure;
      }
      unzip.push(new Uint8Array(0),true);await chain;
      if(failure)throw failure;
      if(!manifest||completed.size!==expected.size||!personal["personal/notes.json"]||!personal["personal/topics.json"])throw Error("이전 파일이 누락되거나 다운로드가 중단됐습니다.");
      await io.commitPersonal(personal["personal/notes.json"],personal["personal/topics.json"],manifest);
      return manifest;
    }finally{await reader.cancel().catch(()=>{});}
  }
  const api={mergeNotes,validateTopics,mergeTopics,importArchive};
  if(typeof module!=="undefined")module.exports=api;else root.BibleMigration=api;
})(typeof window!=="undefined"?window:globalThis);
