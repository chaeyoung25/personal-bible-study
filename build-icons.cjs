// Render our vector artwork to installable PNGs without remote assets.
const {chromium}=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({deviceScaleFactor:1});
  const svg=fs.readFileSync(path.join(__dirname,'source/app-icon.svg'),'utf8');
  for(const size of [180,192,512]) {
   await page.setViewportSize({width:size,height:size});
   await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`);
   await page.screenshot({path:path.join(__dirname,`source/app-icon-${size}.png`)});
  }
 } finally {await browser.close();}
})();
