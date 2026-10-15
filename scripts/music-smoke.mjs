import {chromium} from 'playwright';
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--in-process-gpu','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1100,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error'&&/shader|WebGLProgram/.test(e.text()))errors.push(e.text())});
const rate=16000,duration=12,wav=Buffer.alloc(44+rate*duration*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<rate*duration;i++){const t=i/rate;wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*110*t)*Math.exp(-(t%.5)*18)*17000),44+i*2)}
const song={id:'abcdefghijk',title:'Original rain',artist:'Test Artist',album:'Demo',duration,sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk'};
let lyricCalls=0;
await page.route('**/music/search?**',route=>route.fulfill({json:{data:[song]}}));
await page.route('**/music/resolve/**',route=>route.fulfill({json:{streamPath:'/audio/abcdefghijk',track:song}}));
await page.route('**/music/audio/**',route=>{
 const range=route.request().headers()['range'];const match=range?.match(/bytes=(\d+)-(\d*)/);
 const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(wav.length-1,Number(match[2])):wav.length-1;
 return route.fulfill({status:match?206:200,contentType:'audio/wav',body:wav.subarray(start,end+1),headers:{'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})}});
});
await page.route('https://api.audius.co/**',route=>route.fulfill({json:{data:[]}}));
await page.route('https://lrclib.net/api/**',route=>{
 lyricCalls++;
 const record={id:1,trackName:song.title,artistName:song.artist,albumName:'Demo',duration,syncedLyrics:'[00:00.00]Original test line\n[00:05.00]Second original line',instrumental:false};
 return route.fulfill({json:route.request().url().includes('/search?')?[record]:record});
});
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.locator('canvas.cinematic-canvas').waitFor();
 await page.getByRole('slider',{name:'Spectrum gain',exact:true}).press('Home');
 if(await page.getByRole('slider',{name:'Spectrum gain',exact:true}).inputValue()!=='0')throw Error('Spectrum gain control did not update');
 if(await page.getByRole('slider',{name:'Audio sensitivity',exact:true}).inputValue()!=='50')throw Error('Spectrum control changed overall sensitivity');
 console.log('PASS spectrum gain is separate from overall sensitivity');
 await page.locator('.stage-source-button').click();
 await page.getByRole('button',{name:'YouTube Music',exact:true}).click();
 // Vite without dev:full can still exercise the configured resolver contract.
 if(!await page.getByRole('textbox',{name:'Music resolver URL'}).isVisible())await page.getByRole('button',{name:'Search settings',exact:true}).click();
 const base=page.getByRole('textbox',{name:'Music resolver URL'});
 if(await base.count()){await base.fill('http://127.0.0.1:5173/music');await page.getByRole('button',{name:'Save connection'}).click()}
 await page.getByRole('textbox',{name:'Search songs',exact:true}).fill('Original rain');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('button',{name:'Play Original rain',exact:true}).click();
 await page.getByRole('dialog',{name:'Select audio source'}).waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('.cinematic-canvas')?.dataset.audioSource==='LOCAL AUDIO',null,{timeout:20000});
 console.log('PASS searched recording loads through shared audio analyzer');
 await page.getByRole('button',{name:'Pause track',exact:true}).click();
 await page.getByRole('slider',{name:'Song position',exact:true}).press('Home');
 await page.getByRole('checkbox',{name:/I confirm I have the necessary permission/}).check();
 await page.getByRole('checkbox',{name:/Automatically load matching timed lyrics/}).check();
 await page.waitForFunction(()=>document.querySelector('.lyric-display')?.textContent?.includes('Original test line'),null,{timeout:15000});
 if(!lyricCalls)throw Error('Automatic lyric provider was not called');
 console.log('PASS exact recording metadata automatically loads timestamped lyrics');
 const seek=page.getByRole('slider',{name:'Song position',exact:true});const seekBox=await seek.boundingBox();
 await seek.click({position:{x:seekBox.width*.55,y:seekBox.height*.5}});
 
 await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>=5);
 await page.waitForFunction(()=>document.querySelector('.lyric-display p')?.textContent==='Second original line');
 await page.getByRole('spinbutton',{name:'Lyrics delay seconds',exact:true}).fill('4');
 await page.waitForFunction(()=>document.querySelector('.lyric-display p')?.textContent==='Original test line');
 console.log('PASS seek and independent delay update lyric display from actual player clock');
 await page.locator('.cinematic-scene-card').filter({hasText:'Glass Architecture'}).click();
 await page.waitForFunction(()=>document.querySelector('.cinematic-canvas')?.dataset.renderer==='WEBGL 3D',null,{timeout:20000});
 await page.locator('.stage').scrollIntoViewIfNeeded();
 await page.locator('.stage').screenshot({path:process.env.MUSIC_SCREENSHOT||'/tmp/lyricflow-music-check.png'});
 await page.locator('button.cinema-button').click();
 await page.getByRole('button',{name:'Show cinema controls'}).click();
 await page.getByRole('slider',{name:'Cinema spectrum gain'}).press('End');
 await page.getByRole('slider',{name:'Cinema song position'}).press('Home');
 if(await page.getByRole('button',{name:'Cinema play song'}).count()!==1)throw Error('Missing fullscreen song playback control');
 console.log('PASS fullscreen exposes spectrum, song transport and timeline controls');
 await page.getByRole('button',{name:'Exit cinema mode'}).click();
 await page.setViewportSize({width:800,height:1100});
 await page.locator('.stage-source-button').click();
 await page.getByRole('dialog',{name:'Select audio source'}).waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Tablet layout overflows horizontally');
 await page.getByRole('button',{name:'Close audio sources'}).click();
 console.log('PASS portrait tablet input sheet fits viewport');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS no uncaught runtime or shader compilation errors');
}catch(error){console.log(await page.evaluate(()=>({lyrics:document.querySelector('.lyric-display')?.innerHTML,delay:document.querySelector('[aria-label=\"Lyrics delay seconds\"]')?.value,position:document.querySelector('audio')?.currentTime,errors:document.querySelector('.player-error')?.textContent,renderer:document.querySelector('.cinematic-canvas')?.dataset.renderer,webgl:document.querySelector('.cinematic-canvas')?.dataset.rendererError,runtimeErrors:[]})));throw error}finally{await browser.close()}
