import type {TrackInfo} from '../metadata/trackInfo';
import {correctionContext,type Correction,type RecordingIdentity} from '../firebase/correctionModel';
import {SONG_MAPPING_FIELDS,sameSong,validSongMapping,type SongMapping} from '../firebase/songMappings';
import {atomicDeviceWrite,readDevice,scopedKey} from '../firebase/deviceStore';
import {notifySongMappingData} from '../firebase/songMappingReset';
import {flushAccountSongData} from '../firebase/songDatabaseSync';
import {localSongData} from './localSongData';

/** This is the sole playback-edit commit point. Selection/timing controls only stage drafts. */
export function saveSongMapping(track:TrackInfo|null,uid:string|null){
 const context=correctionContext(track,'lyrics');if(!context)throw new Error('Choose a song first.');
 const local=localSongData(track,uid);
 const mapping=validSongMapping(local.mapping||{identity:context.identity},context.identity);
 if(!mapping)throw new Error('This song mapping is invalid.');
 const mappingKey=scopedKey('songMappings',uid),customKey=scopedKey('customLyrics',uid),correctionCacheKey=scopedKey('corrections',uid);
 const mappings=readDevice<Record<string,SongMapping&{dirty?:string[];removed?:boolean}>>(mappingKey,{});
 const custom=readDevice<Record<string,{identity:RecordingIdentity;text:string;dirty:boolean}>>(customKey,{});
 const corrections=readDevice<Record<string,{value:Correction;dirty:boolean;removed?:boolean}>>(correctionCacheKey,{});
 for(const [id,value] of Object.entries(mappings))if(id!==context.recordingKey&&value.identity&&sameSong(value.identity,context.identity)){
  if(uid)mappings[id]={identity:value.identity,removed:true};else delete mappings[id];
 }
 mappings[context.recordingKey]={...mapping,dirty:uid?[...SONG_MAPPING_FIELDS]:[]};
 for(const [id,value] of Object.entries(custom))if(id!==context.recordingKey&&sameSong(value.identity,context.identity)){
  if(uid)custom[id]={identity:value.identity,text:'',dirty:true};else delete custom[id];
 }
 custom[context.recordingKey]={identity:context.identity,text:mapping.lyrics?local.text:'',dirty:Boolean(uid)};
 for(const [id,value] of Object.entries(local.session?.corrections||{})){
  if(value)corrections[id]={value,dirty:Boolean(uid)};
  else if(uid&&corrections[id])corrections[id]={...corrections[id],dirty:true,removed:true};
  else delete corrections[id];
 }
 atomicDeviceWrite({[mappingKey]:mappings,[customKey]:custom,[correctionCacheKey]:corrections});
 // Reconciliation invalidates any prepared result from the previous permanent mapping.
 localSongData(track,uid);notifySongMappingData();
 if(uid)void flushAccountSongData(uid).catch(()=>{/* Durable pending data retries at reconnect/startup. */});
}
