import {byId,type SceneId} from './catalog';
import type {Pulse} from './paint';

const DB_NAME='lyricflow-cinematic-backgrounds';
const STORE='artwork';
const DB_VERSION=1;
const MAX_IN_MEMORY=5;
/** Shipped as real public/scene-art/*.webp Git files. Four scenes still use fallbacks. */
export const BUNDLED_SCENES:readonly SceneId[]=[
 'bubble-pop','cloud-cathedral','color-riot','concrete-manifesto','crimson-impact',
 'final-ascension','fragmented-thoughts','glass-architecture','holographic-frequency',
 'inferno-letterforms','ink-rebellion','marker-diary','midnight-confession',
 'midnight-transit','monument-titles','neon-velocity','ocean-reverie',
 'petal-memory','quiet-pages','rain-on-glass','stellar-expansion',
 'submerged-words','sunset-frequency','type-collision','typographic-vortex',
 'word-playground'
] as const;
const bundled=new Set<SceneId>(BUNDLED_SCENES);
export type ArtworkStatus='ready'|'loading'|'retrying'|'error'|'missing';
type Layer={image:HTMLImageElement;url:string;ready:boolean;failed:boolean;revoke:boolean;attempts:number;failedAt:number};
const stored=new Map<SceneId,Blob>();
const decoded=new Map<SceneId,Layer>();
let initialized=false;
let initializing:Promise<void>|null=null;


function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('IndexedDB is not available'));return}
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('Unable to open artwork library'));
 });
}
async function putAll(files:ReadonlyMap<SceneId,Blob>){
 const db=await database();
 try{
  await new Promise<void>((resolve,reject)=>{
   const transaction=db.transaction(STORE,'readwrite');
   const bucket=transaction.objectStore(STORE);
   for(const [scene,blob] of files)bucket.put(blob,scene);
   transaction.oncomplete=()=>resolve();
   transaction.onerror=()=>reject(transaction.error??new Error('Cannot save artwork'));
   transaction.onabort=()=>reject(transaction.error??new Error('Artwork storage interrupted'));
  });
 }finally{db.close()}
}
/** Restore the user's own cached WebP files. Images never leave the browser. */
export function initializeArtwork():Promise<void>{
 if(initialized)return Promise.resolve();
 if(initializing)return initializing;
 initializing=(async()=>{
  const db=await database();
  try{
   await new Promise<void>((resolve,reject)=>{
    const request=db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
    request.onsuccess=()=>{
     const cursor=request.result;
     if(!cursor){resolve();return}
     const id=String(cursor.key);
     if(id in byId&&cursor.value instanceof Blob)stored.set(id as SceneId,cursor.value);
     cursor.continue();
    };
    request.onerror=()=>reject(request.error??new Error('Cannot read installed scene images'));
   });
  }finally{db.close()}
  initialized=true;
 })().finally(()=>{initializing=null});
 return initializing;
}
export function availableArtworkCount(){return new Set<SceneId>([...bundled,...stored.keys()]).size}
export function hasArtwork(scene:SceneId){return stored.has(scene)||bundled.has(scene)}
export function installedArtworks(){return [...new Set<SceneId>([...bundled,...stored.keys()])]}
export async function installArtworks(images:ReadonlyMap<SceneId,Blob>){
 if(!images.size)throw new Error('No valid artwork in the selected archive');
 await initializeArtwork();
 await putAll(images);
 for(const [id,blob] of images){
  stored.set(id,blob);
  const layer=decoded.get(id);
  if(layer){if(layer.revoke)URL.revokeObjectURL(layer.url);decoded.delete(id)}
 }
 return availableArtworkCount();
}
/**
 * StackBlitz's WebContainer can serve public files a moment after the preview starts.
 * Retry temporary image failures instead of caching a failed HTMLImageElement forever.
 */
