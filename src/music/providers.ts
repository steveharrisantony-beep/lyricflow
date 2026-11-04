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
 primaryArtist?:string;featuredArtist?:string;
 provider:keyof typeof MUSIC_SOURCES;sourceUrl:string;artwork?:string;
 directStreamUrl?:string;audioSource?:string;
 youtubeVideoId?:string;videoTitle?:string;
 viewCount?:number;
 videoType?:'ATV'|'OMV'|'UGC';
 channelId?:string;channelVerified?:boolean;uploaderName?:string;artistCredits?:string[];artistChannelIds?:string[];
 counterpartOf?:string;catalogueTitle?:string;catalogueArtists?:string[];catalogueAlbum?:string;embeddable?:boolean;
 visualContent?:'motion'|'static'|'unknown';metadataSource?:'ytmusic'|'innertube'|'mirror'|'oembed';
}
export interface PlayableSong extends SongResult {streamUrl:string;format?:'hls'|'audio'|'youtube'}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
const string=(v:unknown)=>typeof v==='string'?v:'';

export {isLyricalVideo} from './videoMatching';

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
export function parseSongs(value:unknown,provider:SongResult['provider'],keepIncomplete=false):SongResult[]{
 if(!record(value)||!Array.isArray(value.data))throw Error('The music provider returned an unexpected response.');
 return value.data.flatMap((item,index)=>{
  if(!record(item)||(!keepIncomplete&&(!string(item.id)||!string(item.title))))return [];
  if(provider==='audius'&&(item.is_streamable===false||item.is_stream_gated===true))return [];
  const user=record(item.user)?item.user:{};
  const art=record(item.artwork)?item.artwork:{};
  const duration=typeof item.duration==='number'&&Number.isFinite(item.duration)?Math.max(0,item.duration):0;
  const viewCount=typeof item.viewCount==='number'&&Number.isFinite(item.viewCount)&&item.viewCount>=0?Math.round(item.viewCount):undefined;
  const resolvedProv=(Object.hasOwn(MUSIC_SOURCES,string(item.provider))?string(item.provider):provider) as SongResult['provider'];
  const id=string(item.id)||`candidate:${index}`;
  const sourceUrl=provider==='audius'&&string(item.permalink)?'https://audius.co'+string(item.permalink):string(item.sourceUrl);
  const ytId=string(item.youtubeVideoId)||extractYouTubeVideoId({id,provider:resolvedProv,sourceUrl})||undefined;
  const artworkUrl=string(art['480x480'])||string(art['150x150'])||string(item.artwork)||(ytId?`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`:undefined);
  return [{id,title:string(item.title),artist:string(item.artist)||string(user.name),album:string(item.album),duration,provider:resolvedProv,
   primaryArtist:string(item.primaryArtist)||undefined,featuredArtist:string(item.featuredArtist)||undefined,
   sourceUrl,artwork:artworkUrl,
   directStreamUrl:string(item.directStreamUrl)||undefined,
   audioSource:string(item.audioSource)||undefined,
   youtubeVideoId:ytId,
   videoTitle:string(item.videoTitle)||(ytId?string(item.title):undefined),
   channelId:string(item.channelId)||undefined,channelVerified:item.channelVerified===true,uploaderName:string(item.uploaderName)||undefined,
   artistChannelIds:Array.isArray(item.artistChannelIds)?item.artistChannelIds.filter((v):v is string=>typeof v==='string'):undefined,
   counterpartOf:string(item.counterpartOf)||undefined,catalogueTitle:string(item.catalogueTitle)||undefined,catalogueAlbum:string(item.catalogueAlbum)||undefined,
   catalogueArtists:Array.isArray(item.catalogueArtists)?item.catalogueArtists.filter((v):v is string=>typeof v==='string'):undefined,
   embeddable:typeof item.embeddable==='boolean'?item.embeddable:undefined,
   artistCredits:Array.isArray(item.artistCredits)?item.artistCredits.filter((v):v is string=>typeof v==='string'):undefined,
   visualContent:['motion','static','unknown'].includes(string(item.visualContent))?item.visualContent as SongResult['visualContent']:undefined,
   metadataSource:['ytmusic','innertube','mirror','oembed'].includes(string(item.metadataSource))?item.metadataSource as SongResult['metadataSource']:undefined,
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
  primaryArtist:meta?.primaryArtist||song.primaryArtist,
  featuredArtist:meta?.featuredArtist||song.featuredArtist,
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
 *    - Client-side Piped API mirrors from the user's own device IP.
 */
export async function searchStashCatalog(
 query:string,
 provider:SongResult['provider'],
 base:string,
 signal?:AbortSignal,
 {refresh=false,background}: {refresh?:boolean;background?:{title:string;artist:string;featuredArtist?:string}}={}
):Promise<SongResult[]>{
 const refreshYouTubeSearch=provider==='resolver'&&refresh;
 if(query.trim().length<(refreshYouTubeSearch?1:2))return [];
 const effectiveBase=base.trim()||musicBackendBase();

 if(effectiveBase){
  try{
   const params=new URLSearchParams({q:query.trim(),provider:provider==='resolver'?'youtube':provider});
   if(refreshYouTubeSearch)params.set('refresh','1');
   if(background){
    params.set('backgroundTitle',background.title);
    params.set('backgroundArtist',background.artist);
    if(background.featuredArtist)params.set('backgroundFeaturedArtist',background.featuredArtist);
   }
   const res=await providerRequest(
    `${effectiveBase.replace(/\/$/,'')}/search?`+params,
    signal,
    background?32000:undefined
   );
   if(res.ok){
    const payload=await res.json();
    const parsed=parseSongs(payload,provider,Boolean(background));
    if(background)return parsed;
    const available=parsed.filter(s=>s.duration===0||s.duration>=45);
    if(available.length>0)return available;
   }
  }catch(e){
   if(signal?.aborted)throw e;
  }
 }
 if(background)return [];

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
     const rawArtist=string(item.uploaderName)||'YouTube';
     const desc=string(item.shortDescription)||string(item.description);
     const isTopic=/(?:^|[\s\-–—])Topic\b/i.test(rawArtist)||/\b(?:Provided to YouTube by|Auto-generated by YouTube)\b/i.test(desc);
     const cleanArtist=rawArtist.replace(/\s*[-–—]\s*Topic\b/i,'').trim()||'YouTube';
     const artist=isTopic?`${cleanArtist} - Topic`:cleanArtist;
     fallbackSongs.push({
      id:`yt_${vid}`,
      title,
      videoTitle:title,
      artist,
      album:isTopic?'Audio Track':'',
      duration:dur,
      viewCount:views,
      videoType:isTopic?'ATV':undefined,
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


