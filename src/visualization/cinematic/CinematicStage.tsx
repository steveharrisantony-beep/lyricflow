import {useEffect,useRef} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,sceneAt,type DirectedScene,type SceneId} from './catalog';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark,drawTypography} from './typography';
import {drawSpatialTypography,spatialLayoutFor} from './spatialTypography';
import {selectMotif} from './narrative';
import {ProceduralCinema} from './procedural/ThreeEngine';

export type Quality='High'|'Balanced'|'Performance';
export type CameraMode='Automatic'|'Front'|'Orbit'|'Side'|'Top';
export interface CinematicProps{
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;narrativeObjects:boolean;motionBlur:number;
}
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const sceneForAudio=(time:number,manual:SceneId,auto:boolean):DirectedScene=>{
 const index=Math.max(0,Math.floor(time/13));
 const id=auto?AUDIO_ONLY_SCENES[index%AUDIO_ONLY_SCENES.length]:manual;
 const template=byId[id];
 return {id,start:index*13,end:(index+1)*13,font:template.font,layout:template.layout,camera:template.camera,
 transition:template.transition,variation:index%5,section:index,reason:'audio-only visualizer'};
};
function drawSafeFallback(c:CanvasRenderingContext2D,id:SceneId,w:number,h:number,t:number,p:Pulse){
 const color=byId[id];
 const bg=c.createLinearGradient(0,0,w,h);
 bg.addColorStop(0,color.background);bg.addColorStop(1,'#040611');
 c.fillStyle=bg;c.fillRect(0,0,w,h);
 const r=Math.max(w,h)*.72;
 const glow=c.createRadialGradient(w*.56,h*.43,0,w*.5,h*.45,r);
 glow.addColorStop(0,color.accent+'50');glow.addColorStop(.52,color.accent+'15');glow.addColorStop(1,'transparent');
 c.fillStyle=glow;c.fillRect(0,0,w,h);
 // Graceful Canvas-only geometry, never any image or old static animation.
 c.save();c.translate(w*.5,h*.5);c.rotate(t*.025);
 c.strokeStyle=color.accent;c.lineWidth=1.3+p.bass*2;
 for(let i=0;i<12;i++){
  c.save();c.rotate(i*Math.PI/6);
  c.beginPath();c.ellipse(0,0,w*(.10+i*.018),h*(.10+i*.010),0,Math.PI*.25,Math.PI*1.6);c.stroke();
  c.restore();
 }
 c.restore();
}
function useOneCinematicRenderer(props:CinematicProps){
 const canvas=useRef<HTMLCanvasElement>(null),currentProps=useRef(props);
 useEffect(()=>{currentProps.current=props},[props]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const ctx=element.getContext('2d',{alpha:false});
  if(!ctx){element.dataset.rendererError='Canvas 2D unavailable';return}
  const graphics=new ProceduralCinema();
  element.dataset.renderer=graphics.available?'WEBGL 3D':'CANVAS FALLBACK';
  if(!graphics.available)element.dataset.rendererError='WebGL not available. Using procedural Canvas 2D fallback.';
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,revision=-1;
  let sequence:DirectedScene[]=[];
  let w=1,h=1,adaptiveScale=1,slowSeconds=0,fastSeconds=0;
  const resize=()=>{
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?950_000:q==='Balanced'?1_600_000:2_400_000;
   const dpr=Math.max(.45,Math.min(ratio,Math.sqrt(limit/(w*h)))*adaptiveScale);
   element.width=Math.max(1,Math.floor(w*dpr));element.height=Math.max(1,Math.floor(h*dpr));
   ctx.setTransform(element.width/w,0,0,element.height/h,0,0);
   graphics.resize(element.width,element.height,q);
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  const frame=(now:number)=>{
   raf=requestAnimationFrame(frame);
   const config=currentProps.current;
   const dt=clamp((now-last||16.7)/1000,0,.06);last=now;
   if(document.hidden||config.paused)return;
   if(config.quality!==quality){quality=config.quality;if(quality==='High')adaptiveScale=1;slowSeconds=0;fastSeconds=0;resize()}
   elapsed+=dt;
   frames++;if(now-fpsTime>=1000){
    const fps=frames*1000/(now-fpsTime);
    element.dataset.fps=String(Math.round(fps));
    // Automatic render-scale fallback prevents large tablets / software WebGL
    // from blocking animation and audio analysis with expensive GPU frames.
    if(config.quality!=='High'){
     slowSeconds=fps<26?slowSeconds+1:0;
     fastSeconds=fps>51?fastSeconds+1:0;
     if(slowSeconds>=2&&adaptiveScale>.53){
      adaptiveScale=Math.max(.53,adaptiveScale-.16);
      slowSeconds=0;fastSeconds=0;resize();
     }else if(fastSeconds>=9&&adaptiveScale<.98){
      adaptiveScale=Math.min(1,adaptiveScale+.11);
      slowSeconds=0;fastSeconds=0;resize();
     }
    }
    element.dataset.renderScale=String(Math.round(adaptiveScale*100));
    frames=0;fpsTime=now;
   }
   const mediaTime=getLocalMediaTime();
   const time=mediaTime??elapsed;
   const snapshot=getLyricTimelineSnapshot();
   if(snapshot.revision!==revision){
    revision=snapshot.revision;
    const key=snapshot.cues.map(c=>c.text).join('|').slice(0,1500);
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,key);
   }
   const lyric=getLyricState(time);
   const lyricMode=config.autoScenes&&sequence.length>0;
   const directed=lyricMode?sceneAt(sequence,lyric.position):null;
   const scene=directed??sceneForAudio(time,config.manualScene,config.autoScenes);
   const measured=readLocalAudio(now);
   const source=getInputSource();
   const isDemo=source==='IDLE'&&config.demo&&mediaTime===null;
   const fake=isDemo?.20+.13*Math.sin(time*2.2)+.12*Math.pow(Math.max(0,Math.sin(time*3.4)),12):0;
   pulse.loudness=measured?.loudness??fake;
   pulse.bass=measured?.bass??fake*.85;
   pulse.mids=measured?.mids??fake*.7;
   pulse.treble=measured?.treble??fake*.55;
   pulse.beat=measured?.beat??(isDemo?Math.pow(Math.max(0,Math.sin(time*3.4)),15):0);
   pulse.onset=measured?.onset??0;
   pulse.downbeat=measured?.downbeat??0;
   const p=pulse;
   const factor=config.intensity;
   const visualTime=time*config.speed*(config.reducedMotion?.15:1);
   ctx.setTransform(element.width/w,0,0,element.height/h,0,0);
   ctx.globalAlpha=1;
   ctx.globalCompositeOperation='source-over';
   const rendered=graphics.render(scene.id,p,visualTime,factor,config.motionBlur,config.reducedMotion,config.quality,config.narrativeObjects,config.cameraMode);
   if(rendered)ctx.drawImage(graphics.canvas,0,0,w,h);
   else drawSafeFallback(ctx,scene.id,w,h,visualTime,p);
   const transition=clamp((time-scene.start)/.7);
   // Section color fades apply to the environment only, not word timing or beat scale.
   if(transition<1&&!config.reducedMotion){
    ctx.save();ctx.globalAlpha=(1-transition)*.17;
    ctx.fillStyle=byId[scene.id].background;ctx.fillRect(0,0,w,h);ctx.restore();
   }
   // Lyrics are composited LAST: sharp, clean and completely outside the GPU feedback trail.
   if(sequence.length&&lyric.cue){
    ctx.save();
    if(config.spatialTypography){
     drawSpatialTypography({c:ctx,scene,cue:lyric.cue,time:lyric.position,
      mode:lyric.mode,w,h,p,intensity:factor,reduced:config.reducedMotion});
    }else{
     drawTypography({c:ctx,scene,cue:lyric.cue,mode:lyric.mode,time:lyric.position,
      width:w,height:h,pulse:p,intensity:factor,reducedMotion:config.reducedMotion});
    }
    ctx.restore();
   }else if(!snapshot.cues.length)drawInstrumentalMark(ctx,scene,w,h,measured?.loudness??fake);
   element.dataset.currentScene=scene.id;
   element.dataset.renderer=rendered?'WEBGL 3D':'CANVAS FALLBACK';
   element.dataset.motionBlur=String(config.reducedMotion?0:config.motionBlur);
   element.dataset.motif=config.narrativeObjects?selectMotif(lyric.cue?.text||'',lyric.cue?.mood||'abstract',scene.id):'disabled';
   element.dataset.lyricLayout=lyric.cue?(config.spatialTypography?spatialLayoutFor(scene,lyric.cue.text):'classic'):'none';
   element.dataset.sceneLabel=byId[scene.id].label;
   element.dataset.hasLyrics=sequence.length>0&&!!lyric.cue?'yes':'no';
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
  raf=requestAnimationFrame(frame);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();graphics.dispose()};
 },[]);
 return canvas;
}
export default function CinematicStage(props:CinematicProps){
 const canvas=useOneCinematicRenderer(props);
 return <canvas className="visual-canvas cinematic-canvas" ref={canvas} aria-label="LyricFlow procedural three-dimensional cinematic lyrics and sound-reactive visual elements"/>;
}
