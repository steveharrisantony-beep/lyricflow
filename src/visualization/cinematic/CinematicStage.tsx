import {useEffect,useRef} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,sceneAt,type DirectedScene,type SceneId} from './catalog';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark,drawTypography} from './typography';
import {drawSpatialTypography,spatialLayoutFor} from './spatialTypography';
import {selectMotif} from './narrative';
import {ProceduralCinema} from './procedural/ThreeEngine';
import {GraphicCompositions,type GraphicSystem} from './procedural/GraphicCompositions';

export type Quality='High'|'Balanced'|'Performance';
export type CameraMode='Automatic'|'Front'|'Orbit'|'Side'|'Top';
export interface CinematicProps{
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;narrativeObjects:boolean;motionBlur:number;
}
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
/** The first three hand-directed showcases have separate rendering grammars. */
export function visualSystemFor(id:SceneId):GraphicSystem|'cinematic'{
 if(id==='crimson-impact')return 'spectrum';
 if(id==='color-riot')return 'geometry';
 return 'cinematic';
}
const sceneForAudio=(time:number,manual:SceneId,auto:boolean):DirectedScene=>{
 const index=Math.max(0,Math.floor(time/13));
 const id=auto?AUDIO_ONLY_SCENES[index%AUDIO_ONLY_SCENES.length]:manual;
 const template=byId[id];
 return {id,start:index*13,end:(index+1)*13,font:template.font,layout:template.layout,camera:template.camera,
 transition:template.transition,variation:index%5,section:index,reason:'audio-only visualizer'};
};
function drawSafeFallback(c:CanvasRenderingContext2D,id:SceneId,w:number,h:number,t:number,p:Pulse){
 const palette=byId[id],grad=c.createLinearGradient(0,0,w,h);
 grad.addColorStop(0,palette.background);grad.addColorStop(1,'#050916');
 c.fillStyle=grad;c.fillRect(0,0,w,h);
 const glow=c.createRadialGradient(w*.5,h*.46,0,w*.5,h*.48,w*.62);
 glow.addColorStop(0,palette.accent+'50');glow.addColorStop(1,'transparent');
 c.fillStyle=glow;c.fillRect(0,0,w,h);
 c.save();c.translate(w*.5,h*.5);c.rotate(t*.035);
 for(let i=0;i<11;i++){
  c.beginPath();c.strokeStyle=palette.foreground+'4a';c.lineWidth=1+p.bass;
  c.ellipse(0,0,w*(.08+i*.025),h*(.1+i*.022),0,i*.2,i*.2+Math.PI*1.7);c.stroke();
 }c.restore();
}
function useCinematicRenderer(props:CinematicProps){
 const host=useRef<HTMLDivElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null);
 const effects=useRef<HTMLCanvasElement>(null);
 const currentProps=useRef(props);
 useEffect(()=>{currentProps.current=props},[props]);
 useEffect(()=>{
  const element=canvas.current,fx=effects.current,wrapper=host.current;
  if(!element||!fx||!wrapper)return;
  const textCtx=element.getContext('2d',{alpha:true});
  const paintCtx=fx.getContext('2d',{alpha:false});
  if(!textCtx||!paintCtx){element.dataset.rendererError='Canvas 2D unavailable';return}
  const graphics=new ProceduralCinema();
  const graphicArt=new GraphicCompositions();
  const glCanvas=graphics.canvas;
  glCanvas.className='cinematic-webgl-canvas';
  glCanvas.setAttribute('aria-hidden','true');
  wrapper.insertBefore(glCanvas,fx);
  element.dataset.renderer=graphics.available?'WEBGL 3D':'CANVAS FALLBACK';
  if(!graphics.available)element.dataset.rendererError='WebGL unavailable. Using Canvas fallback.';
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,revision=-1;
  let sequence:DirectedScene[]=[];
  let w=1,h=1,adaptiveScale=1,slowSeconds=0,fastSeconds=0,modeLast='';
  let demoBands=new Float32Array(64);
  const resize=()=>{
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?950_000:q==='Balanced'?1_600_000:2_400_000;
   const dpr=Math.max(.48,Math.min(ratio,Math.sqrt(limit/(w*h)))*adaptiveScale);
   for(const c of [element,fx]){
    c.width=Math.max(1,Math.floor(w*dpr));
    c.height=Math.max(1,Math.floor(h*dpr));
   }
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   paintCtx.setTransform(fx.width/w,0,0,fx.height/h,0,0);
   graphics.resize(fx.width,fx.height,q);
   graphicArt.reset();
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  let visualMode:GraphicSystem|'cinematic'='cinematic';
  const frame=(now:number)=>{
   raf=requestAnimationFrame(frame);
   const config=currentProps.current;
   const dt=clamp((now-last||16.7)/1000,0,.06);last=now;
   if(document.hidden||config.paused)return;
   if(config.quality!==quality){quality=config.quality;
    if(quality==='High')adaptiveScale=1;
    slowSeconds=0;fastSeconds=0;resize();
   }
   elapsed+=dt;
   frames++;
   if(now-fpsTime>=1000){
    const fps=frames*1000/(now-fpsTime);
    element.dataset.fps=String(Math.round(fps));
    if(config.quality!=='High'){
     slowSeconds=fps<26?slowSeconds+1:0;
     fastSeconds=fps>51?fastSeconds+1:0;
     if(slowSeconds>=2&&adaptiveScale>.53){
      adaptiveScale=Math.max(.53,adaptiveScale-.16);slowSeconds=0;fastSeconds=0;resize();
     }else if(fastSeconds>=9&&adaptiveScale<.98){
      adaptiveScale=Math.min(1,adaptiveScale+.11);slowSeconds=0;fastSeconds=0;resize();
     }
    }
    element.dataset.renderScale=String(Math.round(adaptiveScale*100));
    frames=0;fpsTime=now;
   }
   const mediaTime=getLocalMediaTime(),time=mediaTime??elapsed;
   const snapshot=getLyricTimelineSnapshot();
   if(snapshot.revision!==revision){
    revision=snapshot.revision;
    const key=snapshot.cues.map(c=>c.text).join('|').slice(0,1500);
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,key);
   }
   const lyric=getLyricState(time);
   const directed=config.autoScenes&&sequence.length>0?sceneAt(sequence,lyric.position):null;
   const scene=directed??sceneForAudio(time,config.manualScene,config.autoScenes);
   const measured=readLocalAudio(now),source=getInputSource();
   const isDemo=source==='IDLE'&&config.demo&&mediaTime===null;
   const fake=isDemo?.20+.13*Math.sin(time*2.2)+.12*Math.pow(Math.max(0,Math.sin(time*3.4)),12):0;
   pulse.loudness=measured?.loudness??fake;
   pulse.bass=measured?.bass??fake*.85;
   pulse.mids=measured?.mids??fake*.7;
   pulse.treble=measured?.treble??fake*.55;
   pulse.beat=measured?.beat??(isDemo?Math.pow(Math.max(0,Math.sin(time*3.4)),15):0);
   pulse.onset=measured?.onset??0;pulse.downbeat=measured?.downbeat??0;
   const factor=config.intensity;
   const visualTime=time*config.speed*(config.reducedMotion?.15:1);
   visualMode=visualSystemFor(scene.id);
   if(visualMode!==modeLast){
    modeLast=visualMode;
    graphicArt.reset();
    paintCtx.clearRect(0,0,w,h);
    // Disable frame-history ghosting when transitioning between pipelines.
    graphics.resetTrails();
   }
   glCanvas.style.display=visualMode==='cinematic'&&graphics.available?'block':'none';
   fx.style.display=visualMode!=='cinematic'||!graphics.available?'block':'none';
   paintCtx.setTransform(fx.width/w,0,0,fx.height/h,0,0);
   if(visualMode==='cinematic'&&graphics.available){
    graphics.render(scene.id,pulse,visualTime,factor,config.motionBlur,
      config.reducedMotion,config.quality,config.narrativeObjects,config.cameraMode);
   }else if(visualMode==='cinematic'){
    drawSafeFallback(paintCtx,scene.id,w,h,visualTime,pulse);
   }else{
    const spectrum=measured?.bands;
    if(isDemo){
     for(let i=0;i<64;i++){
      const oscillation=Math.abs(Math.sin(time*2.2+i*.38)*Math.cos(time*.66+i*.25));
      demoBands[i]=Math.max(.035,oscillation*(.25+.2*Math.max(0,Math.sin(time*3.9-i*.22))));
     }
    }
    graphicArt.render(paintCtx,w,h,visualTime,{...pulse,bands:spectrum??(isDemo?demoBands:undefined)},
      visualMode,config.motionBlur,factor,Boolean(isDemo),config.reducedMotion);
   }
   // Dedicated top canvas: text is never copied through the motion-blur framebuffer.
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   textCtx.clearRect(0,0,w,h);
   const transition=clamp((time-scene.start)/.7);
   if(transition<1&&!config.reducedMotion){
    textCtx.save();textCtx.globalAlpha=(1-transition)*.12;
    textCtx.fillStyle=byId[scene.id].background;textCtx.fillRect(0,0,w,h);textCtx.restore();
   }
   if(sequence.length&&lyric.cue){
    textCtx.save();
    if(config.spatialTypography){
     drawSpatialTypography({c:textCtx,scene,cue:lyric.cue,time:lyric.position,
      mode:lyric.mode,w,h,p:pulse,intensity:factor,reduced:config.reducedMotion});
    }else{
     drawTypography({c:textCtx,scene,cue:lyric.cue,mode:lyric.mode,time:lyric.position,
      width:w,height:h,pulse,intensity:factor,reducedMotion:config.reducedMotion});
    }
    textCtx.restore();
   }else if(!snapshot.cues.length)drawInstrumentalMark(textCtx,scene,w,h,measured?.loudness??fake);
   const engine=visualMode==='spectrum'?'SPECTRUM 64B':visualMode==='geometry'?'GENERATIVE GEOMETRY':
    graphics.available?'WEBGL 3D':'CANVAS FALLBACK';
   element.dataset.renderer=engine;
   element.dataset.visualSystem=visualMode;
   element.dataset.currentScene=scene.id;
   element.dataset.motionBlur=String(config.reducedMotion?0:config.motionBlur);
   element.dataset.motif=config.narrativeObjects?selectMotif(lyric.cue?.text||'',lyric.cue?.mood||'abstract',scene.id):'disabled';
   element.dataset.lyricLayout=lyric.cue?(config.spatialTypography?spatialLayoutFor(scene,lyric.cue.text):'classic'):'none';
   element.dataset.sceneLabel=byId[scene.id].label;
   element.dataset.hasLyrics=sequence.length>0&&!!lyric.cue?'yes':'no';
   element.dataset.sceneCount=String(sequence.length);
   element.dataset.audioSource=source!=='IDLE'?source:isDemo?'DEMO':'IDLE';
   element.dataset.audioLevel=String(Math.round(pulse.loudness*100));
   element.dataset.audioBass=String(Math.round(pulse.bass*100));
   element.dataset.audioMids=String(Math.round(pulse.mids*100));
   element.dataset.audioTreble=String(Math.round(pulse.treble*100));
   element.dataset.audioBeat=String(Math.round(pulse.beat*100));
   element.dataset.audioBpm=String(measured?.bpm||0);
   element.dataset.audioTempoConfidence=String(Math.round((measured?.tempoConfidence||0)*100));
   element.dataset.audioOnset=String(Math.round(pulse.onset*100));
   element.dataset.audioDownbeat=String(Math.round(pulse.downbeat*100));
   element.dataset.audioSection=measured?.section||'unknown';
   element.dataset.audioFlux=String(Math.round((measured?.flux||0)*10000));
   element.dataset.audioThreshold=String(Math.round((measured?.threshold||0)*10000));
   element.dataset.audioBeatCount=String(measured?.beatCount||0);
   element.dataset.audioBandCount=String(measured?.bands.length??64);
  };
  raf=requestAnimationFrame(frame);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();graphics.dispose();glCanvas.remove()};
 },[]);
 return {host,canvas,effects};
}
export default function CinematicStage(props:CinematicProps){
 const {host,canvas,effects}=useCinematicRenderer(props);
 return <div className="cinematic-stack" ref={host}>
  <canvas className="cinematic-effects" ref={effects} aria-hidden="true"/>
  <canvas className="visual-canvas cinematic-canvas" ref={canvas}
   aria-label="LyricFlow premium audio-reactive backgrounds with independent sharp cinematic lyrics"/>
 </div>;
}
