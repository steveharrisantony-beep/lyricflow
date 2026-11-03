import {collection,getDocsFromServer,writeBatch} from 'firebase/firestore';
import {db} from './firebaseClient';
import {readDevice,scopedKey} from './deviceStore';

// A reset also invalidates acknowledgements from writes already in flight.
const versions=new Map<string,number>();
export const songMappingResetVersion=(uid:string)=>versions.get(uid)||0;
export function markSongMappingReset(uid:string){versions.set(uid,songMappingResetVersion(uid)+1);}
export const songMappingResetKey=(uid:string)=>scopedKey('songMappingResetPending',uid);
export const songMappingResetPending=(uid:string)=>readDevice<boolean>(songMappingResetKey(uid),false);
export function notifySongMappingData(){
 for(const event of ['lyricflow:songMappings','lyricflow:corrections','lyricflow:customLyrics'])window.dispatchEvent(new Event(event));
}
const inFlight=new Map<string,Promise<boolean>>();
/** Keep the reset pending offline so old account snapshots cannot restore deleted data. */
export function retrySongMappingReset(uid:string):Promise<boolean>{
 if(!songMappingResetPending(uid))return Promise.resolve(true);
 if(!db||navigator.onLine===false)return Promise.resolve(false);
 const running=inFlight.get(uid);if(running)return running;
 const database=db;
 const task=(async()=>{
  // Include account records which have never been opened on this device.
  const snapshots=await Promise.all(['songMappings','corrections','customLyrics'].map(name=>getDocsFromServer(collection(database,'profiles',uid,name))));
  const documents=snapshots.flatMap(snapshot=>snapshot.docs);
  for(let offset=0;offset<documents.length;offset+=450){
   const batch=writeBatch(database);
   for(const document of documents.slice(offset,offset+450))batch.delete(document.ref);
   await batch.commit();
  }
  localStorage.removeItem(songMappingResetKey(uid));
  notifySongMappingData();
  return true;
 })().finally(()=>inFlight.delete(uid));
 inFlight.set(uid,task);
 return task;
}
