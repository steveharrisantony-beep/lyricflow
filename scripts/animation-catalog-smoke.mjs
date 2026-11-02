import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const baselineMode=process.argv.includes('--baseline');
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-catalog';await mkdir(shots,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.route('**/catalog-qa.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#07090e"><canvas width="960" height="540"></canvas></body></html>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/catalog-qa.html`);
 await page.addStyleTag({url:'/node_modules/@fontsource/anton/400.css'});
 await page.addStyleTag({url:'/node_modules/@fontsource/noto-sans-devanagari/800.css'});
 const result=await page.evaluate(async baselineMode=>{
  const [{LYRIC_MOTIONS,drawKineticLyrics},{buildCues},{analyzeLyricWords},{TEMPLATES},{preloadLyricFonts}]=await Promise.all([
   import('/src/visualization/cinematic/kineticTypography.ts'),import('/src/lyrics/lyricTimeline.ts'),import('/src/lyrics/wordEmphasis.ts'),import('/src/visualization/cinematic/catalog.ts'),import('/src/visualization/cinematic/fonts.ts')]);
  await preloadLyricFonts(['impact']);await document.fonts.load('400 64px Anton','Carry');await document.fonts.load('800 64px "Noto Sans Devanagari"','संगीत');
  const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');
  const [rawCue]=buildCues([{time:0,text:'Carry the light home',words:[{text:'Carry',start:0,end:1,timing:'sourced'},{text:'the',start:1,end:1.5,timing:'sourced'},{text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}]}],[]);
  const cue={...rawCue,end:6},[hindiCue]=buildCues([{time:0,text:'संगीत दिल को छू ले'}],[]),emphasis=analyzeLyricWords([cue]);
  const scene={...TEMPLATES[0],start:0,end:12,variation:0,section:0,reason:'QA'};
  const draw=(motion,time,overrides={})=>{
   c.resetTransform();c.globalAlpha=1;c.clearRect(0,0,canvas.width,canvas.height);
   return drawKineticLyrics({c,scene,cue,time,mode:'original',w:canvas.width,h:canvas.height,intensity:1,reduced:false,emphasis,enabledMotions:[motion],enabledFonts:['impact'],placementMode:'center',fillPaceMode:'word',...overrides});
  };
  const pixels=()=>c.getImageData(0,0,canvas.width,canvas.height).data;
  const checksum=()=>{let hash=2166136261;for(const byte of pixels())hash=Math.imul(hash^byte,16777619);return hash>>>0;};
  const ink=()=>{let count=0;const rgba=pixels();for(let i=3;i<rgba.length;i+=4)if(rgba[i])count++;return count;};
  const samples={};
  for(const motion of (baselineMode?LYRIC_MOTIONS.slice(0,12):LYRIC_MOTIONS)){
   samples[motion]=[.12,.45,2.1,5.98].map(time=>{draw(motion,time);return checksum();});
   if(!baselineMode){
    const hold=draw(motion,2.1),early=checksum();if(hold.drawn!==4||hold.motionPhase!=='hold'||ink()<100)throw Error(`Invisible hold: ${motion}`);
    draw(motion,2.3);if(early===checksum())throw Error(`Frozen hold: ${motion}`);
    draw(motion,6.01);if(ink()!==0)throw Error(`Incomplete outro: ${motion}`);
    const shaped=draw(motion,1.1,{cue:hindiCue});if(shaped.letterMode!=='shaped'||shaped.glyphs!==5)throw Error(`Broken Hindi: ${motion}`);
   }
  }
  window.catalogQA={draw,ids:[...LYRIC_MOTIONS]};
  return {samples,count:LYRIC_MOTIONS.length};
 },baselineMode);
 if(baselineMode){assert.equal(Object.keys(result.samples).length,12);await writeFile(`${shots}/original-12.json`,JSON.stringify(result.samples));console.log('Saved original 12 animation pixel baselines.');}
 else{
  assert.equal(result.count,25);
  const savedBaseline=await readFile(`${shots}/original-12.json`,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const originals=savedBaseline?JSON.parse(savedBaseline):null;
  if(originals)for(const [motion,samples] of Object.entries(originals))assert.deepEqual(result.samples[motion],samples,`Original changed: ${motion}`);
  for(const motion of Object.keys(result.samples).slice(12)){
   await page.evaluate(motion=>window.catalogQA.draw(motion,.2),motion);
   await page.locator('canvas').screenshot({path:`${shots}/${motion}-intro.png`});
   await page.evaluate(motion=>window.catalogQA.draw(motion,2.1),motion);
   await page.locator('canvas').screenshot({path:`${shots}/${motion}-hold.png`});
  }
  for(const [part,ids] of [Object.keys(result.samples).slice(12,19),Object.keys(result.samples).slice(19)].entries()){
   await page.evaluate(ids=>{
    const gallery=document.createElement('canvas');gallery.dataset.gallery='true';gallery.width=1200;gallery.height=ids.length*200;
    const g=gallery.getContext('2d');g.fillStyle='#07090e';g.fillRect(0,0,gallery.width,gallery.height);g.font='15px sans-serif';
    const source=document.querySelector('canvas');
    ids.forEach((id,row)=>[.18,1.4,4.8,5.95].forEach((time,col)=>{
     window.catalogQA.draw(id,time);g.drawImage(source,col*300,row*200,300,169);g.fillStyle='#cbd5e1';g.fillText(`${id} · ${time}s`,col*300+8,row*200+188);
    }));
    document.body.append(gallery);
   },ids);
   await page.locator('canvas[data-gallery]').screenshot({path:`${shots}/storyboard-${part+1}.png`});
   await page.locator('canvas[data-gallery]').evaluate(canvas=>canvas.remove());
  }
  console.log(`PASS browser: 25 moving holds and complete outros, intact Hindi in every animation${originals?', and pixel-identical original 12':'. No comparison baseline supplied'}.`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
