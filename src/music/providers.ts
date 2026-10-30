import {musicBackendBase} from '../network/backend';
import {providerRequest} from '../network/request';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

export const MUSIC_SOURCES={ytmusic:'YouTube Music',soundcloud:'SoundCloud',jiosaavn:'JioSaavn',audius:'Audius',resolver:'YouTube'} as const;

/** Only JioSaavn and YouTube are exposed in the built-in online player UI */
export const BUILTIN_PLAYER_SOURCES={
 jiosaavn:'JioSaavn',
 resolver:'YouTube'
} as const;

/** Search metadata and resolve playable sources separately, as in a native player. */
export interface SongResult {
 id:string;title:string;artist:string;album:string;duration:number;
 provider:keyof typeof MUSIC_SOURCES;sourceUrl:string;artwork?:string;
 directStreamUrl?:string;audioSource?:string;
 youtubeVideoId?:string;videoTitle?:string;
 viewCount?:number;
 videoType?:'ATV'|'OMV'|'UGC';
}
export interface PlayableSong extends SongResult {streamUrl:string;format?:'hls'|'audio'|'youtube'}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
const string=(v:unknown)=>typeof v==='string'?v:'';

/** Backgrounds require a video label or known music-video metadata; static audio is never a fallback. */
export const isLyricalVideo=(song:SongResult)=>/\blyric(?:s|al)?\b/i.test(song.title);
export function isYouTubeBackgroundVideo(song:SongResult){
 const label=`${song.title} ${song.videoTitle||''}`;
 if(!extractYouTubeVideoId(song)||song.videoType==='ATV'||/[-–]\s*Topic$/i.test(song.artist)||/^Audio Track$/i.test(song.album))return false;
 if(/\b(?:audio|jukebox|album\s*(?:art|image)|cover\s*art|static|visuali[sz]er|auto.generated|podcast|reaction)\b/i.test(label))return false;
 return isLyricalVideo(song)||song.videoType==='OMV'||/\b(?:(?:official|music|full)\s*video|video\s*song|mv)\b/i.test(label);
}
const videoWords=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
export function rankYouTubeBackgroundCandidates(songs:SongResult[],track:{title:string;artist:string;duration:number},preference:'music'|'lyrics'='music'):SongResult[]{
 const titleWords=videoWords(track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' '));
 const artistWords=videoWords(track.artist).filter(w=>w.length>1&&!['unknown','various','artist','artists','official','music','records','vevo'].includes(w));
 const scored=songs.filter(isYouTubeBackgroundVideo).flatMap(song=>{
  const lyric=isLyricalVideo(song);
  if(preference==='lyrics'&&!lyric)return [];
  const words=new Set(videoWords(song.title));
  const titleMatch=titleWords.filter(w=>words.has(w)).length/Math.max(1,titleWords.length);
  if(titleMatch<.75)return [];
  const context=new Set(videoWords(song.title+' '+song.artist));
  const artistMatch=artistWords.filter(w=>context.has(w)).length/Math.max(1,artistWords.length);
  if(artistWords.length&&artistMatch===0)return [];
  const version=/\b(cover|live|remix|karaoke|instrumental|sped\s*up|slowed|nightcore)\b/i;
  if(version.test(song.title)&&!version.test(track.title))return [];
  const difference=track.duration>0&&song.duration>0?Math.abs(song.duration-track.duration):null;
  if(difference!==null&&(song.duration<track.duration*.6||difference>Math.max(100,track.duration*.5)))return [];
  const timing=difference===null?0:25*Math.max(0,1-difference/Math.max(30,track.duration*.3));
  const score=titleMatch*100+artistMatch*45+timing+(/\bofficial\b/i.test(song.title)?5:0);
  return [{song,lyric,score}];
 });
 return scored.sort((a,b)=>{
  // A suitable music video wins; use a lyrical video when no music video passes the checks.
  if(preference==='music'&&a.lyric!==b.lyric)return Number(a.lyric)-Number(b.lyric);
  if(Math.abs(a.score-b.score)>3)return b.score-a.score;
  return (b.song.viewCount||0)-(a.song.viewCount||0)||b.score-a.score;
 }).map(item=>item.song);
}

export function formatViewCount(views?:number):string{
 if(typeof views!=='number'||!Number.isFinite(views)||views<=0)return '';
 if(views>=1_000_000_000)return `${(views/1_000_000_000).toFixed(1).replace(/\.0$/,'')}B views`;
 if(views>=1_000_000)return `${(views/1_000_000).toFixed(1).replace(/\.0$/,'')}M views`;
 if(views>=1_000)return `${(views/1_000).toFixed(1).replace(/\.0$/,'')}K views`;
 return `${Math.round(views)} views`;
}

