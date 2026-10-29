import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/shader|WebGLProgram/.test(e.text()))errors.push(e.text())});
await mkdir('/tmp/lyricflow-scenes',{recursive:true});
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.locator('.cinematic-canvas').waitFor();
 await page.getByRole('button',{name:'Edit / import lyrics'}).click();
 await page.locator('.lyrics-editor textarea').first().fill('[00:00.00]Let the rhythm paint the sky\n[30:00.00]End');
 await page.waitForFunction(()=>document.querySelector('.cinematic-canvas').dataset.hasLyrics==='yes');
 await page.getByRole('button',{name:'2D motion · 12',exact:true}).click();
 if(await page.locator('.cinematic-scene-card').count()!==12)throw Error('2D filter');
 const names=['Paper Cut','Orbital Score','Silk Waves','Bauhaus Beat','Star Map','Halftone Club','Ribbon Dance','Vinyl Groove','Pixel Garden','Contour Flow'];
 const hashes=[];
 for(const name of names){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).click();
  await page.waitForFunction(n=>document.querySelector('.cinematic-canvas').dataset.sceneLabel===n,name);
  await page.waitForFunction(()=>document.querySelector('.cinematic-canvas').dataset.transition==='none');
  hashes.push(await page.evaluate(()=>{const c=document.querySelector('.cinematic-effects');const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=0;for(let i=0;i<data.length;i+=400)hash=(Math.imul(hash,31)+data[i]+data[i+1])|0;return hash}));
  await page.locator('.stage').screenshot({path:'/tmp/lyricflow-scenes/'+name.toLowerCase().replaceAll(' ','-')+'.png'});
 }
 if(new Set(hashes).size!==10)throw Error('2D backgrounds are not distinct');
 console.log('PASS ten distinct 2D compositions, live lyrics and completed transitions');
 await page.getByRole('button',{name:'All 40',exact:true}).click();
 for(const name of ['Glass Architecture','Concrete Manifesto','Ink Rebellion']){
  await page.locator('.cinematic-scene-card').filter({hasText:name}).click();
  await page.waitForFunction(n=>document.querySelector('.cinematic-canvas').dataset.sceneLabel===n,name);
  await page.waitForFunction(()=>document.querySelector('.cinematic-canvas').dataset.transition==='none');
  await page.locator('.stage').screenshot({path:'/tmp/lyricflow-scenes/'+name.toLowerCase().replaceAll(' ','-')+'.png'});
 }
 await page.setViewportSize({width:800,height:1100});
 await page.locator('.stage-source-button').click();
 for(const source of ['YouTube Music','SoundCloud','JioSaavn'])if(!await page.getByRole('button',{name:source,exact:true}).isVisible())throw Error('Missing source '+source);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Tablet overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS 3D materials render without shader errors; source choices fit portrait tablet');
}finally{await browser.close()}
