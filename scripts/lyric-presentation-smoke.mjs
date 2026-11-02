import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

// Run in one process so the ephemeral dev server and browser share a network namespace.
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
const port=server.httpServer.address().port;
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.setDefaultTimeout(10000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{if(msg.type()==='error')console.log('browser console:',msg.text());});
page.on('requestfailed',req=>console.log('request failed:',req.url(),req.failure()?.errorText));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');
 if(!localStorage.getItem('lyricflow.extendedSettings.v1'))localStorage.setItem('lyricflow.extendedSettings.v1',JSON.stringify({themeMode:'dark'}));
});
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-presentation';
try{
 await page.route(/^http:\/\/127\.0\.0\.1:\d+\/music\//,route=>route.fulfill({json:{results:[]}}));
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 const animations=page.getByRole('switch',{name:'Lyric animations',exact:true});
 const styles=page.getByRole('switch',{name:'Current word styles',exact:true});
 assert.equal(await page.getByLabel('Lyric animation',{exact:true}).locator('option').count(),21);
 assert.equal(await page.getByLabel('Current word style',{exact:true}).locator('option').count(),10);
 await page.getByLabel('Current word style',{exact:true}).selectOption('ripple');
 await animations.uncheck();assert.equal(await styles.isChecked(),true);
 assert.equal(await page.getByLabel('Lyric animation',{exact:true}).isDisabled(),true);
 await styles.uncheck();
 await page.reload({waitUntil:'networkidle'});
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 assert.equal(await animations.isChecked(),false);assert.equal(await styles.isChecked(),false);
 await animations.check();await styles.check();
 await page.getByLabel('Lyric animation',{exact:true}).selectOption('ribbon');
 await page.getByLabel('Current word style',{exact:true}).selectOption('halo');
 await mkdir(shots,{recursive:true});
 for(const [width,height] of [[390,844],[800,1280],[1280,800]]){
  await page.setViewportSize({width,height});
  // Switching to the compact settings sheet is responsive to viewport changes.
  if(!await page.getByLabel('Current word style',{exact:true}).isVisible()){
   await page.getByRole('button',{name:'Settings',exact:true}).click();
  }
  await page.getByLabel('Current word style',{exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const fields=await page.locator('select[aria-label="Current word style"],select[aria-label="Lyric animation"]').evaluateAll(nodes=>nodes.map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:innerWidth})));
  assert.ok(fields.every(field=>field.left>=0&&field.right<=field.width));
  await page.screenshot({path:`${shots}/settings-${width}.png`});
 }
 // Exercise the real canvas renderer with every effect on browser Canvas 2D.
 const qa=await page.evaluate(async()=>{
  const [{drawKineticLyrics,LYRIC_MOTIONS},{CURRENT_WORD_STYLES},{buildCues},{analyzeLyricWords},{TEMPLATES},{preloadLyricFonts}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/visualization/cinematic/currentWordStyles.ts'),
   import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),import('/src/visualization/cinematic/fonts.ts')]);
  await preloadLyricFonts(['impact']);
  const [cue]=buildCues([{time:0,text:'Carry the light home',words:[{text:'Carry',start:0,end:1,timing:'sourced'},{text:'the',start:1,end:1.5,timing:'sourced'},{text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}]}],[]);
  const scene={...TEMPLATES[0],start:0,end:12,variation:0,section:0,reason:'fixture'};
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
  document.body.replaceChildren(canvas);canvas.style.cssText='width:100vw;height:auto;background:#071326';
  const c=canvas.getContext('2d'),emphasis=analyzeLyricWords([cue]);
  let count=0;
  for(const motion of LYRIC_MOTIONS)for(const style of CURRENT_WORD_STYLES){
   c.resetTransform();c.clearRect(0,0,960,540);
   const result=drawKineticLyrics({c,scene,cue,time:.45,mode:'original',w:960,h:540,intensity:1,reduced:false,emphasis,
    enabledMotions:[motion],enabledFonts:['impact'],wordStylesEnabled:true,currentWordStyle:style.id,placementMode:'center',fillPaceMode:'word'});
   if(result.drawn!==4)throw Error(`Missing words ${motion}/${style.id}`);
   count++;
  }
  window.lyricQA={draw:(motion,style,time)=>{
   c.resetTransform();c.clearRect(0,0,960,540);
   c.fillStyle='#071326';c.fillRect(0,0,960,540);
   return drawKineticLyrics({c,scene,cue,time,mode:'original',w:960,h:540,intensity:1,reduced:false,emphasis,
    enabledMotions:[motion],enabledFonts:['impact'],wordStylesEnabled:true,currentWordStyle:style,placementMode:'center',fillPaceMode:'word'});
  }};
  return count;
 });
 assert.equal(qa,200);
 for(const [motion,style] of [['ribbon','halo'],['hinge','brackets'],['cascade','ribbon'],['orbit','sparkle']]){
  await page.evaluate(([motion,style])=>window.lyricQA.draw(motion,style,.45),[motion,style]);
  await page.locator('canvas').screenshot({path:`${shots}/${motion}-${style}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS browser: 20 animations × 10 styles, independent controls, stored toggles, and 390/800/1280px layouts.');
}catch(error){
 console.log({errors,body:(await page.locator('body').innerText()).slice(0,1600)});
 throw error;
}finally{await browser.close();await server.close();}
