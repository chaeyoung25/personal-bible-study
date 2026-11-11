/* Multi-value registers with causal contexts; wall clocks never decide winners. */
(function(root){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const collections=["notes","tags","highlights","underlines"];
  const refPattern=/^(?:[1-9]|[1-5][0-9]|6[0-6])-\d+(?:-\d+)?$/;
  const devicePattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const empty=()=>({bookmarks:[],notes:{},tags:{},highlights:{},underlines:{},updated:{},annotations:[]});
  function flatten(notes){
    const result={};
    for(const field of collections)for(const [ref,value] of Object.entries(notes[field]||{}))result[JSON.stringify([field,ref])]=value;
    for(const mark of notes.annotations||[]){
      const key=JSON.stringify(["annotations",mark.key,mark.version,mark.type]);
      (result[key]||=[]).push(mark);
    }
    for(const key of Object.keys(result))if(key.startsWith('["annotations"'))result[key].sort((a,b)=>a.start-b.start||a.end-b.end||a.text.localeCompare(b.text));
    if(notes.bookmarks?.length)result['["bookmarks"]']=notes.bookmarks;
    return result;
  }
  function validateOperation(op){
    if(!op||typeof op!=="object"||!devicePattern.test(op.device)||!Number.isSafeInteger(op.seq)||op.seq<1||!op.context||typeof op.context!=="object"||Array.isArray(op.context)||!Number.isFinite(op.time)||op.time<0)throw Error("동기화 기록 형식 오류");
    for(const [device,seq] of Object.entries(op.context))if(!devicePattern.test(device)||!Number.isSafeInteger(seq)||seq<0)throw Error("동기화 순서 오류");
    if((op.context[op.device]||0)>=op.seq)throw Error("잘못된 동기화 인과관계");
    const key=JSON.parse(op.key);
    if(!Array.isArray(key))throw Error("동기화 항목 오류");
    if(key[0]==="bookmarks"&&key.length===1){if(op.value!==null&&!Array.isArray(op.value))throw Error("북마크 오류");}
    else if(collections.includes(key[0])&&key.length===2&&refPattern.test(key[1])){
      if(op.value!==null){
        if(key[0]==="notes"&&typeof op.value!=="string")throw Error("메모 오류");
        if(key[0]==="tags"&&(!Array.isArray(op.value)||!op.value.every(v=>typeof v==="string")))throw Error("태그 오류");
        if(["highlights","underlines"].includes(key[0])&&(!op.value||typeof op.value.text!=="string"))throw Error("표시 오류");
      }
    }else if(key[0]==="annotations"&&key.length===4&&refPattern.test(key[1])&&typeof key[2]==="string"&&["highlight","underline"].includes(key[3])){
      if(op.value!==null&&(!Array.isArray(op.value)||!op.value.every(mark=>mark&&mark.key===key[1]&&mark.version===key[2]&&mark.type===key[3]&&typeof mark.text==="string"&&Number.isInteger(mark.start)&&Number.isInteger(mark.end)&&mark.start>=0&&mark.end>mark.start)))throw Error("선택 표시 오류");
    }else throw Error("지원하지 않는 동기화 항목");
    if(op.value===undefined)throw Error("동기화 값 누락");
    return op;
  }
  const id=op=>op.device+":"+op.seq;
  const dominates=(a,b)=>(a.context[b.device]||0)>=b.seq;
  function fresh(device){if(!devicePattern.test(device))throw Error("기기 ID 오류");return {schema:1,device,seq:0,clock:{},records:{},outbox:[],seen:[],lastBackupAt:0,needsBackup:false};}
  function merge(model,operations){
    const next=clone(model);
    for(const raw of operations){
      const op=validateOperation(raw);
      const heads=next.records[op.key]||[];
      const existing=heads.find(head=>id(head)===id(op));
      if(existing&&!equal(existing,op))throw Error("동일 기록 ID의 내용이 다릅니다.");
      if(!existing&&!heads.some(head=>dominates(head,op))){
        next.records[op.key]=heads.filter(head=>!dominates(op,head)).concat(clone(op)).sort((a,b)=>id(a).localeCompare(id(b)));
      }
      next.clock[op.device]=Math.max(next.clock[op.device]||0,op.seq);
      for(const [device,seq] of Object.entries(op.context))next.clock[device]=Math.max(next.clock[device]||0,seq);
      if(op.device===next.device)next.seq=Math.max(next.seq,op.seq);
    }
    return next;
  }
  function materialize(model){
    const notes=empty(),conflicts=[];
    for(const [register,heads] of Object.entries(model.records)){
      if(!heads.length)continue;
      const values=[];
      for(const head of heads)if(!values.some(other=>equal(other.value,head.value)))values.push(head);
      if(values.length>1)conflicts.push({key:register,choices:clone(values)});
      const winner=heads[heads.length-1],key=JSON.parse(register),value=winner.value;
      if(key[1])notes.updated[key[1]]=Math.max(notes.updated[key[1]]||0,...heads.map(head=>head.time));
      if(value===null)continue;
      if(key[0]==="annotations")notes.annotations.push(...clone(value));
      else if(key[0]==="bookmarks")notes.bookmarks=clone(value);
      else notes[key[0]][key[1]]=clone(value);
    }
    return {notes,conflicts};
  }
  function write(model,changes,context){
    let next=clone(model);
    for(const [key,value] of Object.entries(changes)){
      const observed=context?context[key]||{}:registerContext(next.records[key]||[]);
      const op={device:next.device,seq:++next.seq,key,value:clone(value),context:clone(observed),time:Date.now()};
      // A local sequence always causally includes our prior local operations.
      op.context[next.device]=op.seq-1;
      next=merge(next,[op]);next.outbox.push(op);
    }
    if(Object.keys(changes).length)next.needsBackup=true;
    return next;
  }
  function capture(model,notes,context,baseline){
    const before=flatten(baseline||materialize(model).notes),after=flatten(notes),changes={};
    for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
      const oldValue=before[key]??null,newValue=after[key]??null;
      if(!equal(oldValue,newValue))changes[key]=newValue;
    }
    return write(model,changes,context);
  }
  function registerContext(heads){
    const clock={};
    for(const head of heads){
      clock[head.device]=Math.max(clock[head.device]||0,head.seq);
      for(const [device,seq] of Object.entries(head.context))clock[device]=Math.max(clock[device]||0,seq);
    }
    return clock;
  }
  const context=model=>Object.fromEntries(Object.entries(model.records).map(([key,heads])=>[key,registerContext(heads)]));
  const api={fresh,merge,materialize,capture,write,flatten,validateOperation,id,context};
  if(typeof module!=="undefined")module.exports=api;
  else root.BibleSyncEngine=api;
})(typeof window!=="undefined"?window:globalThis);
