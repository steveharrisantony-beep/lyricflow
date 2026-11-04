import {useEffect,useRef,useState} from 'react';
import {extractYouTubeVideoId,type TrackInfo} from '../metadata/trackInfo';
import {findYouTubeBackgrounds} from './backgroundVideos';
import type {SongResult} from './providers';
import {relevantYouTubeVideoChoices} from './videoMatching';

type Options={
 selectionKey:string;
 track:TrackInfo|null;
 candidates:SongResult[];
 preference:'music'|'lyrics';
 excludedVideoIds?:readonly string[];
 onMatchedSearch?:(candidates:SongResult[],candidateCount:number)=>void;
};
type Recovery={key:string;videoId:string|null;candidate:SongResult|null;pending:boolean;message:string};
const empty:Recovery={key:'',videoId:null,candidate:null,pending:false,message:''};

/** Recovery is temporary for this selection; saved song mappings are never changed. */
export function useVideoRecovery({selectionKey,track,candidates,preference,excludedVideoIds,onMatchedSearch}:Options){
 const [state,setState]=useState<Recovery>(empty);
 const session=useRef<{key:string;excluded:Set<string>;candidates:SongResult[];controller:AbortController|null}|null>(null);
 useEffect(()=>{
  setState(empty);
  return()=>{session.current?.controller?.abort();session.current=null;};
 },[selectionKey]);
 const reset=()=>{
  session.current?.controller?.abort();
  session.current=null;
  setState(empty);
 };

 const loadAnotherVideo=async(failedId:string)=>{
  if(!track||!failedId)return;
  if(session.current?.key===selectionKey&&session.current.controller)return;
  if(session.current?.key!==selectionKey){
   session.current?.controller?.abort();
   session.current={key:selectionKey,excluded:new Set(),candidates:[],controller:null};
  }
  const current=session.current!;
  current.excluded.add(failedId);
  const controller=new AbortController();
  current.controller=controller;
  setState(previous=>({... (previous.key===selectionKey?previous:empty),key:selectionKey,pending:true,message:''}));
  const choose=(pool:SongResult[])=>{
   const eligible=pool.filter(candidate=>{
    const id=extractYouTubeVideoId(candidate);
    return id&&!current.excluded.has(id)&&!excludedVideoIds?.includes(id);
   });
   return relevantYouTubeVideoChoices(eligible, track)[0] ?? null;
  };
  try{
   let candidate=choose([...candidates,...current.candidates]);
   if(!candidate){
    const base=localStorage.getItem('lyricflow.resolver')||import.meta.env.VITE_MUSIC_RESOLVER||'';
    const result=await findYouTubeBackgrounds(track,preference,base,controller.signal);
    if(controller.signal.aborted)return;
    current.candidates=result.candidates;
    onMatchedSearch?.(result.candidates,result.candidateCount);
    candidate=choose(result.candidates);
   }
   if(controller.signal.aborted)return;
   if(candidate){
    setState({key:selectionKey,videoId:extractYouTubeVideoId(candidate),candidate,pending:false,message:''});
   }else{
    setState(previous=>({...previous,pending:false,message:'No other matching video found. Try again or reload this video.'}));
   }
  }catch{
   if(!controller.signal.aborted)setState(previous=>({...previous,pending:false,message:'Could not find another video. Try again or reload this video.'}));
  }finally{
   if(session.current===current)current.controller=null;
  }
 };
 return {...(state.key===selectionKey?state:empty),loadAnotherVideo,reset};
}

