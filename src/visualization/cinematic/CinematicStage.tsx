import {videoSyncTarget} from '../../audio/videoTiming';
import {setLyricBackdrop} from './contrast';
import {drawMotionGraphics,MOTION_SCENES} from './procedural/MotionGraphics';
import {drawSceneTransition,transitionProgress,sceneEntryPose} from './transitions';
import {drawKineticLyrics,lyricWordHit,type LyricMotion,type LyricFillPaceMode,type LyricPlacementMode} from './kineticTypography';
import {MusicCameraRig,makeLyricProjection} from './cameraRig';
import {getSpectrumSensitivity} from '../../audio/audioSignal';
import {useEffect,useRef,useState} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {getInputSource,getLocalMediaTime,readLocalAudio} from '../../audio/audioSignal';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,resolveThemePalette,sceneAt,type DirectedScene,type FontPack,type SceneId} from './catalog';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark} from './typography';
import {GraphicCompositions,type GraphicSystem} from './procedural/GraphicCompositions';
import {useYouTubeAuth} from '../../music/youtubeAuth';
import {useYouTubeAdBlocker,recordSkippedYouTubeAd,recordRemovedAntiAdblockPopup} from '../../music/youtubeAdBlocker';

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
 enabledPlacements?:readonly Exclude<LyricPlacementMode,'auto'>[];
 enabledFonts?:readonly FontPack[];
 enabledCameraViews?:readonly CameraView[];
 cameraShakeEnabled?:boolean;
 cameraShakeSensitivity?:number;
 themePalettes?:Record<string,string>;
 customLyricAccentColor?:string;
 customLyricBaseColor?:string;
 lyricFillPaceMode?:LyricFillPaceMode;
 lyricMinFontSize?:number;
 lyricMaxFontSize?:number;
 lyricPlacementMode?:LyricPlacementMode;
 videoOverlayOpacity?:number;
 audioPaused?:boolean;
 youtubeVideoId?:string|null;
 videoDelaySeconds?:number;
 youtubeBackgroundMode?:YouTubeBackgroundMode;
 hideStageLyrics?:boolean;
 playbackTime?:number;
 hasSeparateAudioStream?:boolean;
 playerVolume?:number;
 onYoutubeTimeUpdate?:(currentTime:number,duration?:number)=>void;
 onYoutubeEnded?:()=>void;
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
  const element=canvas.current,wrapper=host.current;
  if(!element||!wrapper)return;
  const textCtx=element.getContext('2d',{alpha:true});
  if(!textCtx){element.dataset.rendererError='Canvas 2D unavailable';return}
  // Lazy-instantiate background theme compositions ONLY when built-in themes are active (not during YouTube video background)
  let graphicArt:GraphicCompositions|null=null;
  let outgoingArt:GraphicCompositions|null=null;
  const getGraphicArt=()=>{if(!graphicArt)graphicArt=new GraphicCompositions();return graphicArt};
  const getOutgoingArt=()=>{if(!outgoingArt)outgoingArt=new GraphicCompositions();return outgoingArt};

  const cameraRig=new MusicCameraRig();
  element.dataset.renderer='VOXELWALL 2D ENGINE';
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,revision=-1,enabledScenesKey='';
  let sequence:DirectedScene[]=[];
  let w=1,h=1,adaptiveScale=1,slowSeconds=0,fastSeconds=0,modeLast='',wasYtVideoBg:boolean|null=null;
  const sample=document.createElement('canvas');sample.width=48;sample.height=30;
  const sampleCtx=sample.getContext('2d',{willReadFrequently:true});let sampleAt=-1;
  const outgoing=document.createElement('canvas');
  const outgoingCtx=outgoing.getContext('2d');
  let previousId:SceneId|null=null,outgoingId:SceneId|null=null,transitionStarted=-100;
  const demoBands=new Float32Array(64);
  const resize=()=>{
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const useYtBgNow=Boolean(currentProps.current.youtubeVideoId&&(currentProps.current.youtubeBackgroundMode??'video')==='video');
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?950_000:q==='Balanced'?1_600_000:2_400_000;
   const dpr=Math.max(.48,Math.min(ratio,Math.sqrt(limit/(w*h)))*adaptiveScale);
   const textRatio=Math.min(window.devicePixelRatio||1,useYtBgNow?1.35:1.75);
   element.width=Math.max(1,Math.floor(w*textRatio));
   element.height=Math.max(1,Math.floor(h*textRatio));
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   const fx=effects.current;
   if(fx&&!useYtBgNow){
    fx.width=Math.max(1,Math.floor(w*dpr));
    fx.height=Math.max(1,Math.floor(h*dpr));
    const paintCtx=fx.getContext('2d',{alpha:false});
    paintCtx?.setTransform(fx.width/w,0,0,fx.height/h,0,0);
    graphicArt?.reset();
   }
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  let visualMode:GraphicSystem|'motion2d'='motion2d';
  let smoothMediaClock:number|null=null;
  let lastRawMediaTime:number|null=null;
  const datasetCache:Record<string,string>={};
  const setData=(key:string,val:string)=>{
   if(datasetCache[key]!==val){
    datasetCache[key]=val;
    element.dataset[key]=val;
   }
  };
  const frame=(now:number)=>{
   raf=requestAnimationFrame(frame);
   const config=currentProps.current;
   const dt=Math.min(0.1,Math.max(0,(last?now-last:16.7)/1000));last=now;
   if(document.hidden||config.paused)return;
   const useYtVideoBg=Boolean(config.youtubeVideoId&&(config.youtubeBackgroundMode??'video')==='video');
   if(wasYtVideoBg!==useYtVideoBg){
    wasYtVideoBg=useYtVideoBg;
    if(useYtVideoBg){
     // Unload theme state while YouTube video is active so zero background theme work runs
     graphicArt?.reset();
     outgoingArt?.reset();
    }
    resize();
   }
   if(config.quality!==quality){quality=config.quality;
    if(quality==='High')adaptiveScale=1;
    slowSeconds=0;fastSeconds=0;resize();
   }
   elapsed+=dt;
   frames++;
   if(now-fpsTime>=1000){
    const fps=frames*1000/(now-fpsTime);
    setData('fps',String(Math.round(fps)));
    if(config.quality!=='High'&&!useYtVideoBg){
     slowSeconds=fps<26?slowSeconds+1:0;
     fastSeconds=fps>51?fastSeconds+1:0;
     if(slowSeconds>=2&&adaptiveScale>.53){
      adaptiveScale=Math.max(.53,adaptiveScale-.16);slowSeconds=0;fastSeconds=0;resize();
     }else if(fastSeconds>=9&&adaptiveScale<.98){
      adaptiveScale=Math.min(1,adaptiveScale+.11);slowSeconds=0;fastSeconds=0;resize();
     }
    }
    setData('renderScale',String(Math.round(adaptiveScale*100)));
    frames=0;fpsTime=now;
   }
   const rawMediaTime=getLocalMediaTime();
   if(rawMediaTime!==null){
    if(config.audioPaused){
     smoothMediaClock=rawMediaTime;
     lastRawMediaTime=rawMediaTime;
    }else if(
     smoothMediaClock===null||
     lastRawMediaTime===null||
     Math.abs(rawMediaTime-smoothMediaClock)>0.18||
     rawMediaTime<lastRawMediaTime-0.02
    ){
     smoothMediaClock=rawMediaTime;
     lastRawMediaTime=rawMediaTime;
    }else{
     smoothMediaClock+=dt;
     const drift=rawMediaTime-smoothMediaClock;
     smoothMediaClock+=drift*Math.min(1,dt*10);
     lastRawMediaTime=rawMediaTime;
    }
   }else{
    smoothMediaClock=null;
    lastRawMediaTime=null;
   }
   const mediaTime=smoothMediaClock,time=mediaTime??elapsed;
   const snapshot=getLyricTimelineSnapshot();
   const currentScenesKey=(config.enabledScenes||[]).join(',');
   if(snapshot.revision!==revision||currentScenesKey!==enabledScenesKey){
    revision=snapshot.revision;
    enabledScenesKey=currentScenesKey;
    const key=snapshot.cues.map(c=>c.text).join('|').slice(0,1500);
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,key,config.enabledScenes);
    (element as unknown as {_lockedCueKey?:string;_lockedScene?:DirectedScene|null})._lockedCueKey='';
    (element as unknown as {_lockedCueKey?:string;_lockedScene?:DirectedScene|null})._lockedScene=null;
   }
   let lyric=getLyricState(time);
   const activeCueNow=(config.audioPaused||config.hideStageLyrics)?null:lyric.cue;
   const directed=config.autoScenes&&sequence.length>0?sceneAt(sequence,lyric.position):null;
   const candidateScene=directed??sceneForAudio(time,config.manualScene,config.autoScenes,config.enabledScenes);
   const lockHolder=element as unknown as {_lockedCueKey?:string;_lockedScene?:DirectedScene|null};
   let scene:DirectedScene;
   if(!config.autoScenes){
    scene=candidateScene;
    lockHolder._lockedCueKey='';
    lockHolder._lockedScene=candidateScene;
    }else if(activeCueNow){
    const cueKey=activeCueNow.duetGroupKey||`${activeCueNow.time.toFixed(2)}:${activeCueNow.text}`;
    if(lockHolder._lockedCueKey===cueKey&&lockHolder._lockedScene){
     scene=lockHolder._lockedScene;
    }else{
     lockHolder._lockedCueKey=cueKey;
     lockHolder._lockedScene=candidateScene;
     scene=candidateScene;
    }
   }else{
    lockHolder._lockedCueKey='';
    lockHolder._lockedScene=candidateScene;
    scene=candidateScene;
   }
   const measured=readLocalAudio(now),source=getInputSource();
   const isYtPlaying=Boolean(config.youtubeVideoId&&!config.audioPaused);
   const isDemo=(source==='IDLE'&&config.demo&&mediaTime===null)||(isYtPlaying&&source==='IDLE');
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

   // Camera shake must never affect the YouTube video background
   if(ytWrapRef.current&&ytWrapRef.current.style.transform!=='none'){
    ytWrapRef.current.style.transform='none';
   }

   // ONLY load & render procedural background themes when Built-in Themes mode is active (!useYtVideoBg)
   const fx=effects.current;
   const paintCtx=!useYtVideoBg&&fx?fx.getContext('2d',{alpha:false}):null;
   if(!useYtVideoBg&&fx&&paintCtx){
    if(scene.id!==previousId){
     outgoingId=previousId;previousId=scene.id;transitionStarted=now/1000;
     if(outgoingId){outgoing.width=fx.width;outgoing.height=fx.height;getOutgoingArt().reset()}
    }
    const transition=outgoingId&&!config.reducedMotion?transitionProgress(now/1000,transitionStarted):1;
    visualMode=visualSystemFor(scene.id);
    if(visualMode!==modeLast){modeLast=visualMode;getGraphicArt().reset()}

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
    if(transition<1&&outgoingId&&outgoingCtx)background(outgoingId,outgoingCtx,getOutgoingArt(),true);
    background(scene.id,paintCtx,getGraphicArt());
    if(sampleCtx&&(elapsed-sampleAt>.25||transition<.04)){
     sampleCtx.drawImage(fx,0,0,48,30);
     setLyricBackdrop(textCtx,sampleCtx.getImageData(0,0,48,30));sampleAt=elapsed;
    }
   }

   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   textCtx.clearRect(0,0,w,h);
   const displayTransition=useYtVideoBg||config.reducedMotion?1:transitionProgress(performance.now()/1000,transitionStarted);
   if(!useYtVideoBg&&outgoingId&&displayTransition<1&&outgoing.width>0){
    drawSceneTransition(textCtx,outgoing,w,h,displayTransition,scene.transition);
   }
   setData('transition',!useYtVideoBg&&outgoingId&&displayTransition<1?scene.transition:'none');
   const entry=sceneEntryPose(displayTransition,scene.transition);
   if(!useYtVideoBg&&fx){
    fx.style.transform=`translate(${entry.x*w}px,${entry.y*h}px) rotate(${entry.roll}rad) scale(${entry.scale})`;
   }
   textCtx.save();textCtx.translate(w*.5+entry.x*w,h*.5+entry.y*h);textCtx.rotate(entry.roll);
   textCtx.scale(entry.scale,entry.scale);textCtx.translate(-w*.5,-h*.5);
   const lyricClock=smoothMediaClock??time;
   lyric=getLyricState(lyricClock);
   // Do not hold previous lyrics during pause, instrumental music gaps, or when hidden for lyric videos
   const activeCue=(config.audioPaused||config.hideStageLyrics)?null:lyric.cue;
   const secondaryCue=(config.audioPaused||config.hideStageLyrics)?null:lyric.secondaryCue;
   if(activeCue){
    const project=makeLyricProjection(w,h,cameraFrame);
    const activePaletteId=config.themePalettes?.[scene.id];
    const isDuet=Boolean(secondaryCue||activeCue.duetSide);
    const primaryDuetSide=activeCue.duetSide??(secondaryCue?'left':undefined);
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
     enabledPlacements:config.enabledPlacements,
     enabledFonts:config.enabledFonts,
     paletteId:activePaletteId,
     customAccentColor:config.customLyricAccentColor,
     customBaseColor:config.customLyricBaseColor,
     bpm:measured?.bpm||0,
     fillPaceMode:config.lyricFillPaceMode,
     minFontSize:config.lyricMinFontSize,
     maxFontSize:config.lyricMaxFontSize,
     forceLightText:useYtVideoBg,
     placementMode:config.lyricPlacementMode??'auto',
     duetSide:primaryDuetSide
    });
    if(secondaryCue){
     const secondaryDuetSide=secondaryCue.duetSide??(primaryDuetSide==='right'?'left':'right');
     const rightResult=drawKineticLyrics({
      c:textCtx,
      scene,
      cue:secondaryCue,
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
      enabledPlacements:config.enabledPlacements,
      enabledFonts:config.enabledFonts,
      paletteId:activePaletteId,
      customAccentColor:config.customLyricAccentColor,
      customBaseColor:config.customLyricBaseColor,
      bpm:measured?.bpm||0,
      fillPaceMode:config.lyricFillPaceMode,
      minFontSize:config.lyricMinFontSize,
      maxFontSize:config.lyricMaxFontSize,
      forceLightText:useYtVideoBg,
      placementMode:config.lyricPlacementMode??'auto',
      duetSide:secondaryDuetSide
     });
     setData('lyricLayout',config.spatialTypography?result.motion:'classic');
     setData('lyricPlacement','duet-split');
     setData('lyricText',`${result.text} | ${rightResult.text}`);
     setData('lyricWords',String(result.words+rightResult.words));
     setData('lyricDraws',String(result.drawn+rightResult.drawn));
     setData('lyricHighlights',String(result.highlights+rightResult.highlights));
     setData('lyricFont',result.font);
     setData('lyricFillPace',result.fillPace||'line');
    }else{
     setData('lyricLayout',config.spatialTypography?result.motion:'classic');
     setData('lyricPlacement',isDuet?'duet-split':(result.placement||'center'));
     setData('lyricText',result.text);setData('lyricWords',String(result.words));setData('lyricDraws',String(result.drawn));
     setData('lyricHighlights',String(result.highlights));setData('lyricFont',result.font);
     setData('lyricFillPace',result.fillPace||'line');
    }
   }else{
    if(!snapshot.cues.length&&!useYtVideoBg&&!config.hideStageLyrics){
     drawInstrumentalMark(textCtx,scene,w,h,measured?.loudness??fake);
    }
    setData('lyricLayout','none');setData('lyricText','');setData('lyricWords','0');setData('lyricDraws','0');
   }
   textCtx.restore();
   setData('lyricClock',lyricClock.toFixed(3));
   setData('lyricClockLag',String(Math.round(Math.abs((rawMediaTime??lyricClock)-lyricClock)*1000)));
   setData('cameraImpact',cameraFrame.impact.toFixed(3));setData('cameraZoom',cameraFrame.zoom.toFixed(3));
   setData('cameraView',activeCameraView);
   setData('cameraShake',shakeEnabled?String(Math.round((config.cameraShakeSensitivity??50))):'off');
   setData('wordKeywords',snapshot.emphasis.keywords.slice(0,12).join(','));
   const engine=useYtVideoBg?'YOUTUBE VIDEO + VOXELVERSE':visualMode==='motion2d'?'VOXELWALL 2D ENGINE':visualMode==='spectrum'?'SPECTRUM 64B':'GENERATIVE GEOMETRY';
   setData('renderer',engine);
   setData('visualSystem',useYtVideoBg?'youtube-video':visualMode);
   setData('currentScene',scene.id);
   setData('motionBlur',String(config.reducedMotion?0:config.motionBlur));
   setData('motif','disabled');
   setData('sceneLabel',useYtVideoBg?'YouTube Video Background':byId[scene.id].label);
   setData('hasLyrics',sequence.length>0&&!!activeCue?'yes':'no');
   setData('sceneCount',String(sequence.length));
   setData('audioSource',source!=='IDLE'?source:isYtPlaying?'YOUTUBE VIDEO':isDemo?'DEMO':'IDLE');
   setData('audioLevel',String(Math.round(pulse.loudness*100)));
   setData('audioBass',String(Math.round(pulse.bass*100)));
   setData('audioMids',String(Math.round(pulse.mids*100)));
   setData('audioTreble',String(Math.round(pulse.treble*100)));
   setData('audioBeat',String(Math.round(pulse.beat*100)));
   setData('audioBpm',String(measured?.bpm||0));
   setData('audioTempoConfidence',String(Math.round((measured?.tempoConfidence||0)*100)));
   setData('audioOnset',String(Math.round(pulse.onset*100)));
   setData('audioDownbeat',String(Math.round(pulse.downbeat*100)));
   setData('audioSection',measured?.section||'unknown');
   setData('audioFlux',String(Math.round((measured?.flux||0)*10000)));
   setData('audioThreshold',String(Math.round((measured?.threshold||0)*10000)));
   setData('audioBeatCount',String(measured?.beatCount||0));
   setData('audioBandCount',String(measured?.bands.length??64));
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
 const lastVideoMappingRef=useRef('');
 const videoWaitingRef=useRef(false);
 const ytReadyRef=useRef<boolean>(false);
 const ytEndedFiredRef=useRef<boolean>(false);
 const loadedVideoIdRef=useRef<string|null>(null);
 const inAdFastForwardRef=useRef(false);
 const mainVideoDurationRef=useRef(0);
 const latestPropsRef=useRef(props);
 latestPropsRef.current=props;
 const ytAuth=useYouTubeAuth();
 const ytAdBlocker=useYouTubeAdBlocker();
 const ytAdBlockerRef=useRef(ytAdBlocker);
 ytAdBlockerRef.current=ytAdBlocker;
 const [errorRetryNonce,setErrorRetryNonce]=useState(0);
 const {host,canvas,effects}=useCinematicRenderer(props,ytWrapRef);

 const ytId=props.youtubeVideoId||null;
 const [mountedVideoId,setMountedVideoId]=useState<string|null>(ytId);
 const showYtBg=Boolean(ytId&&(props.youtubeBackgroundMode??'video')==='video');
 const blackOverlayOpacity=Math.max(0,Math.min(0.92,props.videoOverlayOpacity??0.45));

 // Reuse the authenticated YouTube IFrame Player via loadVideoById when ready so playing multiple
 // videos in a row never triggers YouTube's /embed/ cold-load bot limiter or loses autoplay permission.
 useEffect(()=>{
  if(!ytId){
   loadedVideoIdRef.current=null;
   setMountedVideoId(null);
   return;
  }
  if(!mountedVideoId||!ytReadyRef.current||!ytIframeRef.current){
   loadedVideoIdRef.current=ytId;
   setMountedVideoId(ytId);
   return;
  }
  if(loadedVideoIdRef.current!==ytId){
   loadedVideoIdRef.current=ytId;
   ytEndedFiredRef.current=false;
   const target=videoSyncTarget(props.playbackTime??0,props.videoDelaySeconds,Boolean(props.hasSeparateAudioStream));
   sendYouTubeCommand(ytIframeRef.current,'loadVideoById',[ytId,Math.max(0,target.time)]);
   if(props.hasSeparateAudioStream){
    sendYouTubeCommand(ytIframeRef.current,'mute');
   }else{
    sendYouTubeCommand(ytIframeRef.current,'unMute');
    sendYouTubeCommand(ytIframeRef.current,'setVolume',[props.playerVolume??85]);
   }
   if(props.audioPaused||target.waiting){
    sendYouTubeCommand(ytIframeRef.current,'pauseVideo');
   }else{
    sendYouTubeCommand(ytIframeRef.current,'playVideo');
   }
  }
 },[ytId,mountedVideoId]);

 // When user signs into YouTube account or clicks Reload Video, remount with current ytId
 useEffect(()=>{
  if(ytId){
   ytReadyRef.current=false;
   loadedVideoIdRef.current=ytId;
   setMountedVideoId(ytId);
  }
 },[ytAuth.reloadNonce,ytAuth.useNoCookieDomain]);

 const syncYtPlayerState=()=>{
  const iframe=ytIframeRef.current;
  if(!iframe)return;
  const cur=latestPropsRef.current;
  if(cur.youtubeVideoId&&loadedVideoIdRef.current&&loadedVideoIdRef.current!==cur.youtubeVideoId){
   loadedVideoIdRef.current=cur.youtubeVideoId;
   const startTarget=videoSyncTarget(cur.playbackTime??0,cur.videoDelaySeconds,Boolean(cur.hasSeparateAudioStream));
   sendYouTubeCommand(iframe,'loadVideoById',[cur.youtubeVideoId,Math.max(0,startTarget.time)]);
  }
  if(cur.hasSeparateAudioStream){
   sendYouTubeCommand(iframe,'mute');
  }else{
   sendYouTubeCommand(iframe,'unMute');
   sendYouTubeCommand(iframe,'setVolume',[cur.playerVolume??85]);
  }
  const target=videoSyncTarget(cur.playbackTime??0,cur.videoDelaySeconds,Boolean(cur.hasSeparateAudioStream));
  if(cur.hasSeparateAudioStream)sendYouTubeCommand(iframe,'seekTo',[target.time,true]);
  if(cur.audioPaused||target.waiting){
   sendYouTubeCommand(iframe,'pauseVideo');
  }else{
   sendYouTubeCommand(iframe,'playVideo');
  }
 };

 // Establish YouTube IFrame API postMessage handshake ("listening") and receive real-time currentTime / duration
 useEffect(()=>{
  ytReadyRef.current=false;
  ytEndedFiredRef.current=false;
  if(!mountedVideoId)return;

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
    sendYouTubeCommand(iframe,'addEventListener',['onError']);
   }catch{
    // Ignore before iframe ready
   }
  };

  let pollId=0;
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
    if(pollId)window.clearInterval(pollId);
    syncYtPlayerState();
   }else if(evt==='onError'){
    if(ytAdBlockerRef.current.enabled&&ytAdBlockerRef.current.removeAdblockThingEnabled){
     recordRemovedAntiAdblockPopup();
    }
    // If loadVideoById hit a transient error, remount iframe once with the current video ID
    const curVid=latestPropsRef.current.youtubeVideoId;
    if(curVid&&mountedVideoId!==curVid){
     ytReadyRef.current=false;
     loadedVideoIdRef.current=curVid;
     setMountedVideoId(curVid);
     setErrorRetryNonce(n=>n+1);
    }
   }else if(evt==='onStateChange'&&typeof data.info==='number'){
    if(data.info===0&&!ytEndedFiredRef.current){
     ytEndedFiredRef.current=true;
     if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
    }else if(data.info===1){
     ytEndedFiredRef.current=false;
    }
   }else if(evt==='infoDelivery'&&data.info&&typeof data.info==='object'){
    const info=data.info as Record<string,unknown>;
    if(!ytReadyRef.current){
     ytReadyRef.current=true;
     if(pollId)window.clearInterval(pollId);
     syncYtPlayerState();
    }
    const ct=typeof info.currentTime==='number'&&Number.isFinite(info.currentTime)?info.currentTime:undefined;
    const dur=typeof info.duration==='number'&&Number.isFinite(info.duration)&&info.duration>0?info.duration:undefined;
    if(dur&&dur>45){
     mainVideoDurationRef.current=dur;
    }
    const videoData=info.videoData&&typeof info.videoData==='object'?(info.videoData as Record<string,unknown>):undefined;
    const playingVidId=typeof videoData?.video_id==='string'?videoData.video_id:'';
    const targetVidId=latestPropsRef.current.youtubeVideoId||'';
    const isInterruptingAd=
     info.adState===1||
     info.isAdPlaying===true||
     Boolean(playingVidId&&targetVidId&&playingVidId!==targetVidId)||
     Boolean(ytAdBlockerRef.current.skipEmbeddedAdsEnabled&&dur&&dur>=5&&dur<=32&&mainVideoDurationRef.current>45);
    if(isInterruptingAd&&ytAdBlockerRef.current.enabled&&ytAdBlockerRef.current.removeAdblockThingEnabled&&ytIframeRef.current){
     sendYouTubeCommand(ytIframeRef.current,'mute');
     sendYouTubeCommand(ytIframeRef.current,'setPlaybackRate',[16]);
     if(dur&&dur>0)sendYouTubeCommand(ytIframeRef.current,'seekTo',[dur,true]);
     if(!inAdFastForwardRef.current){
      inAdFastForwardRef.current=true;
      recordSkippedYouTubeAd();
     }
     return;
    }else if(inAdFastForwardRef.current&&ytIframeRef.current){
     inAdFastForwardRef.current=false;
     sendYouTubeCommand(ytIframeRef.current,'setPlaybackRate',[1]);
     syncYtPlayerState();
    }
    if(ct!==undefined){
     lastSyncTimeRef.current=ct;
     if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeTimeUpdate?.(ct,dur);
     if(dur&&dur>15&&ct>=dur-0.45&&!ytEndedFiredRef.current){
      ytEndedFiredRef.current=true;
      if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
     }else if(ct<3){
      ytEndedFiredRef.current=false;
     }
    }
    const pState=typeof info.playerState==='number'?info.playerState:undefined;
    if(pState===0&&!ytEndedFiredRef.current){
     ytEndedFiredRef.current=true;
     if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
    }else if((pState===-1||pState===5)&&!latestPropsRef.current.audioPaused){
     syncYtPlayerState();
    }
   }
  };

  window.addEventListener('message',onMessage);
  pollId=window.setInterval(()=>{
   if(ytReadyRef.current){
    window.clearInterval(pollId);
    return;
   }
   sendListening();
   syncYtPlayerState();
  },450);

  return()=>{
   window.removeEventListener('message',onMessage);
   if(pollId)window.clearInterval(pollId);
  };
 },[mountedVideoId,ytAuth.reloadNonce,errorRetryNonce]);

 // Video timing is independent of the audio clock and lyric timing.
 useEffect(()=>{
  if(!ytId||!ytIframeRef.current||typeof props.playbackTime!=='number')return;
  const target=videoSyncTarget(props.playbackTime,props.videoDelaySeconds,Boolean(props.hasSeparateAudioStream));
  const mapping=ytId+'|'+(props.hasSeparateAudioStream?props.videoDelaySeconds??0:0)+'|'+Boolean(props.hasSeparateAudioStream);
  const changed=mapping!==lastVideoMappingRef.current;
  const resumed=videoWaitingRef.current&&!target.waiting;
  lastVideoMappingRef.current=mapping;
  videoWaitingRef.current=target.waiting;
  if(props.hasSeparateAudioStream){
   sendYouTubeCommand(ytIframeRef.current,'mute');
   if(changed||resumed||Math.abs(target.time-lastSyncTimeRef.current)>.75){
    sendYouTubeCommand(ytIframeRef.current,'seekTo',[target.time,true]);
    lastSyncTimeRef.current=target.time;
   }
  }else{
   sendYouTubeCommand(ytIframeRef.current,'unMute');
   sendYouTubeCommand(ytIframeRef.current,'setVolume',[props.playerVolume??85]);
   if(Math.abs(target.time-lastSyncTimeRef.current)>1.5){
    sendYouTubeCommand(ytIframeRef.current,'seekTo',[target.time,true]);
    lastSyncTimeRef.current=target.time;
   }
  }
  sendYouTubeCommand(ytIframeRef.current,props.audioPaused||target.waiting?'pauseVideo':'playVideo');
 },[ytId,props.playbackTime,props.videoDelaySeconds,props.hasSeparateAudioStream,props.audioPaused,props.playerVolume]);

 const originParam=typeof window!=='undefined'&&window.location?.origin
  ?`&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}`
  :'';
 const embedHost=ytAuth.useNoCookieDomain?'https://www.youtube-nocookie.com':'https://www.youtube.com';
 const activeEmbedVid=mountedVideoId||ytId;
 const controlsParam=ytAuth.interactivePlayer?'1':'0';
 const embedSrc=activeEmbedVid
  ?`${embedHost}/embed/${encodeURIComponent(activeEmbedVid)}?autoplay=1&controls=${controlsParam}&disablekb=${ytAuth.interactivePlayer?'0':'1'}&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1${props.hasSeparateAudioStream?'&mute=1':''}${originParam}`
  :'';

 return <div className="cinematic-stack" ref={host}>
  {activeEmbedVid&&(
   <div
    ref={ytWrapRef}
    className="youtube-stage-backdrop"
    style={{
     position:'absolute',
     inset:0,
     width:'100%',
     height:'100%',
     overflow:'hidden',
     zIndex:ytAuth.interactivePlayer?4:0,
     opacity:showYtBg?1:0,
     visibility:showYtBg?'visible':'hidden',
     pointerEvents:ytAuth.interactivePlayer?'auto':'none',
     transition:'opacity 240ms ease',
     background:'#04070f'
    }}
    aria-hidden={!showYtBg}
   >
    <iframe
     ref={ytIframeRef}
     key={`yt-${mountedVideoId||ytId}-${ytAuth.reloadNonce}-${ytAuth.useNoCookieDomain?'nc':'std'}-${errorRetryNonce}`}
     src={embedSrc}
     title="YouTube video background"
     referrerPolicy="strict-origin-when-cross-origin"
     allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
     style={{
      position:'absolute',
      top:'50%',
      left:'50%',
      width:ytAuth.interactivePlayer?'100%':'116%',
      height:ytAuth.interactivePlayer?'100%':'116%',
      transform:'translate(-50%, -50%)',
      border:0,
      pointerEvents:ytAuth.interactivePlayer?'auto':'none'
     }}
     onLoad={()=>{
      try{
       ytIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({event:'listening',id:'lyricflow-yt',channel:'widget'}),
        '*'
       );
       sendYouTubeCommand(ytIframeRef.current,'addEventListener',['onReady']);
       sendYouTubeCommand(ytIframeRef.current,'addEventListener',['onStateChange']);
       sendYouTubeCommand(ytIframeRef.current,'addEventListener',['onError']);
      }catch{}
      syncYtPlayerState();
      window.setTimeout(syncYtPlayerState,250);
      window.setTimeout(syncYtPlayerState,700);
     }}
    />
   </div>
  )}
  {showYtBg&&(
   <div
    className="youtube-video-black-overlay"
    aria-hidden="true"
    style={{
     position:'absolute',
     inset:0,
     width:'100%',
     height:'100%',
     zIndex:1,
     background:'#000000',
     opacity:blackOverlayOpacity,
     pointerEvents:'none'
    }}
   />
  )}
  {!showYtBg&&(
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
     pointerEvents:'none'
    }}
   />
  )}
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

