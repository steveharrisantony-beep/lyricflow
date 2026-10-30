import {getLocalMediaTime} from '../audio/audioSignal';
import {getLyricState} from './lyricTimeline';

/** Capture the currently sung line(s) once; do not keep postponing to each following line. */
export function afterCurrentLyricLine(apply:()=>void,signal?:AbortSignal){
 const clock=getLocalMediaTime();
 const current=clock===null?null:getLyricState(clock);
 const active=[current?.cue,current?.secondaryCue].filter(c=>c!==null&&c!==undefined);
 if(!current||!active.length){if(!signal?.aborted)apply();return()=>{};}
 const end=Math.max(...active.map(c=>c.end)),start=Math.min(...active.map(c=>c.time));
 let stopped=false;
 const cancel=()=>{stopped=true;clearInterval(timer);signal?.removeEventListener('abort',cancel);};
 const timer=setInterval(()=>{
  if(stopped||signal?.aborted){cancel();return;}
  const now=getLocalMediaTime();
  const position=now===null?null:getLyricState(now).position;
  if(position===null||position>=end||position<start-.05){cancel();apply();}
 },40);
 signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted)cancel();
 return cancel;
}
