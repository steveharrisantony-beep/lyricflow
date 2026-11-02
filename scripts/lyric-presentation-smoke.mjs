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
page.setDefaultTimeout(20000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{if(msg.type()==='error')console.log('browser console:',msg.text());});
page.on('requestfailed',req=>console.log('request failed:',req.url(),req.failure()?.errorText));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');
 if(!localStorage.getItem('lyricflow.v3.guest.preferences'))localStorage.setItem('lyricflow.v3.guest.preferences',JSON.stringify({quality:'Performance',autoScenes:false,enabledScenes:['holographic-tide'],intensity:20}));
 if(!localStorage.getItem('lyricflow.extendedSettings.v1'))localStorage.setItem('lyricflow.extendedSettings.v1',JSON.stringify({themeMode:'dark'}));
});
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-presentation';
try{
 await page.route(/^http:\/\/127\.0\.0\.1:\d+\/music\//,route=>route.fulfill({json:{results:[]}}));
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 const openWindow=async name=>{
  const summary=page.locator('summary').filter({hasText:new RegExp('^'+name+'(?:\\s|$)')}).first();
  if(!await summary.evaluate(node=>node.parentElement.open))await summary.click();
 };
 const animations=page.getByRole('switch',{name:'Lyric animations',exact:true});
 const styles=page.getByRole('switch',{name:'Current word styles',exact:true});
 const wordAnimations=page.getByRole('switch',{name:'Current word animations',exact:true});
 assert.equal(await page.locator('summary').filter({hasText:/^Lyric transitions/}).count(),0);
 for(const name of ['Theme selection','Theme colour palette','Video lyric placement','Theme lyric placement','Lyric font','Lyric animation','Current word style']){
  assert.equal(await page.locator(`select[aria-label="${name}"]`).count(),0);
 }
 await openWindow('Animations');
 await page.getByRole('switch',{name:'Ship',exact:true}).uncheck();
 const saved=await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1'));
 await page.getByRole('button',{name:'Preview Ship',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.waitForFunction(()=>{const c=document.querySelector('.option-preview-canvas');return c?.width>0;});
 assert.equal(await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1')),saved);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.option-preview-dialog').count(),0);
 assert.equal(await page.getByRole('switch',{name:'Ship',exact:true}).isChecked(),false);
 await openWindow('Current word styles');
 assert.equal(await page.locator('input.option-toggle[role="switch"]').count()>38,true);
 await page.getByRole('switch',{name:'Classic Focus',exact:true}).uncheck();
 await animations.uncheck();assert.equal(await styles.isChecked(),true);await styles.uncheck();
 await page.reload({waitUntil:'networkidle'});
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 assert.equal(await animations.isChecked(),false);assert.equal(await styles.isChecked(),false);
 await openWindow('Animations');await openWindow('Current word styles');
 assert.equal(await page.getByRole('switch',{name:'Ship',exact:true}).isChecked(),false);
 assert.equal(await page.getByRole('switch',{name:'Classic Focus',exact:true}).isChecked(),false);
 await animations.check();await styles.check();
 await openWindow('Current word animations');
 const animationWindow=page.locator('details').filter({has:page.locator('summary',{hasText:/^Current word animations/})}).first();
 assert.equal(await animationWindow.locator('input[role="switch"]').count(),3);
 for(const name of ['Lift','Glow','Zoom']){
  const option=page.getByRole('switch',{name:`Word animation · ${name}`,exact:true});
  await option.uncheck();const before=await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1'));
  await page.getByRole('button',{name:`Preview Word animation · ${name}`,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lyricflow.extendedSettings.v1')),before);
  await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
  await option.check();
 }
 await wordAnimations.uncheck();await page.reload({waitUntil:'networkidle'});
 if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 assert.equal(await wordAnimations.isChecked(),false);await wordAnimations.check();
 await mkdir(shots,{recursive:true});
 await openWindow('Fonts');
 const fontWindow=page.locator('details').filter({has:page.locator('summary', {hasText:/^Fonts$/})}).first();
 await fontWindow.locator('button.option-preview-button').first().click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
 await openWindow('On video');
 await page.getByRole('button',{name:'Preview Video · Bottom-Right Cinema',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
 for(const theme of ['Dark','Light']){
  await page.getByRole('tab',{name:'Others',exact:true}).click();await page.getByRole('button',{name:theme,exact:true}).click();
  await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
  for(const [width,height] of [[390,844],[800,1280],[1280,800]]){
   await page.setViewportSize({width,height});
   if(!await page.getByRole('tab',{name:'Lyrics',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
   await openWindow('Current word styles');
   await page.getByRole('switch',{name:'Classic Focus',exact:true}).scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const fields=await page.locator('#settings-page-lyrics .preview-setting').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:innerWidth})));
   assert.ok(fields.every(field=>field.left>=0&&field.right<=field.width));
   assert.equal(await page.locator('#settings-page-lyrics input.option-toggle').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().width>=32)),true);
   await page.screenshot({path:`${shots}/selections-${theme.toLowerCase()}-${width}.png`});
   console.log(`PASS layout ${theme.toLowerCase()} ${width}px`);
   await page.getByRole('button',{name:'Preview Classic Focus',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
   assert.equal(await page.evaluate(()=>document.querySelector('.option-preview-dialog').getBoundingClientRect().right<=innerWidth),true);
   await page.waitForTimeout(250);
   await page.screenshot({path:`${shots}/preview-${theme.toLowerCase()}-${width}.png`});
   await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
  }
 }
 await page.getByRole('tab',{name:'Background',exact:true}).click();
 await openWindow('Enabled themes');
 const themeRow=page.locator('.theme-selection').first();
 await themeRow.locator('summary').click();
 assert.ok(await themeRow.getByRole('radio').count()>=4);
 await themeRow.getByRole('radio').nth(1).check();
 assert.equal(await page.getByRole('switch',{name:'Auto-randomize colour palette',exact:true}).isChecked(),false);
 await themeRow.getByRole('button',{name:/Preview .*Liquid Filigree/}).click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.screenshot({path:`${shots}/theme-palette-preview.png`});
 await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
 await openWindow('Theme transitions');
 await page.getByRole('button',{name:'Preview Theme transition · Refraction rings',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.waitForTimeout(250);await page.screenshot({path:`${shots}/theme-transition.png`});
 await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
 await page.getByRole('tab',{name:'Lyrics',exact:true}).click();
 await openWindow('Animations');
 await page.getByRole('button',{name:'Preview Alternating Sides',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.option-preview-canvas')?.width>0);
 await page.waitForTimeout(250);await page.screenshot({path:`${shots}/choreography-preview.png`});
 await page.getByRole('button',{name:'Close preview',exact:true}).dispatchEvent('click');
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
 assert.equal(qa,60);
 await page.evaluate(()=>window.lyricQA.draw('wave','underline',.9));
 await page.locator('canvas').screenshot({path:`${shots}/wave-early.png`});
 await page.evaluate(()=>window.lyricQA.draw('wave','underline',3.4));
 await page.locator('canvas').screenshot({path:`${shots}/wave-late.png`});
 for(const [motion,style] of [['wave','underline'],['hinge','classic-focus'],['cascade','classic-capsule'],['orbit','halo']]){
  await page.evaluate(([motion,style])=>window.lyricQA.draw(motion,style,.45),[motion,style]);
  await page.locator('canvas').screenshot({path:`${shots}/${motion}-${style}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS browser: 12 letter choreographies × 5 static styles, isolated previews, Lift/Glow/Zoom previews and switches, saved selection windows, nested palettes, and light/dark layouts at 390/800/1280px.');
}catch(error){
 console.log({errors,body:(await page.locator('body').innerText()).slice(0,1600)});
 throw error;
}finally{await browser.close();await server.close();}
