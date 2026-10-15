import type {TrackInfo, TrackCandidate, SearchRecord} from '../metadata/trackInfo';
import {rankCandidate} from '../metadata/trackInfo';
export interface LyricProvider {
 id:string; label:string;
 search(track:TrackInfo, signal?:AbortSignal):Promise<TrackCandidate[]>;
}
const isRecord=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null;
const str=(x:unknown)=>typeof x==='string'?x:'';
const num=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:0;
const record=(v:unknown):SearchRecord|null=>{
 if(!isRecord(v)||!Number.isSafeInteger(v.id)||!str(v.trackName))return null;
 return {id:num(v.id),trackName:str(v.trackName),artistName:str(v.artistName),
 albumName:str(v.albumName),duration:num(v.duration),instrumental:v.instrumental===true,
 syncedLyrics:typeof v.syncedLyrics==='string'?v.syncedLyrics:null,hasWordSync:v.hasWordSync===true};
};
export const lrclibProvider:LyricProvider={
 id:'lrclib',label:'LRCLIB (track candidates)',
 async search(track,signal){
  if(track.title.trim().length<2)return [];
  const p=new URLSearchParams({track_name:track.title.trim()});
  if(track.artist)p.set('artist_name',track.artist);
  const res=await fetch('https://lrclib.net/api/search?'+p.toString(),{
    headers:{'Lrclib-Client':'LyricFlow/0.2 (https://github.com/steveharrisantony-beep/lyricflow)'},
    signal
  });
  if(res.status===429)throw new Error('Lyrics search rate limited. Wait before retrying.');
  if(!res.ok)throw new Error('Lyrics search unavailable (HTTP '+res.status+').');
  const data:unknown=await res.json();
  if(!Array.isArray(data))throw new Error('Unexpected lyrics search response.');
  return data.slice(0,20).map(record).filter((r):r is SearchRecord=>r!==null)
   .map(r=>rankCandidate(track,r)).filter(r=>r.confidence>=.23)
   .sort((a,b)=>b.confidence-a.confidence).slice(0,8);
 }
};
export async function retrievePermittedLyrics(candidate:TrackCandidate, signal?:AbortSignal){
 if(!Number.isSafeInteger(candidate.id)||candidate.id<=0)throw new Error('Invalid lyrics ID');
 const response=await fetch('https://lrclib.net/api/get/'+candidate.id,{signal,headers:{'Lrclib-Client':'LyricFlow/0.2 (https://github.com/steveharrisantony-beep/lyricflow)'}});
 if(!response.ok)throw new Error('Lyrics provider returned HTTP '+response.status);
 const data:unknown=await response.json();
 const valid=record(data);
 if(!valid||valid.id!==candidate.id)throw new Error('Invalid lyrics provider result');
 const lyrics=data as Record<string,unknown>;
 return {synced:typeof lyrics.syncedLyrics==='string'?lyrics.syncedLyrics:'',
   plain:typeof lyrics.plainLyrics==='string'?lyrics.plainLyrics:'',
   source:'LRCLIB',sourceUrl:candidate.url,license:'Rights supplied by user, not verified by LRCLIB'};
}

/** Automatic mode accepts only the same title/artist and a close recording length. */
export function isAutomaticLyricMatch(track:TrackInfo,candidate:TrackCandidate){
 const clean=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 return !!track.artist.trim()&&clean(track.title)===clean(candidate.title)&&clean(track.artist)===clean(candidate.artist)
  &&track.duration>0&&candidate.duration>0&&Math.abs(track.duration-candidate.duration)<=2
  &&candidate.hasSynced&&!candidate.instrumental;
}
export async function resolveAutomaticLyrics(track:TrackInfo,signal?:AbortSignal){
 if(!track.artist.trim()||track.duration<=0)return null;
 // A single exact request first, matching Stash's bounded get → search strategy.
 const params=new URLSearchParams({track_name:track.title,artist_name:track.artist,duration:String(Math.round(track.duration))});
 const res=await fetch('https://lrclib.net/api/get?'+params,{signal});
 if(res.ok){
  const raw:unknown=await res.json(),valid=record(raw);
  if(valid){const candidate=rankCandidate(track,valid);
   if(isAutomaticLyricMatch(track,candidate))return {original:valid.syncedLyrics||'',romanized:'',source:'LRCLIB · matched recording',sourceUrl:candidate.url};
   if(valid.instrumental)return null;
  }
 }else if(res.status!==404)throw Error('Automatic lyrics temporarily unavailable (HTTP '+res.status+'). Retry or import LRC.');
 const candidates=await lrclibProvider.search(track,signal);
 const matches=candidates.filter(c=>isAutomaticLyricMatch(track,c));
 // Multiple different recordings at the same length need user selection.
 if(matches.length!==1)return null;
 const lyric=await retrievePermittedLyrics(matches[0],signal);
 return lyric.synced?{original:lyric.synced,romanized:'',source:lyric.source,sourceUrl:lyric.sourceUrl}:null;
}
