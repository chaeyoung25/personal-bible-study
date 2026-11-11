const {chromium}=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),data=path.join(root,'data/bethlehem');
const find=name=>path.join(data,fs.readdirSync(data).find(f=>f.normalize('NFC')===name));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block'});
  page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8806');
  await page.locator('#localFiles').setInputFiles([find('개역개정.bdb'),find('ESV.bdb'),find('새찬송가.hdb'),path.join(root,'data/hymn_scores/new_50.jpg')]);
  await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('4개 파일'));
  await page.locator('#openReader').click();
  await page.locator('#cloudDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>state.notes.highlights&&state.panes?.length&&document.querySelector('.verse-text'));
  await page.evaluate(async()=>{state.versions=['개역개정.bdb','ESV.bdb'];state.comparisonLayout='aligned';state.book=43;state.chapter=3;renderVersionSelectors();await loadPassage();});
  for(const [name,width,height] of [['desktop',1440,960],['tablet',820,1180],['phone',390,844],['small',360,780]]){
   await page.setViewportSize({width,height});
   await page.waitForTimeout(100);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert(await page.locator('.active-pane .verse-text').first().isVisible());
   if(width<=700){
    for(const id of ['compactCloud','toggleStudy','compactHymns','compactTopics']){
     const box=await page.locator('#'+id).boundingBox();assert(box.height>=44);assert(box.x+box.width<=width);
    }
   }
   await page.screenshot({path:`/private/tmp/bible-design-${name}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#comparisonLayout').selectOption('flow');
  await page.screenshot({path:'/private/tmp/bible-design-reading.png'});
  await page.locator('#themeToggle').click();
  await page.screenshot({path:'/private/tmp/bible-design-dark.png'});
  await page.locator('#compactCloud').click();
  await page.screenshot({path:'/private/tmp/bible-design-drive.png'});
  await page.locator('#closeCloud').click();
  await page.locator('#cloudDialog').waitFor({state:'hidden'});
  await page.locator('#themeToggle').click();
  await page.locator('#compactHymns').click();
  await page.locator('#hymnSearch').fill('50');
  await page.locator('#hymnList button[data-number="50"]').click();
  await page.waitForFunction(()=>document.querySelector('#hymnScore img')?.naturalWidth>0);
  await page.screenshot({path:'/private/tmp/bible-design-hymn.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop/tablet/phone light/dark visual captures; no viewport overflow; mobile menu touch targets; Drive/hymn views.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
