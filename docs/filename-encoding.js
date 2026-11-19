/* Recover Korean UTF-8 filenames misread as single-byte text, including NFD.
   Never guess from verse contents or change stored file IDs during recovery. */
(function(root){
  const utf8 = new TextDecoder("utf-8",{fatal:true,ignoreBOM:true});
  const encoder = new TextEncoder();
  const western = new TextDecoder("windows-1252");
  const windowsBytes = new Map();
  for(let byte=0;byte<256;byte++)windowsBytes.set(western.decode(Uint8Array.of(byte)),byte);
  const hangul = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/;
  function bytes(value,windows){
    const result=[];
    for(const character of value){
      const code=character.codePointAt(0);
      const byte=windows?windowsBytes.get(character):code<256?code:undefined;
      if(byte===undefined)return null;
      result.push(byte);
    }
    return Uint8Array.from(result);
  }
  function run(value){
    let candidates=[value];
    for(let round=0;round<3;round++){
      const next=[];
      for(const candidate of candidates)for(const windows of [false,true]){
        const raw=bytes(candidate,windows);if(!raw)continue;
        try{
          const decoded=utf8.decode(raw),encoded=encoder.encode(decoded);
          if(decoded===candidate||encoded.length!==raw.length||encoded.some((b,i)=>b!==raw[i]))continue;
          if(hangul.test(decoded)&&!/[\u0000-\u001f\u007f-\u009f\ufffd]/.test(decoded))return decoded.normalize("NFC");
          if(!next.includes(decoded))next.push(decoded);
        }catch{} // Invalid UTF-8 is not a reversible UTF-8 filename.
      }
      candidates=next;if(!next.length)break;
    }
    return value;
  }
  function repair(value){
    // Keep correctly decoded Korean/path segments and repair only byte-like runs.
    let output="",segment="";
    const flush=()=>{output+=run(segment);segment="";};
    for(const character of String(value??"")){
      if(character.codePointAt(0)<256||windowsBytes.has(character))segment+=character;
      else{flush();output+=character;}
    }
    flush();return output.normalize("NFC");
  }
  const api={repair};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.BibleFilenames=api;
})(typeof globalThis!=="undefined"?globalThis:self);
