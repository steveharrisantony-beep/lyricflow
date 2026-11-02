import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:650}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-letters';await mkdir(shots,{recursive:true});
try{
 await page.route('**/letter-qa.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#07090e"><canvas width="1200" height="650"></canvas></body></html>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/letter-qa.html`);
 await page.addStyleTag({url:'/node_modules/@fontsource/noto-sans-devanagari/800.css'});
 await page.addStyleTag({url:'/node_modules/@fontsource/anton/400.css'});
 const results=await page.evaluate(async()=>{
  const [{drawKineticLyrics},{buildCues},{analyzeLyricWords},{TEMPLATES},{paletteFromArtworkPixels},{preloadLyricFonts},{LYRIC_TRANSITIONS,ALL_THEME_TRANSITIONS},{drawSceneTransition}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),
   import('/src/visualization/cinematic/contrast.ts'),import('/src/visualization/cinematic/fonts.ts'),import('/src/visualization/cinematic/lyricTransitions.ts'),import('/src/visualization/cinematic/transitions.ts')]);
  await preloadLyricFonts(['impact']);await document.fonts.load('400 72px Anton','Carry');await document.fonts.load('800 72px "Noto Sans Devanagari"','संगीत');
  const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');
  const pixels=new Uint8ClampedArray(Array.from({length:120},(_,i)=>i<40?[220,35,70,255]:i<80?[20,120,215,255]:[25,175,95,255]).flat());
  const palette=paletteFromArtworkPixels(pixels),scene={...TEMPLATES[0],start:0,end:8,variation:0,section:0,reason:'QA'};
  const [cue]=buildCues([{time:0,text:'Carry the light home',words:[{text:'Carry',start:0,end:1,timing:'sourced'},{text:'the',start:1,end:1.5,timing:'sourced'},{text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}]}],[]);
  const paints=[],fill=c.fillText.bind(c);c.fillText=(...args)=>{paints.push(c.fillStyle);fill(...args);};
  const draw=(time,overrides={})=>{
   paints.length=0;c.resetTransform();c.fillStyle='#07090e';c.fillRect(0,0,1200,650);
   return drawKineticLyrics({c,scene,cue,time,mode:'original',w:1200,h:650,intensity:1,reduced:false,emphasis:analyzeLyricWords([cue]),enabledFonts:['impact'],enabledMotions:['wave'],enabledLyricTransitions:[],
    wordStylesEnabled:true,currentWordStyle:'classic-focus',albumPalette:palette,forceLightText:true,placementMode:'center',fillPaceMode:'word',...overrides});
  };
  const line=draw(1,{cue:{...cue,timing:'estimated'}}),lineColors=new Set(paints);
  if(lineColors.size!==1||!palette.colors.includes(line.baseColor))throw Error('Line-only ink is not the pale album palette');
  const sung=draw(3.6);const afterColors=new Set(paints),a=canvas.toDataURL();draw(3.75);const b=canvas.toDataURL();
  if(afterColors.size!==1||!afterColors.has(sung.activeColor)||a===b)throw Error('Uniform vibrant line accent or persistent letter motion missing');
  const hindi='संगीत दिल को छू ले';
  const [hindiCue]=buildCues([{time:0,text:hindi}],[]);
  const shaped=draw(1.1,{cue:hindiCue});
  if(shaped.letterMode!=='shaped'||shaped.glyphs!==5)throw Error('Hindi was split into letters');
  for(const item of LYRIC_TRANSITIONS)if(draw(.15,{enabledLyricTransitions:[item.id]}).lyricTransition!==item.id)throw Error('Lyric transition selection failed');
  const previous=document.createElement('canvas');previous.width=1200;previous.height=650;previous.getContext('2d').fillRect(0,0,1200,650);
  for(const kind of ALL_THEME_TRANSITIONS)drawSceneTransition(c,previous,1200,650,.4,kind);
  window.letterQA={draw,hindiCue};
  return {letters:draw(1).glyphs,hindiGlyphs:shaped.glyphs,sungColors:afterColors.size,transitions:LYRIC_TRANSITIONS.length+ALL_THEME_TRANSITIONS.length};
 });
 assert.equal(results.letters,17);assert.equal(results.hindiGlyphs,5);assert.equal(results.sungColors,1);assert.equal(results.transitions,13);
 for(const [name,time,mode] of [['album-unread',.2,'normal'],['album-sung',3.7,'normal'],['hindi-shaped',1.3,'hindi'],['line-synced',1,'line']]){
  await page.evaluate(([time,mode])=>window.letterQA.draw(time,mode==='hindi'?{cue:window.letterQA.hindiCue}:mode==='line'?{cue:{...window.letterQA.hindiCue,text:'Carry the light home',timing:'estimated'}}:{}),[time,mode]);
  await page.locator('canvas').screenshot({path:`${shots}/${name}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS browser: persistent letters, intact Hindi shaping, pale unread/line ink, one vibrant accent per sung line and all 13 transitions.');
}finally{await browser.close();await server.close();}
