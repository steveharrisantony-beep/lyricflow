import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const rate=16000,duration=30,wav=Buffer.alloc(44+rate*duration*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<rate*duration;i++){const t=i/rate,hit=Math.exp(-(t%.5)*18);const v=Math.sin(t*2*Math.PI*110)*hit*.55+Math.sin(t*2*Math.PI*880)*.08+Math.sin(t*2*Math.PI*5000)*hit*.07;wav.writeInt16LE(Math.round(v*30000),44+i*2)}
const lines=['Let the thunder roll','Thunder calls us home','We carry thunder into light','Let the thunder roll','We rise through every storm','Thunder leads us home','Let the thunder roll','We carry thunder into light','The sky is ours tonight','Thunder leads us home'];
const lrc=lines.map((line,i)=>`[00:${String(i*3).padStart(2,'0')}.00]${line}`).join('\n');
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/shader|WebGLProgram/.test(e.text()))errors.push(e.text())});
await page.route('https://lrclib.net/api/**',route=>route.fulfill({json:[]}));
await mkdir('/tmp/lyricflow-kinetic',{recursive:true});
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Settings',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Performance',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Close settings',exact:true}).dispatchEvent('click');
 await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:'Test Artist - Thunder.wav',mimeType:'audio/wav',buffer:wav});
 await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
 await page.getByRole('button',{name:'Edit / import lyrics'}).dispatchEvent('click');await page.locator('.lyrics-editor textarea').first().fill(lrc);
 await page.locator('.cinematic-scene-card').filter({hasText:'Glass Architecture'}).dispatchEvent('click');
 await page.getByRole('button',{name:'Play track',exact:true}).dispatchEvent('click');
 await page.locator('.stage').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>Number(document.querySelector('.cinematic-canvas').dataset.audioBass)>0);
 await page.waitForFunction(()=>Number(document.querySelector('.cinematic-canvas').dataset.cameraImpact)>.1);
 console.log('PASS actual audio drives camera impulses');
 const clocks=[];
 for(const name of ['Paper Cut','Neon Velocity','Color Riot','Glass Architecture']){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).dispatchEvent('click');
  await page.waitForFunction(n=>document.querySelector('.cinematic-canvas').dataset.sceneLabel===n,name);
  for(let i=0;i<3;i++){
   const state=await page.evaluate(()=>{const c=document.querySelector('.cinematic-canvas'),a=document.querySelector('audio');return {time:a.currentTime,clock:Number(c.dataset.lyricClock),text:c.dataset.lyricText,words:Number(c.dataset.lyricWords),draws:Number(c.dataset.lyricDraws),keywords:c.dataset.wordKeywords,transition:c.dataset.transition}});
   const index=Math.min(lines.length-1,Math.floor(state.clock/3));
   if(state.text!==lines[index])throw Error('Stale lyric across transition: '+JSON.stringify(state));
   if(state.words!==state.draws)throw Error('Missing or duplicate word runs: '+JSON.stringify(state));
   if(Math.abs(state.time-state.clock)>1.5)throw Error('Playback clock lag exceeds a slow software-rendered frame');
   if(!state.keywords.includes('thunder'))throw Error('Whole-song hook analysis missing');
   clocks.push(state);await page.waitForTimeout(75);
  }
 }
 console.log('PASS live scene changes keep current lyrics synchronized and paint a single phrase');
 await page.getByRole('button',{name:'Pause track',exact:true}).click();
 const seek=page.getByRole('slider',{name:'Song position',exact:true}),box=await seek.boundingBox();await seek.click({position:{x:box.width*.035,y:box.height*.5}});
 await page.locator('.stage').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.cinematic-canvas').dataset.lyricText==='Let the thunder roll');
 if(await page.locator('.lyric-display p').count()!==1)throw Error('Identical Romanization repeats the phrase');
 for(const name of ['Glass Architecture','Paper Cut','Bauhaus Beat']){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).dispatchEvent('click');
  await page.waitForFunction(n=>document.querySelector('.cinematic-canvas').dataset.sceneLabel===n,name);
  await page.waitForFunction(()=>document.querySelector('.cinematic-canvas').dataset.transition==='none');
  await page.locator('.stage').screenshot({path:'/tmp/lyricflow-kinetic/'+name.toLowerCase().replaceAll(' ','-')+'.png'});
 }
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('checkbox',{name:/Reduced motion/}).check();
 await page.waitForFunction(()=>Number(document.querySelector('.cinematic-canvas').dataset.cameraImpact)===0);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.setViewportSize({width:800,height:1100});
 await page.locator('.stage').screenshot({path:'/tmp/lyricflow-kinetic/portrait.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Portrait overflow');
 const native=await page.evaluate(async()=>{const f=await document.fonts.load('800 40px "Noto Sans Malayalam"','മഴ');return f.length});
 if(!native)throw Error('Bold Malayalam font did not load');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS bold lyric rendering, duplicate removal, reduced motion and portrait layout');
 console.log('Maximum sampled lyric clock lag: '+Math.round(Math.max(...clocks.map(s=>Math.abs(s.time-s.clock)))*1000)+'ms');
}catch(error){console.log(await page.evaluate(()=>({time:document.querySelector('audio')?.currentTime,paused:document.querySelector('audio')?.paused,seek:document.querySelector('[aria-label="Song position"]')?.value,canvas:{...document.querySelector('.cinematic-canvas')?.dataset},lyrics:document.querySelector('.lyric-display')?.textContent})));console.log(errors);throw error}finally{await browser.close()}
