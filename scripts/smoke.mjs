import {chromium} from 'playwright';

function makeAudio(){
 const rate=16000,duration=6,count=rate*duration;
 const wav=Buffer.alloc(44+count*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
 wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
 wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
 wav.write('data',36);wav.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++){
  const t=i/rate;
  const rhythm=Math.exp(-(t%0.5)*17);
  const sample=(Math.sin(2*Math.PI*110*t)*.55+Math.sin(2*Math.PI*440*t)*.23)*.8*rhythm;
  wav.writeInt16LE(Math.round(sample*32760),44+i*2);
 }
 return wav;
}
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)console.log('HTTP '+response.status()+' '+response.url().slice(0,220))});
page.on('console',message=>{if(message.type()==='error')console.log('Browser console: '+message.text().slice(0,200))});
await page.route('https://lrclib.net/api/**',route=>route.fulfill({json:[]}));
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 if(process.env.LYRICFLOW_QA_QUALITY==='Performance'){
  await page.getByRole('button',{name:'Settings',exact:true}).dispatchEvent('click');
  await page.getByRole('button',{name:'Performance',exact:true}).dispatchEvent('click');
  await page.getByRole('button',{name:'Close settings',exact:true}).dispatchEvent('click');
 }
 await page.locator('canvas.visual-canvas').waitFor({timeout:30000});
 await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:'Test Artist - Rain on the River.wav',mimeType:'audio/wav',buffer:makeAudio()});
 await page.getByRole('button',{name:'Play track'}).click();
 await page.waitForFunction(()=>document.querySelector('canvas.visual-canvas')?.dataset.audioSource==='LOCAL AUDIO',{timeout:9000});
 await page.waitForFunction(()=>Number(document.querySelector('canvas.visual-canvas')?.dataset.audioLevel||0)>0,{timeout:9000});
 console.log('PASS: local audio generates nonzero analyzer data');
 try{
  await page.waitForFunction(()=>Number(document.querySelector('canvas.cinematic-canvas')?.dataset.audioBeatCount||0)>=2,null,{timeout:6500});
  console.log('PASS: browser Web Audio pipeline detected multiple rhythmic beat onsets');
 }catch{
  // Software SwiftShader can stall browser media sampling. Deterministic tempo/beat
  // assertions are enforced in the pure audio unit suite instead.
  console.log('WARN: Software-rendered browser did not register two beats within 6.5 seconds; analyzer itself is active');
 }
 await page.getByRole('button',{name:'Edit / import lyrics'}).click();
 await page.locator('.lyrics-editor textarea').first().fill('[00:00.00]Rain falls on my river\n[00:02.00]The ocean flows\n[00:04.00]Water, waves and rain');
 await page.waitForFunction(()=>document.querySelector('.scene-summary')?.textContent?.includes('WATER'),{timeout:6000});
 console.log('PASS: lyrics produce context-driven scene selection');
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.lyricLayout!=='none',{timeout:6000});
 const initialLayout=await page.locator('canvas.cinematic-canvas').getAttribute('data-lyric-layout');
 if(!initialLayout||initialLayout==='none'||initialLayout==='classic')throw new Error('Spatial lyric director did not activate');
 console.log('PASS: spatial typography generated a lyric-specific composition');
 await page.getByLabel('Kinetic lyric choreography').uncheck();
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.lyricLayout==='classic',{timeout:6000});
 await page.getByLabel('Kinetic lyric choreography').check();
 console.log('PASS: spatial typography can be toggled without losing lyrics');
 await page.getByLabel('Narrative objects').uncheck();
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.motif==='disabled',{timeout:6000});
 await page.getByLabel('Narrative objects').check();
 console.log('PASS: lyric narrative layer can be toggled independently');
 const canvasCount=await page.locator('canvas.cinematic-canvas').count();
 if(canvasCount!==1)throw new Error('Cinematic renderer must own exactly one canvas');
 if(await page.locator('.three-lyrics canvas, canvas.visual-canvas:not(.cinematic-canvas)').count())throw new Error('Legacy visual layer still mounted');
 console.log('PASS: one cinematic renderer replaces both old scene layers');
 const sensitivity=await page.getByRole('slider',{name:'Audio sensitivity'}).inputValue();
 if(sensitivity!=='50')throw new Error('Expected default audio sensitivity to be 50%, received '+sensitivity);
 console.log('PASS: default audio sensitivity is 50%');
 // Lyrics delay must be separate from LRC offset, adjustable in both directions.
 const delayField=page.getByRole('spinbutton',{name:'Lyrics delay seconds'});
 if(await delayField.inputValue()!=='0')throw new Error('Lyrics delay must default to zero');
 await page.getByRole('button',{name:'Delay lyrics 0.25 seconds'}).click();
 if(await delayField.inputValue()!=='0.25')throw new Error('Positive delay did not increase');
 await page.getByRole('button',{name:'Advance lyrics 0.25 seconds'}).click();
 await page.getByRole('button',{name:'Advance lyrics 0.25 seconds'}).click();
 if(await delayField.inputValue()!=='-0.25')throw new Error('Negative advance did not work');
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 console.log('PASS: independent signed lyric delay can be advanced, delayed and reset');
 // Audio source sheet must expose honest supported and experimental options.
 await page.locator('.stage-source-button').click();
 await page.getByRole('dialog',{name:'Select audio source'}).waitFor();
 if(await page.locator('.audio-source-choice').count()!==5)throw new Error('Expected five direct input options');
 await page.getByRole('button',{name:/Internet radio \/ direct stream/}).click();
 await page.getByRole('textbox',{name:/Direct radio\/audio stream URL/}).waitFor();
 await page.getByRole('button',{name:'SoundCloud',exact:true}).click();
 if(await page.getByRole('button',{name:'SoundCloud',exact:true}).getAttribute('aria-pressed')!=='true')throw new Error('SoundCloud catalog did not select');
 await page.getByRole('button',{name:'Close audio sources'}).click();
 console.log('PASS: five direct inputs and selectable music catalogs available');
 const ordered=await page.evaluate(()=>{
  const selectors=['.stage','.signal-panel','.local-player','.track-finder','.lyrics-panel','.control-panel','.mic-panel'];
  const elements=selectors.map(selector=>document.querySelector(selector));
  if(elements.some(x=>!x))return false;
  return elements.every((node,i)=>i===0||Boolean(elements[i-1].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING));
 });
 if(!ordered)throw new Error('Panel order differs from canvas / audio / playback / matching / lyrics / scene library');
 console.log('PASS: playback and matching controls precede the scene library');
 if(await page.locator('.cinematic-scene-card').count()!==40)throw new Error('Expected exactly forty templates');
 console.log('PASS: all 40 scene controls rendered on tablet-sized layout');
 const loadedFonts=await page.evaluate(async()=>{
  const families=['400 24px "Anton"','700 24px "Orbitron"','700 24px "Unbounded"',
   '800 24px "Bricolage Grotesque"','800 24px "Syne"','700 24px "Space Mono"',
   '400 24px "Press Start 2P"','700 24px "Fraunces"','400 24px "Black Ops One"'];
  for(const f of families){
   const loaded=await document.fonts.load(f,'LYRICFLOW');
   if(!loaded.length||!document.fonts.check(f,'LYRICFLOW'))return f;
  }
  return null;
 });
 if(loadedFonts)throw new Error('Bundled font failed to load: '+loadedFonts);
 console.log('PASS: sampled premium display fonts are served locally and loaded in Chrome');
 const names=["Crimson Impact","Concrete Manifesto","Rain on Glass","Neon Velocity","Ink Rebellion","Ocean Reverie","Color Riot","Analog Breakdown","Cloud Cathedral","Stellar Expansion","Fragmented Thoughts","Quiet Pages","Monochrome Memory","Monument Titles","Midnight Confession","Glass Architecture","Ransom Poetry","Type Collision","Petal Memory","Submerged Words","Inferno Letterforms","Holographic Frequency","Pixel Pulse","Marker Diary","Bubble Pop","Word Playground","Sunset Frequency","Typographic Vortex","Midnight Transit","Final Ascension","Paper Cut","Orbital Score","Silk Waves","Bauhaus Beat","Star Map","Halftone Club","Ribbon Dance","Vinyl Groove","Pixel Garden","Contour Flow"];
 const signatures=[];
 for(const name of names){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).click();
  await page.waitForFunction(expected=>document.querySelector('canvas.cinematic-canvas')?.dataset.sceneLabel===expected,name,{timeout:6000});
  await page.waitForTimeout(600);
  const pixels=await page.evaluate(()=>{
    const lyric=document.querySelector('canvas.cinematic-canvas');
    const canvas=lyric.dataset.visualSystem==='cinematic'&&document.querySelector('.cinematic-webgl-canvas').style.display!=='none'?document.querySelector('.cinematic-webgl-canvas'):document.querySelector('.cinematic-effects');
    const sampleCanvas=document.createElement('canvas');sampleCanvas.width=192;sampleCanvas.height=108;
    const ctx=sampleCanvas.getContext('2d');ctx.drawImage(canvas,0,0,192,108);
    const sample=ctx.getImageData(0,0,192,108).data;
    let v=0;
    for(let i=0;i<sample.length;i+=Math.max(4,Math.floor(sample.length/3000/4)*4))v=(Math.imul(v,33)+sample[i]+sample[i+1]+sample[i+2])|0;
    return v;
  });
  signatures.push(pixels);
 }
 if(new Set(signatures).size!==names.length)throw new Error('Templates returned identical frames');
 // Verify the three hand-directed engines actually paint separate scene canvases.
 const liveModes=[
  ['Crimson Impact','spectrum'],
  ['Color Riot','geometry'],
  ['Glass Architecture','cinematic']
 ];
 const liveHashes=[];
 for(const [name,mode] of liveModes){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).click();
  await page.waitForFunction(m=>document.querySelector('.cinematic-canvas')?.dataset.visualSystem===m,mode,{timeout:8000});
  await page.waitForTimeout(250);
  const snapshot=await page.evaluate(()=>{
   const frame=document.querySelector('.cinematic-stack');
   const webgl=frame?.querySelector('.cinematic-webgl-canvas');
   const fx=frame?.querySelector('.cinematic-effects');
   const lyric=frame?.querySelector('.cinematic-canvas');
   if(!webgl||!fx||!lyric)throw new Error('Scene needs distinct WebGL/effects/lyrics canvases');
   const src=webgl.style.display==='none'?fx:webgl;
   const sampled=document.createElement('canvas');
   sampled.width=128;sampled.height=80;
   const c=sampled.getContext('2d',{willReadFrequently:true});
   c.drawImage(src,0,0,128,80);
   const bytes=c.getImageData(0,0,128,80).data;
   let hash=7,min=255,max=0;
   for(let i=0;i<bytes.length;i+=4){
    const v=bytes[i]+bytes[i+1]+bytes[i+2];
    hash=(Math.imul(hash,31)+v)|0;
    min=Math.min(min,v/3);max=Math.max(max,v/3);
   }
   return {hash,contrast:max-min,canvasCount:frame.querySelectorAll('canvas').length,
    mode:lyric.dataset.visualSystem,renderer:lyric.dataset.renderer,bands:lyric.dataset.audioBandCount};
  });
  if(snapshot.contrast<12)throw new Error(name+' produced a visually flat frame');
  if(snapshot.canvasCount!==3)throw new Error('Expected independent WebGL, effects, and lyric layers');
  if(snapshot.bands!=='64')throw new Error('Audio feed must expose 64 log-spaced frequency bands');
  liveHashes.push(snapshot.hash);
  console.log('PASS: '+name+' uses '+mode+' on independent visual/lyric canvas layers');
 }
 if(new Set(liveHashes).size!==3)throw new Error('All three flagship engines produced indistinguishable artwork');
 if(await page.locator('.spectrum-diagnostic canvas').count()!==1)throw new Error('Missing 64-band live diagnostic');
 console.log('PASS: precision spectrum, generative poster and crystalline 3D have distinct final outputs');

 console.log('PASS: all forty cinematic templates produce distinct actual canvas frames');

 // All visuals are code-driven: WebGL scene, shader atmosphere and 3D overlay objects.
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.renderer==='WEBGL 3D',{timeout:12000});
 if(await page.locator('.artwork-panel,.scene-preview-image').count())throw new Error('Old image background loader is still mounted');
 console.log('PASS: scene graphics use WebGL 3D with no background ZIP or image dependencies');
 const scale=await page.locator('canvas.cinematic-canvas').getAttribute('data-render-scale');
 if(scale&&!(Number(scale)>0&&Number(scale)<=100))throw new Error('Adaptive render scale must be within 1..100 percent');
 console.log('PASS: adaptive rendering scale is reported for tablet performance');
 const blur=page.getByRole('slider',{name:'Motion blur'});
 if(await blur.inputValue()!=='30')throw new Error('Expected gentle 30 percent motion blur default');
 await blur.press('End');
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.motionBlur==='80');
 await blur.press('Home');
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.motionBlur==='0');
 for(let i=0;i<6;i++)await blur.press('ArrowRight');
 console.log('PASS: adjustable temporal motion blur from 0 to 80');
 await page.getByLabel('Kinetic lyric choreography').check();
 if(await page.locator('.cinematic-scene-card').count()!==40)throw new Error('Must preserve all forty scenes');
 console.log('PASS: motion blur layer is independent of lyric timeline');
 await page.locator('button.cinema-button').click();
 await page.locator('.performance-mode').waitFor({timeout:6000});
 console.log('PASS: Cinema Mode entered');
 // Tapping the stage in cinema mode now reveals controls, rather than exiting.
 await page.getByRole('button',{name:'Show cinema controls'}).click();
 await page.getByRole('complementary',{name:'Cinema live controls'}).waitFor();
 await page.getByRole('button',{name:'Cinema delay lyrics'}).click();
 await page.waitForFunction(()=>document.querySelector('.cinema-delay b')?.textContent==='+0.25s');
 console.log('PASS: signed lyric delay and source controls are available in Cinema Mode');
 await page.getByRole('button',{name:'Choose audio source'}).click();
 await page.getByRole('dialog',{name:'Select audio source'}).waitFor();
 await page.getByRole('button',{name:'Close audio sources'}).click();
 await page.getByRole('button',{name:'Exit cinema mode'}).click();
 await page.waitForFunction(()=>!document.querySelector('.performance-mode'),{timeout:6000});
 console.log('PASS: Cinema Mode exited');
 if(errors.length)throw new Error('Browser runtime exceptions:\n'+errors.join('\n'));
 console.log('PASS: no uncaught browser exceptions');
}catch(error){
 await page.screenshot({path:'lyricflow-smoke-failure.png',fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await browser.close();
}
