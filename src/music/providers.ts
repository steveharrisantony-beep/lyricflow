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
}
export interface PlayableSong extends SongResult {streamUrl:string;format?:'hls'|'audio'|'youtube'}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
const string=(v:unknown)=>typeof v==='string'?v:'';
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
  const resolvedProv=(Object.hasOwn(MUSIC_SOURCES,string(item.provider))?string(item.provider):provider) as SongResult['provider'];
  const id=string(item.id);
  const sourceUrl=provider==='audius'&&string(item.permalink)?'https://audius.co'+string(item.permalink):string(item.sourceUrl);
  const ytId=string(item.youtubeVideoId)||extractYouTubeVideoId({id,provider:resolvedProv,sourceUrl})||undefined;
  return [{id,title:string(item.title),artist:string(item.artist)||string(user.name),album:string(item.album),duration,provider:resolvedProv,
   sourceUrl,artwork:string(art['480x480'])||string(art['150x150'])||string(item.artwork)||undefined,
   directStreamUrl:string(item.directStreamUrl)||undefined,
   audioSource:string(item.audioSource)||undefined,
   youtubeVideoId:ytId,
   videoTitle:string(item.videoTitle)||(ytId?string(item.title):undefined)}];
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
 * Built-in Online Player search:
 * Queries the Express /music resolver for JioSaavn (320kbps AAC) and YouTube Video/Audio.
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

 return [];
}
