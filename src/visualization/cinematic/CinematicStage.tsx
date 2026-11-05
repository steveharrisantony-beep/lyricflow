import {SpectrumThemes,isSpectrumScene} from './procedural/SpectrumThemes';
import {paletteForSection,type ThemePaletteInput} from './themeSelection';
import type {LyricLayoutSettings} from '../../lyrics/lyricLayout';
import {chooseThemeTransition} from './themeTransitions';
import type {CurrentWordAnimation} from './currentWordAnimations';
import type {Transition} from './catalog';
import {videoSyncTarget} from '../../audio/videoTiming';
import type {AlbumArtLyricPalette} from './contrast';
import type {CurrentWordStyle} from './currentWordStyles';
import {setLyricBackdrop} from './contrast';
import {drawMotionGraphics,MOTION_SCENES} from './procedural/MotionGraphics';
import {drawSceneTransition,transitionProgress,sceneEntryPose,TRANSITION_SECONDS} from './transitions';
import {drawKineticLyrics,lyricWordHit,type LyricMotion,type LyricFillPaceMode,type LyricPlacementMode} from './kineticTypography';
import {MusicCameraRig} from './cameraRig';
import {getSpectrumSensitivity,getInputSource,getLocalMediaTime,readLocalAudio,setVirtualMediaTime} from '../../audio/audioSignal';
import {useEffect,useRef,useState} from 'react';
import {getLyricState,getLyricTimelineSnapshot} from '../../lyrics/lyricTimeline';
import {AUDIO_ONLY_SCENES,buildCinematicSchedule,byId,resolveThemePalette,sceneAt,type DirectedScene,type FontPack,type SceneId} from './catalog';
import {preloadLyricFonts} from './fonts';
import {NO_AUDIO,type Pulse} from './paint';
import {drawInstrumentalMark} from './typography';
import {GraphicCompositions,type GraphicSystem} from './procedural/GraphicCompositions';
import {useYouTubeAuth} from '../../music/youtubeAuth';
import {useNativePlaybackPolicy} from '../../audio/nativePlaybackPolicy';
import {isYouTubeTopicChannel} from '../../music/videoMatching';
import {logVideoPlaybackRecovery,logVideoPlaybackError} from '../../music/videoSearchHistory';
import {AUTO_VIDEO_START_TIMEOUT_MS,AUTO_VIDEO_STALL_TIMEOUT_MS,MAX_AUTO_VIDEO_RELOADS,shouldMonitorAutoVideo,nextAutoVideoRecoveryAction} from '../../music/videoPlaybackRecovery';

export type Quality='High'|'Balanced'|'Performance';
export const CAMERA_VIEWS=['Front'] as const;
export type CameraView=typeof CAMERA_VIEWS[number];
export type CameraMode='Automatic'|'Front';
export type YouTubeBackgroundMode='video'|'theme';
export type VideoFitMode='default'|'stretch';
export interface BackgroundVideoMetadata {videoId:string;title:string;author:string}

export interface CinematicProps{
 quality:Quality;intensity:number;speed:number;reducedMotion:boolean;
 demo:boolean;paused:boolean;autoScenes:boolean;cameraMode?:CameraMode;manualScene:SceneId;
 spatialTypography:boolean;
 wordStylesEnabled?:boolean;
 currentWordStyle?:CurrentWordStyle;
 enabledWordStyles?:readonly CurrentWordStyle[];
 enabledThemeTransitions?:readonly Transition[];
 wordAnimationsEnabled?:boolean;
 enabledWordAnimations?:readonly CurrentWordAnimation[];
 albumLyricPalette?:AlbumArtLyricPalette;
 narrativeObjects?:boolean;motionBlur:number;
 enabledScenes?:readonly SceneId[];
 enabledKineticMotions?:readonly LyricMotion[];
 enabledPlacements?:readonly Exclude<LyricPlacementMode,'auto'>[];
 enabledVideoPlacements?:readonly Exclude<LyricPlacementMode,'auto'>[];
 enabledThemePlacements?:readonly Exclude<LyricPlacementMode,'auto'>[];
 enabledFonts?:readonly FontPack[];
 enabledCameraViews?:readonly CameraView[];
 cameraShakeEnabled?:boolean;
 cameraShakeSensitivity?:number;
 themePalettes?:ThemePaletteInput;
 themeDurationLines?:number;
 themeDurationSeconds?:number;
 customLyricAccentColor?:string;
 customLyricBaseColor?:string;
 lyricFillPaceMode?:LyricFillPaceMode;
 lyricMinFontSize?:number;
 lyricMaxFontSize?:number;
 lyricFontScale?:number;
 lyricLayout?:LyricLayoutSettings;
 lyricPlacementMode?:LyricPlacementMode;
 videoPlacementMode?:LyricPlacementMode;
 themePlacementMode?:LyricPlacementMode;
 videoOverlayOpacity?:number;
 videoFitMode?:VideoFitMode;
 audioPaused?:boolean;
 youtubeVideoId?:string|null;
 videoReloadNonce?:number;
 videoDelaySeconds?:number;
 youtubeBackgroundMode?:YouTubeBackgroundMode;
 hideStageLyrics?:boolean;
 hideVideo?:boolean;
 playbackTime?:number;
 hasSeparateAudioStream?:boolean;
 playerVolume?:number;
 onYoutubeTimeUpdate?:(currentTime:number,duration?:number)=>void;
 onYoutubeEnded?:()=>void;
 onLoadAnotherVideo?:(videoId:string)=>void;
 loadingAnotherVideo?:boolean;
 videoRecoveryMessage?:string;
 onRejectBackgroundVideo?:(videoId:string,reason:string)=>void;
 onAutoPlaybackExhausted?:(videoId:string)=>void;
 videoLogKey?:string;
 onVerifiedBackground?:(recordingKey:string,videoId:string|null)=>void;
 onBackgroundVideoMetadata?:(recordingKey:string,metadata:BackgroundVideoMetadata)=>void;
 recordingKey?:string;
 externalPlayer?:boolean;
 videoSearchPending?:boolean;
 advertisementPlaying?:boolean;
 renderThemes?:boolean;
}
export function resolveActiveCameraView():CameraView{
 return 'Front';
}

/** Routes each VoxelWall music-reactive theme to its dedicated 2D rendering grammar (no 3D WebGL themes). */
export function visualSystemFor(id:SceneId):GraphicSystem|'motion2d'|'analyzer'{
 if(isSpectrumScene(id))return 'analyzer';
 if(id==='color-riot')return 'geometry';
 if(MOTION_SCENES.includes(id))return 'motion2d';
 return 'motion2d';
}

function hashSeed(input:string):number{
 let h=2166136261;
 for(let i=0;i<input.length;i++)h=Math.imul(h^input.charCodeAt(i),16777619);
 return h>>>0;
}

