import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-size-timing';await mkdir(shots,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');
 if(!localStorage.getItem('lyricflow.v3.guest.preferences'))localStorage.setItem('lyricflow.v3.guest.preferences',JSON.stringify({quality:'Performance',autoScenes:false,intensity:20}));
});
const lyrics=async()=>{
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
};
try{
 await page.route(/^http:\/\/127\.0\.0\.1:\d+\/music\//,route=>route.fulfill({json:{results:[]}}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:'networkidle'});await lyrics();
 const min=page.getByRole('slider',{name:'Minimum lyric font size',exact:true}),max=page.getByRole('slider',{name:'Maximum lyric font size',exact:true}),scale=page.getByRole('slider',{name:'Lyrics font size scale',exact:true});
 assert.equal(await min.inputValue(),'26');assert.equal(await max.inputValue(),'88');
 await min.press('End');assert.equal(await min.inputValue(),'72');assert.equal(await max.inputValue(),'88');assert.equal(await scale.inputValue(),'100');
 await max.press('Home');assert.equal(await max.inputValue(),'32');assert.equal(await min.inputValue(),'32');
 await scale.press('End');assert.equal(await scale.inputValue(),'180');assert.equal(await max.inputValue(),'32');assert.equal(await min.inputValue(),'32');
 await page.reload({waitUntil:'networkidle'});await lyrics();
 assert.equal(await scale.inputValue(),'180');assert.equal(await min.inputValue(),'32');assert.equal(await max.inputValue(),'32');
 for(const theme of ['Dark','Light']){
  await page.getByRole('tab',{name:'Others',exact:true}).click();await page.getByRole('button',{name:theme,exact:true}).click();await lyrics();
  for(const width of [390,800]){
   await page.setViewportSize({width,height:900});await lyrics();await max.scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const box=await max.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width);
   await page.screenshot({path:`${shots}/font-limits-${theme.toLowerCase()}-${width}.png`});
  }
 }
 const result=await page.evaluate(async()=>{
  const [{drawKineticLyrics,LYRIC_MOTIONS},{parseLRC},{buildCues,setLyricTimeline,getLyricState},{analyzeLyricWords},{TEMPLATES},{preloadLyricFonts}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/lyrics/lrc.ts'),import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),import('/src/visualization/cinematic/fonts.ts')]);
  await preloadLyricFonts(['impact']);
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);canvas.style.cssText='width:100vw;height:auto;background:#07090e';
  const c=canvas.getContext('2d'),paints=[],fill=c.fillText.bind(c);c.fillText=(...args)=>{paints.push({text:args[0],alpha:c.globalAlpha,size:Number(c.font.match(/([\d.]+)px/)?.[1])});fill(...args);};
  const scene={...TEMPLATES[0],start:0,end:60,variation:0,section:0,reason:'QA'};
  const [short]=buildCues([{time:0,text:'Stay'}],[],'',20);
  const draw=(cue,time,options={})=>{
   paints.length=0;c.resetTransform();c.globalAlpha=1;c.clearRect(0,0,canvas.width,canvas.height);
   return drawKineticLyrics({c,scene,cue,time,mode:'original',w:canvas.width,h:canvas.height,intensity:1,reduced:false,emphasis:analyzeLyricWords([cue]),enabledFonts:['impact'],enabledMotions:['wave'],placementMode:'center',...options});
  };
  let checks=0;
  for(const [w,h] of [[360,203],[800,1280],[1920,1080]])for(const [minFontSize,maxFontSize] of [[16,32],[48,64],[64,130]])for(const fontScale of [.5,1.8]){
   canvas.width=w;canvas.height=h;draw(short,2,{minFontSize,maxFontSize,fontScale,animated:false});
   if(paints.some(p=>p.size<minFontSize-.01||p.size>maxFontSize+.01))throw Error(`Font limits were not enforced: ${w}/${minFontSize}/${maxFontSize}/${fontScale}`);
   checks++;
  }
  canvas.width=1200;canvas.height=650;
  const cues=buildCues(parseLRC('[00:00]Hold this slow note\n[00:14]Next phrase\n[00:18]'),[],'',30);
  setLyricTimeline(cues);
  if(getLyricState(13.99).cue!==cues[0]||getLyricState(18.01).cue!==null)throw Error('Slow line or instrumental clear timing failed');
  const known=buildCues(parseLRC('[00:00]<00:00>Hold <00:03>on<00:12>\n[00:15]Next'),[])[0];
  for(const motion of LYRIC_MOTIONS)for(const [cue,time] of [[cues[0],13.99],[known,11.99]]){
   draw(cue,time,{enabledMotions:[motion]});
   if(!paints.length||paints.some(p=>p.alpha<.999))throw Error(`Animation hid a lyric before vocal completion: ${motion}`);
  }
  window.fontTimingQA={draw,cue:cues[0]};setLyricTimeline([]);
  return {fontChecks:checks,motions:LYRIC_MOTIONS.length};
 });
 assert.equal(result.fontChecks,18);assert.equal(result.motions,25);
 await page.evaluate(()=>window.fontTimingQA.draw(window.fontTimingQA.cue,13.99,{enabledMotions:['wave']}));
 await page.locator('canvas').screenshot({path:`${shots}/slow-line-before-end.png`});
 assert.deepEqual(errors,[]);console.log('PASS browser: independent saved font controls, phone/tablet light/dark layouts, 18 pixel-bound checks and no early exit in all 25 animations.');
}catch(error){
 console.error(await page.evaluate(()=>({settings:document.querySelector('[role="dialog"]')?.textContent?.slice(0,2200),sliders:[...document.querySelectorAll('input[type="range"]')].map(e=>e.getAttribute('aria-label'))})));
 await page.screenshot({path:`${shots}/failure.png`});throw error;
}finally{await browser.close();await server.close();}
