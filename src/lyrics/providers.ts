import {providerRequest} from '../network/request';
import {
 extractYouTubeVideoId,
 hasValidLrcTimestamps,
 normalizeTrackForLyricsLookup as normalizeTrackMetaForLyricsLookup,
 rankCandidate,
 type TrackInfo,
 type TrackCandidate,
 type SearchRecord
} from '../metadata/trackInfo';
import {fetchAppleMusicWordSyncedLyrics, fetchYouTubeSubtitlesForTrack} from './appleLyrics';
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
 return {id:num(v.id),trackName:str(v.trackName),artistName:str(v.artistName),
 albumName:str(v.albumName),duration:num(v.duration),instrumental:v.instrumental===true,
 syncedLyrics:synced,hasWordSync:Boolean(synced&&(v.hasWordSync===true||synced.includes('<')))};
};
export const lrclibProvider:LyricProvider={
 id:'lrclib',label:'LRCLIB (track candidates)',
 async search(track,signal,rawOverride=false){
  const normalized=normalizeTrackForLyricsLookup(track,rawOverride);
  if(normalized.title.trim().length<2)return [];
  const isYt=!rawOverride&&(track.provider==='resolver'||Boolean(track.youtubeVideoId));
  const queryTitle=rawOverride?normalized.title.trim():cleanLyricMetadata(normalized.title.trim());
  const p=new URLSearchParams({track_name:queryTitle});
  if((rawOverride||!isYt)&&normalized.artist.trim()){
   p.set('artist_name',rawOverride?normalized.artist.trim():cleanLyricMetadata(normalized.artist));
  }
  const res=await providerRequest('https://lrclib.net/api/search?'+p.toString(),signal);
  if(res.status===429)throw new Error('Lyrics search rate limited. Wait before retrying.');
  if(!res.ok)throw new Error('Lyrics search unavailable (HTTP '+res.status+').');
  const data:unknown=await res.json();
  if(!Array.isArray(data))throw new Error('Unexpected lyrics search response.');
  return data.slice(0,25).map(record).filter((r):r is SearchRecord=>r!==null)
   .map(r=>rankCandidate(normalized,r,rawOverride)).filter(r=>rawOverride?r.confidence>=0.12:r.confidence>=.45)
   .sort((a,b)=>b.confidence-a.confidence).slice(0,10);
 }
};
export async function retrievePermittedLyrics(candidate:TrackCandidate, signal?:AbortSignal){
 if(!Number.isSafeInteger(candidate.id)||candidate.id<=0)throw new Error('Invalid lyrics ID');
 signal?.throwIfAborted();
 if(candidate.syncedLyrics&&hasValidLrcTimestamps(candidate.syncedLyrics))return {synced:candidate.syncedLyrics,plain:'',source:candidate.provider==='apple'?(candidate.hasWordSync?'Apple Library · Word-Synced':'Apple Library · Synced'):(candidate.hasWordSync?'LRCLIB · Word-Synced':'LRCLIB'),sourceUrl:candidate.url,license:'Rights supplied by user'};
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
   source:'LRCLIB',sourceUrl:candidate.url,license:'Rights supplied by user, not verified by LRCLIB'};
}

/** Automatic mode accepts only the same title/artist and a close recording length. */
export function isAutomaticLyricMatch(track:TrackInfo,candidate:TrackCandidate){
 const clean=(s:string)=>cleanLyricMetadata(s).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const isYt=track.provider==='resolver'||Boolean(track.youtubeVideoId);
 if(isYt){
  return clean(track.title)===clean(candidate.title)
   &&candidate.hasSynced&&!candidate.instrumental
   &&candidate.confidence>=0.45
   &&(track.duration<=0||candidate.duration<=0||candidate.duration<=track.duration+20);
 }
 return !!track.artist.trim()&&clean(track.title)===clean(candidate.title)&&clean(track.artist)===clean(candidate.artist)
  &&track.duration>0&&candidate.duration>0&&Math.abs(track.duration-candidate.duration)<=5
  &&candidate.hasSynced&&!candidate.instrumental;
}
export async function resolveAutomaticLyrics(track:TrackInfo,signal?:AbortSignal){
 const isYt=track.provider==='resolver'||Boolean(track.youtubeVideoId);
 if((!isYt&&!track.artist.trim())||track.duration<=0)return null;
 track=normalizeTrackForLyricsLookup(track);
 if(!isYt&&track.artist){
  const params=new URLSearchParams({track_name:track.title,artist_name:track.artist,duration:String(Math.round(track.duration))});
  const res=await providerRequest('https://lrclib.net/api/get?'+params,signal);
  if(res.ok){
   const raw:unknown=await res.json(),valid=record(raw);
   if(valid){const candidate=rankCandidate(track,valid);
    if(isAutomaticLyricMatch(track,candidate))return {original:valid.syncedLyrics||'',romanized:'',source:'LRCLIB · matched recording',sourceUrl:candidate.url};
   }
  }else if(res.status===429)throw Error('Automatic lyrics temporarily unavailable (HTTP '+res.status+'). Retry or import LRC.');
 }
 const candidates=await lrclibProvider.search(track,signal);
 const matches=candidates.filter(c=>isAutomaticLyricMatch(track,c));
 if(matches.length!==1)return null;
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
 availableEngines?:LyricEngineOption[];
 subtitleTracks?:YouTubeSubtitleTrackItem[];
 selectedSubtitleTrackId?:string;
}

