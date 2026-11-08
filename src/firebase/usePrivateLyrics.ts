import { useEffect, useState } from 'react';
import { LEGACY_DELAYS_KEY, type SongDelayRecord } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import { type RecordingIdentity } from './correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';
import {localSongData} from '../data/localSongData';
import {temporarySongs,TEMPORARY_SONG_EVENT} from '../data/temporarySongs';

type Custom = { identity: RecordingIdentity; text: string; dirty: boolean; imported?:boolean };
export function legacySongDelay(track: TrackInfo | null): SongDelayRecord | null {
  if (!track) return null;
  const records = Object.values(readDevice<Record<string, SongDelayRecord>>(LEGACY_DELAYS_KEY, {}));
  return records.find(r => typeof r.title === 'string' && r.title.toLowerCase() === track.title.toLowerCase()
    && typeof r.artist === 'string' && r.artist.toLowerCase() === track.artist.toLowerCase()
    && Math.abs(r.duration - track.duration) <= 1) || null;
}
export function usePrivateLyrics(track: TrackInfo | null, uid: string | null) {
  const [,refresh]=useState(0);
  useEffect(()=>{
    const emit=()=>refresh(value=>value+1);
    window.addEventListener('lyricflow:customLyrics',emit);window.addEventListener(TEMPORARY_SONG_EVENT,emit);
    return()=>{window.removeEventListener('lyricflow:customLyrics',emit);window.removeEventListener(TEMPORARY_SONG_EVENT,emit);};
  },[]);
  const local=localSongData(track,uid);
  const save=(text:string)=>temporarySongs.edit(track,uid,entry=>{entry.draftText=text.slice(0,100000);});
  return {text:local.text,hasOverride:Boolean(local.text),save,error:''};
}

export function importGuestCustomLyrics(uid: string) {
  const guest = readDevice<Record<string, Custom>>(scopedKey('customLyrics', null), {});
  const cacheKey = scopedKey('customLyrics', uid);
  const account = readDevice<Record<string, Custom>>(cacheKey, {});
  for(const [id,entry] of Object.entries(guest))account[id]={...entry,dirty:true,imported:true};
  writeDevice(cacheKey,account);
  window.dispatchEvent(new Event('lyricflow:customLyrics'));
}
export async function retryCustomLyrics(_uid:string,_importsOnly=false){
  return;
}
