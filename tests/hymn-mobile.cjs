const {chromium}=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), data=path.join(root,'data/bethlehem');
const find=name=>path.join(data,fs.readdirSync(data).find(file=>file.normalize('NFC')===name));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8806');
  await page.locator('#localFiles').setInputFiles([find('개역개정.bdb'),find('새찬송가.hdb'),path.join(root,'data/hymn_scores/new_50.jpg'),path.join(root,'data/hymn_scores/new_51.jpg')]);
  await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('4개 파일'));
  await page.locator('#openReader').click();
  await page.locator('#compactHymns').click();
  await page.locator('#hymnSearch').fill('50');
  await page.waitForFunction(()=>document.querySelector('#hymnList button[data-number="50"]'));
  await page.locator('#hymnList button[data-number="50"]').click();
  assert.equal(await page.locator('#toggleHymnSearch').getAttribute('aria-expanded'),'false');
  await page.waitForFunction(()=>document.querySelector('#hymnScore img')?.naturalWidth>0);
  for(const width of [360,390,600]){
   await page.setViewportSize({width,height:844});
   await page.locator('#scoreFit').click();
   await page.waitForTimeout(100);
   const m=await page.evaluate(()=>{
    const d=document.querySelector('#hymnDialog').getBoundingClientRect(),a=document.querySelector('#hymnScore').getBoundingClientRect(),i=document.querySelector('#hymnScore img').getBoundingClientRect();
    return {dw:d.width,dh:d.height,ah:a.height,iw:i.width,ih:i.height,aw:a.width};
   });
   assert(Math.abs(m.dw-width)<2);assert(m.dh>=840);assert(m.ah>500,JSON.stringify(m));assert(m.iw<=m.aw&&m.ih<=m.ah,JSON.stringify(m));
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#scoreWidth').click();
  const before=await page.locator('#hymnScore img').evaluate(el=>el.width);
  await page.locator('#scoreZoomIn').click();
  assert(await page.locator('#hymnScore img').evaluate(el=>el.width)>before);
  await page.locator('#showLyrics').click();assert(await page.locator('#hymnLyrics').isVisible());
  await page.locator('#showScore').click();assert(await page.locator('#hymnScore').isVisible());
  await page.locator('#nextHymn').click();
  await page.waitForFunction(()=>document.querySelector('#hymnTitle').textContent.startsWith('51장'));
  await page.locator('#previousHymn').click();
  await page.waitForFunction(()=>document.querySelector('#hymnTitle').textContent.startsWith('50장'));
  await page.locator('#scoreFit').click();
  await page.screenshot({path:'/private/tmp/bible-hymn-mobile.png'});
  await page.locator('#hymnReadingMode').click();
  assert(await page.locator('#hymnDialog').evaluate(el=>el.getBoundingClientRect().top)>200);
  await page.locator('#toggleHymnSearch').click();assert(await page.locator('#hymnSearch').isVisible());
  await page.locator('#clearHymnSearch').click();
  await page.locator('#hymnSearch').fill('내게 있는');
  await page.waitForFunction(()=>document.querySelector('#hymnList').textContent.includes('내게 있는'));
  await page.setViewportSize({width:820,height:1100});
  assert(await page.locator('#hymnSearch').isVisible());
  await page.locator('#closeHymns').click();
  assert(await page.locator('.active-pane .verse-text').first().isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile hymn search/select, keyboard blur, fullscreen and Bible split, fit/width/zoom, lyrics, previous/next, tablet and close to Bible.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
