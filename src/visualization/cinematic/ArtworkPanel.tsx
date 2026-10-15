import {useEffect,useRef,useState} from 'react';
import {unzipSync} from 'fflate';
import {byId,TEMPLATES,type SceneId} from './catalog';
import {availableArtworkCount,initializeArtwork,installArtworks} from './artwork';

const MAX_ZIP=12_000_000;
const MAX_UNPACKED=35_000_000;
const MAX_IMAGE=1_500_000;
function isWebP(bytes:Uint8Array):boolean{
 return bytes.length>=16&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&
  String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
}
export function parseSceneArchive(bytes:Uint8Array):Map<SceneId,Blob>{
 if(bytes.byteLength>MAX_ZIP)throw new Error('The ZIP file exceeds 12 MB. Use an optimized LyricFlow scene pack.');
 const entries=unzipSync(bytes);
 const scenes=new Map<SceneId,Blob>();
 let extracted=0;
 for(const [filename,raw] of Object.entries(entries)){
  extracted+=raw.byteLength;
  if(extracted>MAX_UNPACKED)throw new Error('Archive expands beyond 35 MB.');
  const basename=filename.split('/').pop()?.toLowerCase()||'';
  if(!basename.endsWith('.webp'))continue;
  const id=basename.slice(0,-5);
  if(!(id in byId))continue;
  if(raw.byteLength>MAX_IMAGE)throw new Error('Image '+basename+' exceeds 1.5 MB.');
  if(!isWebP(raw))throw new Error('Invalid WebP format: '+basename);
  // Make a true standalone ArrayBuffer-backed byte view for browser Blob constructors.
  const copy=new Uint8Array(new ArrayBuffer(raw.byteLength));copy.set(raw);
  scenes.set(id as SceneId,new Blob([copy],{type:'image/webp'}));
 }
 if(!scenes.size)throw new Error('No matching scene-name.webp files found in this ZIP.');
 return scenes;
}
export default function ArtworkPanel(){
 const input=useRef<HTMLInputElement>(null);
 const [count,setCount]=useState(availableArtworkCount());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('Loading locally saved artwork…');
 useEffect(()=>{
  let live=true;
  initializeArtwork().then(()=>{
   if(live){const amount=availableArtworkCount();setCount(amount);setMessage(amount?'26 premium scene images are built into LyricFlow. You can optionally import a ZIP to replace an image or complete the remaining scenes.':'No bundled artwork found. Import a scene ZIP to enable premium backgrounds.')}
  }).catch(e=>{if(live)setMessage('Local artwork storage unavailable: '+String(e))});
  return()=>{live=false};
 },[]);
 async function importPack(){
  const file=input.current?.files?.[0];
  if(!file)return;
  setBusy(true);
  try{
   if(file.size>MAX_ZIP)throw new Error('Maximum supported pack size is 12 MB.');
   const list=parseSceneArchive(new Uint8Array(await file.arrayBuffer()));
   const total=await installArtworks(list);
   setCount(total);
   setMessage('Installed '+list.size+' local artwork overrides. Bundled GitHub backgrounds remain available for other scenes; nothing was uploaded.');
  }catch(e){
   setMessage(e instanceof Error?e.message:'The scene pack could not be imported.');
  }finally{
   setBusy(false);if(input.current)input.current.value='';
  }
 }
 return <div className="artwork-panel">
  <div className="artwork-summary">
   <div><b>PREMIUM BACKGROUND ARTWORK</b><small>26 included with LyricFlow · cinematic camera drift · lyrics remain independent</small></div>
   <strong className="artwork-count">{count} / {TEMPLATES.length}</strong>
  </div>
  <div className="artwork-options">
   <input ref={input} type="file" accept=".zip,application/zip" aria-label="Import cinematic scene background ZIP" className="visually-hidden" onChange={()=>void importPack()}/>
   <button type="button" className="upload-button" disabled={busy} onClick={()=>input.current?.click()}>
    {busy?'Installing artwork…':'Import or replace scene artwork (optional)'}
   </button>
   <span className="artwork-hint">Your optional ZIP overrides bundled WebP images by scene ID and is saved in IndexedDB on this tablet.</span>
  </div>
  <p className="player-footnote" role="status">{message}</p>
  {count===0&&<p className="player-footnote">No images currently available. The existing scenes still work without any image files.</p>}
  {count>0&&count<TEMPLATES.length&&<p className="player-footnote">{TEMPLATES.length-count} scene(s) are waiting for distinct premium artwork and use their original procedural fallback in the meantime.</p>}
 </div>;
}
