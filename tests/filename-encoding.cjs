const assert=require('node:assert/strict');
const {repair}=require('../source/filename-encoding.js');
const latin=value=>Buffer.from(value,'utf8').toString('latin1');
const windows=value=>new TextDecoder('windows-1252').decode(new TextEncoder().encode(value));
for(const name of ['개역개정.bdb','새번역.bdb','표준새번역.bdb','국한문병기.bdb','원전분해.sdb','성경관주.cdb','새찬송가.hdb']){
 for(const normalized of [name,name.normalize('NFD')]){
  for(const broken of [latin(normalized),windows(normalized),latin(latin(normalized)),windows(windows(normalized))]){
   assert.equal(repair(broken),name);
   assert.equal(repair('자료/'+broken),'자료/'+name);
  }
  assert.equal(repair(normalized),name);
 }
}
for(const name of ['ESV.bdb','NAS2020.bdb','new_50.jpg','café.bdb','français.bdb','Ångström.bdb','Ελληνικά.bdb','notes.json','._개역개정.bdb','../bad.bdb'])assert.equal(repair(name),name);
assert.equal(repair(repair(latin('개역개정'.normalize('NFD')))),'개역개정');
console.log('PASS: reversible Korean UTF-8/NFD mojibake (Latin-1, Windows-1252, double encoding), mixed paths and NFC; valid international names preserved.');
