import {parseTrackFilename,type TrackInfo} from './trackInfo';
const KEY='lyricflow.trackCorrections.v1';
type Entry=TrackInfo&{fileName:string;updated:number};
function entries():Entry[]{
 try{const data:unknown=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(!Array.isArray(data))return [];
  return data.filter((x):x is Entry=>Boolean(x&&typeof x==='object'&&typeof x.fileName==='string'&&typeof x.title==='string'&&typeof x.artist==='string')).slice(-100);
 }catch{return []}
}
export function resolveTrackFilename(fileName:string):TrackInfo{
 const found=entries().find(x=>x.fileName===fileName);
 if(found)return {...found,source:'manual',confidence:1,provider:'local',audioSource:`Local Audio File (${fileName})`};
 return {...parseTrackFilename(fileName),fileName,provider:'local',audioSource:`Local Audio File (${fileName})`};
}
export function saveTrackCorrection(track:TrackInfo){
 if(!track.fileName||!track.title.trim())return;
 const item:Entry={...track,title:track.title.trim(),artist:track.artist.trim(),album:track.album.trim(),source:'manual',confidence:1,fileName:track.fileName,updated:Date.now()};
 const all=entries().filter(x=>x.fileName!==item.fileName);all.push(item);
 try{localStorage.setItem(KEY,JSON.stringify(all.slice(-100)))}catch{/* Private mode and quota can block persistence. */}
}