const sceneForAudio=(
 time:number,
 manual:SceneId,
 auto:boolean,
 enabledScenes?:readonly SceneId[],
 durationSeconds=6,
 seedKey=''
):DirectedScene=>{
 const span=Math.max(4,Math.min(120,Number(durationSeconds)||6));
 const index=Math.max(0,Math.floor(time/span));
 const allowed=enabledScenes&&enabledScenes.length>0?AUDIO_ONLY_SCENES.filter(s=>enabledScenes.includes(s)):AUDIO_ONLY_SCENES;
 const basePool=allowed.length>0?[...allowed]:[...AUDIO_ONLY_SCENES];
 // Deterministically shuffle each cycle of basePool so all enabled themes are visited in random order without repeating only a few
 const cycle=Math.floor(index/Math.max(1,basePool.length));
 const shuffled=[...basePool];
 for(let i=shuffled.length-1;i>0;i--){
  const j=hashSeed(`${seedKey}:cycle:${cycle}:${i}`)%(i+1);
  const tmp=shuffled[i];
  shuffled[i]=shuffled[j];
  shuffled[j]=tmp;
 }
 const id=auto?shuffled[index%shuffled.length]:(byId[manual]?manual:basePool[0]);
 const template=byId[id];
 const palSeed=hashSeed(`${seedKey}:pal:${index}:${id}`);
 const paletteObj=template.palettes[palSeed%template.palettes.length];
 return {
  id,
  start:index*span,
  end:(index+1)*span,
  font:template.font,
  layout:template.layout,
  camera:template.camera,
  transition:template.transition,
  variation:index%5,
  section:index,
  reason:'audio-only visualizer',
  paletteId:paletteObj?.id
 };
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

  let spectrumArt:SpectrumThemes|null=null,outgoingSpectrum:SpectrumThemes|null=null;
  const getSpectrumArt=()=>spectrumArt??(spectrumArt=new SpectrumThemes());
  const getOutgoingSpectrum=()=>outgoingSpectrum??(outgoingSpectrum=new SpectrumThemes());
  let spectrumRecordingKey=props.recordingKey;
  const cameraRig=new MusicCameraRig();
  element.dataset.renderer='VOXELWALL 2D ENGINE';
  let raf=0,last=0,elapsed=0,frames=0,fpsTime=0,quality=props.quality,revision=-1,enabledScenesKey='';
  let sequence:DirectedScene[]=[];
  let w=1,h=1,adaptiveScale=1,slowSeconds=0,fastSeconds=0,modeLast='',wasYtVideoBg:boolean|null=null;
  const sample=document.createElement('canvas');sample.width=48;sample.height=30;
  const sampleCtx=sample.getContext('2d',{willReadFrequently:true});let sampleAt=-1;
  const outgoing=document.createElement('canvas');
  const outgoingCtx=outgoing.getContext('2d');
  let needsFrame=true;
  let previousId:SceneId|null=null,outgoingId:SceneId|null=null,transitionStarted=-100;
  let previousPaletteId:string|undefined=undefined,outgoingPaletteId:string|undefined=undefined;
  let activeThemeTransition:Transition|null=null;
  const demoBands=new Float32Array(64);
  const resize=()=>{
   needsFrame=true;
   w=Math.max(1,element.clientWidth);h=Math.max(1,element.clientHeight);
   const q=currentProps.current.quality;
   const useYtBgNow=currentProps.current.renderThemes===false;
   const ratio=Math.min(window.devicePixelRatio||1,q==='High'?2:q==='Balanced'?1.5:1);
   const limit=q==='Performance'?950_000:q==='Balanced'?1_600_000:2_400_000;
   const dpr=Math.max(.48,Math.min(ratio,Math.sqrt(limit/(w*h)))*adaptiveScale);
   const textRatio=Math.min(window.devicePixelRatio||1,useYtBgNow?1.35:1.75);
   element.width=Math.max(1,Math.floor(w*textRatio));
   element.height=Math.max(1,Math.floor(h*textRatio));
   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   const fx=effects.current;
   if(fx){
    fx.width=Math.max(1,Math.floor(w*dpr));
    fx.height=Math.max(1,Math.floor(h*dpr));
    const paintCtx=fx.getContext('2d',{alpha:false});
    paintCtx?.setTransform(fx.width/w,0,0,fx.height/h,0,0);
    graphicArt?.reset();spectrumArt?.reset();
   }
  };
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const pulse:Pulse={...NO_AUDIO};
  let visualMode:GraphicSystem|'motion2d'|'analyzer'='motion2d';
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
   const useYtVideoBg=config.renderThemes===false;
   if(document.hidden||(config.paused&&!needsFrame&&wasYtVideoBg===useYtVideoBg))return;
   needsFrame=false;
   if(wasYtVideoBg!==useYtVideoBg){
    wasYtVideoBg=useYtVideoBg;
    if(useYtVideoBg){
     // Unload theme state while YouTube video is active so zero background theme work runs
     graphicArt?.reset();
     outgoingArt?.reset();spectrumArt?.reset();outgoingSpectrum?.reset();
     setLyricBackdrop(textCtx,null);
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
   const signalMediaTime=getLocalMediaTime();
   const fallbackPlaybackTime=typeof config.playbackTime==='number'&&Number.isFinite(config.playbackTime)&&config.playbackTime>0?config.playbackTime:null;
   const rawMediaTime=signalMediaTime!==null&&signalMediaTime>0?signalMediaTime:(fallbackPlaybackTime??signalMediaTime);
   if(rawMediaTime!==null){
    if(config.audioPaused){
     smoothMediaClock=rawMediaTime;
     lastRawMediaTime=rawMediaTime;
    }else if(
     smoothMediaClock===null||
     lastRawMediaTime===null||
     rawMediaTime<lastRawMediaTime-0.05
    ){
     smoothMediaClock=rawMediaTime;
     lastRawMediaTime=rawMediaTime;
    }else if(rawMediaTime!==lastRawMediaTime){
     // A fresh time sample arrived from the audio/YouTube player
     if(Math.abs(rawMediaTime-smoothMediaClock)>0.45){
      smoothMediaClock=rawMediaTime;
     }else{
      smoothMediaClock+=dt;
      const drift=rawMediaTime-smoothMediaClock;
      smoothMediaClock+=drift*Math.min(1,dt*12);
     }
     lastRawMediaTime=rawMediaTime;
    }else{
     // Between player time samples (e.g. YouTube 250ms infoDelivery ticks), advance smoothly forward
     if(smoothMediaClock-rawMediaTime<1.35){
      smoothMediaClock+=dt;
     }
    }
   }else{
    smoothMediaClock=null;
    lastRawMediaTime=null;
   }
   const mediaTime=smoothMediaClock,time=mediaTime??elapsed;
   const snapshot=getLyricTimelineSnapshot();
   const currentScenesKey=`${(config.enabledScenes||[]).join(',')}|${config.themeDurationLines??0}|${config.recordingKey||''}`;
   if(snapshot.revision!==revision||currentScenesKey!==enabledScenesKey){
    revision=snapshot.revision;
    enabledScenesKey=currentScenesKey;
    const key=`${config.recordingKey||''}:${snapshot.cues.map(c=>c.text).join('|').slice(0,1500)}`;
    sequence=buildCinematicSchedule(snapshot.sections,snapshot.cues,snapshot.genre,key,config.enabledScenes,config.themeDurationLines);
    (element as unknown as {_lockedCueKey?:string;_lockedScene?:DirectedScene|null})._lockedCueKey='';
    (element as unknown as {_lockedCueKey?:string;_lockedScene?:DirectedScene|null})._lockedScene=null;
   }
   let lyric=getLyricState(time);
   const activeCueNow=(config.audioPaused||config.hideStageLyrics)?null:lyric.cue;
   const directed=(config.autoScenes||config.enabledScenes?.length===1)&&sequence.length>0?sceneAt(sequence,lyric.position):null;
   const candidateScene=directed??sceneForAudio(time,config.manualScene,config.autoScenes,config.enabledScenes,config.themeDurationSeconds??6,config.recordingKey||'');
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

   const resolveScenePaletteId=(targetSceneId:SceneId)=>paletteForSection(targetSceneId,config.themePalettes,scene.section,config.recordingKey||'');

   // Draw themes only while visible or transitioning. This canvas is permanently between video and lyrics.
   const fx=effects.current;
   const paintCtx=!useYtVideoBg&&fx?fx.getContext('2d',{alpha:false}):null;
   if(!useYtVideoBg&&fx&&paintCtx){
    if(spectrumRecordingKey!==config.recordingKey){spectrumArt?.reset();outgoingSpectrum?.reset();spectrumRecordingKey=config.recordingKey;}
    const chosenPaletteId=resolveScenePaletteId(scene.id);
    setData('paletteId',chosenPaletteId);
    if(scene.id!==previousId||chosenPaletteId!==previousPaletteId){
     outgoingId=previousId;
     outgoingPaletteId=previousPaletteId;
     if(outgoingId&&isSpectrumScene(outgoingId)&&spectrumArt)getOutgoingSpectrum().copyFrom(spectrumArt);
     if(scene.id!==outgoingId)spectrumArt?.reset();
     previousId=scene.id;
     previousPaletteId=chosenPaletteId;
     transitionStarted=now/1000;
     activeThemeTransition=chooseThemeTransition(scene.transition,config.enabledThemeTransitions,`${scene.id}|${scene.section}`);
     if(outgoingId){outgoing.width=fx.width;outgoing.height=fx.height;getOutgoingArt().reset()}
    }
    const transition=outgoingId&&activeThemeTransition&&!config.reducedMotion?transitionProgress(now/1000,transitionStarted):1;
    visualMode=visualSystemFor(scene.id);
    if(visualMode!==modeLast){modeLast=visualMode;graphicArt?.reset()}

    if(isDemo)for(let i=0;i<64;i++){
     const oscillation=Math.abs(Math.sin(time*2.2+i*.38)*Math.cos(time*.66+i*.25));
     demoBands[i]=getSpectrumSensitivity()*Math.max(.035,oscillation*(.5+.4*Math.max(0,Math.sin(time*3.9-i*.22))));
    }
    const background=(id:SceneId,target:CanvasRenderingContext2D,old=false)=>{
     const mode=visualSystemFor(id);
     const paletteId=old?outgoingPaletteId:previousPaletteId;
     const resolvedPal=resolveThemePalette(id,paletteId);
     target.setTransform(outgoing.width/w,0,0,outgoing.height/h,0,0);
     if(!old)target.setTransform(fx.width/w,0,0,fx.height/h,0,0);
     target.save();target.translate(w*.5+cameraFrame.x*w,h*.5+cameraFrame.y*h);
     target.rotate(cameraFrame.roll);target.scale(cameraFrame.zoom*1.025,cameraFrame.zoom*1.025);target.translate(-w*.5,-h*.5);
     if(isSpectrumScene(id))(old?getOutgoingSpectrum():getSpectrumArt()).render(target,w,h,visualTime,{...pulse,bands:measured?.bands??(isDemo?demoBands:undefined)},id,resolvedPal,factor,config.reducedMotion,(quality==='Performance'?.5:quality==='Balanced'?.75:1)*adaptiveScale,now/1000);
     else if(mode==='motion2d')drawMotionGraphics(target,w,h,visualTime,pulse,id,factor,config.reducedMotion,paletteId,{bands:measured?.bands??(isDemo?demoBands:undefined),detail:(quality==='Performance'?.5:quality==='Balanced'?.75:1)*adaptiveScale});
     else if(mode!=='analyzer')(old?getOutgoingArt():getGraphicArt()).render(target,w,h,visualTime,{...pulse,bands:measured?.bands??(isDemo?demoBands:undefined)},mode,
       transition<1?0:config.motionBlur,factor,Boolean(isDemo),config.reducedMotion,resolvedPal);
     target.restore();
    };
    if(transition<1&&outgoingId&&outgoingCtx)background(outgoingId,outgoingCtx,true);
    background(scene.id,paintCtx);
    // Scene transitions belong on the theme layer, never on the transparent lyrics canvas.
    if(transition<1&&outgoingId&&outgoing.width>0)drawSceneTransition(paintCtx,outgoing,w,h,transition,activeThemeTransition!);
    if(sampleCtx&&(elapsed-sampleAt>.25||transition<.04)){
     sampleCtx.drawImage(fx,0,0,48,30);
     setLyricBackdrop(textCtx,sampleCtx.getImageData(0,0,48,30));sampleAt=elapsed;
    }
   }

   textCtx.setTransform(element.width/w,0,0,element.height/h,0,0);
   textCtx.clearRect(0,0,w,h);
   const displayTransition=useYtVideoBg||config.reducedMotion||!activeThemeTransition?1:transitionProgress(now/1000,transitionStarted);
   setData('transition',!useYtVideoBg&&outgoingId&&displayTransition<1?activeThemeTransition!:'none');
   textCtx.save();
   const lyricClock=smoothMediaClock??time;
   lyric=getLyricState(lyricClock);
   // Do not hold previous lyrics during pause, instrumental music gaps, or when hidden for lyric videos
   const activeCue=(config.audioPaused||config.hideStageLyrics)?null:lyric.cue;
   const secondaryCue=(config.audioPaused||config.hideStageLyrics)?null:lyric.secondaryCue;
   if(activeCue){
    const activePaletteId=previousPaletteId??resolveScenePaletteId(scene.id);
    const isDuet=Boolean(secondaryCue||activeCue.duetSide);
    const primaryDuetSide=activeCue.duetSide??(secondaryCue?'left':undefined);
    const activeEnabledPlacements=useYtVideoBg
     ?(config.enabledVideoPlacements??config.enabledPlacements)
     :(config.enabledThemePlacements??config.enabledPlacements);
    const activePlacementMode=activeEnabledPlacements?.length?'auto':useYtVideoBg
     ?(config.videoPlacementMode??config.lyricPlacementMode??'bottom-right')
     :(config.themePlacementMode??config.lyricPlacementMode??'center');
    const result=drawKineticLyrics({
     c:textCtx,
     scene,
     cue:activeCue,
     cueIndex:snapshot.cues.indexOf(activeCue),
     time:lyric.position,
     mode:lyric.mode,
     w,
     h,
     intensity:factor,
     reduced:config.reducedMotion,
     emphasis:snapshot.emphasis,
     camera:cameraFrame,
     animated:config.spatialTypography,
     wordStylesEnabled:config.wordStylesEnabled,
     currentWordStyle:config.currentWordStyle,
     enabledWordStyles:config.enabledWordStyles,
     wordAnimationsEnabled:config.wordAnimationsEnabled,
     enabledWordAnimations:config.enabledWordAnimations,
     albumPalette:config.albumLyricPalette,
     enabledMotions:config.enabledKineticMotions,
     enabledPlacements:activeEnabledPlacements,
     enabledFonts:config.enabledFonts,
     paletteId:activePaletteId,
     customAccentColor:config.customLyricAccentColor,
     customBaseColor:config.customLyricBaseColor,
     bpm:measured?.bpm||0,
     fillPaceMode:config.lyricFillPaceMode,
     minFontSize:config.lyricMinFontSize,
     maxFontSize:config.lyricMaxFontSize,
     fontScale:config.lyricFontScale,
     layout:config.lyricLayout,
     forceLightText:useYtVideoBg,
     placementMode:activePlacementMode,
     duetSide:primaryDuetSide
    });
    if(secondaryCue){
     const secondaryDuetSide=secondaryCue.duetSide??(primaryDuetSide==='right'?'left':'right');
     const rightResult=drawKineticLyrics({
      c:textCtx,
      scene,
      cue:secondaryCue,
      cueIndex:snapshot.cues.indexOf(secondaryCue),
      time:lyric.position,
      mode:lyric.mode,
      w,
      h,
      intensity:factor,
      reduced:config.reducedMotion,
      emphasis:snapshot.emphasis,
      camera:cameraFrame,
      animated:config.spatialTypography,
     wordStylesEnabled:config.wordStylesEnabled,
     currentWordStyle:config.currentWordStyle,
     enabledWordStyles:config.enabledWordStyles,
     wordAnimationsEnabled:config.wordAnimationsEnabled,
     enabledWordAnimations:config.enabledWordAnimations,
     albumPalette:config.albumLyricPalette,
      enabledMotions:config.enabledKineticMotions,
      enabledPlacements:activeEnabledPlacements,
      enabledFonts:config.enabledFonts,
      paletteId:activePaletteId,
      customAccentColor:config.customLyricAccentColor,
      customBaseColor:config.customLyricBaseColor,
      bpm:measured?.bpm||0,
      fillPaceMode:config.lyricFillPaceMode,
      minFontSize:config.lyricMinFontSize,
      maxFontSize:config.lyricMaxFontSize,
      fontScale:config.lyricFontScale,
      layout:config.lyricLayout,
      forceLightText:useYtVideoBg,
      placementMode:activePlacementMode,
      duetSide:secondaryDuetSide
     });
     setData('lyricLayout',config.spatialTypography?result.motion:'classic');
     setData('lyricPlacement','duet-split');
     setData('lyricText',`${result.drawn>0?result.text:''}${result.drawn>0&&rightResult.drawn>0?' | ':''}${rightResult.drawn>0?rightResult.text:''}`);
     setData('lyricWords',String(result.words+rightResult.words));
     setData('lyricDraws',String(result.drawn+rightResult.drawn));
     setData('lyricHighlights',String(result.highlights+rightResult.highlights));
     setData('lyricFont',result.drawn>0?result.font:rightResult.font);
     setData('lyricFillPace',result.fillPace||'line');
     setData('lyricWordStyle',result.wordStyle||'off');
     setData('lyricGlyphs',String(result.glyphs||0));
     setData('lyricLetterMode',result.letterMode||'shaped');
     setData('lyricMotionPhase',result.motionPhase||'still');
     setData('lyricWordAnimation',result.wordAnimation||'off');
     setData('lyricBaseColor',result.baseColor||'');
     setData('lyricActiveColor',result.activeColor||'');
    }else{
     setData('lyricLayout',config.spatialTypography?result.motion:'classic');
     setData('lyricPlacement',isDuet?'duet-split':(result.placement||'center'));
     setData('lyricText',result.text);setData('lyricWords',String(result.words));setData('lyricDraws',String(result.drawn));
     setData('lyricHighlights',String(result.highlights));setData('lyricFont',result.font);
     setData('lyricFillPace',result.fillPace||'line');
     setData('lyricWordStyle',result.wordStyle||'off');
     setData('lyricGlyphs',String(result.glyphs||0));
     setData('lyricLetterMode',result.letterMode||'shaped');
     setData('lyricMotionPhase',result.motionPhase||'still');
     setData('lyricWordAnimation',result.wordAnimation||'off');
     setData('lyricBaseColor',result.baseColor||'');
     setData('lyricActiveColor',result.activeColor||'');
    }
   }else{
    if(!snapshot.cues.length&&!useYtVideoBg&&!config.hideStageLyrics){
     drawInstrumentalMark(textCtx,scene,w,h,measured?.loudness??fake);
    }
    setData('lyricWordStyle','off');setData('lyricLayout','none');setData('lyricText','');setData('lyricWords','0');setData('lyricDraws','0');
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
 const lastTargetTimeRef=useRef<number>(0);
 const lastVideoMappingRef=useRef('');
 const lastControlSigRef=useRef('');
 const videoWaitingRef=useRef(false);
 const ytReadyRef=useRef<boolean>(false);
 const ytEndedFiredRef=useRef<boolean>(false);
 const ytDurationRef=useRef<number>(0);
 const ytEndedEarlyRef=useRef<boolean>(false);
 const ytPlayerStateRef=useRef<number|null>(null);
 const videoRecoveryRef=useRef({identity:'',reloads:0,attemptAt:0,progressAt:0,lastTime:-1,finished:false});
 const [videoPageVisible,setVideoPageVisible]=useState(()=>typeof document==='undefined'||document.visibilityState!=='hidden');
 useEffect(()=>{
  const update=()=>setVideoPageVisible(document.visibilityState!=='hidden');
  document.addEventListener('visibilitychange',update);
  return()=>document.removeEventListener('visibilitychange',update);
 },[]);
 const latestPropsRef=useRef(props);
 latestPropsRef.current=props;
 const reportedVideoMetadata=useRef('');
 const ytAuth=useYouTubeAuth();
 const [playbackError,setPlaybackError]=useState('');
 const [canReplaceVideo,setCanReplaceVideo]=useState(false);
 const [errorRetryNonce,setErrorRetryNonce]=useState(0);
 const [ytVideoDuration,setYtVideoDuration]=useState<number>(0);
 const [ytVideoEnded,setYtVideoEnded]=useState<boolean>(false);
 const nativePolicy=useNativePlaybackPolicy(Boolean(props.externalPlayer));

 // A background-only player can be removed; the main audio player must keep running.
 // Do not mount a muted background iframe when Themes are selected.
 // Keep the YouTube iframe when it is the actual AUDIO source.
 const ytId=props.hasSeparateAudioStream&&(props.hideVideo||props.youtubeBackgroundMode==='theme')?null:props.youtubeVideoId||null;
 const mountedVideoId=ytId;
 const reloadKey=[ytAuth.reloadNonce,errorRetryNonce,props.videoReloadNonce??0].join('|');
 const previousReloadKey=useRef(reloadKey);
 const reloadSeekTime=useRef<number|null>(null);
 const playbackKey=[props.recordingKey,ytId,Boolean(props.hasSeparateAudioStream),ytAuth.useNoCookieDomain,reloadKey].join('|');
 const [playingVideoKey,setPlayingVideoKey]=useState('');
 useEffect(()=>{
  const identity=[props.recordingKey||'',ytId||''].join('|');
  if(videoRecoveryRef.current.identity!==identity)
   videoRecoveryRef.current={identity,reloads:0,attemptAt:Date.now(),progressAt:Date.now(),lastTime:-1,finished:false};
 },[props.recordingKey,ytId]);
 useEffect(()=>{
  reloadSeekTime.current=previousReloadKey.current!==reloadKey&&!props.hasSeparateAudioStream
   ?videoSyncTarget(props.playbackTime??0,0,false).time:null;
  previousReloadKey.current=reloadKey;
  setPlaybackError('');
  setCanReplaceVideo(false);
  ytDurationRef.current=0;
  ytEndedEarlyRef.current=false;
  ytPlayerStateRef.current=null;
  ytReadyRef.current=false;
  lastControlSigRef.current='';
  videoRecoveryRef.current.attemptAt=Date.now();
  videoRecoveryRef.current.progressAt=Date.now();
  videoRecoveryRef.current.lastTime=-1;
  setYtVideoDuration(0);
  setYtVideoEnded(false);
 },[playbackKey]);
 const syncTarget=videoSyncTarget(props.playbackTime??0,props.videoDelaySeconds,Boolean(props.hasSeparateAudioStream));
 const pastVideoDuration=Boolean(props.hasSeparateAudioStream&&ytVideoDuration>15&&syncTarget.time>=ytVideoDuration-0.35);
 const videoEndedEarly=Boolean(props.hasSeparateAudioStream&&(ytVideoEnded||pastVideoDuration));
 const showThemes=Boolean(props.hideVideo)||!ytId||props.youtubeBackgroundMode==='theme'||Boolean(props.videoSearchPending)||Boolean(props.advertisementPlaying)||!nativePolicy.allowed||Boolean(playbackError)||playingVideoKey!==playbackKey||syncTarget.waiting||videoEndedEarly;
 useEffect(()=>{
  if(!props.recordingKey)return;
  const verified=playingVideoKey===playbackKey&&!playbackError&&nativePolicy.allowed;
  props.onVerifiedBackground?.(props.recordingKey,verified?ytId:null);
 },[ytId,props.recordingKey,playingVideoKey,playbackKey,playbackError,nativePolicy.allowed,props.onVerifiedBackground]);
 const [themeExitPending,setThemeExitPending]=useState(true);
 useEffect(()=>{
  if(showThemes){setThemeExitPending(true);return;}
  const timer=window.setTimeout(()=>setThemeExitPending(false),props.reducedMotion||props.enabledThemeTransitions?.length===0?0:TRANSITION_SECONDS*1000);
  return()=>window.clearTimeout(timer);
 },[showThemes,props.reducedMotion,props.enabledThemeTransitions]);
 const renderThemes=showThemes||themeExitPending;
 const {host,canvas,effects}=useCinematicRenderer({...props,renderThemes},ytWrapRef);
 const backgroundPose=sceneEntryPose(showThemes?1:0,byId[props.manualScene].transition);
 const transitionMs=props.reducedMotion||props.enabledThemeTransitions?.length===0?0:TRANSITION_SECONDS*1000;
 const mustPauseVideo=(config:CinematicProps,waiting:boolean,endedEarly=false)=>Boolean(config.audioPaused||waiting||endedEarly||(config.hasSeparateAudioStream&&(config.youtubeBackgroundMode==='theme'||config.videoSearchPending||config.advertisementPlaying)));

 // A successful search result proves that a video ID matched, not that the
 // iframe actually started rendering. Retry an unstarted or stalled AUTO match
 // twice; after three failed attempts leave the current song without a video.
 const recoveryEligible=shouldMonitorAutoVideo({
  hasAutoMatch:Boolean(props.onAutoPlaybackExhausted),
  videoId:ytId,
  separateAudio:Boolean(props.hasSeparateAudioStream),
  backgroundMode:props.youtubeBackgroundMode||'video',
  audioPaused:Boolean(props.audioPaused),
  hiddenVideo:Boolean(props.hideVideo),
  adPlaying:Boolean(props.advertisementPlaying),
  searchPending:Boolean(props.videoSearchPending),
  playerAllowed:nativePolicy.allowed,
  awaitingVideoStart:syncTarget.waiting,
  // A premature end is a playback failure; only skip recovery if the audio clock
  // already passed the embedded video's actual end.
  videoEnded:pastVideoDuration,
  pageVisible:videoPageVisible,
 });
 const recoveryWasEligibleRef=useRef(false);
 useEffect(()=>{
  // A pause, song intro, offscreen app or Themes mode is not a failed attempt.
  if(recoveryEligible&&!recoveryWasEligibleRef.current){
   videoRecoveryRef.current.attemptAt=Date.now();
   videoRecoveryRef.current.progressAt=Date.now();
  }
  recoveryWasEligibleRef.current=recoveryEligible;
 },[recoveryEligible]);
 useEffect(()=>{
  if(!recoveryEligible||!ytId||videoRecoveryRef.current.finished)return;
  const timer=window.setInterval(()=>{
   const state=videoRecoveryRef.current;
   const current=latestPropsRef.current;
   if(document.visibilityState==='hidden'||current.audioPaused||
      current.hideVideo||current.youtubeBackgroundMode==='theme'||
      current.videoSearchPending||current.advertisementPlaying)return;
   if(state.finished||state.identity!==[props.recordingKey||'',ytId].join('|'))return;
   const verified=playingVideoKey===playbackKey;
   const threshold=verified?AUTO_VIDEO_STALL_TIMEOUT_MS:AUTO_VIDEO_START_TIMEOUT_MS;
   const elapsed=Date.now()-(verified?state.progressAt:state.attemptAt);
   if(elapsed<threshold)return;
   if(nextAutoVideoRecoveryAction(state.reloads)==='reload'){
    state.reloads++;
    state.attemptAt=Date.now();
    state.progressAt=Date.now();
    state.lastTime=-1;
    logVideoPlaybackRecovery(ytId,
     `Video ${verified?'stalled':'did not start'} · automatic reload ${state.reloads}/${MAX_AUTO_VIDEO_RELOADS}`,latestPropsRef.current.videoLogKey);
    setPlayingVideoKey('');
    setPlaybackError('');
    setErrorRetryNonce(n=>n+1);
   }else{
    state.finished=true;
    const reason='Auto background video failed to play after 3 attempts';
    logVideoPlaybackRecovery(ytId,reason+' · no other video will be selected',latestPropsRef.current.videoLogKey);
    setPlayingVideoKey('');
    setPlaybackError(reason);
    latestPropsRef.current.onAutoPlaybackExhausted?.(ytId);
   }
  },1000);
  return()=>window.clearInterval(timer);
 },[recoveryEligible,ytId,props.recordingKey,playbackKey,playingVideoKey]);

 const blackOverlayOpacity=Math.max(0,Math.min(0.92,props.videoOverlayOpacity??0));

 // The previous iframe is removed in the same render as a recording/video change.
 // Keeping its media alive while the next search loads can leak the old song's video/audio.
 const syncYtPlayerState=()=>{
  const iframe=ytIframeRef.current;
  if(!iframe||!nativePolicy.allowed)return;
  const cur=latestPropsRef.current;
  if(cur.hasSeparateAudioStream){
   sendYouTubeCommand(iframe,'mute');
   sendYouTubeCommand(iframe,'setVolume',[0]);
  }else{
   sendYouTubeCommand(iframe,'unMute');
   sendYouTubeCommand(iframe,'setVolume',[cur.playerVolume??100]);
  }
  const target=videoSyncTarget(cur.playbackTime??0,cur.videoDelaySeconds,Boolean(cur.hasSeparateAudioStream));
  const dur=ytDurationRef.current;
  const endedEarly=Boolean(cur.hasSeparateAudioStream&&(ytEndedEarlyRef.current||(dur>15&&target.time>=dur-0.35)));
  if(!endedEarly&&(cur.hasSeparateAudioStream||reloadSeekTime.current!==null)){
   const seekTime=cur.hasSeparateAudioStream?target.time:reloadSeekTime.current!;
   sendYouTubeCommand(iframe,'seekTo',[seekTime,true]);
   lastSyncTimeRef.current=seekTime;
   lastTargetTimeRef.current=seekTime;
   if(ytReadyRef.current)reloadSeekTime.current=null;
  }
  if(mustPauseVideo(cur,target.waiting,endedEarly)){
   sendYouTubeCommand(iframe,'pauseVideo');
  }else{
   sendYouTubeCommand(iframe,'playVideo');
  }
 };

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
     sendYouTubeCommand(iframe,'addEventListener',['onAutoplayBlocked']);
   }catch{
    // Ignore before iframe ready
   }
 };

 // WebViews can pause an unchanged iframe while the app is in the background.
 useEffect(()=>{
  if(!nativePolicy.resumeVersion||!mountedVideoId||!nativePolicy.allowed)return;
  const iframe=ytIframeRef.current;
  if(!iframe)return;
  ytPlayerStateRef.current=null;
  const restore=()=>{
   if(document.visibilityState==='hidden'||ytIframeRef.current!==iframe)return;
   sendListening();
   syncYtPlayerState();
  };
  restore();
  // A resume event may arrive before the iframe has resumed its own media process.
  const retries=[300,1200].map(delay=>window.setTimeout(()=>{
   if(ytPlayerStateRef.current!==1)restore();
  },delay));
  const cancelRetries=()=>{if(document.visibilityState==='hidden')retries.forEach(id=>window.clearTimeout(id));};
  document.addEventListener('visibilitychange',cancelRetries);
  return()=>{
   retries.forEach(id=>window.clearTimeout(id));
   document.removeEventListener('visibilitychange',cancelRetries);
  };
 },[nativePolicy.resumeVersion,mountedVideoId,playbackKey,nativePolicy.allowed]);

 // Establish YouTube IFrame API postMessage handshake ("listening") and receive real-time currentTime / duration
 useEffect(()=>{
  ytReadyRef.current=false;
  ytEndedFiredRef.current=false;
  if(!mountedVideoId)return;

  let pollId=0;
  const onMessage=(event:MessageEvent)=>{
   if(!ytIframeRef.current||event.source!==ytIframeRef.current.contentWindow)return;
   if(event.origin&&!/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/.test(event.origin))return;
    if(typeof event.data!=='string')return;
   let data:Record<string,unknown>;
   try{
    data=JSON.parse(event.data) as Record<string,unknown>;
   }catch{
    return;
   }
   const evt=String(data.event||'');
   if((evt==='initialDelivery'||evt==='infoDelivery')&&data.info&&typeof data.info==='object'){
    const info=data.info as Record<string,unknown>;
    const video=info.videoData&&typeof info.videoData==='object'?info.videoData as Record<string,unknown>:undefined;
    const current=latestPropsRef.current;
    // Only the mounted video can identify itself; ignore old-video and advertisement messages.
    if(info.adState!==1&&info.isAdPlaying!==true&&video?.video_id===mountedVideoId&&video.video_id===current.youtubeVideoId&&typeof video.title==='string'&&video.title.trim()&&current.recordingKey){
     const metadata={videoId:mountedVideoId,title:video.title.trim().slice(0,1000),author:typeof video.author==='string'?video.author.trim().slice(0,500):''};
     const signature=JSON.stringify([current.recordingKey,metadata]);
     if(reportedVideoMetadata.current!==signature){
      reportedVideoMetadata.current=signature;
      current.onBackgroundVideoMetadata?.(current.recordingKey,metadata);
     }
    }
   }
   if(evt==='onReady'||evt==='initialDelivery'){
    ytReadyRef.current=true;
    if(pollId)window.clearInterval(pollId);
    syncYtPlayerState();
   }else if(evt==='onError'){
    const code=Number(data.info);
     const current=latestPropsRef.current;
     logVideoPlaybackError(current.youtubeVideoId||mountedVideoId||'',`YouTube embed error ${Number.isFinite(code)?code:'unknown'}`,current.videoLogKey);
     if((code===101||code===150)&&current.youtubeVideoId&&current.onRejectBackgroundVideo){
      current.onRejectBackgroundVideo(current.youtubeVideoId,'Embedding blocked');
      return;
     }
     setCanReplaceVideo(true);
     setPlaybackError(code===101||code===150?'This video does not allow embedded playback. Choose another video.':code===153?'YouTube could not verify this player. Try reloading or choose another video.':'YouTube could not play this video. Try reloading or choose another video.');
   }else if(evt==='onAutoplayBlocked'){
     logVideoPlaybackError(latestPropsRef.current.youtubeVideoId||mountedVideoId||'','YouTube blocked automatic playback',latestPropsRef.current.videoLogKey);
     setCanReplaceVideo(false);
     setPlaybackError('YouTube blocked automatic playback. Use the player controls or reload the video.');
    }else if(evt==='onStateChange'&&typeof data.info==='number'){
     const priorState=ytPlayerStateRef.current;
     ytPlayerStateRef.current=data.info;
     if(data.info===1){
      videoRecoveryRef.current.progressAt=Date.now();
      setPlaybackError('');
      setPlayingVideoKey(playbackKey);
      ytEndedEarlyRef.current=false;
      setYtVideoEnded(false);
     }
     if(data.info===2&&priorState!==2&&!latestPropsRef.current.audioPaused&&latestPropsRef.current.youtubeBackgroundMode==='video'){
      videoRecoveryRef.current.attemptAt=Date.now();
      setPlayingVideoKey('');
     }
     if(data.info===0){
      if(priorState!==0&&latestPropsRef.current.hasSeparateAudioStream){
       videoRecoveryRef.current.attemptAt=Date.now();
       setPlayingVideoKey('');
      }
      ytEndedEarlyRef.current=true;
      setYtVideoEnded(true);
      if(!ytEndedFiredRef.current){
       ytEndedFiredRef.current=true;
       if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
      }
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
     if(dur&&dur>1){
      ytDurationRef.current=dur;
      setYtVideoDuration(prev=>prev&&Math.abs(prev-dur)<0.25?prev:dur);
     }
     const videoData=info.videoData&&typeof info.videoData==='object'?(info.videoData as Record<string,unknown>):undefined;
     const playingVidId=typeof videoData?.video_id==='string'?videoData.video_id:'';
     // A reused iframe can report the previous video while loadVideoById is pending.
     // Ignore that clock; it is not evidence of an advertisement.
     if(playingVidId&&playingVidId!==latestPropsRef.current.youtubeVideoId)return;
     if(latestPropsRef.current.hasSeparateAudioStream&&latestPropsRef.current.onRejectBackgroundVideo&&videoData){
      const vdAuthor=typeof videoData.author==='string'?videoData.author:'';
      if(isYouTubeTopicChannel(vdAuthor)){
       sendYouTubeCommand(ytIframeRef.current,'pauseVideo');
       const rejectedId=playingVidId||latestPropsRef.current.youtubeVideoId||'';
       if(rejectedId)latestPropsRef.current.onRejectBackgroundVideo?.(rejectedId,'Topic channel');
       return;
      }
     }
     if(info.adState===1||info.isAdPlaying===true)return;
     if(ct!==undefined){
      // A nonzero seek position alone does not prove the video is playing.
      // Only an advancing YouTube clock in PLAYING state refreshes the watchdog.
      const recovery=videoRecoveryRef.current;
      if(ytPlayerStateRef.current===1){
       if(recovery.lastTime>=0&&ct>recovery.lastTime+0.005&&ct-recovery.lastTime<30)
        recovery.progressAt=Date.now();
       recovery.lastTime=ct;
      }
      lastSyncTimeRef.current=ct;
      if(!latestPropsRef.current.hasSeparateAudioStream){
       setVirtualMediaTime(ct);
       latestPropsRef.current.onYoutubeTimeUpdate?.(ct,dur);
      }
      if(ct>0.02&&ytPlayerStateRef.current===1&&!latestPropsRef.current.audioPaused&&(!dur||ct<dur-0.45)){
       setPlaybackError('');
       setPlayingVideoKey(playbackKey);
       if(dur&&ct<dur-1.5&&ytEndedEarlyRef.current){
        ytEndedEarlyRef.current=false;
        setYtVideoEnded(false);
       }
      }
      if(dur&&dur>5&&ct>=dur-0.45){
       ytEndedEarlyRef.current=true;
       setYtVideoEnded(true);
       if(!ytEndedFiredRef.current){
        ytEndedFiredRef.current=true;
        if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
       }
      }else if(ct<3){
       ytEndedFiredRef.current=false;
      }
     }
     const pState=typeof info.playerState==='number'?info.playerState:undefined;
     const previousPlayerState=ytPlayerStateRef.current;
     if(pState!==undefined)ytPlayerStateRef.current=pState;
     if(pState===1){
      if(previousPlayerState!==1)videoRecoveryRef.current.progressAt=Date.now();
      setPlaybackError('');
      setPlayingVideoKey(playbackKey);
      ytEndedEarlyRef.current=false;
      setYtVideoEnded(false);
     }
     if(pState===2&&previousPlayerState!==2&&!latestPropsRef.current.audioPaused&&latestPropsRef.current.youtubeBackgroundMode==='video'){
      videoRecoveryRef.current.attemptAt=Date.now();
      setPlayingVideoKey('');
     }
     if(pState===0){
      if(previousPlayerState!==0&&latestPropsRef.current.hasSeparateAudioStream){
       videoRecoveryRef.current.attemptAt=Date.now();
       setPlayingVideoKey('');
      }
      ytEndedEarlyRef.current=true;
      setYtVideoEnded(true);
      if(!ytEndedFiredRef.current){
       ytEndedFiredRef.current=true;
       if(!latestPropsRef.current.hasSeparateAudioStream)latestPropsRef.current.onYoutubeEnded?.();
      }
     }else if((pState===-1||pState===5)&&!latestPropsRef.current.audioPaused&&!ytEndedEarlyRef.current){
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
  },[mountedVideoId,playbackKey,nativePolicy.allowed]);

  // Video timing is independent of the audio clock and lyric timing.
  // Avoid spamming mute/playVideo/seekTo on every 120ms playbackTime tick so YouTube's
  // internal HUD stays in autohide and playback stays smooth.
  useEffect(()=>{
   if(!ytId||!ytIframeRef.current||typeof props.playbackTime!=='number')return;
   const target=videoSyncTarget(props.playbackTime,props.videoDelaySeconds,Boolean(props.hasSeparateAudioStream));
   const dur=ytDurationRef.current;
   const reachedEnd=Boolean(props.hasSeparateAudioStream)&&(ytEndedEarlyRef.current||Boolean(dur&&dur>1&&target.time>=dur-0.35));
   if(Boolean(props.hasSeparateAudioStream)&&dur&&dur>1&&target.time<dur-1.5&&ytEndedEarlyRef.current){
    ytEndedEarlyRef.current=false;
    setYtVideoEnded(false);
   }
   const mapping=ytId+'|'+(props.hasSeparateAudioStream?props.videoDelaySeconds??0:0)+'|'+Boolean(props.hasSeparateAudioStream);
   const changed=mapping!==lastVideoMappingRef.current;
   const resumed=videoWaitingRef.current&&!target.waiting;
   const shouldPause=mustPauseVideo(props,target.waiting||reachedEnd);
   const controlSig=[
    mapping,
    String(shouldPause),
    props.youtubeBackgroundMode||'',
    String(Boolean(props.audioPaused)),
    String(Boolean(props.videoSearchPending)),
    String(Boolean(props.advertisementPlaying)),
    String(props.playerVolume??100)
   ].join('|');
   const controlChanged=controlSig!==lastControlSigRef.current;
   lastVideoMappingRef.current=mapping;
   lastControlSigRef.current=controlSig;
   videoWaitingRef.current=target.waiting;

   const targetDelta=target.time-lastTargetTimeRef.current;
   lastTargetTimeRef.current=target.time;
   if(!changed&&!resumed&&!shouldPause&&targetDelta>0&&targetDelta<=0.75){
    lastSyncTimeRef.current+=targetDelta;
   }

   if(props.hasSeparateAudioStream){
    if(controlChanged)sendYouTubeCommand(ytIframeRef.current,'mute');
    if(!reachedEnd&&(changed||resumed||Math.abs(target.time-lastSyncTimeRef.current)>1.25)){
     sendYouTubeCommand(ytIframeRef.current,'seekTo',[target.time,true]);
     lastSyncTimeRef.current=target.time;
    }
   }else{
    if(controlChanged){
     sendYouTubeCommand(ytIframeRef.current,'unMute');
     sendYouTubeCommand(ytIframeRef.current,'setVolume',[props.playerVolume??100]);
    }
    if(Math.abs(target.time-lastSyncTimeRef.current)>1.5){
     sendYouTubeCommand(ytIframeRef.current,'seekTo',[target.time,true]);
     lastSyncTimeRef.current=target.time;
    }
   }
   if(controlChanged||changed||resumed){
    sendYouTubeCommand(ytIframeRef.current,shouldPause?'pauseVideo':'playVideo');
   }
  },[ytId,props.playbackTime,props.videoDelaySeconds,props.hasSeparateAudioStream,props.audioPaused,props.playerVolume,props.youtubeBackgroundMode,props.videoSearchPending,props.advertisementPlaying,nativePolicy.allowed]);

 const [stageSize,setStageSize]=useState<{w:number;h:number}>({w:1280,h:720});
 const [videoAspect,setVideoAspect]=useState<number>(16/9);

 // Preload enabled lyric fonts before display so lyrics never flash in default font first
 useEffect(()=>{
  void preloadLyricFonts(props.enabledFonts);
 },[props.enabledFonts]);

 // Resolve the video's native aspect ratio (16:9, IMAX 1.90:1 / 1.43:1, 4:3, or 21:9) from YouTube oEmbed
 useEffect(()=>{
  const vid=mountedVideoId||ytId;
  setVideoAspect(16/9);
  if(!vid||typeof fetch!=='function')return;
  if(typeof navigator!=='undefined'&&/jsdom/i.test(navigator.userAgent||''))return;
  const controller=new AbortController();
  void fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}&format=json`,{
   signal:controller.signal
  })
   .then(res=>(res.ok?res.json():null))
   .then((meta:Record<string,unknown>|null)=>{
    if(controller.signal.aborted||!meta)return;
    const ow=Number(meta.width);
    const oh=Number(meta.height);
    if(Number.isFinite(ow)&&Number.isFinite(oh)&&ow>0&&oh>0){
     const ratio=ow/oh;
     if(ratio>=0.5&&ratio<=3.2){
      setVideoAspect(ratio);
     }
    }
   })
   .catch(()=>{});
  return()=>controller.abort();
 },[mountedVideoId,ytId]);

 useEffect(()=>{
  const el=host.current;
  if(!el)return;
  const updateStageSize=()=>{
   const w=el.clientWidth;
   const h=el.clientHeight;
   if(w>0&&h>0){
    setStageSize(prev=>(prev.w===w&&prev.h===h?prev:{w,h}));
   }
  };
  updateStageSize();
  window.addEventListener('resize',updateStageSize);
  if(typeof ResizeObserver!=='undefined'){
   const ro=new ResizeObserver(updateStageSize);
   ro.observe(el);
   return()=>{
    window.removeEventListener('resize',updateStageSize);
    ro.disconnect();
   };
  }
  return()=>window.removeEventListener('resize',updateStageSize);
 },[]);

 const originParam=typeof window!=='undefined'&&window.location?.origin
  ?`&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}`
  :'';
 const embedHost=ytAuth.useNoCookieDomain?'https://www.youtube-nocookie.com':'https://www.youtube.com';
 const activeEmbedVid=mountedVideoId||ytId;
 const allowIframePointer=!showThemes&&ytAuth.interactivePlayer&&(!props.hasSeparateAudioStream||Boolean(playbackError));
 const showInteractiveControls=Boolean(ytAuth.interactivePlayer&&!props.hasSeparateAudioStream&&playbackError);
 const controlsParam=showInteractiveControls?'1':'0';
 const embedSrc=activeEmbedVid
  ?`${embedHost}/embed/${encodeURIComponent(activeEmbedVid)}?autoplay=0&controls=${controlsParam}&disablekb=${showInteractiveControls?'0':'1'}&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&showinfo=0&enablejsapi=1${props.hasSeparateAudioStream?'&mute=1':''}${originParam}`
  :'';

 const fitMode:VideoFitMode=props.videoFitMode||'stretch';
 const safeStageW=Math.max(1,stageSize.w);
 const safeStageH=Math.max(1,stageSize.h);
 const stageAspect=safeStageW/safeStageH;
 const safeVideoAspect=Math.max(0.5,Math.min(3.2,videoAspect||16/9));

 // Native YouTube Zoom-to-Fill & Chrome-Hiding Vertical Overscan:
 // YouTube pins its title bar (.ytp-chrome-top) to top:0 of the iframe and its progress bar /
 // watermark (.ytp-chrome-bottom) to bottom:0 of the iframe, while centering the <video> stream
 // vertically at its native aspect ratio. Adding vertical overscan (chromeOverscanY) pushes
 // the YouTube title bar and bottom controls outside the overflow:hidden stage backdrop without
 // cropping or distorting the centered <video> frame.
 let targetPlayerW=safeStageW;
 let targetPlayerH=safeStageH;

 if(fitMode==='stretch'){
  if(stageAspect>=safeVideoAspect){
   targetPlayerW=safeStageW;
   targetPlayerH=Math.ceil(safeStageW/safeVideoAspect);
  }else{
   targetPlayerH=safeStageH;
   targetPlayerW=Math.ceil(safeStageH*safeVideoAspect);
  }
  if(Math.abs(stageAspect-safeVideoAspect)<0.03){
   const imaxFillFactor=1.18;
   targetPlayerW=Math.ceil(targetPlayerW*imaxFillFactor);
   targetPlayerH=Math.ceil(targetPlayerH*imaxFillFactor);
  }
 }else{
  if(stageAspect>=safeVideoAspect){
   targetPlayerH=safeStageH;
   targetPlayerW=Math.ceil(safeStageH*safeVideoAspect);
  }else{
   targetPlayerW=safeStageW;
   targetPlayerH=Math.ceil(safeStageW/safeVideoAspect);
  }
 }

 const chromeOverscanY=showInteractiveControls?0:Math.max(180,Math.ceil(safeStageH*0.45));
 const targetIframeW=targetPlayerW;
 const targetIframeH=targetPlayerH+chromeOverscanY*2;
 const playerWidthStyle=fitMode==='stretch'?`${targetIframeW}px`:'100%';
 const playerHeightStyle=showInteractiveControls
  ?(fitMode==='stretch'?`${targetPlayerH}px`:'100%')
  :`${targetIframeH}px`;

 useEffect(()=>{
  const iframe=ytIframeRef.current;
  if(!iframe||!activeEmbedVid||!nativePolicy.allowed)return;
  sendYouTubeCommand(iframe,'setSize',[targetIframeW,targetIframeH]);
 },[activeEmbedVid,fitMode,targetIframeW,targetIframeH,nativePolicy.allowed]);

 return <div className="cinematic-stack" ref={host} data-background-state={showThemes?'themes':'video'} data-video-ready={playingVideoKey===playbackKey?'yes':'no'} data-video-fit={fitMode}>
  {activeEmbedVid&&nativePolicy.allowed&&(
   <div ref={ytWrapRef} className="youtube-stage-backdrop" data-layer="video" data-video-fit={fitMode}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'hidden',zIndex:0,background:'#04070f',opacity:props.hideVideo?0:1,pointerEvents:allowIframePointer?'auto':'none'}}>
    <iframe ref={ytIframeRef}
     key={playbackKey}
     src={embedSrc} title="YouTube video background" referrerPolicy="strict-origin-when-cross-origin"
     allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
     style={{position:'absolute',top:'50%',left:'50%',width:playerWidthStyle,height:playerHeightStyle,transform:'translate(-50%, -50%)',border:0,pointerEvents:allowIframePointer?'auto':'none'}}
     onLoad={()=>{
      try{
       ytIframeRef.current?.contentWindow?.postMessage(JSON.stringify({event:'listening',id:'lyricflow-yt',channel:'widget'}),'*');
       for(const event of ['onReady','onStateChange','onError','onAutoplayBlocked'])sendYouTubeCommand(ytIframeRef.current,'addEventListener',[event]);
       sendYouTubeCommand(ytIframeRef.current,'setSize',[targetIframeW,targetIframeH]);
      }catch{}
      syncYtPlayerState();
     }}/>
    <div className="youtube-video-black-overlay" aria-hidden="true" style={{position:'absolute',inset:0,zIndex:1,background:'#000',opacity:blackOverlayOpacity,pointerEvents:'none'}}/>
   </div>
  )}
  <div className="theme-layer" data-layer="themes" data-transition={byId[props.manualScene].transition} aria-hidden={!showThemes}
   style={{position:'absolute',inset:0,zIndex:1,pointerEvents:'none',opacity:showThemes?1:0,visibility:renderThemes?'visible':'hidden',transform:`translate(${backgroundPose.x*100}%,${backgroundPose.y*100}%) rotate(${backgroundPose.roll}rad) scale(${backgroundPose.scale})`,transition:`opacity ${transitionMs}ms ease, transform ${transitionMs}ms cubic-bezier(.22,.7,.25,1)`}}>
   <canvas className="cinematic-effects" ref={effects} aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}/>
  </div>
  <canvas className="visual-canvas cinematic-canvas" ref={canvas} data-layer="lyrics"
   style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:2,background:'transparent',pointerEvents:'none'}}
   aria-label="LyricFlow VoxelWall audio-reactive backgrounds with VoxelVerse animated lyrics"/>
  {(playbackError||props.loadingAnotherVideo||nativePolicy.message)&&<div className="youtube-playback-notice" role="status">
   <span>{props.loadingAnotherVideo?'Finding another video…':props.videoRecoveryMessage||playbackError||nativePolicy.message}</span>
   {nativePolicy.allowed&&<>
    {canReplaceVideo&&ytId&&props.onLoadAnotherVideo&&<button type="button" disabled={props.loadingAnotherVideo} onClick={()=>props.onLoadAnotherVideo?.(ytId)}>{props.loadingAnotherVideo?'Loading another video…':'Load another video'}</button>}
    <button type="button" disabled={props.loadingAnotherVideo} onClick={()=>{setPlaybackError('');setErrorRetryNonce(n=>n+1);}}>Reload video</button>
   </>}
  </div>}
 </div>;
}