export function resolverBase(value:string){
 if(!value.trim())return '';
 const u=new URL(value,typeof location!=='undefined'?location.origin:undefined);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))&&(typeof location==='undefined'||u.origin!==location.origin))throw Error('Use an HTTPS resolver address.');
 if(u.username||u.password||u.search||u.hash)throw Error('Use a resolver base URL without credentials or query parameters.');
 return u.href.replace(/\/$/,'');
}
export function parseSongs(value:unknown,provider:SongResult['provider']):SongResult[]{
 if(!record(value)||!Array.isArray(value.data))throw Error('The music provider returned an unexpected response.');
 return value.data.slice(0,20).flatMap(item=>{
  if(!record(item)||!string(item.id)||!string(item.title))return [];
  if(provider==='audius'&&(item.is_streamable===false||item.is_stream_gated===true))return [];
  const user=record(item.user)?item.user:{};
  const art=record(item.artwork)?item.artwork:{};
  const duration=typeof item.duration==='number'&&Number.isFinite(item.duration)?Math.max(0,item.duration):0;
  const viewCount=typeof item.viewCount==='number'&&Number.isFinite(item.viewCount)&&item.viewCount>0?Math.round(item.viewCount):undefined;
  const resolvedProv=(Object.hasOwn(MUSIC_SOURCES,string(item.provider))?string(item.provider):provider) as SongResult['provider'];
  const id=string(item.id);
  const sourceUrl=provider==='audius'&&string(item.permalink)?'https://audius.co'+string(item.permalink):string(item.sourceUrl);
  const ytId=string(item.youtubeVideoId)||extractYouTubeVideoId({id,provider:resolvedProv,sourceUrl})||undefined;
  const artworkUrl=string(art['480x480'])||string(art['150x150'])||string(item.artwork)||(ytId?`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`:undefined);
  return [{id,title:string(item.title),artist:string(item.artist)||string(user.name),album:string(item.album),duration,provider:resolvedProv,
   sourceUrl,artwork:artworkUrl,
   directStreamUrl:string(item.directStreamUrl)||undefined,
   audioSource:string(item.audioSource)||undefined,
   youtubeVideoId:ytId,
   videoTitle:string(item.videoTitle)||(ytId?string(item.title):undefined),
   viewCount,videoType:['ATV','OMV','UGC'].includes(string(item.videoType))?item.videoType as SongResult['videoType']:undefined}];
 });
}
async function json(url:string,signal?:AbortSignal){
 const response=await providerRequest(url,signal);
 if(!response.ok){const data=await response.json().catch(()=>null);if(record(data)&&typeof data.detail==='string')throw Error(data.detail);throw Error(response.status===429?'Music search is busy. Please retry shortly.':`Music provider unavailable (HTTP ${response.status}). Try another source or a local file.`);}
 return response.json() as Promise<unknown>;
}
export async function searchSongs(query:string,provider:SongResult['provider'],base:string,signal?:AbortSignal){
 if(query.trim().length<2)return [];
 const url=provider==='audius'?'https://api.audius.co/v1/tracks/search?'+new URLSearchParams({query:query.trim(),limit:'16',app_name:'LyricFlow'}):resolverBase(base)+'/search?'+new URLSearchParams({q:query.trim(),provider:provider==='resolver'?'youtube':provider});
 if(provider!=='audius'&&!base.trim())throw Error('Connect a music resolver in Search settings first.');
 return parseSongs(await json(url,signal),provider);
}
export async function resolveSong(song:SongResult,base:string,signal?:AbortSignal):Promise<PlayableSong>{
 const ytId=song.youtubeVideoId||extractYouTubeVideoId(song)||undefined;
 // The embedded player provides YouTube audio; it does not need an audio proxy.
 if(song.provider==='resolver'&&ytId)return {...song,youtubeVideoId:ytId,streamUrl:'https://www.youtube.com/watch?v='+ytId,format:'youtube',audioSource:'YouTube Video'};
 if(song.directStreamUrl)return {...song,youtubeVideoId:ytId,streamUrl:song.directStreamUrl,format:'audio',audioSource:song.audioSource||MUSIC_SOURCES[song.provider]};
 if(song.provider==='audius'&&!song.id.startsWith('audius_'))return {...song,streamUrl:'https://api.audius.co/v1/tracks/'+encodeURIComponent(song.id)+'/stream?app_name=LyricFlow',audioSource:song.audioSource||'Audius (Direct Stream)'};
 const root=resolverBase(base);
 const data=await json(root+'/resolve/'+encodeURIComponent(song.id),signal);
 if(!record(data)||typeof data.streamPath!=='string'||!/^\/audio\/[\w-]+$/.test(data.streamPath))throw Error('Invalid music resolver response.');
 const meta=record(data.track)?parseSongs({data:[data.track]},song.provider)[0]:null;
 const audioSource=string(data.audioSource)||meta?.audioSource||song.audioSource||MUSIC_SOURCES[song.provider];
 const resolvedYtId=string(data.youtubeVideoId)||meta?.youtubeVideoId||ytId;
 const format:PlayableSong['format']=data.format==='hls'?'hls':data.format==='youtube'?'youtube':'audio';
 return {
  ...song,
  ...meta,
  artist:meta?.artist||song.artist,
  title:meta?.title||song.title,
  videoTitle:meta?.videoTitle||song.videoTitle||(resolvedYtId?song.title:undefined),
  youtubeVideoId:resolvedYtId,
  streamUrl:root+data.streamPath,
  format,
  audioSource
 };
}

