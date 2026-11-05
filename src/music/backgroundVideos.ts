import type {TrackInfo} from '../metadata/trackInfo';
import {searchStashCatalog} from './providers';
import {backgroundVideoQuery} from './backgroundQuery';
import {logVideoSearch,logVideoSearchFailure,videoSearchLogKey} from './videoSearchHistory';

type VideoTarget=Pick<TrackInfo,'title'|'artist'|'primaryArtist'|'featuredArtist'> & Partial<Pick<TrackInfo,'provider'|'sourceTrackId'|'externalPackageName'>>;

function splitFeatureCredit(value:string){
 const bracketed=value.match(/\s*[\[(]\s*(?:featuring|feat|ft)(?:\.\s*|\s+)([^)\]]+)[)\]]\s*/i);
 if(bracketed)return {text:value.replace(bracketed[0],' ').trim(),credit:bracketed[1]};
 const suffix=value.match(/\s+(?:featuring|feat|ft)(?:\.\s*|\s+)(.+)$/i);
 return suffix ? {text:value.slice(0,suffix.index).trim(),credit:suffix[1]} : {text:value.trim(),credit:''};
}

const firstListedArtist=(value:string)=>value.split(/[,;]|\s+&\s+/).map(name=>name.trim()).find(Boolean);

function waitForVideoRetry(delay:number,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const cancel=()=>{clearTimeout(timer);reject(signal?.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},delay);
  signal?.addEventListener('abort',cancel,{once:true});
 });
}

export async function findYouTubeBackgrounds(track:VideoTarget,base:string,signal?:AbortSignal,preference:'music'|'lyrics'='music',mode:'Autoplay'|'Search online'='Autoplay'){
 const title=track.title;
 if(!title.trim())return {candidates:[],candidateCount:0};
 const artistCredit=splitFeatureCredit(track.artist);
 const artist=track.primaryArtist?.trim()||firstListedArtist(artistCredit.text)||'';
 const query=backgroundVideoQuery(title,artist,preference);
 const recordingKey=videoSearchLogKey(track);
 const delays=mode==='Autoplay'?[0,0,1000,2000]:[0];
 for(const [index,delay] of delays.entries()){
  signal?.throwIfAborted();
  if(delay)await waitForVideoRetry(delay,signal);
  const candidates=await logVideoSearch(query,mode,()=>searchStashCatalog(query,'resolver',base,signal,{
   ...(index>0?{refresh:true}:{}),
   background:{title,artist,...(preference==='lyrics'?{preference}:{})},
  }),signal,recordingKey,mode==='Autoplay'
   ?{attempt:index+1,maxAttempts:delays.length,retryDelayMs:delay}:undefined);
  signal?.throwIfAborted();
  if(candidates.length)return {candidates,candidateCount:candidates.length};
 }
 if(mode==='Autoplay')logVideoSearchFailure(recordingKey,query,delays.length);
 return {candidates:[],candidateCount:0};
}
