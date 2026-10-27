import {setLyricBackdrop} from './contrast';
import {drawMotionGraphics,MOTION_SCENES} from './procedural/MotionGraphics';
import {drawSceneTransition,transitionProgress,sceneEntryPose} from './transitions';
import {drawKineticLyrics,lyricWordHit,type LyricMotion,type LyricFillPaceMode} from './kineticTypography';
import {MusicCameraRig,makeLyricProjection} from './cameraRig';
import {getSpectrumSensitivity} from '../../audio/audioSignal';
import {useEffect,useRef} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,resolveThemePalette,sceneAt,type DirectedScene,type SceneId} from './catalog';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark} from './typography';
import {GraphicCompositions,type GraphicSystem} from './procedural/GraphicCompositions';

export type Quality='High'|'Balanced'|'Performance';
export const CAMERA_VIEWS=['Front'] as const;
export type CameraView=typeof CAMERA_VIEWS[number];
export type CameraMode='Automatic'|'Front';
export type YouTubeBackgroundMode='video'|'theme';

export interface CinematicProps{
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode?:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;narrativeObjects?:boolean;motionBlur:number;
 enabledScenes?:readonly SceneId[];
 enabledKineticMotions?:readonly LyricMotion[];
 enabledCameraViews?:readonly CameraView[];
 cameraShakeEnabled?:boolean;
 cameraShakeSensitivity?:number;
 themePalettes?:Record<string,string>;
 customLyricAccentColor?:string;
 lyricFillPaceMode?:LyricFillPaceMode;
 lyricMinFontSize?:number;
 lyricMaxFontSize?:number;
 audioPaused?:boolean;
 youtubeVideoId?:string|null;
 youtubeBackgroundMode?:YouTubeBackgroundMode;
 hideStageLyrics?:boolean;
 playbackTime?:number;
 hasSeparateAudioStream?:boolean;
 playerVolume?:number;
 onYoutubeTimeUpdate?:(currentTime:number,duration?:number)=>void;
}
export function resolveActiveCameraView():CameraView{
 return 'Front';
}

/** Routes each VoxelWall music-reactive theme to its dedicated 2D rendering grammar (no 3D WebGL themes). */
export function visualSystemFor(id:SceneId):GraphicSystem|'motion2d'{
 if(id==='signal-chamber')return 'spectrum';
 if(id==='color-riot')return 'geometry';
 if(MOTION_SCENES.includes(id))return 'motion2d';
 return 'motion2d';
}

const sceneForAudio=(time:number,manual:SceneId,auto:boolean,enabledScenes?:readonly SceneId[]):DirectedScene=>{
 const index=Math.max(0,Math.floor(time/13));
 const allowed=enabledScenes&&enabledScenes.length>0?AUDIO_ONLY_SCENES.filter(s=>enabledScenes.includes(s)):AUDIO_ONLY_SCENES;
 const pool=allowed.length>0?allowed:AUDIO_ONLY_SCENES;
 const id=auto?pool[index%pool.length]:(byId[manual]?manual:pool[0]);
 const template=byId[id];
 return {id,start:index*13,end:(index+1)*13,font:template.font,layout:template.layout,camera:template.camera,
 transition:template.transition,variation:index%5,section:index,reason:'audio-only visualizer'};
};

function sendYouTubeCommand(iframe:HTMLIFrameElement|null,func:string,args:unknown[]=[]){
 if(!iframe?.contentWindow)return;
 try{
  iframe.contentWindow.postMessage(JSON.stringify({event:'command',func,args}),'*');
 }catch{
  // Ignore cross-origin postMessage errors before iframe ready
 }
}

