import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';

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
  const sample=(Math.sin(2*Math.PI*110*t)*.55+Math.sin(2*Math.PI*440*t)*.23)*.7;
  wav.writeInt16LE(Math.round(sample*32760),44+i*2);
 }
 return wav;
}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')console.log('Browser console: '+message.text().slice(0,200))});
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.locator('canvas.visual-canvas').waitFor({timeout:12000});
 await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:'Test Artist - Rain on the River.wav',mimeType:'audio/wav',buffer:makeAudio()});
 await page.getByRole('button',{name:'Play track'}).click();
 await page.waitForFunction(()=>document.querySelector('canvas.visual-canvas')?.dataset.audioSource==='LOCAL AUDIO',{timeout:9000});
 await page.waitForFunction(()=>Number(document.querySelector('canvas.visual-canvas')?.dataset.audioLevel||0)>0,{timeout:9000});
 console.log('PASS: local audio generates nonzero analyzer data');
 await page.getByRole('button',{name:'Edit / import lyrics'}).click();
 await page.locator('.lyrics-editor textarea').first().fill('[00:00.00]Rain falls on my river\n[00:02.00]The ocean flows\n[00:04.00]Water, waves and rain');
 await page.waitForFunction(()=>document.querySelector('.scene-summary')?.textContent?.includes('WATER'),{timeout:6000});
 console.log('PASS: lyrics produce context-driven scene selection');
 const count=await page.locator('.three-lyrics canvas').count();
 if(count)console.log('PASS: WebGL lyric renderer initialized');
 else console.log('WARNING: headless Chrome WebGL unavailable; Canvas 2D fallback visible');
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
