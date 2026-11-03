import {readDevice,scopedKey} from '../firebase/deviceStore';
import {recordingIdentity,type RecordingIdentity} from '../firebase/correctionModel';
import {validSongMapping,type SongMapping} from '../firebase/songMappings';
import type {TrackInfo} from '../metadata/trackInfo';
import {temporarySongs} from './temporarySongs';

/** Provider and catalog ID deliberately do not participate in matching. */
export function findSongRecord<T extends {identity:RecordingIdentity;removed?:boolean}>(records:Record<string,T>,identity:RecordingIdentity):T|undefined{
 return Object.values(records).filter(value=>!value.removed&&value.identity?.title===identity.title)
  .find(value=>value.identity.artist===identity.artist&&value.identity.duration===identity.duration);
}
const indexes=new Map<string,{raw:string|null;byTitle:Map<string,unknown[]>}>();
function lookup<T extends {identity:RecordingIdentity;removed?:boolean}>(key:string,identity:RecordingIdentity):T|undefined{
 let raw:string|null;try{raw=localStorage.getItem(key);}catch{return undefined;}
 let index=indexes.get(key);
 if(!index||index.raw!==raw){
  const records=readDevice<Record<string,T>>(key,{}),byTitle=new Map<string,unknown[]>();
  for(const value of Object.values(records))if(value.identity&&!value.removed){
   const items=byTitle.get(value.identity.title)||[];items.push(value);byTitle.set(value.identity.title,items);
  }
  index={raw,byTitle};indexes.set(key,index);
 }
 return (index.byTitle.get(identity.title) as T[]|undefined)?.find(value=>value.identity.artist===identity.artist&&value.identity.duration===identity.duration);
}
export function localSongData(track:TrackInfo|null,uid:string|null){
 const identity=recordingIdentity(track);if(!identity)return {mapping:null,text:'',session:undefined};
 const saved=lookup<SongMapping>(scopedKey('songMappings',uid),identity);
 const mapping=saved?validSongMapping(saved,identity):null;
 const custom=lookup<{identity:RecordingIdentity;text:string}>(scopedKey('customLyrics',uid),identity);
 const text=custom?.text||'';
 const session=temporarySongs.reconcile(track,uid,JSON.stringify([mapping?.lyrics,mapping?.video,mapping?.hideLyrics,mapping?.hideVideo,text]));
 return {mapping:session?.draftMapping||mapping,text:session?.draftText??text,session};
}

