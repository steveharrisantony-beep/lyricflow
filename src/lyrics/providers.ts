import {lyricProviderName,normalizeLyricSource} from './sourceLabels';
import {hasWordTiming} from './lyricsQuality';
import {providerRequest} from '../network/request';
import {buildLyricsSearchPlan,type LyricsSearchContext,type LyricsSearchReport,type LyricsSearchCandidate} from './searchPlan';
import {executeLyricsSearchPlan} from './searchLyrics';
import {
 extractYouTubeVideoId,
 isYouTubeAudioTrack,
 hasValidLrcTimestamps,
 normalizeTrackForLyricsLookup as normalizeTrackMetaForLyricsLookup,
 rankCandidate,
 type TrackInfo,
 type TrackCandidate,
 type SearchRecord
} from '../metadata/trackInfo';
import {fetchYouTubeSubtitlesForTrack,type AppleLyricResult} from './appleLyrics';
import {
 alignAppleWordSyncWithYouTubeSubtitles,
 type LyricEngineOption,
 type YouTubeSubtitleTrackItem
} from './lyricFlowEngine';

export interface LyricProvider {
 id:string; label:string;
 search(track:TrackInfo, signal?:AbortSignal, rawOverride?:boolean):Promise<TrackCandidate[]>;
}
const isRecord=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null;
const str=(x:unknown)=>typeof x==='string'?x:'';
const num=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:0;
const record=(v:unknown):SearchRecord|null=>{
 if(!isRecord(v)||!Number.isSafeInteger(v.id)||!str(v.trackName))return null;
 const synced=typeof v.syncedLyrics==='string'&&hasValidLrcTimestamps(v.syncedLyrics)?v.syncedLyrics:null;
 const plain=typeof v.plainLyrics==='string'&&v.plainLyrics.trim()?v.plainLyrics.trim():null;
 return {id:num(v.id),trackName:str(v.trackName),artistName:str(v.artistName),
 albumName:str(v.albumName),duration:num(v.duration),instrumental:v.instrumental===true,
 syncedLyrics:synced,plainLyrics:plain,hasWordSync:hasWordTiming(synced||undefined)};
};
export const lrclibProvider:LyricProvider={
 id:'lrclib',label:'LRCLIB (track candidates)',
 async search(track,signal,rawOverride=false){
  const normalized=normalizeTrackForLyricsLookup(track,rawOverride);
  if(normalized.title.trim().length<2)return [];
  const isYt=!rawOverride&&(isYouTubeAudioTrack(track));
  const queryTitle=rawOverride?normalized.title.trim():cleanLyricMetadata(normalized.title.trim());
  const p=new URLSearchParams({track_name:queryTitle});
  if((rawOverride||!isYt)&&normalized.artist.trim()){
   p.set('artist_name',rawOverride?normalized.artist.trim():cleanLyricMetadata(normalized.artist));
  }
  const runSearchQuery=async(params:URLSearchParams):Promise<TrackCandidate[]>=>{
   const res=await providerRequest('https://lrclib.net/api/search?'+params.toString(),signal);
   if(res.status===429)throw new Error('Lyrics search rate limited. Wait before retrying.');
   if(!res.ok)throw new Error('Lyrics search unavailable (HTTP '+res.status+').');
   const data:unknown=await res.json();
   if(!Array.isArray(data))throw new Error('Unexpected lyrics search response.');
   return data.slice(0,25).map(record).filter((r):r is SearchRecord=>r!==null)
    .map(r=>rankCandidate(normalized,r,rawOverride)).filter(r=>rawOverride?r.confidence>=0.12:r.confidence>=.45)
    .sort((a,b)=>b.confidence-a.confidence).slice(0,10);
  };
  const primary=await runSearchQuery(p);
  if(primary.length>0)return primary;
  if(!rawOverride&&!isYt&&normalized.artist.trim()&&/[,&/|]|\b(?:feat|ft)\b/i.test(normalized.artist)){
   const fallbackParams=new URLSearchParams({track_name:queryTitle});
   const retry=await runSearchQuery(fallbackParams).catch(()=>[]);
   if(retry.length>0)return retry;
  }
  const artistHint=cleanLyricMetadata((track.channelHint||track.artist||'').trim());
  if(isYt&&artistHint){
   const withArtistParams=new URLSearchParams({track_name:queryTitle,artist_name:artistHint});
   const retry=await runSearchQuery(withArtistParams).catch(()=>[]);
   if(retry.length>0)return retry;
  }
  return primary;
 }
};
export async function retrievePermittedLyrics(candidate:TrackCandidate, signal?:AbortSignal){
 if(!Number.isSafeInteger(candidate.id)||(candidate.id<=0&&candidate.provider!=='apple'))throw new Error('Invalid lyrics ID');
 signal?.throwIfAborted();
 const cleanCandTitle=candidate.title.replace(/\s*\[Apple Library\]$/i,'').trim()||candidate.title;
 if(candidate.syncedLyrics&&hasValidLrcTimestamps(candidate.syncedLyrics))return {synced:candidate.syncedLyrics,plain:'',source:candidate.provider==='apple'?normalizeLyricSource(candidate.sourceLabel||'Synced lyrics',candidate.url):(candidate.hasWordSync?'LRCLIB · Word-Synced':'LRCLIB'),sourceUrl:candidate.url,title:cleanCandTitle,artist:candidate.artist,license:'Rights supplied by user'};
 if(candidate.provider==='apple')throw Error('The selected source has no usable timed lyrics.');
 const response=await providerRequest('https://lrclib.net/api/get/'+candidate.id,signal);
 if(!response.ok)throw new Error('Lyrics provider returned HTTP '+response.status);
 const data:unknown=await response.json();
 const valid=record(data);
 if(!valid||valid.id!==candidate.id)throw new Error('Invalid lyrics provider result');
 const lyrics=data as Record<string,unknown>;
 const rawSynced=typeof lyrics.syncedLyrics==='string'?lyrics.syncedLyrics:'';
 const validSynced=hasValidLrcTimestamps(rawSynced)?rawSynced:'';
 const plainFallback=typeof lyrics.plainLyrics==='string'?lyrics.plainLyrics:(!validSynced&&rawSynced?rawSynced:'');
 return {synced:validSynced,
   plain:plainFallback,
   source:'LRCLIB',sourceUrl:candidate.url,title:valid.trackName||cleanCandTitle,artist:valid.artistName||candidate.artist,license:'Rights supplied by user, not verified by LRCLIB'};
}

