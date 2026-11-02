import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-layout';await mkdir(shots,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');
 if(!localStorage.getItem('lyricflow.v3.guest.preferences'))localStorage.setItem('lyricflow.v3.guest.preferences',JSON.stringify({quality:'Performance',autoScenes:false,intensity:20}));
});
const openLyrics=async()=>{
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
};
try{
 await page.route(/^http:\/\/127\.0\.0\.1:\d+\/music\//,route=>route.fulfill({json:{results:[]}}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:'networkidle'});await openLyrics();
 const values={'Horizontal lyrics padding':[2,0],'Vertical lyrics padding':[2,8],'Maximum lyrics width':[76,45],'Maximum lyrics height':[40,25]};
 for(const [label,[initial,target]] of Object.entries(values)){
  const control=page.getByRole('slider',{name:label,exact:true});assert.equal(await control.inputValue(),String(initial));
  await control.focus();await control.press('Home');
  while(Number(await control.inputValue())<target)await control.press('ArrowRight');
  assert.equal(await control.inputValue(),String(target));
 }
 await page.reload({waitUntil:'networkidle'});await openLyrics();
 for(const [label,[,target]] of Object.entries(values))assert.equal(await page.getByRole('slider',{name:label,exact:true}).inputValue(),String(target));
 const videoSummary=page.locator('summary').filter({hasText:/^On video$/});await videoSummary.click();
 const saved=await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1'));
 await page.getByRole('button',{name:'Preview Video · Bottom-Right Cinema',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1')),saved);
 for(const theme of ['Dark','Light']){
  await page.getByRole('tab',{name:'Others',exact:true}).click();await page.getByRole('button',{name:theme,exact:true}).click();await openLyrics();
  for(const width of [390,800,1280]){
   await page.setViewportSize({width,height:900});await openLyrics();await page.getByRole('slider',{name:'Maximum lyrics height',exact:true}).scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const label of Object.keys(values)){
    const box=await page.getByRole('slider',{name:label,exact:true}).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width);
   }
   await page.screenshot({path:`${shots}/controls-${theme.toLowerCase()}-${width}.png`});
  }
 }
 const result=await page.evaluate(async()=>{
  const [{drawKineticLyrics,LYRIC_MOTIONS},{resolveLyricBox},{buildCues},{analyzeLyricWords},{TEMPLATES},{preloadLyricFonts}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/lyrics/lyricLayout.ts'),import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),import('/src/visualization/cinematic/fonts.ts')]);
  await preloadLyricFonts(['impact']);
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);canvas.style.cssText='width:100%;height:auto;background:#07090e';
  const c=canvas.getContext('2d'),paints=[],fill=c.fillText.bind(c);
  c.fillText=(...args)=>{
   const m=c.getTransform(),width=c.measureText(args[0]).width;
   paints.push({text:args[0],left:m.e-width*m.a/2,right:m.e+width*m.a/2,y:m.f});fill(...args);
  };
  const scene={...TEMPLATES[0],start:0,end:40,variation:0,section:0,reason:'QA'};
  const text='Let all the stars above the quiet city carry this long line safely home tonight';
  const words=text.split(' ').map((text,i)=>({text,start:i,end:i+1,timing:'sourced'}));
  const [cue]=buildCues([{time:0,text,words}],[],'',20),emphasis=analyzeLyricWords([cue]);
  const [hindi]=buildCues([{time:0,text:'धीरे बहती हवा और तारों की रोशनी में यह गीत घर तक चलता है'}],[],'',20);
  const draw=(options={})=>{
   paints.length=0;c.resetTransform();c.globalAlpha=1;c.clearRect(0,0,canvas.width,canvas.height);
   return drawKineticLyrics({c,scene,cue,time:3,mode:'original',w:canvas.width,h:canvas.height,intensity:1,reduced:false,emphasis,
    enabledFonts:['impact'],enabledMotions:['wave'],placementMode:'bottom-right',...options});
  };
  const placements=['left','right','center','bottom-left','bottom-right','top-left','alternating'];
  const sizes=[[390,844],[800,1280],[1280,720]];
  let alignmentChecks=0,boundChecks=0;
  for(const [w,h] of sizes){
   canvas.width=w;canvas.height=h;
   for(const placementMode of placements)for(const cueIndex of [0,1]){
    const box=resolveLyricBox(w,h,placementMode,undefined,cueIndex);
    const rendered=draw({placementMode,cueIndex,animated:false});
    if(rendered.drawn!==words.length||rendered.rows<2)throw Error(`Missing long-line words: ${placementMode}`);
    const rows=new Map();for(const p of paints){const key=p.y.toFixed(2),row=rows.get(key)||{left:Infinity,right:-Infinity};row.left=Math.min(row.left,p.left);row.right=Math.max(row.right,p.right);rows.set(key,row);}
    const anchors=[...rows.values()].map(row=>box.align==='left'?row.left:box.align==='right'?row.right:(row.left+row.right)/2);
    if(Math.max(...anchors)-Math.min(...anchors)>3)throw Error(`Rows are not ${box.align} aligned: ${placementMode}: ${anchors}`);
    alignmentChecks++;
   }
   for(const layout of [undefined,{horizontalPadding:0,verticalPadding:4,maxWidth:45,maxHeight:25}])for(const motion of LYRIC_MOTIONS)for(const time of [.2,3,19.99]){
    const box=resolveLyricBox(w,h,'bottom-right',layout);
    const rendered=draw({layout,time,enabledMotions:[motion],wordAnimationsEnabled:true,enabledWordAnimations:['zoom'],wordStylesEnabled:true,currentWordStyle:'classic-capsule'});
    if(rendered.drawn!==words.length)throw Error(`Lost words: ${motion}`);
    const pixels=c.getImageData(0,0,w,h).data;let ink=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){
     ink++;
     if(x<Math.floor(box.x)||x>=Math.ceil(box.x+box.width)||y<Math.floor(box.y)||y>=Math.ceil(box.y+box.height))throw Error(`Ink outside max dimensions: ${motion}`);
    }
    if(time===3&&ink<50)throw Error(`Unreadable hold: ${motion}`);
    boundChecks++;
   }
   const shaped=draw({cue:hindi});if(shaped.letterMode!=='shaped')throw Error('Connected script split');
  }
  canvas.width=960;canvas.height=540;
  const gallery=document.createElement('canvas');gallery.width=1440;gallery.height=680;
  const g=gallery.getContext('2d');g.fillStyle='#07090e';g.fillRect(0,0,1440,680);
  placements.slice(0,6).forEach((placement,i)=>{
   draw({placementMode:placement,animated:false,layout:{horizontalPadding:2,verticalPadding:2,maxWidth:55,maxHeight:35}});
   const box=resolveLyricBox(960,540,placement,{maxWidth:55,maxHeight:35});
   c.strokeStyle='#fb923c';c.lineWidth=1;c.strokeRect(box.x,box.y,box.width,box.height);
   const x=i%3*480,y=Math.floor(i/3)*340;g.drawImage(canvas,x,y+35,480,270);g.fillStyle='#e2e8f0';g.font='18px sans-serif';g.fillText(placement,x+12,y+24);
  });
  gallery.dataset.gallery='true';document.body.append(gallery);
  window.layoutQA={draw,canvas};return {alignmentChecks,boundChecks};
 });
 assert.equal(result.alignmentChecks,42);assert.equal(result.boundChecks,450);
 await page.locator('canvas[data-gallery]').screenshot({path:`${shots}/alignment-gallery.png`});
 assert.deepEqual(errors,[]);
 console.log(`PASS browser: saved independent padding/box controls; preview isolation; phone/tablet/desktop light and dark layouts; ${result.alignmentChecks} row-alignment checks; ${result.boundChecks} animation bounds checks; intact Hindi.`);
}finally{await browser.close();await server.close();}
