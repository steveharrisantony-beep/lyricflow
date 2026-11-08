import {readDevice,scopedKey} from './deviceStore';

const versions=new Map<string,number>();
export const songMappingResetVersion=(uid:string)=>versions.get(uid)||0;
export function markSongMappingReset(uid:string){versions.set(uid,songMappingResetVersion(uid)+1);}
export const songMappingResetKey=(uid:string)=>scopedKey('songMappingResetPending',uid);
export const songMappingResetPending=(uid:string)=>readDevice<boolean>(songMappingResetKey(uid),false);
export function notifySongMappingData(){
 for(const event of ['lyricflow:songMappings','lyricflow:corrections','lyricflow:customLyrics'])window.dispatchEvent(new Event(event));
}
export function retrySongMappingReset(uid:string):Promise<boolean>{
 if(!songMappingResetPending(uid))return Promise.resolve(true);
 localStorage.removeItem(songMappingResetKey(uid));
 notifySongMappingData();
 return Promise.resolve(true);
}
