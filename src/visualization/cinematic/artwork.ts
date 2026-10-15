import {byId,type SceneId} from './catalog';
import type {Pulse} from './paint';

const DB_NAME='lyricflow-cinematic-backgrounds';
const STORE='artwork';
const DB_VERSION=1;
const MAX_IN_MEMORY=5;
type Layer={image:HTMLImageElement;url:string;ready:boolean;failed:boolean};
const stored=new Map<SceneId,Blob>();
const decoded=new Map<SceneId,Layer>();
let initialized=false;
let initializing:Promise<void>|null=null;
let loaded=0;

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
  loaded=stored.size;initialized=true;
 })().finally(()=>{initializing=null});
 return initializing;
}
export function availableArtworkCount(){return loaded}
export function hasArtwork(scene:SceneId){return stored.has(scene)}
export function installedArtworks(){return [...stored.keys()]}
export async function installArtworks(images:ReadonlyMap<SceneId,Blob>){
 if(!images.size)throw new Error('No valid artwork in the selected archive');
 await initializeArtwork();
 await putAll(images);
 for(const [id,blob] of images){
  stored.set(id,blob);
  const layer=decoded.get(id);
  if(layer){URL.revokeObjectURL(layer.url);decoded.delete(id)}
 }
 loaded=stored.size;
 return loaded;
}
function sceneLayer(id:SceneId):Layer|null{
 const old=decoded.get(id);
 if(old){
  // A frequently displayed scene stays in the small decode cache.
  decoded.delete(id);decoded.set(id,old);
  return old;
 }
 const blob=stored.get(id);
 if(!blob)return null;
 const url=URL.createObjectURL(blob);
 const image=new Image();
 const layer:Layer={image,url,ready:false,failed:false};
 image.onload=()=>{layer.ready=true};
 image.onerror=()=>{layer.failed=true};
 image.src=url;
 decoded.set(id,layer);
 while(decoded.size>MAX_IN_MEMORY){
  const first=decoded.keys().next().value;
  if(!first)break;
  const stale=decoded.get(first)!;decoded.delete(first);
  URL.revokeObjectURL(stale.url);
 }
 return layer;
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