async function resolveFromLrcLibrary(
 cleaned:TrackInfo,
 signal?:AbortSignal
):Promise<StashResolvedLyrics|null>{
 try{
  if(cleaned.duration>0){
   const exact=await resolveAutomaticLyrics(cleaned,signal);
   if(exact&&exact.original){
    const candidates=await lrclibProvider.search(cleaned,signal).catch(()=>[]);
    return {
     original:exact.original,
     romanized:exact.romanized,
     source:exact.original.includes('<')?'LRC Library · Word-Synced':'LRC Library · Synced',
     sourceUrl:exact.sourceUrl,
     hasWordSync:exact.original.includes('<'),
     candidates
    };
   }
  }
 }catch(e){
  if(signal?.aborted)throw e;
 }

 const candidates=await lrclibProvider.search(cleaned,signal).catch(()=>[]);
 if(!candidates.length)return null;
 const bestSynced=candidates.find(c=>c.hasSynced&&!c.instrumental&&c.confidence>=0.45);
 const target=bestSynced||candidates.find(c=>!c.instrumental&&c.confidence>=0.45);
 if(!target)return null;
 const retrieved=await retrievePermittedLyrics(target,signal);
 if(!retrieved.synced&&!retrieved.plain)return null;
 return {
  original:retrieved.synced,
  romanized:'',
  plain:retrieved.plain,
  source:retrieved.synced
   ?(retrieved.synced.includes('<')?'LRC Library · Word-Synced':'LRC Library · Synced')
   :'LRC Library · Plain Text',
  sourceUrl:retrieved.sourceUrl,
  hasWordSync:retrieved.synced.includes('<'),
  candidates
 };
}

/**
 * Multi-engine lyrics resolution supporting up to 4 selectable options per song
 * (only options that are actually available for the current song are included in `availableEngines`):
 * 1. `lyricflow` (LyricFlow Engine):
 *    - Collects creator-uploaded YouTube video subtitles (line-by-line synced to the actual video) AND
 *      Apple Library data (word-by-word sync), compares the two, and shifts/warps the
 *      Apple Music word-by-word timestamps onto the YouTube video timeline!
 *    - If Apple Library is not found, automatically falls back to YouTube Subtitles or LRC Library.
 * 2. `apple` (Apple Library):
 *    - Direct Apple Music word-by-word TTML / syllable sync.
 * 3. `lrclib` (LRC Library):
 *    - Direct LRCLIB timed LRC matched by cleaned title, post-search artist/album match, and duration.
 * 4. `youtube` (YouTube Subtitles):
 *    - Creator-uploaded closed captions / subtitles from the YouTube video (supports multiple subtitle tracks).
 */