function useCinematicRenderer(props:CinematicProps,ytWrapRef:React.RefObject<HTMLDivElement|null>){
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
  const graphicArt=new GraphicCompositions(),outgoingArt=new GraphicCompositions();
  const cameraRig=new MusicCameraRig();
  element.dataset.renderer='VOXELWALL 2D ENGINE';
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
   graphicArt.reset();
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  let visualMode:GraphicSystem|'motion2d'='motion2d';
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
   const isYtPlaying=Boolean(config.youtubeVideoId&&!config.audioPaused);
   const isDemo=(source==='IDLE'&&config.demo&&mediaTime===null)||isYtPlaying&&source==='IDLE';
   const demoBeatPulse=isDemo?Math.pow(Math.max(0,Math.sin(time*Math.PI*2)),18):0;
   const fake=isDemo?.22+.15*Math.sin(time*2.2)+.14*demoBeatPulse:0;
   pulse.loudness=measured?.loudness??fake;
   pulse.bass=measured?.bass??fake*.92;
   pulse.mids=measured?.mids??fake*.7;
   pulse.treble=measured?.treble??fake*.55;
   pulse.beat=measured?.beat??demoBeatPulse;
   pulse.onset=measured?.onset??demoBeatPulse;
   pulse.downbeat=measured?.downbeat??0;
   const factor=config.intensity;
   const visualTime=time*config.speed*(config.reducedMotion?.15:1);
   const activeCameraView=resolveActiveCameraView();
   const shakeEnabled=config.cameraShakeEnabled??true;
   const shakeSensitivity=config.cameraShakeSensitivity??50;
   const demoBeatCount=isDemo?Math.floor(time*2):undefined;
   const cameraFrame=cameraRig.sample(
    time,
    pulse,
    factor,
    config.reducedMotion,
    lyricWordHit(lyric.cue,lyric.position,snapshot.emphasis,lyric.mode),
    shakeEnabled,
    shakeSensitivity,
    measured?.beatCount??demoBeatCount
   );
   if(scene.id!==previousId){
    outgoingId=previousId;previousId=scene.id;transitionStarted=now/1000;
    if(outgoingId){outgoing.width=fx.width;outgoing.height=fx.height;outgoingArt.reset()}
   }
   const transition=outgoingId&&!config.reducedMotion?transitionProgress(now/1000,transitionStarted):1;
   visualMode=visualSystemFor(scene.id);
   if(visualMode!==modeLast){modeLast=visualMode;graphicArt.reset()}

   const useYtVideoBg=Boolean(config.youtubeVideoId&&(config.youtubeBackgroundMode??'video')==='video');

   if(ytWrapRef.current){
    if(useYtVideoBg){
     ytWrapRef.current.style.transform=`translate(${cameraFrame.x*w}px,${cameraFrame.y*h}px) rotate(${cameraFrame.roll}rad) scale(${cameraFrame.zoom*1.04})`;
    }else{
     ytWrapRef.current.style.transform='none';
    }
   }

   if(useYtVideoBg){
    fx.style.opacity='0';
    fx.style.visibility='hidden';
   }else{
    fx.style.opacity='1';
    fx.style.visibility='visible';
    if(isDemo)for(let i=0;i<64;i++){
     const oscillation=Math.abs(Math.sin(time*2.2+i*.38)*Math.cos(time*.66+i*.25));
     demoBands[i]=getSpectrumSensitivity()*Math.max(.035,oscillation*(.5+.4*Math.max(0,Math.sin(time*3.9-i*.22))));
    }
    const background=(id:SceneId,target:CanvasRenderingContext2D,art:GraphicCompositions,old=false)=>{
     const mode=visualSystemFor(id);
     const paletteId=config.themePalettes?.[id];
     const resolvedPal=resolveThemePalette(id,paletteId);
     target.setTransform(outgoing.width/w,0,0,outgoing.height/h,0,0);
     if(!old)target.setTransform(fx.width/w,0,0,fx.height/h,0,0);
     target.save();target.translate(w*.5+cameraFrame.x*w,h*.5+cameraFrame.y*h);
     target.rotate(cameraFrame.roll);target.scale(cameraFrame.zoom*1.025,cameraFrame.zoom*1.025);target.translate(-w*.5,-h*.5);
     if(mode==='motion2d')drawMotionGraphics(target,w,h,visualTime,pulse,id,factor,config.reducedMotion,paletteId);
     else art.render(target,w,h,visualTime,{...pulse,bands:measured?.bands??(isDemo?demoBands:undefined)},mode,
       transition<1?0:config.motionBlur,factor,Boolean(isDemo),config.reducedMotion,resolvedPal);
     target.restore();
    };
    if(transition<1&&outgoingId&&outgoingCtx)background(outgoingId,outgoingCtx,outgoingArt,true);
    background(scene.id,paintCtx,graphicArt);
    if(sampleCtx&&(elapsed-sampleAt>.2||transition<.04)){
     sampleCtx.drawImage(fx,0,0,48,30);
     setLyricBackdrop(textCtx,sampleCtx.getImageData(0,0,48,30));sampleAt=elapsed;
    }
   }

   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   textCtx.clearRect(0,0,w,h);
   const displayTransition=config.reducedMotion?1:transitionProgress(performance.now()/1000,transitionStarted);
   if(!useYtVideoBg&&outgoingId&&displayTransition<1&&outgoing.width>0){
    drawSceneTransition(textCtx,outgoing,w,h,displayTransition,scene.transition);
   }
   element.dataset.transition=!useYtVideoBg&&outgoingId&&displayTransition<1?scene.transition:'none';
   const entry=sceneEntryPose(displayTransition,scene.transition);
   if(!useYtVideoBg){
    fx.style.transform=`translate(${entry.x*w}px,${entry.y*h}px) rotate(${entry.roll}rad) scale(${entry.scale})`;
   }
   textCtx.save();textCtx.translate(w*.5+entry.x*w,h*.5+entry.y*h);textCtx.rotate(entry.roll);
   textCtx.scale(entry.scale,entry.scale);textCtx.translate(-w*.5,-h*.5);
   const lyricClock=getLocalMediaTime()??time;
   lyric=getLyricState(lyricClock);
   // Do not hold previous lyrics during pause, instrumental music gaps, or when hidden for lyric videos
   const activeCue=(config.audioPaused||config.hideStageLyrics)?null:lyric.cue;
   if(activeCue){
    if(useYtVideoBg){
     // Subtle contrast vignette behind stage lyrics when overlaid on YouTube video
     const scrim=textCtx.createRadialGradient(w*.5,h*.5,Math.min(w,h)*.08,w*.5,h*.5,Math.max(w,h)*.65);
     scrim.addColorStop(0,'rgba(4, 7, 15, 0.42)');
     scrim.addColorStop(1,'rgba(4, 7, 15, 0.14)');
     textCtx.fillStyle=scrim;
     textCtx.fillRect(0,0,w,h);
    }
    const project=makeLyricProjection(w,h,cameraFrame);
    const activePaletteId=config.themePalettes?.[scene.id];
    const result=drawKineticLyrics({
     c:textCtx,
     scene,
     cue:activeCue,
     time:lyric.position,
     mode:lyric.mode,
     w,
     h,
     intensity:factor,
     reduced:config.reducedMotion,
     emphasis:snapshot.emphasis,
     project,
     animated:config.spatialTypography,
     enabledMotions:config.enabledKineticMotions,
     paletteId:activePaletteId,
     customAccentColor:config.customLyricAccentColor,
     bpm:measured?.bpm||0,
     fillPaceMode:config.lyricFillPaceMode,
     minFontSize:config.lyricMinFontSize,
     maxFontSize:config.lyricMaxFontSize
    });
    element.dataset.lyricLayout=config.spatialTypography?result.motion:'classic';
    element.dataset.lyricText=result.text;element.dataset.lyricWords=String(result.words);element.dataset.lyricDraws=String(result.drawn);
    element.dataset.lyricHighlights=String(result.highlights);element.dataset.lyricFont=result.font;
    element.dataset.lyricFillPace=result.fillPace||'line';
   }else{
    if(!snapshot.cues.length&&!useYtVideoBg&&!config.hideStageLyrics){
     drawInstrumentalMark(textCtx,scene,w,h,measured?.loudness??fake);
    }
    element.dataset.lyricLayout='none';element.dataset.lyricText='';element.dataset.lyricWords='0';element.dataset.lyricDraws='0';
   }
   textCtx.restore();
   element.dataset.lyricClock=lyricClock.toFixed(3);
   element.dataset.lyricClockLag=String(Math.round(Math.abs((getLocalMediaTime()??lyricClock)-lyricClock)*1000));
   element.dataset.cameraImpact=cameraFrame.impact.toFixed(3);element.dataset.cameraZoom=cameraFrame.zoom.toFixed(3);
   element.dataset.cameraView=activeCameraView;
   element.dataset.cameraShake=shakeEnabled?String(Math.round((config.cameraShakeSensitivity??50))):'off';
   element.dataset.wordKeywords=snapshot.emphasis.keywords.slice(0,12).join(',');
   const engine=useYtVideoBg?'YOUTUBE VIDEO + VOXELVERSE':visualMode==='motion2d'?'VOXELWALL 2D ENGINE':visualMode==='spectrum'?'SPECTRUM 64B':'GENERATIVE GEOMETRY';
   element.dataset.renderer=engine;
   element.dataset.visualSystem=useYtVideoBg?'youtube-video':visualMode;
   element.dataset.currentScene=scene.id;
   element.dataset.motionBlur=String(config.reducedMotion?0:config.motionBlur);
   element.dataset.motif='disabled';
   element.dataset.sceneLabel=useYtVideoBg?'YouTube Video Background':byId[scene.id].label;
   element.dataset.hasLyrics=sequence.length>0&&!!activeCue?'yes':'no';
   element.dataset.sceneCount=String(sequence.length);
   element.dataset.audioSource=source!=='IDLE'?source:isYtPlaying?'YOUTUBE VIDEO':isDemo?'DEMO':'IDLE';
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
  return()=>{cancelAnimationFrame(raf);observer.disconnect()};
 },[]);
 return {host,canvas,effects};
}