/**
 * Built-in Online Player & Background Video search:
 * 1. Queries the Express /music resolver (passing signed-in YouTube account headers if connected).
 * 2. If searching YouTube ('resolver') and the server is rate-limited or returns empty, falls back to:
 *    - Direct YouTube URL / 11-char Video ID lookup,
 *    - Authenticated client-side YouTube Data API v3 (when signed in with Google OAuth),
 *    - Client-side Piped API mirrors from the user's own device IP.
 */
export async function searchStashCatalog(
 query:string,
 provider:SongResult['provider'],
 base:string,
 signal?:AbortSignal
):Promise<SongResult[]>{
 if(query.trim().length<2)return [];
 const effectiveBase=base.trim()||musicBackendBase();

 if(effectiveBase){
  try{
   const res=await providerRequest(
    `${effectiveBase.replace(/\/$/,'')}/search?`+new URLSearchParams({q:query.trim(),provider:provider==='resolver'?'youtube':provider}).toString(),
    signal
   );
   if(res.ok){
    const payload=await res.json();
    const parsed=parseSongs(payload,provider).filter(s=>s.duration===0||s.duration>=45);
    if(parsed.length>0)return parsed;
   }
  }catch(e){
   if(signal?.aborted)throw e;
  }
 }

 if(provider==='resolver'){
  // Fallback A: Direct YouTube URL or 11-char Video ID pasted into manual search
  const directId=extractYouTubeVideoId({id:query.trim(),provider:'resolver',sourceUrl:query.trim()});
  if(directId){
   try{
    const oembed=await fetch(
     `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${directId}`)}`,
     {signal}
    );
    if(oembed.ok){
     const info=(await oembed.json()) as {title?:string;author_name?:string};
     const title=string(info.title)||`YouTube Video (${directId})`;
     const artist=string(info.author_name)||'YouTube';
     return [{
      id:`yt_${directId}`,
      title,
      videoTitle:title,
      artist,
      album:'',
      duration:0,
      provider:'resolver',
      sourceUrl:`https://www.youtube.com/watch?v=${directId}`,
      artwork:`https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
      youtubeVideoId:directId,
      audioSource:'YouTube Video'
     }];
    }
   }catch(e){
    if(signal?.aborted)throw e;
   }
   return [{
    id:`yt_${directId}`,
    title:`YouTube Video (${directId})`,
    videoTitle:`YouTube Video (${directId})`,
    artist:'YouTube',
    album:'',
    duration:0,
    provider:'resolver',
    sourceUrl:`https://www.youtube.com/watch?v=${directId}`,
    artwork:`https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
    youtubeVideoId:directId,
    audioSource:'YouTube Video'
   }];
  }

  // Fallback B: Client-side Piped API mirror from user's residential/device IP
  const pipedMirrors=[
   'https://pipedapi.kavin.rocks',
   'https://api.piped.private.coffee'
  ];
  for(const mirror of pipedMirrors){
   try{
    const res=await fetch(
     `${mirror}/search?`+new URLSearchParams({q:query.trim(),filter:'videos'}).toString(),
     {signal}
    );
    if(!res.ok)continue;
    const data=(await res.json()) as {items?:Array<Record<string,unknown>>};
    const items=Array.isArray(data?.items)?data.items:[];
    const fallbackSongs:SongResult[]=[];
    for(const item of items){
     if(!record(item))continue;
     const urlStr=string(item.url);
     const vid=extractYouTubeVideoId({id:urlStr,provider:'resolver',sourceUrl:`https://www.youtube.com${urlStr}`});
     const title=string(item.title);
     if(!vid||!title)continue;
     const dur=typeof item.duration==='number'&&Number.isFinite(item.duration)?Math.max(0,item.duration):0;
     if(dur>0&&dur<45)continue;
     const views=typeof item.views==='number'&&Number.isFinite(item.views)&&item.views>0?Math.round(item.views):undefined;
     const artist=string(item.uploaderName)||'YouTube';
     fallbackSongs.push({
      id:`yt_${vid}`,
      title,
      videoTitle:title,
      artist,
      album:'',
      duration:dur,
      viewCount:views,
      provider:'resolver',
      sourceUrl:`https://www.youtube.com/watch?v=${vid}`,
      artwork:string(item.thumbnail)||`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      youtubeVideoId:vid,
      audioSource:'YouTube Video'
     });
     if(fallbackSongs.length>=16)break;
    }
    if(fallbackSongs.length>0)return fallbackSongs;
   }catch(e){
    if(signal?.aborted)throw e;
   }
  }
 }

 return [];
}