export async function resolveStashLyricsChain(
 track:TrackInfo,
 signal?:AbortSignal,
 engineOption:LyricEngineOption='lyricflow',
 leadingNonMusicOffsetSec=0,
 selectedSubtitleTrackId?:string
):Promise<StashResolvedLyrics|null>{
 const ytVideoId=extractYouTubeVideoId(track);
 const cleaned:TrackInfo=normalizeTrackForLyricsLookup(track);
 if(cleaned.title.trim().length<2&&!ytVideoId)return null;

 // An explicit caption request must not wait for unrelated lyric providers.
 if(engineOption==='youtube'){
  if(!ytVideoId)throw new Error('Select a YouTube video before requesting its subtitles.');
  const result=await fetchYouTubeSubtitlesForTrack(ytVideoId,signal);
  signal?.throwIfAborted();
  if(!result?.lrc)throw new Error('This video has no accessible subtitle text. Import subtitles or choose another lyrics engine.');
  const subtitleTracks=result.subtitleTracks||[];
  const chosen=(selectedSubtitleTrackId&&subtitleTracks.find(t=>t.id===selectedSubtitleTrackId))||subtitleTracks[0];
  return {original:chosen?.lrc||result.lrc,romanized:'',source:chosen?`YouTube Subtitles (${chosen.label})`:result.source,sourceUrl:result.sourceUrl,hasWordSync:false,candidates:[],availableEngines:['lyricflow','youtube'],subtitleTracks,selectedSubtitleTrackId:chosen?.id};
 }

 // Probe available sources in parallel so we know which engines actually exist for this song
 // and so LyricFlow Engine can seamlessly combine or fall back between them.
 const [appleRes,lrcRes,ytSubRes]=await Promise.all([
  cleaned.title.trim().length>=2
   ?fetchAppleMusicWordSyncedLyrics(cleaned,signal,'apple').catch(()=>null)
   :Promise.resolve(null),
  cleaned.title.trim().length>=2
   ?resolveFromLrcLibrary(cleaned,signal).catch(()=>null)
   :Promise.resolve(null),
  ytVideoId
   ?fetchYouTubeSubtitlesForTrack(ytVideoId,signal).catch(()=>null)
   :Promise.resolve(null)
 ]);
 signal?.throwIfAborted();

 const hasApple=Boolean(appleRes&&(appleRes.lrc||appleRes.plain));
 const hasLrclib=Boolean(lrcRes&&(lrcRes.original||lrcRes.plain));
 const hasYoutube=Boolean(ytSubRes&&ytSubRes.lrc);

 const availableEngines:LyricEngineOption[]=[];
 if(hasApple||hasLrclib||hasYoutube){
  availableEngines.push('lyricflow');
 }
 if(hasApple)availableEngines.push('apple');
 if(hasLrclib)availableEngines.push('lrclib');
 if(hasYoutube)availableEngines.push('youtube');

 const subtitleTracks:YouTubeSubtitleTrackItem[]=ytSubRes?.subtitleTracks||[];
 const chosenSubTrack:YouTubeSubtitleTrackItem|undefined=
  (selectedSubtitleTrackId&&subtitleTracks.find(t=>t.id===selectedSubtitleTrackId))||
  subtitleTracks[0];
 const activeYoutubeLrc=chosenSubTrack?.lrc||ytSubRes?.lrc||'';
 const isAutomaticCaption=(item:YouTubeSubtitleTrackItem)=>Boolean(item.isAutoGenerated||/^a\./i.test(item.id)||/auto.generated/i.test(item.label));
 const alignmentYoutubeLrc=chosenSubTrack&&isAutomaticCaption(chosenSubTrack)?'':activeYoutubeLrc;
 const activeYoutubeLabel=chosenSubTrack?.label
  ?`YouTube Subtitles (${chosenSubTrack.label})`
  :ytSubRes?.source||'YouTube Subtitles';

 const candidates=lrcRes?.candidates||[];

 // If the requested engine is not available for this song, fall back to 'lyricflow'
 const effectiveEngine:LyricEngineOption=
  availableEngines.includes(engineOption)?engineOption:'lyricflow';

 // OPTION 3: LRC LIBRARY (LRCLIB)
 if(effectiveEngine==='lrclib'&&hasLrclib&&lrcRes){
  return {
   ...lrcRes,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // OPTION 2: APPLE LIBRARY
 if(effectiveEngine==='apple'&&hasApple&&appleRes){
  return {
   original:appleRes.lrc,
   romanized:appleRes.romanizedLrc||'',
   plain:appleRes.plain,
   source:appleRes.source||'Apple Library · Word-Synced',
   sourceUrl:appleRes.sourceUrl,
   hasWordSync:appleRes.hasWordSync,
   candidates,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // OPTION 1: LYRICFLOW ENGINE
 // 1a. Apple Library found -> align with best matching creator-uploaded YouTube subtitle track (or SponsorBlock offset)
 if(hasApple&&appleRes&&appleRes.lrc){
  // Pick the subtitle track that yields the best alignment with Apple lyrics (or user-selected track)
  let bestSubLrc=alignmentYoutubeLrc;
  let bestAligned=alignAppleWordSyncWithYouTubeSubtitles(
   appleRes.lrc,
   appleRes.romanizedLrc||'',
   bestSubLrc,
   leadingNonMusicOffsetSec
  );
  if(!selectedSubtitleTrackId&&subtitleTracks.length>1){
   for(const tr of subtitleTracks){
    if(isAutomaticCaption(tr))continue;
    const testAligned=alignAppleWordSyncWithYouTubeSubtitles(
     appleRes.lrc,
     appleRes.romanizedLrc||'',
     tr.lrc,
     leadingNonMusicOffsetSec
    );
    if(testAligned.matchedAnchors>bestAligned.matchedAnchors){
     bestAligned=testAligned;
     bestSubLrc=tr.lrc;
    }
   }
  }
  const offsetNote=
   bestAligned.appliedMedianOffsetSec!==0
    ?` (${bestAligned.appliedMedianOffsetSec>0?'+':''}${bestAligned.appliedMedianOffsetSec}s video sync)`
    :'';
  const sourceLabel=
   bestSubLrc&&bestAligned.syncMethod!=='direct-apple'
    ?`LyricFlow Engine · Apple Word-Sync + YT Subtitles${offsetNote}`
    :bestAligned.syncMethod==='sponsorblock-offset'
    ?`LyricFlow Engine · Apple Word-Sync + SponsorBlock${offsetNote}`
    :`LyricFlow Engine · ${appleRes.source}`;
  return {
   original:bestAligned.lrc,
   romanized:bestAligned.romanizedLrc,
   source:sourceLabel,
   sourceUrl:appleRes.sourceUrl||ytSubRes?.sourceUrl,
   hasWordSync:bestAligned.hasWordSync,
   candidates,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // 1b. If Apple Library is not found, fall back to LRC Library + YouTube Subtitles alignment (when both exist)
 if(hasLrclib&&lrcRes&&lrcRes.original&&hasYoutube&&alignmentYoutubeLrc){
  const aligned=alignAppleWordSyncWithYouTubeSubtitles(
   lrcRes.original,
   lrcRes.romanized||'',
   alignmentYoutubeLrc,
   leadingNonMusicOffsetSec
  );
  const offsetNote=
   aligned.appliedMedianOffsetSec!==0
    ?` (${aligned.appliedMedianOffsetSec>0?'+':''}${aligned.appliedMedianOffsetSec}s video sync)`
    :'';
  return {
   original:aligned.lrc,
   romanized:aligned.romanizedLrc,
   source:
    aligned.syncMethod!=='direct-apple'
     ?`LyricFlow Engine · LRC Library + YT Subtitles${offsetNote}`
     :`LyricFlow Engine · ${lrcRes.source}`,
   sourceUrl:lrcRes.sourceUrl||ytSubRes?.sourceUrl,
   hasWordSync:aligned.hasWordSync,
   candidates,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // 1c. If Apple Library is not found and creator-uploaded YouTube Subtitles exist, show YouTube Subtitles
 if(hasYoutube&&ytSubRes&&activeYoutubeLrc){
  return {
   original:activeYoutubeLrc,
   romanized:'',
   source:`LyricFlow Engine · ${activeYoutubeLabel}`,
   sourceUrl:ytSubRes.sourceUrl,
   hasWordSync:false,
   candidates,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // 1d. If Apple Library is not found and LRC Library exists, show LRC Library
 if(hasLrclib&&lrcRes){
  return {
   ...lrcRes,
   source:`LyricFlow Engine · ${lrcRes.source}`,
   availableEngines,
   subtitleTracks,
   selectedSubtitleTrackId:chosenSubTrack?.id
  };
 }

 // 1e. Additional server-side fallback (Musixmatch / KuGou) when neither Apple, LRCLIB, nor YouTube Subtitles matched
 if(cleaned.title.trim().length>=2){
  try{
   const extra=await fetchAppleMusicWordSyncedLyrics(cleaned,signal,'all');
   if(extra&&(extra.lrc||extra.plain)){
    return {
     original:extra.lrc||'',
     romanized:extra.romanizedLrc||'',
     plain:extra.plain,
     source:`LyricFlow Engine · ${extra.source}`,
     sourceUrl:extra.sourceUrl,
     hasWordSync:extra.hasWordSync,
     candidates,
     availableEngines:['lyricflow'],
     subtitleTracks
    };
   }
  }catch(e){
   if(signal?.aborted)throw e;
  }
 }

 return null;
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
  .replace(/(?:^|\s)@\S+/g,' ')
  .replace(/\s*[-–]\s*Topic$/i,'')
  .replace(/\s*[([](?:official(?: music)? (?:video|audio)|music video|lyrics?|lyric video|lyrical(?: video)?|full (?:song|video)|audio|visuali[sz]er|4k|hd|hq)[)\]]/gi,'')
  .replace(/\b(?:official(?: music)? video|lyric video|lyrical video)\b/gi,'')
  .replace(/\s+/g,' ')
  .trim();
}



