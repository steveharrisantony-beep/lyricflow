/** Unofficial Innertube video metadata, compatible with the embedded Node 18 runtime.
 * Search shape/filter reference: sigma67/ytmusicapi (MIT). Matching remains in
 * src/music/videoMatching.ts; this module never downloads audio or video.
 */
export interface UnofficialVideo {
 id:string;title:string;videoTitle?:string;artist:string;album:string;duration:number;sourceUrl:string;
 rawId:string;provider:'youtube';artwork?:string;viewCount?:number;
 videoType?:'ATV'|'OMV'|'UGC';channelId?:string;channelVerified?:boolean;
 artistCredits?:string[];visualContent?:'motion'|'static'|'unknown';
 metadataSource?:'ytmusic'|'innertube'|'mirror'|'oembed';
}
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const str=(v:unknown)=>typeof v==='string'?v:'';
export function youtubeText(v:unknown):string{
 const o=obj(v);return typeof v==='string'?v:str(o.simpleText)||str(o.content)||arr(o.runs).map(r=>str(obj(r).text)).join('');
}
export function youtubeViews(v:unknown):number|undefined{
 const text=(typeof v==='number'?String(v):youtubeText(v)).replace(/,/g,'').trim();
 const m=text.match(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|[kmb])?\b/i);
 if(!m)return undefined;
 const unit=(m[2]||'').toLowerCase(),scale=/^(crore|cr)/.test(unit)?1e7:/^(lakh|lac)/.test(unit)?1e5:unit==='b'?1e9:unit==='m'?1e6:unit==='k'?1e3:1;
 const n=Math.round(Number(m[1])*scale);return n>0?n:undefined;
}
const duration=(s:string)=>/^\d+(?::\d+)+$/.test(s.trim())?s.trim().split(':').reduce((a,b)=>a*60+Number(b),0):0;
function findValue(root:unknown,key:string):unknown{
 if(!root||typeof root!=='object')return undefined;
 const record=obj(root);if(record[key]!==undefined)return record[key];
 for(const value of Object.values(root)){const found=findValue(value,key);if(found!==undefined)return found;}
 return undefined;
}
export function parseMusicVideoSearch(root:unknown,limit=40):UnofficialVideo[]{
 const found=new Map<string,UnofficialVideo>();
 const walk=(node:unknown)=>{
  if(!node||typeof node!=='object')return;
  const r=obj(node),renderer=obj(r.musicResponsiveListItemRenderer||r.musicTwoRowItemRenderer||r.musicCardShelfRenderer);
  if(Object.keys(renderer).length){
   const columns=arr(renderer.flexColumns).map(c=>obj(obj(c).musicResponsiveListItemFlexColumnRenderer).text);
   const titleField=columns[0]||renderer.title;
   const title=youtubeText(titleField).trim();
   const videoId=str(findValue(obj(titleField),'videoId'))||str(findValue(renderer.thumbnailOverlay,'videoId'))||str(findValue(renderer.navigationEndpoint||renderer.onTap,'videoId'));
   const type=str(findValue(renderer,'musicVideoType'));
   const textFields=[...columns.slice(1),renderer.subtitle,renderer.secondSubtitle].filter(Boolean);
   const runs=textFields.flatMap(field=>arr(obj(field).runs));
   const credits=runs.flatMap(run=>{
    const rr=obj(run),browse=obj(findValue(rr.navigationEndpoint,'browseEndpoint'));
    return str(browse.browseId).startsWith('UC')&&str(rr.text).trim()?[str(rr.text).trim()]:[];
   });
   const texts=runs.map(run=>str(obj(run).text).trim()).filter(x=>x&&x!=='•');
   const artist=credits[0]||texts.find(x=>!duration(x)&&!youtubeViews(/views?$/i.test(x)?x:'')&&!/^(?:song|video|single|album)$/i.test(x))||'YouTube';
   const channelId=str(findValue(runs.find(run=>str(findValue(obj(run).navigationEndpoint,'browseId')).startsWith('UC')),'browseId'))||undefined;
   const viewText=texts.find(x=>/views?$/i.test(x));
   if(/^[\w-]{11}$/.test(videoId)&&title&&found.size<limit){
    const atv=type==='MUSIC_VIDEO_TYPE_ATV';
    found.set(videoId,{id:'yt_'+videoId,rawId:videoId,provider:'youtube',title,artist:atv?artist+' - Topic':artist,album:atv?'Audio Track':'',duration:texts.map(duration).find(x=>x>0)||0,
     viewCount:youtubeViews(viewText||''),videoType:atv?'ATV':type==='MUSIC_VIDEO_TYPE_OMV'?'OMV':'UGC',channelId,artistCredits:credits,
     visualContent:atv?'static':type==='MUSIC_VIDEO_TYPE_OMV'?'motion':'unknown',metadataSource:'ytmusic',
     sourceUrl:'https://www.youtube.com/watch?v='+videoId,artwork:'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg'});
   }
  }
  for(const v of Object.values(node))walk(v);
 };
 walk(root);return [...found.values()];
}
const MUSIC_VIDEO_FILTER='EgWKAQIQAWoMEA4QChADEAQQCRAF';
export async function searchMusicVideos(query:string,headers:Record<string,string>,region='IN'):Promise<UnofficialVideo[]>{
 try{
  const response=await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://music.youtube.com',...headers},
   body:JSON.stringify({context:{client:{clientName:'WEB_REMIX',clientVersion:'1.20250219.01.00',hl:'en',gl:region}},query,params:MUSIC_VIDEO_FILTER}),signal:AbortSignal.timeout(7000)
  });
  return response.ok?parseMusicVideoSearch(await response.json()):[];
 }catch{return [];}
}
export function mergeVideoMetadata<T extends Omit<UnofficialVideo,'provider'>>(batches:T[][]):T[]{
 const byId=new Map<string,T>();
 for(const batch of batches)for(const next of batch){
  const prior=byId.get(next.rawId);if(!prior){byId.set(next.rawId,next);continue;}
  const primary=next.metadataSource==='ytmusic'&&prior.metadataSource!=='ytmusic'?next:prior;
  const other=primary===next?prior:next;
  const staticVideo=prior.videoType==='ATV'||next.videoType==='ATV'||prior.visualContent==='static'||next.visualContent==='static';
  const titles=[prior.videoTitle,next.videoTitle,...[prior,next].filter(v=>v.metadataSource==='innertube'||v.metadataSource==='mirror').map(v=>v.title)].filter((title):title is string=>Boolean(title));
  titles.sort((a,b)=>Number(/\blyric(?:s|al)?\b/i.test(b))-Number(/\blyric(?:s|al)?\b/i.test(a))||b.length-a.length||a.localeCompare(b));
  byId.set(next.rawId,{...other,...primary,videoTitle:titles[0]||primary.title,duration:primary.duration||other.duration,
   artist:(other.metadataSource==='innertube'||other.metadataSource==='mirror')&&other.artist&&other.artist!=='YouTube'?other.artist:primary.artist&&primary.artist!=='YouTube'?primary.artist:other.artist,
   channelId:(other.metadataSource==='innertube'||other.metadataSource==='mirror')?other.channelId||primary.channelId:primary.channelId||other.channelId,channelVerified:prior.channelVerified||next.channelVerified,
   artistCredits:[...new Set([...(prior.artistCredits||[]),...(next.artistCredits||[])])],
   viewCount:Math.max(prior.viewCount||0,next.viewCount||0)||undefined,
   videoType:staticVideo?'ATV':prior.videoType==='OMV'||next.videoType==='OMV'?'OMV':primary.videoType,
   visualContent:staticVideo?'static':primary.visualContent||other.visualContent});
 }
 return [...byId.values()];
}
export class VideoSearchCache<T>{
 private cache=new Map<string,{at:number;value:T}>();
 private inflight=new Map<string,Promise<T>>();
 constructor(private ttl=300_000,private max=100){}
 async get(key:string,load:()=>Promise<T>):Promise<T>{
  const cached=this.cache.get(key);if(cached&&Date.now()-cached.at<this.ttl)return cached.value;
  if(cached)this.cache.delete(key);
  const pending=this.inflight.get(key);if(pending)return pending;
  const work=load().then(value=>{
   // Do not keep a transient empty/error response for the full cache lifetime.
   if(Array.isArray(value)?value.length:!!value&&typeof value==='object'&&Object.keys(value).length){if(this.cache.size>=this.max)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{at:Date.now(),value});}
   return value;
  }).finally(()=>this.inflight.delete(key));
  this.inflight.set(key,work);return work;
 }
}
const detailsCache=new VideoSearchCache<Partial<UnofficialVideo>>(600_000,300);
export async function hydrateVideoMetadata<T extends Omit<UnofficialVideo,'provider'>>(videos:T[],headers:Record<string,string>,scope:string):Promise<T[]>{
 // Search already supplies most metadata. Resolve missing durations/views via
 // Innertube player metadata, with a bounded worker pool and account-scoped cache.
 const missing=videos.filter(v=>v.videoType!=='ATV'&&(!v.duration||!v.viewCount)).sort((a,b)=>(b.viewCount||0)-(a.viewCount||0)).slice(0,6);
 const details=new Map<string,Partial<UnofficialVideo>>();let cursor=0;
 const worker=async()=>{while(cursor<missing.length){const video=missing[cursor++];
  const data=await detailsCache.get(scope+'|'+video.rawId,async()=>{
   try{
    const res=await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://www.youtube.com',...headers},body:JSON.stringify({context:{client:{clientName:'WEB',clientVersion:'2.20250219.01.00',hl:'en',gl:'IN'}},videoId:video.rawId}),signal:AbortSignal.timeout(4500)});
    if(!res.ok)return {};
    const raw=obj(await res.json()),v=obj(raw.videoDetails),play=obj(raw.playabilityStatus);
    if(str(play.status)!=='OK'||str(v.videoId)!==video.rawId)return {};
    const type=str(findValue(raw,'musicVideoType'));
    return {duration:Number(v.lengthSeconds)||0,viewCount:youtubeViews(v.viewCount),channelId:str(v.channelId)||undefined,
     ...(type==='MUSIC_VIDEO_TYPE_ATV'?{videoType:'ATV' as const,visualContent:'static' as const}:type==='MUSIC_VIDEO_TYPE_OMV'?{videoType:'OMV' as const,visualContent:'motion' as const}:{})};
   }catch{return {};}
  });details.set(video.rawId,data);
 }};
 await Promise.all(Array.from({length:Math.min(3,missing.length)},worker));
 return videos.map(video=>{const d=details.get(video.rawId);return d?{...video,...d,duration:d.duration||video.duration,viewCount:d.viewCount||video.viewCount,channelId:d.channelId||video.channelId}:video;});
}
