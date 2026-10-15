import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {zipSync} from 'fflate';

function byIdToLabel(id){return id.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ')}
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
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)console.log('HTTP '+response.status()+' '+response.url().slice(0,220))});
page.on('console',message=>{if(message.type()==='error')console.log('Browser console: '+message.text().slice(0,200))});
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.locator('canvas.visual-canvas').waitFor({timeout:12000});
 await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:'Test Artist - Rain on the River.wav',mimeType:'audio/wav',buffer:makeAudio()});
 await page.getByRole('button',{name:'Play track'}).click();
 await page.waitForFunction(()=>document.querySelector('canvas.visual-canvas')?.dataset.audioSource==='LOCAL AUDIO',{timeout:9000});
 await page.waitForFunction(()=>Number(document.querySelector('canvas.visual-canvas')?.dataset.audioLevel||0)>0,{timeout:9000});
 console.log('PASS: local audio generates nonzero analyzer data');
 await page.waitForFunction(()=>Number(document.querySelector('canvas.cinematic-canvas')?.dataset.audioBeatCount||0)>=3,{timeout:5200});
 console.log('PASS: real Web Audio analyzer detects multiple synthetic rhythmic beats');
 await page.getByRole('button',{name:'Edit / import lyrics'}).click();
 await page.locator('.lyrics-editor textarea').first().fill('[00:00.00]Rain falls on my river\n[00:02.00]The ocean flows\n[00:04.00]Water, waves and rain');
 await page.waitForFunction(()=>document.querySelector('.scene-summary')?.textContent?.includes('WATER'),{timeout:6000});
 console.log('PASS: lyrics produce context-driven scene selection');
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.lyricLayout!=='none',{timeout:6000});
 const initialLayout=await page.locator('canvas.cinematic-canvas').getAttribute('data-lyric-layout');
 if(!initialLayout||initialLayout==='none'||initialLayout==='classic')throw new Error('Spatial lyric director did not activate');
 console.log('PASS: spatial typography generated a lyric-specific composition');
 await page.getByLabel('Spatial kinetic lyrics').uncheck();
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.lyricLayout==='classic',{timeout:6000});
 await page.getByLabel('Spatial kinetic lyrics').check();
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
 const ordered=await page.evaluate(()=>{
  const selectors=['.stage','.signal-panel','.lyrics-panel','.control-panel','.track-finder','.mic-panel'];
  const elements=selectors.map(selector=>document.querySelector(selector));
  if(elements.some(x=>!x))return false;
  return elements.every((node,i)=>i===0||Boolean(elements[i-1].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING));
 });
 if(!ordered)throw new Error('Panel order differs from canvas / audio / lyrics / library / remaining controls');
 console.log('PASS: user-requested section order is preserved');
 if(await page.locator('.cinematic-scene-card').count()!==30)throw new Error('Expected exactly thirty templates');
 console.log('PASS: all 30 scene controls rendered on tablet-sized layout');
 const loadedFonts=await page.evaluate(async()=>{
  const families=['400 24px "Anton"','700 24px "Orbitron"','700 24px "Unbounded"',
   '400 24px "Italiana"','400 24px "Gloock"','400 24px "Michroma"',
   '400 24px "Press Start 2P"','600 24px "Bodoni Moda"','700 24px "Cinzel Decorative"'];
  for(const f of families){
   const loaded=await document.fonts.load(f,'LYRICFLOW');
   if(!loaded.length||!document.fonts.check(f,'LYRICFLOW'))return f;
  }
  return null;
 });
 if(loadedFonts)throw new Error('Bundled font failed to load: '+loadedFonts);
 console.log('PASS: sampled premium display fonts are served locally and loaded in Chrome');
 const names=["Crimson Impact","Concrete Manifesto","Rain on Glass","Neon Velocity","Ink Rebellion","Ocean Reverie","Color Riot","Analog Breakdown","Cloud Cathedral","Stellar Expansion","Fragmented Thoughts","Quiet Pages","Monochrome Memory","Monument Titles","Midnight Confession","Glass Architecture","Ransom Poetry","Type Collision","Petal Memory","Submerged Words","Inferno Letterforms","Holographic Frequency","Pixel Pulse","Marker Diary","Bubble Pop","Word Playground","Sunset Frequency","Typographic Vortex","Midnight Transit","Final Ascension"];
 const signatures=[];
 for(const name of names){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).click();
  await page.waitForFunction(expected=>document.querySelector('canvas.cinematic-canvas')?.dataset.sceneLabel===expected,name,{timeout:6000});
  await page.waitForTimeout(600);
  const pixels=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas.cinematic-canvas');
    const ctx=canvas.getContext('2d');
    const sample=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let v=0;
    for(let i=0;i<sample.length;i+=Math.max(4,Math.floor(sample.length/3000/4)*4))v=(Math.imul(v,33)+sample[i]+sample[i+1]+sample[i+2])|0;
    return v;
  });
  signatures.push(pixels);
 }
 if(new Set(signatures).size!==names.length)throw new Error('Templates returned identical frames');
 console.log('PASS: all thirty cinematic templates produce distinct actual canvas frames');

 // Verify images committed under public/scene-art load without any user upload.
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.premiumArtwork==='active',{timeout:12000});
 if((await page.locator('.artwork-count').textContent())?.trim()!=='26 / 30')throw new Error('Expected 26 bundled premium backgrounds');
 console.log('PASS: bundled GitHub image renders automatically, without any manual ZIP import');

 // Regression: the user observed old wave graphics instead of the real image for Submerged Words.
 // Exercise every bundled image, not just the last tile. All 26 must decode successfully.
 const bundledIds=[
  'bubble-pop','cloud-cathedral','color-riot','concrete-manifesto','crimson-impact',
  'final-ascension','fragmented-thoughts','glass-architecture','holographic-frequency',
  'inferno-letterforms','ink-rebellion','marker-diary','midnight-confession',
  'midnight-transit','monument-titles','neon-velocity','ocean-reverie',
  'petal-memory','quiet-pages','rain-on-glass','stellar-expansion',
  'submerged-words','sunset-frequency','type-collision','typographic-vortex','word-playground'
 ];
 for(const id of bundledIds){
  await page.locator('.cinematic-scene-card').filter({hasText:byIdToLabel(id)}).click();
  await page.waitForFunction(id=>document.querySelector('canvas.cinematic-canvas')?.dataset.currentScene===id,id,{timeout:3000});
  try{
   await page.waitForFunction(id=>{
    const c=document.querySelector('canvas.cinematic-canvas');
    return c?.dataset.currentScene===id&&c?.dataset.artworkStatus==='ready'&&c?.dataset.premiumArtwork==='active';
   },id,{timeout:9000});
  }catch(error){
   const state=await page.locator('canvas.cinematic-canvas').evaluate(c=>({scene:c.dataset.currentScene,status:c.dataset.artworkStatus,premium:c.dataset.premiumArtwork}));
   throw new Error('Premium scene artwork failed to appear for '+id+' ('+JSON.stringify(state)+'): '+error.message);
  }
 }
 console.log('PASS: all 26 bundled WebP backgrounds decode and replace procedural scenes, including Submerged Words');
 // A pending scene uses the existing fallback until its own WebP is supplied.
 await page.locator('.cinematic-scene-card').filter({hasText:'Analog Breakdown'}).click();
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.premiumArtwork==='fallback',{timeout:6000});
 const asset=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=640;c.height=360;
  const g=c.getContext('2d');const gradient=g.createLinearGradient(0,0,640,360);
  gradient.addColorStop(0,'#a12c4d');gradient.addColorStop(1,'#ffd4a6');
  g.fillStyle=gradient;g.fillRect(0,0,640,360);
  return c.toDataURL('image/webp',.78).split(',')[1];
 });
 const compressed=zipSync({'analog-breakdown.webp':new Uint8Array(Buffer.from(asset,'base64'))});
 await page.getByLabel('Import cinematic scene background ZIP').setInputFiles({
  name:'LyricFlow_Test_Scene.zip',mimeType:'application/zip',buffer:Buffer.from(compressed)
 });
 await page.waitForFunction(()=>document.querySelector('canvas.cinematic-canvas')?.dataset.premiumArtwork==='active',{timeout:10000});
 await page.getByText('Installed 1 local artwork overrides.',{exact:false}).waitFor({timeout:6000});
 if((await page.locator('.artwork-count').textContent())?.trim()!=='27 / 30')throw new Error('One additional custom scene must increase coverage to 27');
 console.log('PASS: optional ZIP import replaces a missing scene and increases image coverage to 27/30');

 await page.locator('button.cinema-button').click();
 await page.locator('.performance-mode').waitFor({timeout:6000});
 console.log('PASS: Cinema Mode entered');
 await page.locator('.stage').click({position:{x:30,y:25}});
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
