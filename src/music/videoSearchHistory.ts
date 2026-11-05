import type {SongResult} from './providers';
import type {TrackInfo} from '../metadata/trackInfo';

/** Song-scoped log identity; duration changes must not create a new log. */
export function videoSearchLogKey(track: (Pick<TrackInfo,'title'|'artist'> &
 Partial<Pick<TrackInfo,'provider'|'sourceTrackId'|'externalPackageName'>>) | null | undefined): string {
 if (!track?.title?.trim()) return '';
 return JSON.stringify([
  track.provider||'',track.sourceTrackId||'',track.title.trim(),
  track.artist.trim(),track.externalPackageName||'',
 ]);
}

export type VideoSearchLog = {
 id:number;
 time:number;
 recordingKey:string;
 status:string;
 mode:'Autoplay'|'Search online'|'Search failure'|'Filter'|'Playback error'|'Playback recovery'|'Suspension'|'SponsorBlock';
 query?:string;
 attempt?:number;
 maxAttempts?:number;
 retryDelayMs?:number;
 resultCount?:number;
 passedFilterCount?:number;
 videoId?:string;
 title?:string;
 start?:number;
 end?:number;
 category?:string;
};

let entries:VideoSearchLog[]=[];
let nextId=0;
const listeners=new Set<() => void>();
const MAX_LOGS=160;

export function subscribeVideoSearchLogs(listener:()=>void){
 listeners.add(listener);
 return ()=>{listeners.delete(listener);};
}
export const getVideoSearchLogs=()=>entries;
function publish(next:VideoSearchLog[]){
 entries=next.slice(0,MAX_LOGS);
 for(const listener of listeners)listener();
}
function append(entry:Omit<VideoSearchLog,'id'|'time'>){
 publish([{...entry,id:++nextId,time:Date.now()},...entries]);
}

/** Store results for the exact song; do not expose request URLs or auth tokens. */
export async function logVideoSearch(
 query:string,mode:'Autoplay'|'Search online',run:()=>Promise<SongResult[]>,
 signal?:AbortSignal,recordingKey='',attemptInfo?:{attempt:number;maxAttempts:number;retryDelayMs:number}
):Promise<SongResult[]>{
 signal?.throwIfAborted();
 const entry:VideoSearchLog={id:++nextId,time:Date.now(),recordingKey,query,mode,...attemptInfo,status:'Searching…'};
 publish([entry,...entries]);
 const finish=(status:string,resultCount?:number)=>{
  if(entries.some(item=>item.id===entry.id))
   publish(entries.map(item=>item.id===entry.id?{...item,status,resultCount}:item));
 };
 try{
  const results=await run();
  signal?.throwIfAborted();
  finish(`${results.length} result${results.length===1?'':'s'} returned`,results.length);
  return results;
 }catch(error){
  finish(signal?.aborted?'Cancelled':'Search failed');
  throw error;
 }
}

export function logVideoSearchFailure(recordingKey:string,query:string,attempts:number){
 if(!recordingKey)return;
 append({recordingKey,mode:'Search failure',query,resultCount:0,
  status:`Search failed: all ${attempts} attempts returned 0 results. No background video selected.`});
}

/** Called after the existing background filtering logic has evaluated candidates. */
export function logVideoFiltering(recordingKey:string,resultCount:number,passedFilterCount:number,mode:'Autoplay'|'Search online'='Autoplay'){
 if(!recordingKey)return;
 const search=entries.find(item=>item.recordingKey===recordingKey&&item.mode===mode);
 if(search&&search.passedFilterCount!==passedFilterCount){
  publish(entries.map(item=>item.id===search.id
   ?{...item,resultCount,passedFilterCount,status:`${resultCount} results · ${passedFilterCount} passed filters`}:item));
 }else if(!search && !entries.some(item=>item.mode==='Filter'&&item.recordingKey===recordingKey&&item.resultCount===resultCount&&item.passedFilterCount===passedFilterCount)){
  append({recordingKey,mode:'Filter',status:`${mode} cached/preloaded candidates evaluated`,resultCount,passedFilterCount});
 }
}

export function logVideoPlaybackRecovery(videoId:string,status:string,recordingKey=''){
 if(!videoId||!status||!recordingKey)return;
 append({recordingKey,mode:'Playback recovery',videoId,status});
}
export function logVideoPlaybackError(videoId:string,status:string,recordingKey=''){
 if(!videoId||!status||!recordingKey)return;
 append({recordingKey,mode:'Playback error',videoId,status});
}
export function logThemeVideoSearchSuspended(recordingKey:string){
 if(!recordingKey||entries.some(e=>e.recordingKey===recordingKey&&e.mode==='Suspension'))return;
 append({recordingKey,mode:'Suspension',status:'Automatic background search suspended after 3 consecutive songs in Themes mode'});
}

export function logSponsorBlockSkip({videoId,title,start,end,category,recordingKey=''}:{
 videoId:string|undefined;title:string;start:number;end:number;category:string;recordingKey?:string;
}){
 if(!recordingKey||!videoId||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return;
 append({recordingKey,mode:'SponsorBlock',status:`Skipped ${category}`,videoId,title,start,end,category});
}
