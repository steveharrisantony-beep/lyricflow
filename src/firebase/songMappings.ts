import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import {songMappingResetPending,songMappingResetVersion} from './songMappingReset';
import { correctionContext, type LyricsSourceReference, type LyricsSelection, type RecordingIdentity } from './correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';
import {localSongData} from '../data/localSongData';
import {temporarySongs,TEMPORARY_SONG_EVENT} from '../data/temporarySongs';

export interface SongLyricsMapping { sourceFile: LyricsSourceReference; selection: LyricsSelection | null; delaySeconds: number; }
export interface SongVideoMapping { youtubeVideoId: string; delaySeconds: number|null; }
export interface SongMapping { identity: RecordingIdentity; lyrics?: SongLyricsMapping; video?: SongVideoMapping; hideLyrics?: boolean; hideVideo?: boolean; }
export const SONG_MAPPING_FIELDS=['lyrics','video','hideLyrics','hideVideo'] as const;
type SongMappingField=typeof SONG_MAPPING_FIELDS[number];
type Entry = SongMapping & { dirty?: SongMappingField[]; removed?:boolean; imported?:boolean };
type Cache = Record<string, Entry>;
const PUBLIC = 'lyricflow.v4.publishedSongMappings';
const EVENT = 'lyricflow:songMappings';
export function sameSong(a: RecordingIdentity, b: RecordingIdentity) { return a.title === b.title && a.artist === b.artist && a.duration === b.duration; }
export function validSongMapping(raw: unknown, identity: RecordingIdentity): SongMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SongMapping;
  if (!r.identity || !sameSong(r.identity, identity)) return null;
  const result: SongMapping = { identity };
  for(const field of ['hideLyrics','hideVideo'] as const){
    if(r[field]!==undefined){if(typeof r[field]!=='boolean')return null;result[field]=r[field];}
  }
  if (r.lyrics) {
    const l = r.lyrics, f = l.sourceFile;
    if (!f || typeof f.name !== 'string' || f.name.length > 256 || typeof f.url !== 'string' || f.url.length > 2048 || !/^l3_[a-f0-9]{16}$/.test(f.revision) || !Number.isFinite(l.delaySeconds) || Math.abs(l.delaySeconds) > 30) return null;
    const selection = l.selection;
    if (selection && (!['lyricflow','apple','lrclib','youtube'].includes(selection.engine) ||
      (selection.lrclibId !== null && (!Number.isSafeInteger(selection.lrclibId) || selection.lrclibId <= 0 || selection.engine !== 'lrclib')) ||
      (selection.subtitleTrackId !== null && (typeof selection.subtitleTrackId !== 'string' || selection.subtitleTrackId.length > 256)))) return null;
    result.lyrics = { sourceFile: { ...f }, selection: selection ? { ...selection } : null, delaySeconds: l.delaySeconds };
  }
  if (r.video) {
    if (!/^[\w-]{11}$/.test(r.video.youtubeVideoId) || (r.video.delaySeconds!==null&&(!Number.isFinite(r.video.delaySeconds)||Math.abs(r.video.delaySeconds)>300))) return null;
    result.video = { ...r.video };
  }
  return result;
}
function notify() { window.dispatchEvent(new Event(EVENT)); }
function cacheWrite(key: string, id: string, entry: Entry | null) {
  const data = readDevice<Cache>(key, {});
  if (entry) data[id] = entry; else delete data[id];
  writeDevice(key, key === PUBLIC ? Object.fromEntries(Object.entries(data).slice(-300)) : data); notify();
}
const flushing=new Map<string,Promise<void>>();
function flush(uid:string,id:string):Promise<void>{
  const lock=uid+':'+id+':'+songMappingResetVersion(uid),existing=flushing.get(lock);
  if(existing)return existing.then(()=>flush(uid,id),()=>flush(uid,id));
  const work=flushLatest(uid,id).finally(()=>{if(flushing.get(lock)===work)flushing.delete(lock);});
  flushing.set(lock,work);return work;
}
async function flushLatest(uid: string, id: string) {
  if (!db||songMappingResetPending(uid)) return;
  const key = scopedKey('songMappings', uid), entry = readDevice<Cache>(key, {})[id],version=songMappingResetVersion(uid);
  if(entry?.removed){
    await deleteDoc(doc(db,'profiles',uid,'songMappings',id));
    if(version!==songMappingResetVersion(uid))return;
    if(readDevice<Cache>(key,{})[id]?.removed)cacheWrite(key,id,null);
    return;
  }
  const fields=entry?.dirty||[];if(!fields.length)return;
  const values=Object.fromEntries(fields.map(field=>[field,entry[field]??deleteField()]));
  await setDoc(doc(db,'profiles',uid,'songMappings',id),{identity:entry.identity,...values,updatedAt:serverTimestamp()},
    {mergeFields:['identity',...fields,'updatedAt']});
  if(version!==songMappingResetVersion(uid))return;
  const latest=readDevice<Cache>(key,{})[id];
  if(latest&&!latest.removed){
    const remaining=latest.dirty?.filter(field=>!fields.includes(field)||JSON.stringify(latest[field])!==JSON.stringify(entry[field]));
    cacheWrite(key,id,{...latest,imported:remaining?.length?latest.imported:false,dirty:remaining});
  }
}
export async function retrySongMappings(uid: string,importsOnly=false) {
  await Promise.all(Object.entries(readDevice<Cache>(scopedKey('songMappings', uid), {}))
    .filter(([,entry])=>(!importsOnly||entry.imported)&&(entry.removed||entry.dirty?.length)).map(([id])=>flush(uid,id)));
}
export function useSongMapping(track: TrackInfo | null, uid: string | null) {
  const serialized=JSON.stringify(correctionContext(track,'lyrics'));
  const context=useMemo(()=>JSON.parse(serialized) as ReturnType<typeof correctionContext>,[serialized]);
  const [,refresh]=useState(0);
  useEffect(()=>{
    const emit=()=>refresh(value=>value+1);
    window.addEventListener(EVENT,emit);window.addEventListener(TEMPORARY_SONG_EVENT,emit);
    return()=>{window.removeEventListener(EVENT,emit);window.removeEventListener(TEMPORARY_SONG_EVENT,emit);};
  },[]);
  const local=localSongData(track,uid),personal=local.mapping;
  const approved=context?validSongMapping(readDevice<Cache>(PUBLIC,{})[context.recordingKey],context.identity):null;
  const [error,setError]=useState('');
  const savePart=<K extends SongMappingField>(field:K,value:NonNullable<SongMapping[K]>|null)=>{
    if(!context)return;
    const draft={...(localSongData(track,uid).mapping||{identity:context.identity}),[field]:value??undefined};
    if(!validSongMapping(draft,context.identity)){setError('Invalid song mapping.');return;}
    temporarySongs.edit(track,uid,entry=>{
      entry.draftMapping=draft;
      if(field==='lyrics'){delete entry.lyrics;if(!value)entry.draftText='';}
      if(field==='video')delete entry.videos;
    });
  };
  return {lyrics:personal?.lyrics||approved?.lyrics||null,video:personal?.video||approved?.video||null,
    hideLyrics:personal?.hideLyrics??false,hideVideo:personal?.hideVideo??false,personal,approved,savePart,error};
}

export function importGuestSongMappings(uid: string) {
  const guest = readDevice<Cache>(scopedKey('songMappings', null), {});
  const key = scopedKey('songMappings', uid), account = readDevice<Cache>(key, {});
  for (const [id, entry] of Object.entries(guest)) {
    const merged={...account[id],...entry};
    account[id]={...merged,imported:true,dirty:SONG_MAPPING_FIELDS.filter(field=>merged[field]!==undefined)};
  }
  writeDevice(key, account); notify(); void retrySongMappings(uid).catch(()=>{});
}

