import type {TrackInfo,TrackCandidate} from '../metadata/trackInfo';
import {hasValidLrcTimestamps,isAdvertisementTrack} from '../metadata/trackInfo';
import type {LyricsSelection,LyricsSourceReference} from '../firebase/correctionModel';
import {lyricFingerprint} from '../firebase/correctionModel';
import {resolveStashLyricsChain,retrievePermittedLyrics,lrclibProvider,type StashResolvedLyrics} from '../lyrics/providers';
import {convertTtmlToEnhancedLrc,convertStructuredAppleJsonToLrc} from '../lyrics/appleLyrics';
import type {LyricEngineOption} from '../lyrics/lyricFlowEngine';
import {lyricProviderName,normalizeLyricSource} from '../lyrics/sourceLabels';
import {providerRequest} from '../network/request';
import {backendOrigin} from '../network/backend';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import {localSongData} from './localSongData';
import {temporarySongs,TEMPORARY_SONG_EVENT,type TemporarySong} from './temporarySongs';

export interface LyricsPreparationOptions {
 engine:LyricEngineOption;selection?:LyricsSelection|null;source?:LyricsSourceReference|null;
 leadingOffset?:number;subtitleId?:string;
}
interface Work<T>{controller:AbortController;promise:Promise<T>;listeners:Set<(value:T)=>void>;users:number;latest?:T}
const work=new Map<string,Work<unknown>>();
function shared<T>(id:string,entry:TemporarySong,signal:AbortSignal|undefined,start:(signal:AbortSignal,publish:(value:T)=>void)=>Promise<T>,progress?:(value:T)=>void):Promise<T>{
 signal?.throwIfAborted();
 let pending=work.get(id) as Work<T>|undefined;
 if(pending?.controller.signal.aborted){work.delete(id);pending=undefined;}
 if(!pending){
  const controller=new AbortController(),generation=entry.generation;
  const valid=()=>temporarySongs.has(entry)&&entry.generation===generation;
  const changed=()=>{if(!valid())controller.abort();};
  const events=[TEMPORARY_SONG_EVENT,'lyricflow:songMappings','lyricflow:customLyrics','lyricflow:corrections'];
  for(const event of events)window.addEventListener(event,changed);
  pending={controller,promise:Promise.resolve(undefined as T),listeners:new Set(),users:0};
  const task=pending;
  const publish=(value:T)=>{if(!controller.signal.aborted&&valid()){task.latest=value;for(const listener of task.listeners)listener(value);}};
  task.promise=Promise.resolve().then(()=>start(controller.signal,publish)).then(value=>{
   if(!valid())throw new DOMException('Song data changed','AbortError');
   controller.signal.throwIfAborted();return value;
  }).finally(()=>{for(const event of events)window.removeEventListener(event,changed);if(work.get(id)===task)work.delete(id);});
  work.set(id,task as Work<unknown>);
 }
 const task=pending;task.users++;if(progress){task.listeners.add(progress);if(task.latest!==undefined)progress(task.latest);}
 return new Promise<T>((resolve,reject)=>{
  let released=false;
  const release=()=>{if(released)return;released=true;signal?.removeEventListener('abort',abort);if(progress)task.listeners.delete(progress);task.users--;if(!task.users&&work.get(id)===task)task.controller.abort();};
  const abort=()=>{release();reject(signal?.reason||new DOMException('Aborted','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
  task.promise.then(value=>{if(!released){release();resolve(value);}},error=>{if(!released){release();reject(error);}});
  if(signal?.aborted)abort();
 });
}
function lyricsKey(options:LyricsPreparationOptions){return JSON.stringify([options.engine,options.selection,options.source,options.subtitleId,options.leadingOffset||0]);}
export function peekPreparedLyrics(track:TrackInfo|null,uid:string|null,options:LyricsPreparationOptions){
 const entry=localSongData(track,uid).session;
 return entry?.lyrics?.key===lyricsKey(options)?entry.lyrics.value:null;
}
function resolvedText(text:string,source:string,sourceUrl:string,track:TrackInfo):StashResolvedLyrics{
 const timed=hasValidLrcTimestamps(text);
 return {original:timed?text:'',plain:timed?undefined:text,romanized:'',source,sourceUrl,
  title:track.title,artist:track.artist,hasWordSync:timed&&text.includes('<'),candidates:[]};
}
async function savedLink(track:TrackInfo,source:LyricsSourceReference,signal:AbortSignal):Promise<StashResolvedLyrics|null>{
 if(!/^https?:\/\//i.test(source.url))return null;
 const response=await providerRequest(source.url,signal);if(!response.ok)return null;
 const body=await response.text();
 if(body.includes('<p')){const parsed=convertTtmlToEnhancedLrc(body);if(parsed.lrc)return resolvedText(parsed.lrc,source.name,source.url,track);}
 if(body.trim().startsWith('{')||body.trim().startsWith('[')){
  const raw=JSON.parse(body),parsed=convertStructuredAppleJsonToLrc(raw);
  const text=parsed.lrc||raw.syncedLyrics||raw.lrc||raw.plainLyrics||raw.plain;
  // An exact saved file may be trusted; metadata returned with it must still match.
  const normal=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  if(raw.trackName&&normal(raw.trackName)!==normal(track.title))return null;
  if(raw.artistName&&normal(raw.artistName)!==normal(track.artist))return null;
  if(raw.duration&&Math.round(raw.duration)!==Math.round(track.duration))return null;
  if(typeof text==='string'&&text.trim())return resolvedText(text,source.name,source.url,track);
 }
 if(hasValidLrcTimestamps(body))return resolvedText(body,source.name,source.url,track);
 return null;
}
async function savedSource(track:TrackInfo,options:LyricsPreparationOptions,signal:AbortSignal):Promise<StashResolvedLyrics|null>{
 const name=lyricProviderName(options.source?.name||'',options.source?.url||'')||
  (options.selection?.engine==='lrclib'?'LRCLIB':options.selection?.engine==='youtube'?'YouTube Subtitles':'');
 if(name==='LRCLIB'){
  const candidates=await lrclibProvider.search(track,signal);
  const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const candidate=candidates.find(c=>normalize(c.title)===normalize(track.title)&&normalize(c.artist)===normalize(track.artist)&&Math.round(c.duration)===Math.round(track.duration));
  if(candidate){const found=await retrievePermittedLyrics(candidate,signal);return resolvedText(found.synced||found.plain,found.source,found.sourceUrl,track);}
  return null;
 }
 if(name==='YouTube Subtitles')return resolveStashLyricsChain(track,signal,'youtube',options.leadingOffset,options.subtitleId);
 const provider:Record<string,string>={'lrc.red':'lrc.red',Binimum:'binimum',Paxsenix:'paxsenix',MusixMatch:'musixmatch',KuGou:'kugou'};
 if(!provider[name])return null;
 const params=new URLSearchParams({title:track.title,artist:track.artist,duration:String(Math.round(track.duration)),source:provider[name]});
 const response=await providerRequest(`${backendOrigin()}/music/lyrics?${params}`,signal);if(!response.ok)return null;
 const raw=await response.json(),parsed=raw.ttml?convertTtmlToEnhancedLrc(raw.ttml):null;
 const text=parsed?.lrc||raw.lrc||raw.plain;
 if(typeof text!=='string'||!text.trim())return null;
 return {...resolvedText(text,normalizeLyricSource(raw.source||name,raw.sourceUrl),raw.sourceUrl||'',track),title:raw.title||track.title,artist:raw.artist||track.artist};
}
export function prepareSongLyrics(track:TrackInfo,uid:string|null,options:LyricsPreparationOptions,signal?:AbortSignal,progress?:(value:StashResolvedLyrics)=>void):Promise<StashResolvedLyrics|null>{
 const local=localSongData(track,uid),entry=local.session;
 if(!entry||local.mapping?.hideLyrics||isAdvertisementTrack(track))return Promise.resolve(null);
 const key=lyricsKey(options),id=`${uid}:${entry.id}:lyrics:${entry.generation}:${key}`;
 const active=work.has(id);
 if(!active&&entry.lyrics?.key===key)return Promise.resolve(entry.lyrics.value);
 return shared(id,entry,signal,async(request,publish)=>{
  let result:StashResolvedLyrics|null=null;
  const source=options.source||local.mapping?.lyrics?.sourceFile;
  const text=local.text;
  if(text&&(!source||lyricFingerprint(text,source.url)===source.revision))result=resolvedText(text,source?.name||'Custom lyrics',source?.url||'',track);
  if(!result&&source)result=await savedLink(track,source,request).catch(error=>{if(request.aborted)throw error;return null;});
  const selectedId=options.selection?.lrclibId;
  if(!result&&!source&&selectedId){
   const candidate:TrackCandidate={id:selectedId,title:track.title,artist:track.artist,album:'',duration:track.duration,instrumental:false,hasSynced:true,hasWordSync:false,url:`https://lrclib.net/api/get/${selectedId}`,confidence:1};
   const found=await retrievePermittedLyrics(candidate,request).catch(error=>{if(request.aborted)throw error;return null;});
   if(found)result=resolvedText(found.synced||found.plain,found.source,found.sourceUrl,track);
  }
  if(!result&&(source||selectedId))result=await savedSource(track,{...options,source},request).catch(error=>{if(request.aborted)throw error;return null;});
  if(!result)result=await resolveStashLyricsChain(track,request,options.engine,options.leadingOffset,options.subtitleId,value=>publish(source?{...value,mappingRevision:source.revision}:value));
  request.throwIfAborted();
  if(result){if(source)result={...result,mappingRevision:source.revision};entry.lyrics={key,value:result};}return result;
 },value=>{if(value)progress?.(value);});
}
export function prepareSongVideo(track:TrackInfo,uid:string|null,preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const local=localSongData(track,uid),entry=local.session;
 if(!entry||local.mapping?.hideVideo||isAdvertisementTrack(track))return Promise.resolve(null);
 const key=JSON.stringify([preference,base,local.mapping?.video]);
 if(entry.videos?.key===key)return Promise.resolve(entry.videos.value);
 return shared(`${uid}:${entry.id}:video:${entry.generation}:${key}`,entry,signal,async(request)=>{
  const video=local.mapping?.video;
  const result=video?{videos:[],candidates:[],automaticVideoId:video.youtubeVideoId,candidateCount:0,usedLyricalFallback:false}:
   await findYouTubeBackgrounds(track,preference,base,request);
  request.throwIfAborted();entry.videos={key,value:result};return result;
 });
}