export default function CinematicStage(props:CinematicProps){
 const ytWrapRef=useRef<HTMLDivElement>(null);
 const ytIframeRef=useRef<HTMLIFrameElement>(null);
 const lastSyncTimeRef=useRef<number>(0);
 const ytReadyRef=useRef<boolean>(false);
 const latestPropsRef=useRef(props);
 latestPropsRef.current=props;
 const {host,canvas,effects}=useCinematicRenderer(props,ytWrapRef);

 const ytId=props.youtubeVideoId||null;
 const showYtBg=Boolean(ytId&&(props.youtubeBackgroundMode??'video')==='video');

 const syncYtPlayerState=()=>{
  const iframe=ytIframeRef.current;
  if(!iframe)return;
  const cur=latestPropsRef.current;
  if(cur.hasSeparateAudioStream){
   sendYouTubeCommand(iframe,'mute');
  }else{
   sendYouTubeCommand(iframe,'unMute');
   sendYouTubeCommand(iframe,'setVolume',[cur.playerVolume??85]);
  }
  if(cur.audioPaused){
   sendYouTubeCommand(iframe,'pauseVideo');
  }else{
   sendYouTubeCommand(iframe,'playVideo');
  }
 };

 // Establish YouTube IFrame API postMessage handshake ("listening") and receive real-time currentTime / duration
 useEffect(()=>{
  ytReadyRef.current=false;
  if(!ytId)return;

  const sendListening=()=>{
   const iframe=ytIframeRef.current;
   if(!iframe?.contentWindow)return;
   try{
    iframe.contentWindow.postMessage(
     JSON.stringify({event:'listening',id:'lyricflow-yt',channel:'widget'}),
     '*'
    );
    sendYouTubeCommand(iframe,'addEventListener',['onReady']);
    sendYouTubeCommand(iframe,'addEventListener',['onStateChange']);
   }catch{
    // Ignore before iframe ready
   }
  };

  const onMessage=(event:MessageEvent)=>{
   if(!ytIframeRef.current||event.source!==ytIframeRef.current.contentWindow)return;
   if(typeof event.data!=='string')return;
   let data:Record<string,unknown>;
   try{
    data=JSON.parse(event.data) as Record<string,unknown>;
   }catch{
    return;
   }
   const evt=String(data.event||'');
   if(evt==='onReady'||evt==='initialDelivery'){
    ytReadyRef.current=true;
    syncYtPlayerState();
   }else if(evt==='infoDelivery'&&data.info&&typeof data.info==='object'){
    const info=data.info as Record<string,unknown>;
    if(!ytReadyRef.current){
     ytReadyRef.current=true;
     syncYtPlayerState();
    }
    const ct=typeof info.currentTime==='number'&&Number.isFinite(info.currentTime)?info.currentTime:undefined;
    const dur=typeof info.duration==='number'&&Number.isFinite(info.duration)&&info.duration>0?info.duration:undefined;
    if(ct!==undefined){
     lastSyncTimeRef.current=ct;
     latestPropsRef.current.onYoutubeTimeUpdate?.(ct,dur);
    }
    const pState=typeof info.playerState==='number'?info.playerState:undefined;
    if((pState===-1||pState===5)&&!latestPropsRef.current.audioPaused){
     syncYtPlayerState();
    }
   }
  };

  window.addEventListener('message',onMessage);
  const poll=window.setInterval(()=>{
   sendListening();
   if(!ytReadyRef.current){
    syncYtPlayerState();
   }
  },350);

  return()=>{
   window.removeEventListener('message',onMessage);
   window.clearInterval(poll);
  };
 },[ytId]);

 // Keep YouTube iframe synchronized with play/pause, mute/volume, and seek time
 useEffect(()=>{
  if(!ytId||!ytIframeRef.current)return;
  if(props.audioPaused){
   sendYouTubeCommand(ytIframeRef.current,'pauseVideo');
  }else{
   sendYouTubeCommand(ytIframeRef.current,'playVideo');
  }
 },[ytId,props.audioPaused]);

 useEffect(()=>{
  if(!ytId||!ytIframeRef.current)return;
  if(props.hasSeparateAudioStream){
   sendYouTubeCommand(ytIframeRef.current,'mute');
  }else{
   sendYouTubeCommand(ytIframeRef.current,'unMute');
   sendYouTubeCommand(ytIframeRef.current,'setVolume',[props.playerVolume??85]);
  }
 },[ytId,props.hasSeparateAudioStream,props.playerVolume]);

 useEffect(()=>{
  if(!ytId||!ytIframeRef.current||typeof props.playbackTime!=='number')return;
  const diff=Math.abs(props.playbackTime-lastSyncTimeRef.current);
  lastSyncTimeRef.current=props.playbackTime;
  if(diff>1.5){
   sendYouTubeCommand(ytIframeRef.current,'seekTo',[props.playbackTime,true]);
  }
 },[ytId,props.playbackTime]);

 const originParam=typeof window!=='undefined'&&window.location?.origin
  ?`&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}`
  :'';
 const embedSrc=ytId
  ?`https://www.youtube.com/embed/${encodeURIComponent(ytId)}?autoplay=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${encodeURIComponent(ytId)}&enablejsapi=1${originParam}`
  :'';

 return <div className="cinematic-stack" ref={host}>
  {ytId&&(
   <div
    ref={ytWrapRef}
    className="youtube-stage-backdrop"
    style={{
     position:'absolute',
     inset:0,
     width:'100%',
     height:'100%',
     overflow:'hidden',
     zIndex:0,
     opacity:showYtBg?1:0,
     visibility:showYtBg?'visible':'hidden',
     pointerEvents:'none',
     transition:'opacity 240ms ease',
     background:'#04070f'
    }}
    aria-hidden={!showYtBg}
   >
    <iframe
     ref={ytIframeRef}
     key={ytId}
     src={embedSrc}
     title="YouTube video background"
     referrerPolicy="strict-origin-when-cross-origin"
     allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
     style={{
      position:'absolute',
      top:'50%',
      left:'50%',
      width:'116%',
      height:'116%',
      transform:'translate(-50%, -50%)',
      border:0,
      pointerEvents:'none'
     }}
     onLoad={()=>{
      try{
       ytIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({event:'listening',id:'lyricflow-yt',channel:'widget'}),
        '*'
       );
       sendYouTubeCommand(ytIframeRef.current,'addEventListener',['onReady']);
       sendYouTubeCommand(ytIframeRef.current,'addEventListener',['onStateChange']);
      }catch{}
      syncYtPlayerState();
      window.setTimeout(syncYtPlayerState,250);
      window.setTimeout(syncYtPlayerState,700);
     }}
    />
   </div>
  )}
  <canvas
   className="cinematic-effects"
   ref={effects}
   aria-hidden="true"
   style={{
    position:'absolute',
    inset:0,
    width:'100%',
    height:'100%',
    zIndex:1,
    opacity:showYtBg?0:1,
    visibility:showYtBg?'hidden':'visible',
    pointerEvents:'none'
   }}
  />
  <canvas
   className="visual-canvas cinematic-canvas"
   ref={canvas}
   style={{
    position:'absolute',
    inset:0,
    width:'100%',
    height:'100%',
    zIndex:2,
    background:'transparent',
    pointerEvents:'none'
   }}
   aria-label="LyricFlow VoxelWall audio-reactive backgrounds with VoxelVerse animated lyrics"
  />
 </div>;
}