function sceneLayer(id:SceneId):Layer|null{
 const previous=decoded.get(id);
 if(previous){
  decoded.delete(id);decoded.set(id,previous);
  if(previous.failed&&Date.now()-previous.failedAt>=2400&&previous.attempts<4){
   previous.failed=false;
   previous.ready=false;
   previous.attempts++;
   const refresh=new Image();
   previous.image=refresh;
   refresh.onload=()=>{if(previous.image===refresh){previous.ready=true;previous.failed=false}};
   refresh.onerror=()=>{if(previous.image===refresh){previous.failed=true;previous.failedAt=Date.now()}};
   // Cache-busting is only needed when a WebContainer initially returns 404 for new assets.
   refresh.src=previous.revoke?previous.url:previous.url+(previous.url.includes('?')?'&':'?')+'retry='+previous.attempts;
  }
  return previous;
 }
 const blob=stored.get(id);
 if(!blob&&!bundled.has(id))return null;
 const url=blob?URL.createObjectURL(blob):new URL(`${import.meta.env.BASE_URL}scene-art/${id}.webp`,window.location.origin).href;
 const image=new Image();
 const layer:Layer={image,url,ready:false,failed:false,revoke:Boolean(blob),attempts:1,failedAt:0};
 image.onload=()=>{if(layer.image===image)layer.ready=true};
 image.onerror=()=>{if(layer.image===image){layer.failed=true;layer.failedAt=Date.now()}};
 image.src=url;
 decoded.set(id,layer);
 while(decoded.size>MAX_IN_MEMORY){
  const first=decoded.keys().next().value;
  if(!first)break;
  const stale=decoded.get(first)!;decoded.delete(first);
  if(stale.revoke)URL.revokeObjectURL(stale.url);
 }
 return layer;
}
export function artworkStatus(id:SceneId):ArtworkStatus{
 const layer=sceneLayer(id);
 if(!layer)return 'missing';
 if(layer.ready)return 'ready';
 if(layer.failed)return 'error';
 return layer.attempts>1?'retrying':'loading';
}
export function artworkUrl(id:SceneId):string|null{
 if(!bundled.has(id))return null;
 return new URL(`${import.meta.env.BASE_URL}scene-art/${id}.webp`,window.location.origin).href;
}
/**
 * Draw a cover-cropped premium image on the existing canvas.
 * Returns false until the asset has decoded, permitting the procedural fallback.
 * Camera movement is intentionally subtle and independent of musical beats.
 */
export function drawPremiumBackground(
 ctx:CanvasRenderingContext2D,scene:SceneId,w:number,h:number,time:number,
 _pulse:Pulse,_intensity:number,reducedMotion:boolean
):boolean{
 const layer=sceneLayer(scene);
 if(!layer||!layer.ready||layer.failed)return false;
 const source=layer.image;
 if(!source.naturalWidth||!source.naturalHeight)return false;
 const drift=reducedMotion?0:1;
 const slow=time*.028;
 const zoom=1.025+drift*.010*(.5+.5*Math.sin(slow));
 const cropScale=Math.max(w/source.naturalWidth,h/source.naturalHeight)*zoom;
 const drawW=source.naturalWidth*cropScale;
 const drawH=source.naturalHeight*cropScale;
 const shiftX=drift*Math.sin(time*.075)*Math.max(0,drawW-w)*.35;
 const shiftY=drift*Math.cos(time*.057)*Math.max(0,drawH-h)*.24;
 const x=(w-drawW)/2+shiftX;
 const y=(h-drawH)/2+shiftY;
 ctx.drawImage(source,x,y,drawW,drawH);
 // Consistent vignette keeps pale or complex images legible behind the lyrics.
 const vignette=ctx.createRadialGradient(w*.5,h*.45,w*.15,w*.5,h*.48,Math.max(w,h)*.82);
 vignette.addColorStop(0,'rgba(0,0,0,0)');
 vignette.addColorStop(1,'rgba(0,0,0,.18)');
 ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
 return true;
}
