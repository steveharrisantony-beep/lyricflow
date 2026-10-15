import { useEffect,useState,useRef } from 'react';
import CinematicStage from './visualization/cinematic/CinematicStage';
import {TEMPLATES,type SceneId} from './visualization/cinematic/catalog';
import {fontLabel} from './visualization/cinematic/fonts';
import {setAudioSensitivity,getAudioFrequencyBands,setSpectrumSensitivity} from './audio/audioSignal';
import LocalPlayer,{type LocalPlayerHandle} from './audio/LocalPlayer';
import AudioSourceHub,{type AudioSourceHubHandle} from './audio/AudioSourceHub';
import MicListener,{type MicListenerHandle} from './audio/MicListener';
import {clampLyricDelay,formatLyricDelay} from './lyrics/lyricTiming';
import SpotifyDiscovery from './spotify/SpotifyDiscovery';
import ManualLyrics, {type IncomingLyrics} from './lyrics/ManualLyrics';
import TrackFinder from './metadata/TrackFinder';
import type {TrackInfo} from './metadata/trackInfo';
import {saveTrackCorrection} from './metadata/metadataStore';
import {AudioLines,Settings2,Expand,Pause,Play,Waves,SlidersHorizontal,Headphones,ChevronLeft,ChevronRight,PanelRightClose,PanelRightOpen,LogOut} from 'lucide-react';
const choices=TEMPLATES;
type Quality='High'|'Balanced'|'Performance';
export default function App(){
 const [scene,setScene]=useState<SceneId>('crimson-impact'),[intensity,setIntensity]=useState(65),[speed,setSpeed]=useState(55);
 const [liveScene,setLiveScene]=useState('Crimson Impact');
 const [renderStatus,setRenderStatus]=useState('INITIALIZING VISUALS');
 const spectrumCanvas=useRef<HTMLCanvasElement>(null);
 const playerRef=useRef<LocalPlayerHandle>(null);
 const micRef=useRef<MicListenerHandle>(null);
 const audioHubRef=useRef<AudioSourceHubHandle>(null);
 const [sourceOpen,setSourceOpen]=useState(false);
 const [cinemaControlsOpen,setCinemaControlsOpen]=useState(false);
 const [lyricDelay,setLyricDelay]=useState(0);
 const updateLyricDelay=(value:number)=>setLyricDelay(clampLyricDelay(value));
 const switchToLocal=()=>{micRef.current?.stop();playerRef.current?.chooseFile();};
 const switchToMic=()=>{playerRef.current?.pause();audioHubRef.current?.stop();if(micRef.current?.isListening())micRef.current.stop();else void micRef.current?.start();};
 const activateExternal=()=>{playerRef.current?.pause();micRef.current?.stop();};
 const [quality,setQuality]=useState<Quality>('Balanced'),[demo,setDemo]=useState(true),[paused,setPaused]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(false),[settings,setSettings]=useState(false),[fps,setFps]=useState(0);
 const [fullscreenError,setFullscreenError]=useState('');
 const [localPlaying,setLocalPlaying]=useState(false);
 const [localTime,setLocalTime]=useState(0);
 const [localLoaded,setLocalLoaded]=useState(false);
 const [localTrack,setLocalTrack]=useState<TrackInfo|null>(null);
 const [incoming,setIncoming]=useState<IncomingLyrics|null>(null);
 const [fileEpoch,setFileEpoch]=useState(0);
 const acceptLyrics=(lyrics:Omit<IncomingLyrics,'token'>)=>setIncoming({...lyrics,token:Date.now()});
 const [sensitivity,setSensitivity]=useState(50);
 const [spectrumSensitivity,setSpectrumControl]=useState(()=>{try{const v=Number(localStorage.getItem('lyricflow.spectrumGain')??35);return Number.isFinite(v)?Math.max(0,Math.min(100,v)):35}catch{return 35}});
 useEffect(()=>{setSpectrumSensitivity(spectrumSensitivity/100);try{localStorage.setItem('lyricflow.spectrumGain',String(spectrumSensitivity))}catch{}},[spectrumSensitivity]);
 const [autoScenes,setAutoScenes]=useState(true);
 const [motionBlur,setMotionBlur]=useState(30);
 const [spatialTypography,setSpatialTypography]=useState(true);
 const [narrativeObjects,setNarrativeObjects]=useState(true);
 const [cameraMode,setCameraMode]=useState<'Automatic'|'Front'|'Orbit'|'Side'|'Top'>('Automatic');
 const [performance,setPerformance]=useState(false);
 useEffect(()=>{setAudioSensitivity(sensitivity/100)},[sensitivity]);
 useEffect(()=>{const onFullscreen=()=>{if(!document.fullscreenElement)setPerformance(false)};document.addEventListener('fullscreenchange',onFullscreen);return()=>document.removeEventListener('fullscreenchange',onFullscreen)},[]);
 const [audioReadout,setAudioReadout]=useState({source:'IDLE',level:0,bass:0,mids:0,treble:0,beat:0,bpm:0,tempoConfidence:0,onset:0,downbeat:0,section:'unknown',beatCount:0,flux:0,threshold:0});
 useEffect(()=>{
   const id=window.setInterval(()=>{
     const canvas=document.querySelector<HTMLCanvasElement>('canvas.visual-canvas');
     if(!canvas)return;
     const numeric=(key:string)=>Number(canvas.dataset[key]||0);
     if(canvas.dataset.sceneLabel)setLiveScene(previous=>previous===canvas.dataset.sceneLabel?previous:canvas.dataset.sceneLabel||previous);
     if(canvas.dataset.renderer)setRenderStatus(previous=>previous===canvas.dataset.renderer?previous:canvas.dataset.renderer||previous);
     const meter=spectrumCanvas.current,frequency=getAudioFrequencyBands();
     if(meter){
      const mc=meter.getContext('2d');
      if(mc){
       const bw=meter.width/64;
       mc.clearRect(0,0,meter.width,meter.height);
       mc.fillStyle='#16232e';mc.fillRect(0,meter.height-1,meter.width,1);
       for(let i=0;i<64;i++){
        const e=Math.max(0,Math.min(1,frequency[i]));
        mc.fillStyle=i<15?'#ffa38c':i<43?'#bc7bf0':'#8fe2e4';
        const height=Math.max(1,e*(meter.height-4));
        mc.fillRect(i*bw+1,meter.height-height,Math.max(2,bw-2),height);
       }
      }
     }
     setAudioReadout({source:canvas.dataset.audioSource||'IDLE',level:numeric('audioLevel'),bass:numeric('audioBass'),mids:numeric('audioMids'),treble:numeric('audioTreble'),beat:numeric('audioBeat'),bpm:numeric('audioBpm'),tempoConfidence:numeric('audioTempoConfidence'),onset:numeric('audioOnset'),downbeat:numeric('audioDownbeat'),section:canvas.dataset.audioSection||'unknown',beatCount:numeric('audioBeatCount'),flux:numeric('audioFlux'),threshold:numeric('audioThreshold')});
   },90);
   return()=>clearInterval(id);
 },[]);
 useEffect(()=>{const id=setInterval(()=>{const v=document.querySelector<HTMLCanvasElement>('.visual-canvas')?.dataset.fps;if(v)setFps(Number(v))},1000);return()=>clearInterval(id)},[]);
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();setFullscreenError('')}catch{setFullscreenError('Fullscreen is not supported in this browser preview. Try opening the app in its own browser tab.')}};
 const togglePerformance=async()=>{if(performance){setPerformance(false);setCinemaControlsOpen(false);if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return;}setPerformance(true);setCinemaControlsOpen(false);try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{setFullscreenError('Browser fullscreen was blocked. Cinema mode still works; use the dock to access controls.')}};
 return <div className={"shell "+(performance?"performance-mode":"")}>
  <header className="header"><div className="logo"><span className="logo-mark"><AudioLines size={21}/></span><div><strong>lyric<span>flow</span></strong><small>VISUAL SOUNDSTAGE</small></div></div>
   <div className="track"><i className="dot"/> {localTrack?.title||'Untitled session'} <span>/</span> {audioReadout.source==='MICROPHONE'?'Microphone':audioReadout.source==='INTERNET RADIO'?'Internet radio':audioReadout.source==='SYSTEM AUDIO'?'System audio':localPlaying?(localTrack?.source==='provider'?'Streamed audio':'Local audio'):demo?'Demo mode':'Idle'}</div>
   <div className="header-right"><span className="demo-status"><i className="dot"/>{localPlaying?(localTrack?.source==='provider'?'STREAM PLAYING':'LOCAL AUDIO'):audioReadout.source==='MICROPHONE'?'MIC ACTIVE':audioReadout.source==='SYSTEM AUDIO'?'SYSTEM AUDIO':audioReadout.source==='INTERNET RADIO'?'RADIO ACTIVE':demo?'DEMO ACTIVE':'DEMO OFF'}</span><button className="icon-btn" aria-label="Settings" onClick={()=>setSettings(v=>!v)}><Settings2 size={19}/></button></div>
  </header>
  <section className="stage" onClick={performance?()=>setCinemaControlsOpen(v=>!v):undefined} aria-label={performance?"Tap canvas to show or hide cinema controls":"Music visualizer"}>
   <CinematicStage manualScene={scene} intensity={intensity/100} speed={speed/50} quality={quality} demo={demo} paused={paused} reducedMotion={reducedMotion} autoScenes={autoScenes} cameraMode={cameraMode} spatialTypography={spatialTypography} narrativeObjects={narrativeObjects} motionBlur={motionBlur}/>

   {!performance&&<div className="stage-source-bar">
     <button type="button" className="stage-source-button" onClick={()=>setSourceOpen(true)}><Headphones size={16}/> <span><small>AUDIO SOURCE</small><b>{audioReadout.source==='IDLE'?'Select a source':audioReadout.source==='LOCAL AUDIO'?localTrack?.title||'Local audio':audioReadout.source==='DEMO'?'Demo mode':audioReadout.source}</b></span><ChevronRight size={17}/></button>
     <button type="button" className="stage-cinema-button" onClick={()=>void togglePerformance()}><Expand size={16}/> Cinema Mode</button>
    </div>}
   {performance&&<div className="cinema-control-hub" onClick={e=>e.stopPropagation()}>
    <div className="cinema-quick-actions">
     <button type="button" className="cinema-hub-trigger" aria-label={cinemaControlsOpen?'Hide cinema controls':'Show cinema controls'} onClick={()=>setCinemaControlsOpen(v=>!v)}>{cinemaControlsOpen?<PanelRightClose size={18}/>:<PanelRightOpen size={18}/>} <span>{cinemaControlsOpen?'Hide controls':'Controls'}</span></button>
     <button type="button" aria-label="Exit cinema mode" onClick={()=>void togglePerformance()}><LogOut size={18}/></button>
    </div>
    {cinemaControlsOpen&&<aside className="cinema-drawer" aria-label="Cinema live controls">
     <div className="cinema-drawer-head"><b>LYRICFLOW LIVE</b><span>{audioReadout.source} · {fps} FPS</span></div>
     <button className="cinema-source-action" onClick={()=>setSourceOpen(true)}><Headphones size={17}/> Choose audio source <ChevronRight size={16}/></button>
     {localLoaded&&<div className="cinema-playback"><strong>{localTrack?.title}</strong><div><button type="button" aria-label={localPlaying?'Cinema pause song':'Cinema play song'} onClick={()=>localPlaying?playerRef.current?.pause():void playerRef.current?.play()}>{localPlaying?<Pause size={16}/>:<Play size={16}/>} {localPlaying?'Pause song':'Play song'}</button><span>{Math.floor(localTime/60)}:{String(Math.floor(localTime%60)).padStart(2,'0')}</span></div><input aria-label="Cinema song position" type="range" min="0" max={Math.max(0,localTrack?.duration||0)} step=".1" value={Math.min(localTime,localTrack?.duration||0)} onChange={e=>playerRef.current?.seek(Number(e.target.value))}/></div>}
     <div className="cinema-scene-steppers">
      <button aria-label="Previous scene" onClick={()=>{const i=choices.findIndex(c=>c.id===scene);setScene(choices[(i-1+choices.length)%choices.length].id);setAutoScenes(false)}}><ChevronLeft size={18}/></button>
      <select aria-label="Cinema scene" value={scene} onChange={e=>{setScene(e.target.value as SceneId);setAutoScenes(false)}}>{choices.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select>
      <button aria-label="Next scene" onClick={()=>{const i=choices.findIndex(c=>c.id===scene);setScene(choices[(i+1)%choices.length].id);setAutoScenes(false)}}><ChevronRight size={18}/></button>
     </div>
     <label className="cinema-check"><input type="checkbox" checked={autoScenes} onChange={e=>setAutoScenes(e.target.checked)}/> Auto-direct scenes</label>
     <label className="cinema-range"><span>Sensitivity <b>{sensitivity}%</b></span><input aria-label="Cinema audio sensitivity" type="range" min="0" max="100" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))}/></label>
     <label className="cinema-range"><span>Spectrum gain <b>{spectrumSensitivity}%</b></span><input aria-label="Cinema spectrum gain" type="range" min="0" max="100" value={spectrumSensitivity} onChange={e=>setSpectrumControl(Number(e.target.value))}/></label>
     <label className="cinema-range"><span>Motion blur <b>{reducedMotion?0:motionBlur}%</b></span><input aria-label="Cinema motion blur" type="range" min="0" max="80" step="5" disabled={reducedMotion} value={motionBlur} onChange={e=>setMotionBlur(Number(e.target.value))}/></label>
     <div className="cinema-delay"><span>LYRICS DELAY <b>{formatLyricDelay(lyricDelay)}</b></span><div>
      <button aria-label="Cinema advance lyrics" onClick={()=>setLyricDelay(v=>clampLyricDelay(v-.25))}>−0.25s</button>
      <button aria-label="Cinema reset lyric delay" onClick={()=>updateLyricDelay(0)}>Reset</button>
      <button aria-label="Cinema delay lyrics" onClick={()=>setLyricDelay(v=>clampLyricDelay(v+.25))}>+0.25s</button>
     </div></div>
     <div className="cinema-drawer-foot"><button onClick={()=>setPaused(p=>!p)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume':'Pause'} visuals</button><button onClick={()=>void togglePerformance()}>Exit Cinema</button></div>
    </aside>}
   </div>}
   <div className="scene-chip cinematic-chip"><span className="chip-icon">✦</span><div><b>{liveScene}</b><small>Cinematic scene director</small></div><span>30 FILM LOOKS</span></div>
   <div className="stage-bottom"><span><i className="dot"/> {renderStatus} · PROCEDURAL CINEMA</span><span>{fps} FPS</span></div>
   {settings&&<aside className="settings-panel"><div className="settings-title"><SlidersHorizontal size={16}/> VISUAL SETTINGS <button aria-label="Close settings" onClick={()=>setSettings(false)}>×</button></div><label className="check"><span><b>Reduced motion</b><small>Calmer animation</small></span><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label><p>RENDERING QUALITY</p><div className="quality-options">{(['High','Balanced','Performance'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} onClick={()=>setQuality(q)}>{q}</button>)}</div><p className="note">Local music and optional microphone audio are analyzed on this device; no recording or uploading.</p></aside>}
  </section>
  <section className="signal-panel" aria-label="Live audio analysis">
    <div className="signal-header"><strong>LIVE AUDIO REACTIVITY</strong><span className={'signal-mode '+(audioReadout.source==='LOCAL AUDIO'?'connected':'')}>{audioReadout.source==='LOCAL AUDIO'?(localTrack?.source==='provider'?'● Stream audio detected':'● Local audio detected'):audioReadout.source==='MICROPHONE'?'● Microphone listening':audioReadout.source==='SYSTEM AUDIO'?'● System/tab capture':audioReadout.source==='INTERNET RADIO'?'● Direct radio stream':audioReadout.source==='DEMO'?'◌ Simulated energy':'○ No audio source'}</span></div>
    <div className="signal-bars">{([['LOUDNESS',audioReadout.level],['BASS',audioReadout.bass],['MID',audioReadout.mids],['TREBLE',audioReadout.treble],['ONSET',audioReadout.onset],['BEAT',audioReadout.beat]] as const).map(([label,value])=><div className="signal-band" key={label}><span>{label}<b>{value}%</b></span><div className="signal-track"><i style={{width:value+'%'}}/></div></div>)}</div>
    <div className="spectrum-diagnostic"><span>64-BAND FREQUENCY SPECTRUM <small>32 Hz – 14 kHz · log-scaled · smoothed</small></span><canvas ref={spectrumCanvas} width={640} height={58} aria-label="Live 64-band musical frequency spectrum"/></div>
    <label className="spectrum-gain-control"><span>Spectrum gain <b>{spectrumSensitivity}%</b><small>Controls 64-band height · beat detection stays independent</small></span><input aria-label="Spectrum gain" type="range" min="0" max="100" value={spectrumSensitivity} onChange={e=>setSpectrumControl(Number(e.target.value))}/><button type="button" aria-label="Reset spectrum gain" onClick={()=>setSpectrumControl(35)}>Reset</button></label>
    <div className="music-metrics"><span>Tempo <b>{audioReadout.bpm?audioReadout.bpm+' BPM':'Estimating…'}</b></span><span>Tempo confidence <b>{audioReadout.tempoConfidence}%</b></span><span>Section <b>{audioReadout.section}</b></span><span>Onset <b>{audioReadout.onset}%</b></span><span>Beat pulses <b>{audioReadout.beatCount}</b></span><span>Downbeat¹ <b>{audioReadout.downbeat}%</b></span></div>
    <p className="signal-hint">Spectral-flux onset detector · adaptive threshold · beat pulses held for readability. BPM and downbeat grouping are estimates, not verified studio beat grids.</p>
    <p className="signal-hint">{audioReadout.source==='LOCAL AUDIO'?'Analyzing the audio file locally. Try a bass-heavy section and watch the bars and visuals change.':audioReadout.source==='MICROPHONE'?'Analyzing nearby sound locally. Exact track timing is unavailable from microphone input.':audioReadout.source==='SYSTEM AUDIO'?'Analyzing permitted shared tab/system audio. End browser sharing to disconnect; Android support varies.':audioReadout.source==='INTERNET RADIO'?'Analyzing a direct radio audio stream that allows browser access. No track timeline is available.':'Choose an audio source in the stage toolbar, or load a local music file. Demo mode is simulated.'}</p>
  </section>
  <LocalPlayer ref={playerRef} onActiveChange={playing=>{setLocalPlaying(playing);if(playing){audioHubRef.current?.stop();micRef.current?.stop();}}} onTimeChange={setLocalTime} onFileChange={loaded=>{setLocalLoaded(loaded);setFileEpoch(e=>e+1);setIncoming(null)}} onTrackChange={track=>{setLocalTrack(track);setIncoming(null)}} onDurationChange={duration=>setLocalTrack(p=>p?{...p,duration}:p)}/>
  <TrackFinder track={localTrack} onMetadataChange={value=>{setLocalTrack(value);saveTrackCorrection(value)}} onLyricsFound={acceptLyrics}/>
  <ManualLyrics key={fileEpoch} time={localTime} trackLoaded={localLoaded} track={localTrack} incoming={incoming} delay={lyricDelay} onDelayChange={updateLyricDelay}/>
  <section className="control-panel">
   <div className="control-heading"><div className="heading-left"><span className="heading-icon"><Waves size={16}/></span><div><b>CINEMATIC SCENE LIBRARY</b><small>30 scene selections · 3 custom-built showcase engines · no image backgrounds</small></div></div><label className="demo-toggle"><div><b>Demo mode</b><small>Simulated music energy</small></div><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/></label></div>
   <div className="scene-director-controls"><label className="auto-scenes"><input type="checkbox" checked={autoScenes} onChange={e=>setAutoScenes(e.target.checked)}/> Auto-direct cinematic scenes <small>(lyric timeline when available; varied music visuals otherwise)</small></label><label className="auto-scenes"><input type="checkbox" checked={spatialTypography} onChange={e=>setSpatialTypography(e.target.checked)}/> Spatial kinetic lyrics <small>(Cotodama-inspired layout choreography)</small></label><label className="auto-scenes"><input type="checkbox" checked={narrativeObjects} onChange={e=>setNarrativeObjects(e.target.checked)}/> Narrative objects <small>(bass scale · treble shimmer)</small></label><label className="camera-picker">Camera view <select value={cameraMode} onChange={e=>setCameraMode(e.target.value as typeof cameraMode)}>{(['Automatic','Front','Orbit','Side','Top'] as const).map(v=><option key={v}>{v}</option>)}</select></label></div>
   <div className="scene-grid cinematic-grid">{choices.map((item,i)=><button className={'scene-card cinematic-scene-card '+(['crimson-impact','color-riot','glass-architecture'].includes(item.id)?'premiere-scene ':'')+(scene===item.id&&!autoScenes?'selected':'')} key={item.id} onClick={()=>{setScene(item.id);setAutoScenes(false)}}><span className="scene-art cinematic-preview" style={{background:`linear-gradient(135deg, ${item.accent}, ${item.background} 75%)`,color:item.foreground,fontFamily:fontLabel(item.font)}}><span className="scene-preview-initials">{item.label.slice(0,2).toUpperCase()}</span>{['crimson-impact','color-riot','glass-architecture'].includes(item.id)&&<span className="premiere-tag">SIGNATURE ENGINE</span>}</span><span className="scene-copy"><b>{item.label}</b><small>{item.id==='crimson-impact'?'64-band spectrum':item.id==='color-riot'?'Generative poster art':item.id==='glass-architecture'?'Architectural 3D':item.family+' · '+fontLabel(item.font)}</small></span><small className="scene-number">{String(i+1).padStart(2,'0')}</small></button>)}</div>
   <div className="control-bottom"><label className="slider"><span><span>◎ &nbsp; Motion blur</span><b>{reducedMotion?0:motionBlur}%</b></span><input aria-label="Motion blur" type="range" min="0" max="80" step="5" value={motionBlur} disabled={reducedMotion} onChange={e=>setMotionBlur(Number(e.target.value))}/></label><label className="slider"><span><span>◉ &nbsp; Audio sensitivity</span><b>{sensitivity}%</b></span><input aria-label="Audio sensitivity" type="range" min="0" max="100" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))}/></label><label className="slider"><span><span>✧ &nbsp; Visual intensity</span><b>{intensity}%</b></span><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/></label><label className="slider"><span><span>ϟ &nbsp; Animation speed</span><b>{speed}%</b></span><input type="range" min="10" max="100" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label><div className="transport"><button aria-label={paused?'Resume':'Pause'} className="play" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17} fill="currentColor"/>:<Pause size={17} fill="currentColor"/>}</button><div><b>{paused?'Resume visuals':'Pause visuals'}</b><small>{paused?'Animation is paused':'Canvas in motion'}</small></div><button onClick={fullscreen} className="fullscreen"><Expand size={16}/> Fullscreen</button><button onClick={()=>void togglePerformance()} className="fullscreen cinema-button">◈ Cinema Mode</button></div></div>
   {fullscreenError&&<p className="error" role="alert">{fullscreenError}</p>}
  </section>
  <MicListener ref={micRef} localPlaying={localPlaying} onBeforeActivate={()=>{playerRef.current?.pause();audioHubRef.current?.stop()}}/>
  <AudioSourceHub ref={audioHubRef} open={sourceOpen} onClose={()=>setSourceOpen(false)} onPickLocal={switchToLocal} onPickMic={switchToMic} onExternalActivated={activateExternal} onPlaySong={async song=>{micRef.current?.stop();setLyricDelay(0);await playerRef.current?.loadRemote(song)}}/>
  <SpotifyDiscovery/>
  <footer>LYRICFLOW <span>·</span> PROCEDURAL 3D ENGINE <span>·</span> 30 SCENE COLLECTION <aside>SONG-DRIVEN MOTION GRAPHICS</aside></footer>
 </div>
}