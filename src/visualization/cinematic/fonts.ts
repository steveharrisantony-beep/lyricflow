import type {FontPack} from './catalog';

/** Fontsource packages embed locally served, open-source Google Fonts. No runtime font API. */
const fontFamilies:Record<FontPack,string>={
 impact:'"Anton"',street:'"Anton"',editorial:'"Bricolage Grotesque"',tech:'"Orbitron"',
 grunge:'"Black Ops One"',rounded:'"Unbounded"',mono:'"Space Mono"',literary:'"Fraunces"',
 monument:'"Anton"',noir:'"Fraunces"',glass:'"Syne"',collage:'"Bricolage Grotesque"',
 pixel:'"Press Start 2P"',handwritten:'"Bricolage Grotesque"',retro:'"Righteous"',
 cyber:'"Chakra Petch"',industrial:'"Black Ops One"',ultra:'"Bricolage Grotesque"',
 couture:'"Unbounded"',vogue:'"Fraunces"',engraved:'"Syne"',techno:'"Orbitron"',
 manuscript:'"Bricolage Grotesque"',typewriter:'"Space Mono"',retrograde:'"Righteous"'
};
const fontWeights:Record<FontPack,number>={
 impact:400,street:400,editorial:800,tech:700,grunge:400,rounded:700,mono:700,
 literary:700,monument:400,noir:700,glass:800,collage:800,pixel:400,handwritten:800,
 retro:400,cyber:700,industrial:400,ultra:800,couture:700,vogue:700,engraved:800,
 techno:700,manuscript:800,typewriter:700,retrograde:400
};
const indianScript=/[\u0900-\u097f\u0b80-\u0bff\u0d00-\u0d7f]/u;
const scriptFallback='"Noto Sans Malayalam","Noto Sans Tamil","Noto Sans Devanagari",sans-serif';
export function usesNativeScript(text:string){return indianScript.test(text)}
export function fontSpec(pack:FontPack,size:number,text:string,_italic=false):string{
 const family=usesNativeScript(text)?scriptFallback:fontFamilies[pack]+',sans-serif';
 const weight=usesNativeScript(text)?800:fontWeights[pack];
 return weight+' '+Math.max(8,Math.round(size))+'px '+family;
}
export function applySceneFont(c:CanvasRenderingContext2D,pack:FontPack,size:number,text:string,italic=false){
 c.font=fontSpec(pack,size,text,italic);
}
export function fontLabel(pack:FontPack){return fontFamilies[pack].replaceAll('"','')}
export const FONT_SHOWCASE:readonly FontPack[]=[
 'impact','street','editorial','tech','grunge','rounded','mono','literary',
 'monument','noir','glass','collage','pixel','handwritten','retro','cyber','industrial','ultra',
 'couture','vogue','engraved','techno','manuscript','typewriter','retrograde'
] as const;

const loadedFontPacks=new Set<FontPack>();
const pendingFontLoads=new Map<FontPack,Promise<void>>();
let fontLoadRevision=0;
let fontListenerAttached=false;
let warmCanvasCtx:CanvasRenderingContext2D|null=null;

function getWarmCanvasContext():CanvasRenderingContext2D|null{
 if(warmCanvasCtx)return warmCanvasCtx;
 if(typeof document==='undefined')return null;
 try{
  const canvas=document.createElement('canvas');
  canvas.width=32;
  canvas.height=32;
  warmCanvasCtx=canvas.getContext('2d');
 }catch{
  warmCanvasCtx=null;
 }
 return warmCanvasCtx;
}

function warmFontOnCanvas(pack:FontPack){
 const ctx=getWarmCanvasContext();
 if(!ctx)return;
 try{
  applySceneFont(ctx,pack,48,'LyricFlow');
  ctx.measureText('LyricFlow 0123456789');
  ctx.fillText('LyricFlow',0,24);
 }catch{
  // Ignore in headless/non-canvas test environments
 }
}

export function getFontLoadRevision():number{
 return fontLoadRevision;
}

export function isFontPackLoaded(pack:FontPack):boolean{
 if(loadedFontPacks.has(pack))return true;
 if(typeof document==='undefined'||!('fonts' in document)||!document.fonts){
  loadedFontPacks.add(pack);
  return true;
 }
 try{
  const spec=`${fontWeights[pack]} 48px ${fontFamilies[pack]}`;
  if(typeof document.fonts.check==='function'&&document.fonts.check(spec,'LyricFlow')){
   loadedFontPacks.add(pack);
   return true;
  }
 }catch{
  // Ignore check errors
 }
 return false;
}

/**
 * Preload and rasterize enabled lyric fonts (plus Indic fallback scripts) before display
 * so lyrics never render in a fallback/default font first and then swap a second later.
 */
export async function preloadLyricFonts(packs:readonly FontPack[]=FONT_SHOWCASE):Promise<void>{
 const targetPacks=packs.length>0?packs:FONT_SHOWCASE;
 if(typeof document==='undefined'||!('fonts' in document)||!document.fonts||typeof document.fonts.load!=='function'){
  for(const pack of targetPacks)loadedFontPacks.add(pack);
  return;
 }
 if(!fontListenerAttached&&typeof document.fonts.addEventListener==='function'){
  fontListenerAttached=true;
  document.fonts.addEventListener('loadingdone',()=>{
   fontLoadRevision++;
  });
 }

 const tasks:Promise<void>[]=[];
 for(const pack of targetPacks){
  if(loadedFontPacks.has(pack))continue;
  let existing=pendingFontLoads.get(pack);
  if(!existing){
   const spec=`${fontWeights[pack]} 48px ${fontFamilies[pack]}`;
   existing=document.fonts
    .load(spec,'LyricFlow 0123456789')
    .then(()=>{
     loadedFontPacks.add(pack);
     warmFontOnCanvas(pack);
     fontLoadRevision++;
    })
    .catch(()=>{
     loadedFontPacks.add(pack);
     fontLoadRevision++;
    })
    .finally(()=>{
     pendingFontLoads.delete(pack);
    });
   pendingFontLoads.set(pack,existing);
  }
  tasks.push(existing);
 }

 // Also preload Indic fallback fonts in parallel
 for(const fallbackFamily of ['"Noto Sans Malayalam"','"Noto Sans Tamil"','"Noto Sans Devanagari"']){
  tasks.push(
   document.fonts.load(`800 36px ${fallbackFamily}`,'LyricFlow').then(()=>{}).catch(()=>{})
  );
 }

 if(tasks.length>0){
  await Promise.race([
   Promise.allSettled(tasks),
   new Promise<void>(resolve=>setTimeout(resolve,1200))
  ]);
 }
}

