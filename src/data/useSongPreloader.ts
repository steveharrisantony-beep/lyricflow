import {useEffect,useRef,useState} from 'react';
import {musicResolverBase} from '../network/backend';
import type {TrackInfo} from '../metadata/trackInfo';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {correctionContext} from '../firebase/correctionModel';
import {temporarySongs} from './temporarySongs';
import {localSongData} from './localSongData';
import {prepareSongLyrics,prepareSongVideo} from './songPreparation';

export function useSongPreloader(current:TrackInfo|null,queue:TrackInfo[],uid:string|null){
 const [,refresh]=useState(0),controllers=useRef(new Set<AbortController>());
 useEffect(()=>{
  const changed=()=>refresh(value=>value+1);
  for(const event of ['lyricflow:songMappings','lyricflow:customLyrics'])window.addEventListener(event,changed);
  return()=>{for(const event of ['lyricflow:songMappings','lyricflow:customLyrics'])window.removeEventListener(event,changed);};
 },[]);
 const currentId=correctionContext(current,'lyrics')?.recordingKey||'';
 const queueKey=JSON.stringify(queue);
 const revisions=JSON.stringify(queue.map(track=>{const value=localSongData(track,uid);return [value.mapping,value.text];}));
 useEffect(()=>{
  temporarySongs.setWindow(current,queue,uid);
  const upcoming=queue.filter(track=>correctionContext(track,'lyrics')?.recordingKey!==currentId)
   .filter(track=>Boolean(temporarySongs.get(track,uid))).slice(0,7);
  let stopped=false,index=0;
  const base=musicResolverBase();
  const next=async()=>{
   while(!stopped&&index<upcoming.length){
    const track=upcoming[index++],controller=new AbortController();controllers.current.add(controller);
    const local=localSongData(track,uid);
    try{
     await Promise.allSettled([
      prepareSongLyrics(track,uid,{engine:local.mapping?.lyrics?.selection?.engine||'lyricflow',
       selection:local.mapping?.lyrics?.selection||null,source:local.mapping?.lyrics?.sourceFile||null},controller.signal),
      !extractYouTubeVideoId(track)?prepareSongVideo(track,uid,base,controller.signal):Promise.resolve(null),
     ]);
    }finally{controllers.current.delete(controller);}
   }
  };
  // At most two queued songs are being prepared; foreground playback never waits for them.
  void next();void next();
  return()=>{stopped=true;};
 },[currentId,queueKey,uid,revisions]);
 useEffect(()=>()=>{for(const controller of controllers.current)controller.abort();controllers.current.clear();},[]);
}

