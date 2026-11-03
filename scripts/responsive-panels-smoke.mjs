import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

// Exercise the production settings/player without accounts or remote media.
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 let file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({
 ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),
 args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']
});
const page=await browser.newPage({viewport:{width:800,height:1000},colorScheme:'dark'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');
 // Keep canvas work paused: this test measures panel layout, not rendering FPS.
 Object.defineProperty(document,'hidden',{get:()=>true});
 // Test the app's fullscreen layout at exact emulated viewport sizes.
 HTMLElement.prototype.requestFullscreen=async()=>{};
});
await page.route('**/music/**',route=>route.fulfill({status:404,json:{detail:'Offline layout fixture'}}));
await page.route('https://**/*',route=>route.fulfill({status:404,body:''}));
const shots=process.env.UI_SCREENSHOTS_DIR;
if(shots)fs.mkdirSync(shots,{recursive:true});
const shot=async name=>{if(shots)await page.screenshot({path:path.join(shots,name+'.png')});};
const settings=page.locator('#app-settings');
const openSettings=async()=>{if(!await settings.isVisible())await page.locator('.app-header .settings-trigger').click();};
const reachable=async(control,panel,label)=>{
 assert.equal(await control.isVisible(),true,label+' is visible');
 await control.scrollIntoViewIfNeeded();
 const a=await control.boundingBox(),b=await panel.boundingBox();
 assert.ok(a&&b&&a.width>0&&a.height>0,label+' has size');
 assert.ok(a.x>=b.x-2&&a.x+a.width<=b.x+b.width+2,label+' fits horizontally');
 assert.ok(a.y>=b.y-2&&a.y+a.height<=b.y+b.height+2,label+' can scroll into the panel');
 assert.ok(await control.evaluate(el=>{
  const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return Boolean(hit&&(el===hit||el.contains(hit)));
 }),label+' is not covered or clipped');
};
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.locator('.spotify-player-card').waitFor();
 const rate=8000,wav=Buffer.alloc(44+rate*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 await page.getByLabel('Select local audio file').setInputFiles({name:'A long fixture artist - An original track title that wraps across several lines.wav',mimeType:'audio/wav',buffer:wav});
 const viewports=[[320,568],[390,844],[568,320],[844,390],[800,1280],[1024,600],[1440,1000],[1920,1080]];
 for(const [width,height] of viewports){
  await page.setViewportSize({width,height});
  await openSettings();
  await page.getByRole('tab',{name:'Others',exact:true}).click();
  await page.getByRole('button',{name:width===390||width===844?'Light':'Dark',exact:true}).click();
  await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
  await settings.locator('.settings-page:not([hidden]) details').evaluateAll(nodes=>nodes.forEach(n=>{n.open=true;}));
  const panel=await settings.boundingBox();
  assert.ok(panel.width>=Math.min(width-32,width<=620?width-16:width<=1100?680:420)-2,'settings use available width');
  if(width<=620||height<=540){
   const before=await settings.locator('.settings-heading').boundingBox();
   const scroll=await settings.evaluate(el=>{el.scrollTop=240;return el.scrollTop;});
   assert.ok(scroll>100,'the complete mobile sheet scrolls');
   const after=await settings.locator('.settings-heading').boundingBox();
   assert.ok(after.y<before.y-100,'mobile settings header scrolls away');
   assert.equal(await settings.locator('.settings-pages').evaluate(el=>el.scrollTop),0,'no nested mobile content scroller');
  }
  await page.getByRole('tab',{name:'Background',exact:true}).click();
  assert.equal(await settings.evaluate(el=>el.scrollTop),0,'switching sections returns to the top');
  if(shots&&[390,844,1920].includes(width))await shot('settings-'+width+'x'+height);
  if(await page.locator('.settings-close').isVisible())await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  await page.locator('.performance-mode').waitFor();
  const toolbar=page.locator('.fullscreen-toolbar');
  await toolbar.getByRole('button',{name:'Player',exact:true}).click();
  const player=page.locator('#fullscreen-player-window');
  const controls=[
   player.getByRole('button',{name:'Shuffle queue',exact:true}),
   player.getByRole('button',{name:'Previous track',exact:true}),
   player.getByRole('button',{name:'Play track',exact:true}),
   player.getByRole('button',{name:'Next track',exact:true}),
   player.getByRole('button',{name:'Repeat track',exact:true}),
   player.getByRole('button',{name:'Search',exact:true}),
   player.getByRole('button',{name:'Change source',exact:true}),
   player.getByRole('button',{name:/^Queue/}),
   player.getByRole('slider',{name:'Volume',exact:true}),
   player.getByRole('group',{name:'Background mode',exact:true})
  ];
  for(let i=0;i<controls.length;i++)await reachable(controls[i],player,`${width}x${height} control ${i}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no page overflow');
  if(shots&&[390,844].includes(width))await shot('player-'+width+'x'+height);
  await toolbar.getByRole('button',{name:'Settings',exact:true}).click();
  const full=await settings.boundingBox();
  assert.ok(full.width>=Math.min(680,width-24)-2,'fullscreen settings are wider');
  await page.keyboard.press('Escape');
  await toolbar.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  assert.equal(await page.locator('audio').count(),1,'one audio player survives fullscreen changes');
  console.log(`PASS ${width}x${height}: settings size/scrolling and all fullscreen player controls reachable`);
 }
 assert.deepEqual(errors,[],'no browser errors');
}finally{await browser.close();server.close();}
