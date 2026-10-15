import {useEffect,useRef} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,sceneAt,type DirectedScene,type SceneId} from './catalog';
import {drawScene,NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark,drawTypography} from './typography';
import {drawNarrativeObjects} from './narrative';
import {drawSpatialTypography,spatialLayoutFor} from './spatialTypography';
import {artworkStatus,drawPremiumBackground,hasArtwork} from './artwork';
export type Quality='High'|'Balanced'|'Performance';
export type CameraMode='Automatic'|'Front'|'Orbit'|'Side'|'Top';
export interface CinematicProps {
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;narrativeObjects:boolean;
}
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const EMPTY_PULSE:Pulse={...NO_AUDIO};
const sceneForAudio=(time:number,manual:SceneId,auto:boolean):DirectedScene=>{
 const index=Math.max(0,Math.floor(time/13));
 const id=auto?AUDIO_ONLY_SCENES[index%AUDIO_ONLY_SCENES.length]:manual;
 const template=byId[id];
 return {id,start:index*13,end:(index+1)*13,font:template.font,layout:template.layout,camera:template.camera,
 transition:template.transition,variation:index%5,section:index,reason:'audio-only visualizer'};
};
const previousAudioScene=(scene:DirectedScene,manual:SceneId,auto:boolean)=>{
 const index=Math.max(0,scene.section-1);
 return sceneForAudio(index*13+.01,manual,auto);
};
/** One requestAnimationFrame loop owns the whole visual presentation; React controls do not restart it. */
export default function CinematicStage(props:CinematicProps){
 const canvas=useRef<HTMLCanvasElement>(null),currentProps=useRef(props);
 useEffect(()=>{currentProps.current=props},[props]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const ctx=element.getContext('2d',{alpha:false});
  if(!ctx){element.dataset.rendererError='Canvas 2D unavailable';return}
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,version=-1,trackKey='';
  let sequence:DirectedScene[]=[];
  let w=0,h=0;
  const resize=()=>{
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?1_000_000:q==='Balanced'?2_200_000:3_400_000;
   const dpr=Math.min(ratio,Math.sqrt(limit/(w*h)));
   element.width=Math.max(1,Math.floor(w*dpr));element.height=Math.max(1,Math.floor(h*dpr));
   ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const cinematicFrame=(now:number)=>{
   raf=requestAnimationFrame(cinematicFrame);
   const config=currentProps.current;
   const dt=clamp((now-last||16.7)/1000,0,.06);last=now;
   if(document.hidden||config.paused)return;
   if(config.quality!==quality){quality=config.quality;resize()}
   elapsed+=dt;
   frames++;if(now-fpsTime>1000){element.dataset.fps=String(Math.round(frames*1000/(now-fpsTime)));frames=0;fpsTime=now}
   const mediaTime=getLocalMediaTime();
   const time=mediaTime??elapsed;
   const snapshot=getLyricTimelineSnapshot();
   if(snapshot.revision!==version){
    version=snapshot.revision;
    trackKey=snapshot.cues.map(c=>c.text).join('|').slice(0,1500);
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,trackKey);
   }
   const lyric=getLyricState(time);
   // A valid LRC controls the scene schedule; without one we remain a useful instrumental visualizer.
   const hasLyricTimeline=sequence.length>0;
   const lyricMode=config.autoScenes&&hasLyricTimeline;
   const directed=lyricMode?sceneAt(sequence,lyric.position):null;
   const scene=directed??sceneForAudio(time,config.manualScene,config.autoScenes);
   const currentIndex=directed?sequence.indexOf(directed):-1;
   const previous=directed
     ?(currentIndex>0?sequence[currentIndex-1]:null)
     :previousAudioScene(scene,config.manualScene,config.autoScenes);
   const measured=readLocalAudio(now);
   const source=getInputSource();
   const isDemo=source==='IDLE'&&config.demo&&mediaTime===null;
   const demo=isDemo?.20+.13*Math.sin(time*2.2)+.12*Math.pow(Math.max(0,Math.sin(time*3.4)),12):0;
   EMPTY_PULSE.loudness=measured?.loudness??demo;
   EMPTY_PULSE.bass=measured?.bass??demo*.85;
   EMPTY_PULSE.mids=measured?.mids??demo*.7;
   EMPTY_PULSE.treble=measured?.treble??demo*.55;
   EMPTY_PULSE.beat=measured?.beat??(isDemo?Math.pow(Math.max(0,Math.sin(time*3.4)),15):0);
   EMPTY_PULSE.onset=measured?.onset??0;
   EMPTY_PULSE.downbeat=measured?.downbeat??0;
   const p=EMPTY_PULSE;
   const factor=config.intensity;
   const progress=clamp((time-scene.start)/Math.max(.0001,.85/(config.reducedMotion?3:1)));
   const transition=progress*progress*(3-2*progress);
   ctx.setTransform(element.width/w,0,0,element.height/h,0,0);
   // No old particle or sine-wave renderer is mounted under this canvas.
   const visualTime=time*config.speed*(config.reducedMotion?.15:1);
   let premiumImageActive=false;
   const paintOne=(s:DirectedScene,alpha:number)=>{
    if(alpha<=.001)return;
    ctx.save();ctx.globalAlpha=alpha;
    const motion=config.reducedMotion?.12:1;
    const path=config.cameraMode==='Automatic'?s.camera:config.cameraMode;
    let dx=0,dy=0,angle=0,zoom=1;
    if(path==='push'||path==='Front'){zoom=1+.022*Math.sin(visualTime*.25*motion)+p.bass*.018*factor}
    if(path==='drift'||path==='Side'){dx=Math.sin(visualTime*.19*motion)*w*.018;dy=Math.cos(visualTime*.12*motion)*h*.014}
    if(path==='orbit'||path==='Orbit'){angle=Math.sin(visualTime*.11*motion)*.009;zoom=1.025}
    if(path==='pullback'||path==='Top'){zoom=1.045-Math.sin(visualTime*.14*motion)*.018;dy=-h*.013}
    ctx.translate(w*.5+dx,h*.5+dy);ctx.rotate(angle);ctx.scale(zoom,zoom);ctx.translate(-w*.5,-h*.5);
    // Premium artwork takes precedence; original graphics remain a safe fallback.
    const imageReady=drawPremiumBackground(ctx,s.id,w,h,visualTime,p,factor,config.reducedMotion);
    if(imageReady)premiumImageActive=true;
    if(!imageReady&&hasArtwork(s.id)){
     // Never show outdated procedural waves behind a scene with a bundled image.
     // A quiet editorial gradient stays in place only until the image finishes decoding.
     const palette=byId[s.id];
     ctx.fillStyle=palette.background;ctx.fillRect(-w*.10,-h*.10,w*1.20,h*1.20);
     const waiting=ctx.createRadialGradient(w*.51,h*.39,0,w*.52,h*.46,Math.max(w,h)*.82);
     waiting.addColorStop(0,palette.accent+'55');
     waiting.addColorStop(1,palette.background);
     ctx.fillStyle=waiting;ctx.fillRect(-w*.10,-h*.10,w*1.20,h*1.20);
    }else if(!imageReady)drawScene(ctx,s,w,h,visualTime,p,config.quality);
    if(config.narrativeObjects)drawNarrativeObjects(ctx,s,lyric.cue,w,h,visualTime,p,factor,config.reducedMotion);
    ctx.restore();
   };
   if(previous&&transition<1){paintOne(previous,1);paintOne(scene,transition)}
   else paintOne(scene,1);
   if(hasLyricTimeline&&lyric.cue){
    ctx.save();ctx.globalAlpha=Math.max(.04,transition);
    if(config.spatialTypography){
      drawSpatialTypography({c:ctx,scene,cue:lyric.cue,time:lyric.position,
       mode:lyric.mode,w,h,p,intensity:factor,reduced:config.reducedMotion});
    }else{
      drawTypography({c:ctx,scene,cue:lyric.cue,mode:lyric.mode,time:lyric.position,
       width:w,height:h,pulse:p,intensity:factor,reducedMotion:config.reducedMotion});
    }
    ctx.restore();
   }else if(!snapshot.cues.length){drawInstrumentalMark(ctx,scene,w,h,measured?.loudness??demo)}
   element.dataset.currentScene=scene.id;
   element.dataset.premiumArtwork=premiumImageActive?'active':'fallback';
   element.dataset.artworkStatus=artworkStatus(scene.id);
   element.dataset.motif=config.narrativeObjects?String(lyric.cue?.mood||'audio'):'disabled';
   element.dataset.lyricLayout=lyric.cue?(config.spatialTypography?spatialLayoutFor(scene,lyric.cue.text):'classic'):'none';
   element.dataset.sceneLabel=byId[scene.id].label;
   element.dataset.hasLyrics=hasLyricTimeline&&!!lyric.cue?'yes':'no';
   element.dataset.sceneCount=String(sequence.length);
   element.dataset.audioSource=source!=='IDLE'?source:isDemo?'DEMO':'IDLE';
   element.dataset.audioLevel=String(Math.round(p.loudness*100));
   element.dataset.audioBass=String(Math.round(p.bass*100));
   element.dataset.audioMids=String(Math.round(p.mids*100));
   element.dataset.audioTreble=String(Math.round(p.treble*100));
   element.dataset.audioBeat=String(Math.round(p.beat*100));
   element.dataset.audioBpm=String(measured?.bpm||0);
   element.dataset.audioTempoConfidence=String(Math.round((measured?.tempoConfidence||0)*100));
   element.dataset.audioOnset=String(Math.round(p.onset*100));
   element.dataset.audioDownbeat=String(Math.round(p.downbeat*100));
   element.dataset.audioSection=measured?.section||'unknown';
   element.dataset.audioFlux=String(Math.round((measured?.flux||0)*10000));
   element.dataset.audioThreshold=String(Math.round((measured?.threshold||0)*10000));
   element.dataset.audioBeatCount=String(measured?.beatCount||0);
  };
  raf=requestAnimationFrame(cinematicFrame);
  return()=>{cancelAnimationFrame(raf);observer.disconnect()};
 },[]);
 return <canvas className="visual-canvas cinematic-canvas" ref={canvas} aria-label="LyricFlow cinematic lyrics and audio reactive motion graphics"/>;
}
