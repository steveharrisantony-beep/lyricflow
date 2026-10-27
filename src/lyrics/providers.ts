import {providerRequest} from '../network/request';
import type {TrackInfo, TrackCandidate, SearchRecord} from '../metadata/trackInfo';
import {rankCandidate} from '../metadata/trackInfo';
import {fetchAppleMusicWordSyncedLyrics} from './appleLyrics';

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
 syncedLyrics:typeof v.syncedLyrics==='string'?v.syncedLyrics:null,hasWordSync:v.hasWordSync===true || (typeof v.syncedLyrics==='string'&&v.syncedLyrics.includes('<'))};
};
export const lrclibProvider:LyricProvider={
 id:'lrclib',label:'LRCLIB (track candidates)',
 async search(track,signal){
  if(track.title.trim().length<2)return [];
  const p=new URLSearchParams({track_name:cleanLyricMetadata(track.title.trim())});
  if(track.artist)p.set('artist_name',cleanLyricMetadata(track.artist));
  const res=await providerRequest('https://lrclib.net/api/search?'+p.toString(),signal);
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
 signal?.throwIfAborted();
 if(candidate.syncedLyrics)return {synced:candidate.syncedLyrics,plain:'',source:candidate.hasWordSync?'LRCLIB · Word-Synced':'LRCLIB',sourceUrl:candidate.url,license:'Rights supplied by user'};
 const response=await providerRequest('https://lrclib.net/api/get/'+candidate.id,signal);
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
 const clean=(s:string)=>cleanLyricMetadata(s).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 return !!track.artist.trim()&&clean(track.title)===clean(candidate.title)&&clean(track.artist)===clean(candidate.artist)
  &&track.duration>0&&candidate.duration>0&&Math.abs(track.duration-candidate.duration)<=5
  &&candidate.hasSynced&&!candidate.instrumental;
}
export async function resolveAutomaticLyrics(track:TrackInfo,signal?:AbortSignal){
 if(!track.artist.trim()||track.duration<=0)return null;
 track={...track,title:cleanLyricMetadata(track.title),artist:cleanLyricMetadata(track.artist)};
 // A single exact request first, matching Stash's bounded get → search strategy.
 const params=new URLSearchParams({track_name:track.title,artist_name:track.artist,duration:String(Math.round(track.duration))});
 const res=await providerRequest('https://lrclib.net/api/get?'+params,signal);
 if(res.ok){
  const raw:unknown=await res.json(),valid=record(raw);
  if(valid){const candidate=rankCandidate(track,valid);
   if(isAutomaticLyricMatch(track,candidate))return {original:valid.syncedLyrics||'',romanized:'',source:'LRCLIB · matched recording',sourceUrl:candidate.url};
  }
 }else if(res.status===429)throw Error('Automatic lyrics temporarily unavailable (HTTP '+res.status+'). Retry or import LRC.');
 const candidates=await lrclibProvider.search(track,signal);
 const matches=candidates.filter(c=>isAutomaticLyricMatch(track,c));
 // Multiple different recordings at the same length need user selection.
 if(matches.length!==1){if(!res.ok&&res.status!==404&&!matches.length)throw Error('Lyrics provider is temporarily unavailable. Try again shortly.');return null}
 const lyric=await retrievePermittedLyrics(matches[0],signal);
 return lyric.synced?{original:lyric.synced,romanized:'',source:lyric.source,sourceUrl:lyric.sourceUrl}:null;
}

export interface StashResolvedLyrics {
 original:string;
 romanized:string;
 plain?:string;
 source:string;
 sourceUrl?:string;
 hasWordSync:boolean;
 candidates:TrackCandidate[];
}

/**
 * Stash-style automatic lyrics resolution pipeline:
 * 1. Queries Apple Music word-synced lyrics library (TTML / syllable word sync)
 * 2. Falls back to LRCLIB exact match (duration-bounded)
 * 3. Falls back to top-ranked LRCLIB synced or plain lyrics candidate
 */
export async function resolveStashLyricsChain(
 track:TrackInfo,
 signal?:AbortSignal
):Promise<StashResolvedLyrics|null>{
 if(track.title.trim().length<2)return null;
 const cleaned:TrackInfo=normalizeTrackForLyricsLookup(track);

 let fallbackPlainResult: { plain: string; source: string; sourceUrl?: string } | null = null;

 // 1. Try Stash Apple Music / ISRC TTML / Musixmatch / KuGou word-synced & synced lyrics first
 try{
  const apple=await fetchAppleMusicWordSyncedLyrics(cleaned,signal);
  if(apple&&apple.lrc){
   // Also fetch LRCLIB candidates in background for alternative version switcher
   const backupCandidates=await lrclibProvider.search(cleaned,signal).catch(()=>[]);
   return {
    original:apple.lrc,
    romanized:apple.romanizedLrc||'',
    source:apple.source,
    sourceUrl:apple.sourceUrl,
    hasWordSync:apple.hasWordSync,
    candidates:backupCandidates
   };
  }
  if(apple&&apple.plain){
   fallbackPlainResult={plain:apple.plain,source:apple.source,sourceUrl:apple.sourceUrl};
  }
 }catch(e){
  if(signal?.aborted)throw e;
 }

 // 2. Try exact LRCLIB recording lookup
 try{
  if(cleaned.artist&&cleaned.duration>0){
   const exact=await resolveAutomaticLyrics(cleaned,signal);
   if(exact&&exact.original){
    const candidates=await lrclibProvider.search(cleaned,signal).catch(()=>[]);
    return {
     original:exact.original,
     romanized:exact.romanized,
     source:exact.original.includes('<')?'LRCLIB · Word-Synced':'LRCLIB · Synced',
     sourceUrl:exact.sourceUrl,
     hasWordSync:exact.original.includes('<'),
     candidates
    };
   }
  }
 }catch(e){
  if(signal?.aborted)throw e;
 }

 // 3. Fallback to LRCLIB ranked search candidates (best synced or plain match)
 const candidates=await lrclibProvider.search(cleaned,signal).catch(()=>[]);
 if(!candidates.length){
  if(fallbackPlainResult){
   return {
    original:'',
    romanized:'',
    plain:fallbackPlainResult.plain,
    source:fallbackPlainResult.source,
    sourceUrl:fallbackPlainResult.sourceUrl,
    hasWordSync:false,
    candidates:[]
   };
  }
  return null;
 }

 const bestSynced=candidates.find(c=>c.hasSynced&&!c.instrumental&&c.confidence>=0.38);
 const target=bestSynced||candidates.find(c=>!c.instrumental)||candidates[0];
 if(!target)return null;

 const retrieved=await retrievePermittedLyrics(target,signal);
 if(!retrieved.synced&&!retrieved.plain){
  if(fallbackPlainResult){
   return {
    original:'',
    romanized:'',
    plain:fallbackPlainResult.plain,
    source:fallbackPlainResult.source,
    sourceUrl:fallbackPlainResult.sourceUrl,
    hasWordSync:false,
    candidates
   };
  }
  return null;
 }

 return {
  original:retrieved.synced,
  romanized:'',
  plain:retrieved.plain||fallbackPlainResult?.plain,
  source:retrieved.synced?(retrieved.synced.includes('<')?'LRCLIB · Word-Synced':'LRCLIB · Synced'):'LRCLIB · Plain Text',
  sourceUrl:retrieved.sourceUrl,
  hasWordSync:retrieved.synced.includes('<'),
  candidates
 };
}

export function normalizeTrackForLyricsLookup(track:TrackInfo):TrackInfo{
 let rawTitle=cleanLyricMetadata(track.title);
 let rawArtist=cleanLyricMetadata(track.artist);
 if(track.provider==='resolver'||track.youtubeVideoId){
  const pipeParts=rawTitle.split('|').map(s=>s.trim()).filter(Boolean);
  if(pipeParts.length>1){
   rawTitle=cleanLyricMetadata(pipeParts[0]);
  }
  const dashMatch=rawTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if(dashMatch){
   const left=cleanLyricMetadata(dashMatch[1]);
   const right=cleanLyricMetadata(dashMatch[2]);
   if(left.length>=2&&right.length>=2){
    rawArtist=left;
    rawTitle=right;
   }
  }else{
   const colonMatch=rawTitle.match(/^(.+?):\s+(.+)$/);
   if(colonMatch&&colonMatch[2].trim().length>=2){
    rawTitle=cleanLyricMetadata(colonMatch[2]);
   }
  }
 }
 return {
  ...track,
  title:rawTitle,
  artist:rawArtist
 };
}

/** Remove upload packaging only; preserve live/remix/acoustic/version identity. */
export function cleanLyricMetadata(value:string){
 return value
  .replace(/\s*[-–]\s*Topic$/i,'')
  .replace(/\s*[([](?:official(?: music)? (?:video|audio)|lyrics?|lyric video|lyrical(?: video)?|full (?:song|video)|audio|visuali[sz]er|4k|hd|hq)[)\]]/gi,'')
  .replace(/\b(?:official(?: music)? video|lyric video|lyrical video)\b/gi,'')
  .replace(/\s+/g,' ')
  .trim();
}

