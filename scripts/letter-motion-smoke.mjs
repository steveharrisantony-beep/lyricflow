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
  const [{drawKineticLyrics,LYRIC_MOTIONS},{buildCues},{analyzeLyricWords},{TEMPLATES},{paletteFromArtworkPixels},{preloadLyricFonts},{ALL_THEME_TRANSITIONS},{drawSceneTransition},{CURRENT_WORD_STYLES}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),
   import('/src/visualization/cinematic/contrast.ts'),import('/src/visualization/cinematic/fonts.ts'),import('/src/visualization/cinematic/themeTransitions.ts'),import('/src/visualization/cinematic/transitions.ts'),import('/src/visualization/cinematic/currentWordStyles.ts')]);
  await preloadLyricFonts(['impact']);await document.fonts.load('400 72px Anton','Carry');await document.fonts.load('800 72px "Noto Sans Devanagari"','संगीत');
  const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');
  const pixels=new Uint8ClampedArray(Array.from({length:120},(_,i)=>i<40?[220,35,70,255]:i<80?[20,120,215,255]:[25,175,95,255]).flat());
  const palette=paletteFromArtworkPixels(pixels),scene={...TEMPLATES[0],start:0,end:8,variation:0,section:0,reason:'QA'};
  const [cue]=buildCues([{time:0,text:'Carry the light home',words:[{text:'Carry',start:0,end:1,timing:'sourced'},{text:'the',start:1,end:1.5,timing:'sourced'},{text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}]}],[]);
  const paints=[],glyphs=[],fill=c.fillText.bind(c);let measureBounds=false;
  c.fillText=(...args)=>{
   paints.push(c.fillStyle);const m=c.getTransform();
   const glyph={text:args[0],x:m.e,y:m.f,scale:Math.hypot(m.a,m.b),blur:c.shadowBlur};
   if(measureBounds){
    const ink=c.measureText(args[0]);
    glyph.corners=[[-ink.actualBoundingBoxLeft,-ink.actualBoundingBoxAscent],[ink.actualBoundingBoxRight,-ink.actualBoundingBoxAscent],[-ink.actualBoundingBoxLeft,ink.actualBoundingBoxDescent],[ink.actualBoundingBoxRight,ink.actualBoundingBoxDescent]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
   }
   glyphs.push(glyph);fill(...args);
  };
  const draw=(time,overrides={})=>{
   paints.length=0;glyphs.length=0;c.resetTransform();c.fillStyle='#07090e';c.fillRect(0,0,canvas.width,canvas.height);
   return drawKineticLyrics({c,scene,cue,time,mode:'original',w:canvas.width,h:canvas.height,intensity:1,reduced:false,emphasis:analyzeLyricWords([cue]),enabledFonts:['impact'],enabledMotions:['wave'],
    wordStylesEnabled:true,currentWordStyle:'classic-focus',albumPalette:palette,forceLightText:true,placementMode:'center',fillPaceMode:'word',...overrides});
  };
  const line=draw(1,{cue:{...cue,timing:'estimated'}}),lineColors=new Set(paints);
  if(lineColors.size!==1||!palette.colors.includes(line.baseColor))throw Error('Line-only ink is not the pale album palette');
  const sung=draw(3.6);const afterColors=new Set(paints),a=canvas.toDataURL();draw(3.75);const b=canvas.toDataURL();
  if(afterColors.size!==1||!afterColors.has(sung.activeColor)||a===b)throw Error('Uniform vibrant line accent or persistent letter motion missing');
  const wordOptions={animated:false,wordStylesEnabled:false,wordAnimationsEnabled:true,enabledWordAnimations:[]};
  draw(.5,wordOptions);const stillWord=canvas.toDataURL();
  for(const id of ['lift','zoom']){
   const result=draw(.5,{...wordOptions,enabledWordAnimations:[id]});
   if(result.wordAnimation!==id||canvas.toDataURL()===stillWord)throw Error(`Missing word animation: ${id}`);
  }
  for(const id of ['lift','zoom']){
   const options={...wordOptions,enabledWordAnimations:[id]};
   draw(0,options);const baseline=glyphs.slice(0,5);
   draw(.3,options);const early=glyphs.slice(0,5);
   draw(.65,options);const late=glyphs.slice(0,5);
   if(glyphs.length!==17)throw Error(`Word effect did not split Latin graphemes: ${id}`);
   if(id==='lift'){
    if(!(early[0].y<baseline[0].y-2&&early[1].y<baseline[1].y-2&&Math.abs(early[0].y-early[1].y)>1))throw Error('Lift letters do not overlap in a travelling wave');
    if(!(Math.abs(late[0].y-baseline[0].y)<.01&&late[4].y<baseline[4].y-2))throw Error('Lift crest did not travel to the final letters');
   }else{
    if(!(early[0].scale>baseline[0].scale*1.1&&early[1].scale>baseline[1].scale*1.05&&Math.abs(early[0].scale-early[1].scale)>.01))throw Error('Zoom letters do not overlap in a travelling wave');
    if(!(Math.abs(late[0].scale-baseline[0].scale)<.001&&late[4].scale>baseline[4].scale*1.1))throw Error('Zoom crest did not travel to the final letters');
   }
  }
  const glowOptions={...wordOptions,wordStylesEnabled:true,currentWordStyle:'orbit',wordAnimationsEnabled:false};
  draw(.22,glowOptions);const initialGlow=glyphs.slice(0,5);
  if(!(initialGlow[0].blur>3&&initialGlow[4].blur===3))throw Error('Glow did not start as a letter prefix');
  for(const time of [.5,.8,.96]){
   draw(time,glowOptions);
   if(glyphs[0].blur!==initialGlow[0].blur)throw Error('An earlier letter lost glow before word end');
  }
  if(!glyphs.slice(0,5).every(g=>g.blur>3))throw Error('Final letters did not join the held glow');
  draw(1.001,glowOptions);if(!glyphs.slice(0,5).every(g=>g.blur===3))throw Error('Glow leaked beyond the word boundary');
  const [indicWord]=buildCues([{time:0,text:'संगीत',words:[{text:'संगीत',start:0,end:1,timing:'sourced'}]}],[]);
  const wordEffects=[...['lift','zoom'].map(id=>({id,options:{...wordOptions,enabledWordAnimations:[id]}})),{id:'orbit',options:glowOptions}];
  for(const {id,options} of wordEffects){
   const shaped=draw(.5,{...options,cue:indicWord});
   if(shaped.glyphs!==1||glyphs.length!==1||glyphs[0].text!=='संगीत')throw Error(`Word effect broke Indic shaping: ${id}`);
   draw(.2,{...options,reduced:true});const still=glyphs.map(g=>[g.x,g.y,g.scale,g.blur]);
   draw(.8,{...options,reduced:true});
   if(JSON.stringify(still)!==JSON.stringify(glyphs.map(g=>[g.x,g.y,g.scale,g.blur])))throw Error(`Reduced motion word effect moved: ${id}`);
  }
  let combinations=0;
  for(const motion of LYRIC_MOTIONS)for(const style of CURRENT_WORD_STYLES)for(const id of ['lift','zoom']){
   const result=draw(1.8,{enabledMotions:[motion],wordStylesEnabled:true,currentWordStyle:style.id,wordAnimationsEnabled:true,enabledWordAnimations:[id]});
   if(result.drawn!==4||glyphs.map(g=>g.text).join('')!=='Carrythelighthome'||glyphs.some(g=>![g.x,g.y,g.scale,g.blur].every(Number.isFinite)))throw Error(`Broken composition ${motion}/${style.id}/${id}`);
   combinations++;
  }
  measureBounds=true;
  for(const [w,h] of [[360,203],[800,1280],[1920,1080]])for(const placementMode of ['top-left','bottom-right'])for(const {id,options} of wordEffects)for(const time of [.3,.65,.96]){
   canvas.width=w;canvas.height=h;
   draw(time,{...options,placementMode,fontScale:2});
   if(glyphs.some(g=>g.corners.some(p=>p.x<-.5||p.x>w+.5||p.y<-.5||p.y>h+.5)))throw Error(`Word wave clipped ink: ${id}/${w}/${placementMode}`);
  }
  measureBounds=false;canvas.width=1200;canvas.height=650;
  const hindi='संगीत दिल को छू ले';
  const [hindiCue]=buildCues([{time:0,text:hindi}],[]);
  const shaped=draw(1.1,{cue:hindiCue});
  if(shaped.letterMode!=='shaped'||shaped.glyphs!==5)throw Error('Hindi was split into letters');
  for(const time of [.05,1,5.99]){
   const result=draw(time,{cue:{...cue,end:6}});
   if(result.motionPhase!==(time<.1?'intro':time<5?'hold':'outro'))throw Error('Integrated choreography timing failed');
  }
  const previous=document.createElement('canvas');previous.width=1200;previous.height=650;previous.getContext('2d').fillRect(0,0,1200,650);
  for(const kind of ALL_THEME_TRANSITIONS)drawSceneTransition(c,previous,1200,650,.4,kind);
  window.letterQA={draw,hindiCue};
  return {letters:draw(1).glyphs,hindiGlyphs:shaped.glyphs,sungColors:afterColors.size,transitions:ALL_THEME_TRANSITIONS.length,combinations};
 });
 assert.equal(results.letters,17);assert.equal(results.hindiGlyphs,5);assert.equal(results.sungColors,1);assert.equal(results.transitions,7);assert.equal(results.combinations,200);
 for(const id of ['lift','zoom']){
  await page.evaluate(id=>window.letterQA.draw(.5,{animated:false,wordStylesEnabled:false,wordAnimationsEnabled:true,enabledWordAnimations:[id]}),id);
  await page.locator('canvas').screenshot({path:`${shots}/word-${id}.png`});
 }
 await page.evaluate(()=>window.letterQA.draw(.5,{animated:false,wordStylesEnabled:true,currentWordStyle:'orbit',wordAnimationsEnabled:false,enabledWordAnimations:[]}));
 await page.locator('canvas').screenshot({path:`${shots}/word-orbit.png`});
 for(const [name,time,mode] of [['album-unread',.2,'normal'],['album-sung',3.7,'normal'],['hindi-shaped',1.3,'hindi'],['line-synced',1,'line']]){
  await page.evaluate(([time,mode])=>window.letterQA.draw(time,mode==='hindi'?{cue:window.letterQA.hindiCue}:mode==='line'?{cue:{...window.letterQA.hindiCue,text:'Carry the light home',timing:'estimated'}}:{}),[time,mode]);
  await page.locator('canvas').screenshot({path:`${shots}/${name}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS browser: persistent letters, intact Hindi shaping, pale unread/line ink, one vibrant accent per sung line, overlapping Lift/Zoom letter waves, Orbit with held letter glow, 200 layer combinations, integrated intro/hold/outro and 7 theme transitions.');
}finally{await browser.close();await server.close();}

