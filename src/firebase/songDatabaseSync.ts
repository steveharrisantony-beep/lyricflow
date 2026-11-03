import {collection,getDocsFromServer,query,where,limit} from 'firebase/firestore';
import {db} from './firebaseClient';
import {atomicDeviceWrite,readDevice,scopedKey} from './deviceStore';
import {validSongMapping,retrySongMappings} from './songMappings';
import {validCorrection} from './correctionModel';
import {retryAccountCorrections} from './correctionStore';
import {retryCustomLyrics} from './usePrivateLyrics';
import {notifySongMappingData,retrySongMappingReset,songMappingResetPending,songMappingResetVersion} from './songMappingReset';

const running=new Map<string,Promise<boolean>>();
export async function flushAccountSongData(uid:string){
 if(!db||navigator.onLine===false)return false;
 if(!await retrySongMappingReset(uid))return false;
 // Explicit saves/imports are pending user writes. Send them before pulling cloud state.
 await Promise.all([retrySongMappings(uid),retryAccountCorrections(uid),retryCustomLyrics(uid)]);
 return true;
}

/** One bulk startup/reconnect sync; playback hooks only read the local database. */
export function syncAccountSongData(uid:string):Promise<boolean>{
 const active=running.get(uid);if(active)return active;
 const task=(async()=>{
  if(!db||navigator.onLine===false||!await retrySongMappingReset(uid))return false;
  // Imports intentionally replace cloud conflicts. Ordinary startup conflicts prefer Firebase.
  await Promise.all([retrySongMappings(uid,true),retryAccountCorrections(uid,true),retryCustomLyrics(uid,true)]);
  const version=songMappingResetVersion(uid);
  const names=['songMappings','corrections','customLyrics'] as const;
  const before=Object.fromEntries(names.map(name=>[name,readDevice<Record<string,unknown>>(scopedKey(name,uid),{})]));
  const snapshots=await Promise.all(names.map(name=>getDocsFromServer(collection(db!,'profiles',uid,name))));
  if(version!==songMappingResetVersion(uid)||songMappingResetPending(uid))return false;
  const writes:Record<string,unknown>={};
  snapshots.forEach((snapshot,index)=>{
   const name=names[index],key=scopedKey(name,uid);
   const cloud:Record<string,unknown>={};
   for(const document of snapshot.docs){
    const value=document.data();
    if(name==='songMappings'){
     const checked=value.identity&&validSongMapping(value,value.identity);if(checked)cloud[document.id]={...checked,dirty:[]};
    }else if(name==='corrections'){
     const checked=value.identity&&validCorrection(value,value as Parameters<typeof validCorrection>[1]);
     if(checked)cloud[document.id]={value:checked,dirty:false};
    }else if(value.identity&&typeof value.text==='string'&&value.text.length<=100000){
     cloud[document.id]={identity:value.identity,text:value.text,dirty:false};
    }
   }
   const current=readDevice<Record<string,unknown>>(key,{});
   for(const id of new Set([...Object.keys(before[name]),...Object.keys(cloud)])){
    // A Save/import/reset performed while this request was running is newer than its snapshot.
    if(JSON.stringify(current[id])!==JSON.stringify(before[name][id]))continue;
    if(cloud[id])current[id]=cloud[id];
    else{
     const value=current[id] as {dirty?:boolean|string[]}|undefined;
     // A new offline save has no cloud counterpart to conflict with.
     if(!(Array.isArray(value?.dirty)?value.dirty.length:value?.dirty))delete current[id];
    }
   }
   writes[key]=current;
  });
  atomicDeviceWrite(writes);notifySongMappingData();
  await Promise.all([retrySongMappings(uid),retryAccountCorrections(uid),retryCustomLyrics(uid)]);
  return true;
 })().finally(()=>running.delete(uid));
 running.set(uid,task);return task;
}

let publicSync:Promise<void>|undefined;
/** Public approved data is warmed once, never fetched on each song transition. */
export function syncPublishedSongData(){
 if(!db||navigator.onLine===false)return Promise.resolve();
 if(publicSync)return publicSync;
 publicSync=(async()=>{
  const results=await Promise.allSettled(['songMappings','approvedCorrections'].map(name=>
   getDocsFromServer(query(collection(db!,name),where('active','==',true),limit(300)))));
  results.forEach((result,index)=>{
   if(result.status!=='fulfilled')return;
   const cache:Record<string,unknown>={};
   for(const document of result.value.docs){
    const raw=document.data();
    const checked=index===0?raw.identity&&validSongMapping(raw,raw.identity):raw.identity&&validCorrection(raw,raw as Parameters<typeof validCorrection>[1]);
    if(checked)cache[document.id]=index===0?checked:{value:checked,dirty:false};
   }
   atomicDeviceWrite({[index===0?'lyricflow.v4.publishedSongMappings':'lyricflow.v3.approvedCorrections']:cache});
  });
  notifySongMappingData();
 })().finally(()=>{publicSync=undefined;});
 return publicSync;
}
