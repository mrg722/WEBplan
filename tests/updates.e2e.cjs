// Isolated local upgrade test; never accesses the published site or personal profiles.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');let release=8;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let content=await fs.readFile(file);
  if(file.endsWith('sw.js'))content=Buffer.from(content.toString().replace('CACHE_VERSION = 8','CACHE_VERSION = '+release));
  if(file.endsWith('app.js'))content=Buffer.from(content.toString().replaceAll('Cree en ti','Cree en ti · edición '+release));
  const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844}});
  await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();
  assert.match(await p.locator('.mobile-brand').innerText(),/edición 8/);
  await p.evaluate(()=>localStorage.setItem('upgrade-preserve-test','conservado'));
  release=9;await p.reload();
  await p.waitForFunction(()=>document.querySelector('.mobile-brand')?.textContent.includes('edición 9'),{},{timeout:20000});
  assert.equal(await p.evaluate(()=>localStorage.getItem('upgrade-preserve-test')),'conservado');
  console.log('PASS: single reload discovers and activates next release, automatically refreshes UI, preserves local data.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
