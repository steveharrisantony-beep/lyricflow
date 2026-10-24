import {setLyricBackdrop} from './contrast';
import {drawMotionGraphics,MOTION_SCENES} from './procedural/MotionGraphics';
import {drawSceneTransition,transitionProgress,sceneEntryPose} from './transitions';
import {drawKineticLyrics,lyricWordHit,type LyricMotion} from './kineticTypography';
import {MusicCameraRig,makeLyricProjection} from './cameraRig';
import {getSpectrumSensitivity} from '../../audio/audioSignal';
import {useEffect,useRef} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,sceneAt,type DirectedScene,type SceneId} from './catalog';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark} from './typography';
import {drawNarrativeObjects,selectMotif} from './narrative';
import {ProceduralCinema} from './procedural/ThreeEngine';
import {GraphicCompositions,type GraphicSystem} from './procedural/GraphicCompositions';

export type Quality='High'|'Balanced'|'Performance';
export type CameraMode='Automatic'|'Front'|'Orbit'|'Side'|'Top';
export interface CinematicProps{
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;narrativeObjects:boolean;motionBlur:number;
 enabledScenes?:readonly SceneId[];
 enabledKineticMotions?:readonly LyricMotion[];
}
/** The first three hand-directed showcases have separate rendering grammars. */
export function visualSystemFor(id:SceneId):GraphicSystem|'cinematic'|'motion2d'{
 if(MOTION_SCENES.includes(id))return 'motion2d';
 if(id==='crimson-impact')return 'spectrum';
 if(id==='color-riot')return 'geometry';
 return 'cinematic';
}
const sceneForAudio=(time:number,manual:SceneId,auto:boolean,enabledScenes?:readonly SceneId[]):DirectedScene=>{
 const index=Math.max(0,Math.floor(time/13));
 const allowed=enabledScenes&&enabledScenes.length>0?AUDIO_ONLY_SCENES.filter(s=>enabledScenes.includes(s)):AUDIO_ONLY_SCENES;
 const pool=allowed.length>0?allowed:AUDIO_ONLY_SCENES;
 const id=auto?pool[index%pool.length]:manual;
 const template=byId[id];
 return {id,start:index*13,end:(index+1)*13,font:template.font,layout:template.layout,camera:template.camera,
 transition:template.transition,variation:index%5,section:index,reason:'audio-only visualizer'};
};
function drawSafeFallback(c:CanvasRenderingContext2D,id:SceneId,w:number,h:number,t:number,p:Pulse){
 const palette=byId[id],u=Math.min(w,h),grad=c.createLinearGradient(0,0,w,h);
 grad.addColorStop(0,palette.background);grad.addColorStop(1,'#050916');
 c.fillStyle=grad;c.fillRect(0,0,w,h);
 const glow=c.createRadialGradient(w*.5,h*.46,0,w*.5,h*.48,w*.65);
 glow.addColorStop(0,palette.accent+'58');glow.addColorStop(1,'transparent');
 c.fillStyle=glow;c.fillRect(0,0,w,h);
 // Perspective horizon grid
 c.save();
 c.strokeStyle=palette.foreground+'1f';
 c.lineWidth=1;
 const horizonY=h*.56;
 for(let i=-6;i<=6;i++){
  c.beginPath();c.moveTo(w*.5+i*w*.04,horizonY);c.lineTo(w*.5+i*w*.15,h);c.stroke();
 }
 for(let j=1;j<=6;j++){
  const yy=horizonY+(h-horizonY)*(j/6)**1.6;
  c.beginPath();c.moveTo(0,yy);c.lineTo(w,yy);c.stroke();
 }
 c.translate(w*.5,h*.48);c.rotate(t*.04);
 for(let i=0;i<12;i++){
  c.beginPath();c.strokeStyle=i%3===0?palette.accent+'88':palette.foreground+'4a';
  c.lineWidth=1.2+p.bass*2;
  c.ellipse(0,0,u*(.09+i*.028)*(1+p.bass*.08),u*(.11+i*.024)*(1+p.mids*.06),0,i*.2,i*.2+Math.PI*1.75);
  c.stroke();
 }
 c.restore();
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
  const graphicArt=new GraphicCompositions(),outgoingArt=new GraphicCompositions();
  const cameraRig=new MusicCameraRig();
  let idle:number|ReturnType<typeof setTimeout>|null=null,preparedKey='';
  const glCanvas=graphics.canvas;
  glCanvas.className='cinematic-webgl-canvas';
  glCanvas.setAttribute('aria-hidden','true');
  wrapper.insertBefore(glCanvas,fx);
  element.dataset.renderer=graphics.available?'WEBGL 3D':'CANVAS FALLBACK';
  if(!graphics.available)element.dataset.rendererError='WebGL unavailable. Using Canvas fallback.';
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,revision=-1,enabledScenesKey='';
  let sequence:DirectedScene[]=[];
  let w=1,h=1,adaptiveScale=1,slowSeconds=0,fastSeconds=0,modeLast='';
  const sample=document.createElement('canvas');sample.width=48;sample.height=30;
  const sampleCtx=sample.getContext('2d',{willReadFrequently:true});let sampleAt=-1;
  const outgoing=document.createElement('canvas');
  const outgoingCtx=outgoing.getContext('2d');
  let previousId:SceneId|null=null,outgoingId:SceneId|null=null,transitionStarted=-100;
  let demoBands=new Float32Array(64);
  const resize=()=>{
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?950_000:q==='Balanced'?1_600_000:2_400_000;
   const dpr=Math.max(.48,Math.min(ratio,Math.sqrt(limit/(w*h)))*adaptiveScale);
   for(const c of [element,fx]){
    const pixelRatio=c===element?Math.min(window.devicePixelRatio||1,2):dpr;
    c.width=Math.max(1,Math.floor(w*pixelRatio));
    c.height=Math.max(1,Math.floor(h*pixelRatio));
   }
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   paintCtx.setTransform(fx.width/w,0,0,fx.height/h,0,0);
   graphics.resize(fx.width,fx.height,q);
   graphicArt.reset();
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  let visualMode:GraphicSystem|'cinematic'|'motion2d'='cinematic';
  const frame=(now:number)=>{
   raf=requestAnimationFrame(frame);
   const config=currentProps.current;
   const dt=Math.max(0,(last?now-last:16.7)/1000);last=now;
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
   const currentScenesKey=(config.enabledScenes||[]).join(',');
   if(snapshot.revision!==revision||currentScenesKey!==enabledScenesKey){
    revision=snapshot.revision;
    enabledScenesKey=currentScenesKey;
    const key=snapshot.cues.map(c=>c.text).join('|').slice(0,1500);
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,key,config.enabledScenes);
   }
   let lyric=getLyricState(time);
   const directed=config.autoScenes&&sequence.length>0?sceneAt(sequence,lyric.position):null;
   const scene=directed??sceneForAudio(time,config.manualScene,config.autoScenes,config.enabledScenes);
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
   const cameraFrame=cameraRig.sample(time,pulse,factor,config.reducedMotion,
    lyricWordHit(lyric.cue,lyric.position,snapshot.emphasis,lyric.mode));
   if(scene.id!==previousId){
    outgoingId=previousId;previousId=scene.id;transitionStarted=now/1000;
    if(outgoingId){outgoing.width=fx.width;outgoing.height=fx.height;outgoingArt.reset()}
   }
   const transition=outgoingId&&!config.reducedMotion?transitionProgress(now/1000,transitionStarted):1;
   visualMode=visualSystemFor(scene.id);
   if(visualMode!==modeLast){modeLast=visualMode;graphicArt.reset();graphics.resetTrails()}
   glCanvas.style.display=visualMode==='cinematic'&&graphics.available?'block':'none';
   fx.style.display=visualMode!=='cinematic'||!graphics.available?'block':'none';
   if(isDemo)for(let i=0;i<64;i++){
    const oscillation=Math.abs(Math.sin(time*2.2+i*.38)*Math.cos(time*.66+i*.25));
    demoBands[i]=getSpectrumSensitivity()*Math.max(.035,oscillation*(.5+.4*Math.max(0,Math.sin(time*3.9-i*.22))));
   }
   const background=(id:SceneId,target:CanvasRenderingContext2D,art:GraphicCompositions,old=false)=>{
    const mode=visualSystemFor(id);
    target.setTransform(outgoing.width/w,0,0,outgoing.height/h,0,0);
    if(!old)target.setTransform(fx.width/w,0,0,fx.height/h,0,0);
    if(mode==='cinematic'&&graphics.available){
     graphics.render(id,pulse,visualTime,factor,transition<1?0:config.motionBlur,
      config.reducedMotion,config.quality,config.narrativeObjects,config.cameraMode,cameraFrame);
     if(old){target.setTransform(1,0,0,1,0,0);target.drawImage(glCanvas,0,0,outgoing.width,outgoing.height)}
    }else{
     target.save();target.translate(w*.5+cameraFrame.x*w,h*.5+cameraFrame.y*h);
     target.rotate(cameraFrame.roll);target.scale(cameraFrame.zoom*1.025,cameraFrame.zoom*1.025);target.translate(-w*.5,-h*.5);
     if(mode==='cinematic')drawSafeFallback(target,id,w,h,visualTime,pulse);
     else if(mode==='motion2d')drawMotionGraphics(target,w,h,visualTime,pulse,id,factor,config.reducedMotion);
     else art.render(target,w,h,visualTime,{...pulse,bands:measured?.bands??(isDemo?demoBands:undefined)},mode,
       transition<1?0:config.motionBlur,factor,Boolean(isDemo),config.reducedMotion);
     target.restore();
    }
   };
   // Both worlds continue responding to the same audio during the cut.
   if(transition<1&&outgoingId&&outgoingCtx)background(outgoingId,outgoingCtx,outgoingArt,true);
   background(scene.id,paintCtx,graphicArt);
   if(sampleCtx&&(elapsed-sampleAt>.2||transition<.04)){
    sampleCtx.drawImage(visualMode==='cinematic'&&graphics.available?glCanvas:fx,0,0,48,30);
    setLyricBackdrop(textCtx,sampleCtx.getImageData(0,0,48,30));sampleAt=elapsed;
   }
   // Dedicated top canvas: text is never copied through the motion-blur framebuffer.
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   textCtx.clearRect(0,0,w,h);
   const displayTransition=config.reducedMotion?1:transitionProgress(performance.now()/1000,transitionStarted);
   if(outgoingId&&displayTransition<1&&outgoing.width>0)drawSceneTransition(textCtx,outgoing,w,h,displayTransition,scene.transition);
   element.dataset.transition=outgoingId&&displayTransition<1?scene.transition:'none';
   const entry=sceneEntryPose(displayTransition,scene.transition);
   const incoming=visualMode==='cinematic'&&graphics.available?glCanvas:fx;
   incoming.style.transform=`translate(${entry.x*w}px,${entry.y*h}px) rotate(${entry.roll}rad) scale(${entry.scale})`;
   textCtx.save();textCtx.translate(w*.5+entry.x*w,h*.5+entry.y*h);textCtx.rotate(entry.roll);
   textCtx.scale(entry.scale,entry.scale);textCtx.translate(-w*.5,-h*.5);
   // Scene construction/rendering can take time. Never draw words with an earlier media timestamp.
   const lyricClock=getLocalMediaTime()??time;
   lyric=getLyricState(lyricClock);
   if(config.narrativeObjects){
    drawNarrativeObjects(textCtx,scene,lyric.cue,w,h,visualTime,pulse,factor,config.reducedMotion);
   }
   if(lyric.cue){
    const project=visualMode==='cinematic'&&graphics.available?
     (x:number,y:number,z:number)=>graphics.projectPoint(x,y,z,w,h):makeLyricProjection(w,h,cameraFrame);
    const result=drawKineticLyrics({c:textCtx,scene,cue:lyric.cue,time:lyric.position,
     mode:lyric.mode,w,h,intensity:factor,reduced:config.reducedMotion,emphasis:snapshot.emphasis,project,animated:config.spatialTypography,enabledMotions:config.enabledKineticMotions});
    element.dataset.lyricLayout=config.spatialTypography?result.motion:'classic';
    element.dataset.lyricText=result.text;element.dataset.lyricWords=String(result.words);element.dataset.lyricDraws=String(result.drawn);
    element.dataset.lyricHighlights=String(result.highlights);element.dataset.lyricFont=result.font;
   }else{
    if(!snapshot.cues.length)drawInstrumentalMark(textCtx,scene,w,h,measured?.loudness??fake);
    element.dataset.lyricLayout='none';element.dataset.lyricText='';element.dataset.lyricWords='0';element.dataset.lyricDraws='0';
   }
   textCtx.restore();
   element.dataset.lyricClock=lyricClock.toFixed(3);
   element.dataset.lyricClockLag=String(Math.round(Math.abs((getLocalMediaTime()??lyricClock)-lyricClock)*1000));
   element.dataset.cameraImpact=cameraFrame.impact.toFixed(3);element.dataset.cameraZoom=cameraFrame.zoom.toFixed(3);
   element.dataset.wordKeywords=snapshot.emphasis.keywords.slice(0,12).join(',');
   // Warm scheduled geometry and shader programs before it reaches the playback clock.
   const next=directed?sequence.find(s=>s.start>=scene.end-.001):sceneForAudio(time+13,scene.id,true);
   const nextMode=next?visualSystemFor(next.id):null;
   const remaining=directed?scene.end-lyric.position:13-time%13;
   const prepareKey=next?.id+config.quality;
   if(config.autoScenes&&next&&nextMode==='cinematic'&&remaining<2&&remaining>.5&&preparedKey!==prepareKey){
    preparedKey=prepareKey;
    const prepare=()=>{idle=null;graphics.prepareScene(next.id,config.quality)};
    idle='requestIdleCallback' in window?window.requestIdleCallback(prepare,{timeout:400}):setTimeout(prepare,0);
   }
   const engine=visualMode==='motion2d'?'2D MOTION GRAPHICS':visualMode==='spectrum'?'SPECTRUM 64B':visualMode==='geometry'?'GENERATIVE GEOMETRY':
    graphics.available?'WEBGL 3D':'CANVAS FALLBACK';
   element.dataset.renderer=engine;
   element.dataset.visualSystem=visualMode;
   element.dataset.currentScene=scene.id;
   element.dataset.motionBlur=String(config.reducedMotion?0:config.motionBlur);
   element.dataset.motif=config.narrativeObjects?selectMotif(lyric.cue?.text||'',lyric.cue?.mood||'abstract',scene.id):'disabled';
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
  return()=>{cancelAnimationFrame(raf);if(idle!==null){if('cancelIdleCallback' in window)window.cancelIdleCallback(idle as number);else clearTimeout(idle)}observer.disconnect();graphics.dispose();glCanvas.remove()};
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