export interface StashResolvedLyrics {
 mappingRevision?:string;
 searchComplete?:boolean;
 original:string;
 romanized:string;
 plain?:string;
 source:string;
 sourceUrl?:string;
 title?:string;
 artist?:string;
 hasWordSync:boolean;
 candidates:TrackCandidate[];
 availableEngines?:LyricEngineOption[];
 subtitleTracks?:YouTubeSubtitleTrackItem[];
 selectedSubtitleTrackId?:string;
}

export function lyricsFromSearchCandidate(candidate:LyricsSearchCandidate):StashResolvedLyrics{
 const provider=lyricProviderName(candidate.source,candidate.sourceUrl||'');
 const engine=provider==='LRCLIB'?'lrclib':
  ['lrc.red','Binimum','Paxsenix'].includes(provider||'')?'apple':null;
 return {
  original:candidate.lrc||'',romanized:candidate.romanized||'',plain:candidate.plain,
  source:normalizeLyricSource(candidate.source,candidate.sourceUrl),sourceUrl:candidate.sourceUrl,
  title:candidate.title,artist:candidate.artist,hasWordSync:candidate.quality===3,
  candidates:[],availableEngines:engine?['lyricflow',engine]:['lyricflow'],
 };
}

/** Playback and preloading enter here. Explicit captions are a separate video lookup. */
export async function resolveStashLyricsChain(
 track:TrackInfo,
 signal?:AbortSignal,
 engine:LyricEngineOption='lyricflow',
 leadingOffset=0,
 subtitleId?:string,
 onProgress?:(result:StashResolvedLyrics)=>void,
 context:LyricsSearchContext={},
 onReport?:(report:LyricsSearchReport)=>void,
):Promise<StashResolvedLyrics|null>{
 if(engine==='youtube'){
  const videoId=context.backgroundVideoId||extractYouTubeVideoId(track)||track.videoId;
  if(!videoId)throw new Error('Select a YouTube video before requesting its subtitles.');
  const result=await fetchYouTubeSubtitlesForTrack(videoId,signal);
  signal?.throwIfAborted();
  if(!result?.lrc)throw new Error('This video has no accessible subtitle text. Import subtitles or choose another lyrics engine.');
  const subtitleTracks=result.subtitleTracks||[];
  const chosen=subtitleTracks.find(item=>item.id===subtitleId)||subtitleTracks[0];
  return {original:chosen?.lrc||result.lrc,romanized:'',source:chosen?`YouTube Subtitles (${chosen.label})`:result.source,
   sourceUrl:result.sourceUrl,title:result.title||track.videoTitle||track.title,artist:result.artist||track.artist,
   hasWordSync:false,candidates:[],availableEngines:['lyricflow','youtube'],subtitleTracks,selectedSubtitleTrackId:chosen?.id};
 }

 const plan=buildLyricsSearchPlan(track);
 // Captions can align a verified match to the video clock, but cannot win a discovery stage.
 const timingVideo=plan.audioSource==='youtube'&&engine==='lyricflow'?(extractYouTubeVideoId(track)||track.videoId):null;
 const timingController=new AbortController();
 const cancelTiming=()=>timingController.abort(signal?.reason);
 signal?.addEventListener('abort',cancelTiming,{once:true});
 if(signal?.aborted)cancelTiming();
 let captions:AppleLyricResult|null=null;
 const timing=timingVideo?fetchYouTubeSubtitlesForTrack(timingVideo,timingController.signal)
  .then(value=>{captions=value;}).catch(()=>undefined):null;
 const timingDeadline=timing?setTimeout(()=>timingController.abort(),6000):undefined;
 const resolved=(candidate:LyricsSearchCandidate)=>{
  const lyrics={...lyricsFromSearchCandidate(candidate),searchComplete:false};
  if(engine!=='lyricflow'||plan.audioSource!=='youtube'||!lyrics.original)return lyrics;
  const subtitleTracks=captions?.subtitleTracks||[];
  const usable=subtitleTracks.filter(item=>!item.isAutoGenerated&&!/^a\./i.test(item.id)&&!/auto.generated/i.test(item.label));
  const preferred=usable.find(item=>item.id===subtitleId);
  let aligned=alignAppleWordSyncWithYouTubeSubtitles(lyrics.original,lyrics.romanized,preferred?.lrc||'',leadingOffset);
  if(!preferred){
   for(const item of usable){
    const candidateAlignment=alignAppleWordSyncWithYouTubeSubtitles(lyrics.original,lyrics.romanized,item.lrc,leadingOffset);
    if(candidateAlignment.matchedAnchors>aligned.matchedAnchors)aligned=candidateAlignment;
   }
  }
  return {...lyrics,original:aligned.lrc,romanized:aligned.romanizedLrc,
   subtitleTracks,availableEngines:captions?[...(lyrics.availableEngines||['lyricflow']),'youtube' as const]:lyrics.availableEngines};
 };
 try{
  const result=await executeLyricsSearchPlan(plan,engine,signal,
   candidate=>onProgress?.(resolved(candidate)),onReport);
  if(!result)return null;
  if(timing)await timing;
  signal?.throwIfAborted();
  return {...resolved(result),searchComplete:true};
 }finally{
  clearTimeout(timingDeadline);
  timingController.abort();
  signal?.removeEventListener('abort',cancelTiming);
 }
}

/**
 * Normalize track metadata for lyrics lookup:
 * Delegates to trackInfo's normalizeTrackForLyricsLookup so `videoTitle` and `channelHint` are preserved.
 */
export function normalizeTrackForLyricsLookup(track:TrackInfo, rawOverride=false):TrackInfo{
 return normalizeTrackMetaForLyricsLookup(track, rawOverride);
}

/** Remove upload packaging only; preserve live/remix/acoustic/version identity. */
export function cleanLyricMetadata(value:string){
 return value
  .replace(/[\u2018\u2019\u02BC]/g,"'")
  .replace(/[\u201C\u201D]/g,'"')
  .replace(/(?:^|\s)@\S+/g,' ')
  .replace(/\s*[-–]\s*Topic$/i,'')
  .replace(/\s*[([](?:official(?: music)? (?:video|audio)|music video|lyrics?|lyric video|lyrical(?: video)?|full (?:song|video)|audio|visuali[sz]er|4k|hd|hq)[)\]]/gi,'')
  .replace(/\b(?:official(?: music)? video|lyric video|lyrical video)\b/gi,'')
  .replace(/\s+/g,' ')
  .trim();
}



