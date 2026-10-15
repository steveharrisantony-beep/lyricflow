import { useEffect,useState } from 'react';
import CinematicStage from './visualization/cinematic/CinematicStage';
import {TEMPLATES,type SceneId} from './visualization/cinematic/catalog';
import {fontLabel} from './visualization/cinematic/fonts';
import {setAudioSensitivity} from './audio/audioSignal';
import LocalPlayer from './audio/LocalPlayer';
import MicListener from './audio/MicListener';
import SpotifyDiscovery from './spotify/SpotifyDiscovery';
import ManualLyrics, {type IncomingLyrics} from './lyrics/ManualLyrics';
import TrackFinder from './metadata/TrackFinder';
import type {TrackInfo} from './metadata/trackInfo';
import {saveTrackCorrection} from './metadata/metadataStore';
import {AudioLines,Settings2,Expand,Pause,Play,Waves,SlidersHorizontal} from 'lucide-react';
const choices=TEMPLATES;
type Quality='High'|'Balanced'|'Performance';
export default function App(){
 const [scene,setScene]=useState<SceneId>('crimson-impact'),[intensity,setIntensity]=useState(65),[speed,setSpeed]=useState(55);
 const [liveScene,setLiveScene]=useState('Crimson Impact');
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
 const [autoScenes,setAutoScenes]=useState(true);
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
     setAudioReadout({source:canvas.dataset.audioSource||'IDLE',level:numeric('audioLevel'),bass:numeric('audioBass'),mids:numeric('audioMids'),treble:numeric('audioTreble'),beat:numeric('audioBeat'),bpm:numeric('audioBpm'),tempoConfidence:numeric('audioTempoConfidence'),onset:numeric('audioOnset'),downbeat:numeric('audioDownbeat'),section:canvas.dataset.audioSection||'unknown',beatCount:numeric('audioBeatCount'),flux:numeric('audioFlux'),threshold:numeric('audioThreshold')});
   },90);
   return()=>clearInterval(id);
 },[]);
 useEffect(()=>{const id=setInterval(()=>{const v=document.querySelector<HTMLCanvasElement>('.visual-canvas')?.dataset.fps;if(v)setFps(Number(v))},1000);return()=>clearInterval(id)},[]);
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();setFullscreenError('')}catch{setFullscreenError('Fullscreen is not supported in this browser preview. Try opening the app in its own browser tab.')}};
 const togglePerformance=async()=>{if(performance){setPerformance(false);if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return;}setPerformance(true);try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{setFullscreenError('Browser fullscreen was blocked. Cinema mode still hides the controls; tap the canvas to exit.')}};
 return <div className={"shell "+(performance?"performance-mode":"")}>
  <header className="header"><div className="logo"><span className="logo-mark"><AudioLines size={21}/></span><div><strong>lyric<span>flow</span></strong><small>VISUAL SOUNDSTAGE</small></div></div>
   <div className="track"><i className="dot"/> {localTrack?.title||'Untitled session'} <span>/</span> {localPlaying?'Local audio':'Demo mode'}</div>
   <div className="header-right"><span className="demo-status"><i className="dot"/>{localPlaying?'LOCAL AUDIO':audioReadout.source==='MICROPHONE'?'MIC ACTIVE':demo?'DEMO ACTIVE':'DEMO OFF'}</span><button className="icon-btn" aria-label="Settings" onClick={()=>setSettings(v=>!v)}><Settings2 size={19}/></button></div>
  </header>
  <section className="stage" onClick={performance?()=>void togglePerformance():undefined} aria-label={performance?"Tap anywhere to exit cinema mode":"Music visualizer"}>
   <CinematicStage manualScene={scene} intensity={intensity/100} speed={speed/50} quality={quality} demo={demo} paused={paused} reducedMotion={reducedMotion} autoScenes={autoScenes} cameraMode={cameraMode} spatialTypography={spatialTypography} narrativeObjects={narrativeObjects}/>

   <div className="scene-chip cinematic-chip"><span className="chip-icon">✦</span><div><b>{liveScene}</b><small>Cinematic scene director</small></div><span>30 FILM LOOKS</span></div>
   <div className="stage-bottom"><span><i className="dot"/> CANVAS ENGINE READY</span><span>{fps} FPS</span></div>
   {settings&&<aside className="settings-panel"><div className="settings-title"><SlidersHorizontal size={16}/> VISUAL SETTINGS <button aria-label="Close settings" onClick={()=>setSettings(false)}>×</button></div><label className="check"><span><b>Reduced motion</b><small>Calmer animation</small></span><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label><p>RENDERING QUALITY</p><div className="quality-options">{(['High','Balanced','Performance'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} onClick={()=>setQuality(q)}>{q}</button>)}</div><p className="note">Local music and optional microphone audio are analyzed on this device; no recording or uploading.</p></aside>}
  </section>
  <section className="signal-panel" aria-label="Live audio analysis">
    <div className="signal-header"><strong>LIVE AUDIO REACTIVITY</strong><span className={'signal-mode '+(audioReadout.source==='LOCAL AUDIO'?'connected':'')}>{audioReadout.source==='LOCAL AUDIO'?'● Local audio detected':audioReadout.source==='MICROPHONE'?'● Microphone listening':audioReadout.source==='DEMO'?'◌ Simulated energy':'○ No audio source'}</span></div>
    <div className="signal-bars">{([['LOUDNESS',audioReadout.level],['BASS',audioReadout.bass],['MID',audioReadout.mids],['TREBLE',audioReadout.treble],['ONSET',audioReadout.onset],['BEAT',audioReadout.beat]] as const).map(([label,value])=><div className="signal-band" key={label}><span>{label}<b>{value}%</b></span><div className="signal-track"><i style={{width:value+'%'}}/></div></div>)}</div>
    <div className="music-metrics"><span>Tempo <b>{audioReadout.bpm?audioReadout.bpm+' BPM':'Estimating…'}</b></span><span>Tempo confidence <b>{audioReadout.tempoConfidence}%</b></span><span>Section <b>{audioReadout.section}</b></span><span>Onset <b>{audioReadout.onset}%</b></span><span>Beat pulses <b>{audioReadout.beatCount}</b></span><span>Downbeat¹ <b>{audioReadout.downbeat}%</b></span></div>
    <p className="signal-hint">Spectral-flux onset detector · adaptive threshold · beat pulses held for readability. BPM and downbeat grouping are estimates, not verified studio beat grids.</p>
    <p className="signal-hint">{audioReadout.source='LOCAL AUDIO'?'Analyzing the audio file locally. Try a bass-heavy section and watch the bars and visuals change.':audioReadout.source==='MICROPHONE'?'Analyzing nearby sound locally. Exact track timing is unavailable from microphone input.':'To react to real music, choose an MP3 from Local Music Player below and press Play, or start the microphone. Demo mode is simulated.'}</p>
  </section>
  <ManualLyrics key={fileEpoch} time={localTime} trackLoaded={localLoaded} track={localTrack} incoming={incoming}/>
  <section className="control-panel">
   <div className="control-heading"><div className="heading-left"><span className="heading-icon"><Waves size={16}/></span><div><b>CINEMATIC SCENE LIBRARY</b><small>30 original motion graphic templates · touch to select manually</small></div></div><label className="demo-toggle"><div><b>Demo mode</b><small>Simulated music energy</small></div><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/></label></div>
   <div className="scene-director-controls"><label className="auto-scenes"><input type="checkbox" checked={autoScenes} onChange={e=>setAutoScenes(e.target.checked)}/> Auto-direct cinematic scenes <small>(lyric timeline when available; varied music visuals otherwise)</small></label><label className="auto-scenes"><input type="checkbox" checked={spatialTypography} onChange={e=>setSpatialTypography(e.target.checked)}/> Spatial kinetic lyrics <small>(Cotodama-inspired layout choreography)</small></label><label className="auto-scenes"><input type="checkbox" checked={narrativeObjects} onChange={e=>setNarrativeObjects(e.target.checked)}/> Narrative objects <small>(bass scale · treble shimmer)</small></label><label className="camera-picker">Camera view <select value={cameraMode} onChange={e=>setCameraMode(e.target.value as typeof cameraMode)}>{(['Automatic','Front','Orbit','Side','Top'] as const).map(v=><option key={v}>{v}</option>)}</select></label></div>
   <div className="scene-grid cinematic-grid">{choices.map((item,i)=><button className={'scene-card cinematic-scene-card '+(scene===item.id&&!autoScenes?'selected':'')} key={item.id} onClick={()=>{setScene(item.id);setAutoScenes(false)}}><span className="scene-art cinematic-preview" style={{background:`linear-gradient(135deg, ${item.accent}, ${item.background} 75%)`,color:item.foreground,fontFamily:fontLabel(item.font)}}>{item.label.slice(0,2).toUpperCase()}</span><span className="scene-copy"><b>{item.label}</b><small>{item.family} · {fontLabel(item.font)}</small></span><small className="scene-number">{String(i+1).padStart(2,'0')}</small></button>)}</div>
   <div className="control-bottom"><label className="slider"><span><span>◉ &nbsp; Audio sensitivity</span><b>{sensitivity}%</b></span><input aria-label="Audio sensitivity" type="range" min="0" max="100" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))}/></label><label className="slider"><span><span>✧ &nbsp; Visual intensity</span><b>{intensity}%</b></span><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/></label><label className="slider"><span><span>ϟ &nbsp; Animation speed</span><b>{speed}%</b></span><input type="range" min="10" max="100" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label><div className="transport"><button aria-label={paused?'Resume':'Pause'} className="play" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17} fill="currentColor"/>:<Pause size={17} fill="currentColor"/>}</button><div><b>{paused?'Resume visuals':'Pause visuals'}</b><small>{paused?'Animation is paused':'Canvas in motion'}</small></div><button onClick={fullscreen} className="fullscreen"><Expand size={16}/> Fullscreen</button><button onClick={()=>void togglePerformance()} className="fullscreen cinema-button">◈ Cinema Mode</button></div></div>
   {fullscreenError&&<p className="error" role="alert">{fullscreenError}</p>}
  </section>
  <LocalPlayer onActiveChange={setLocalPlaying} onTimeChange={setLocalTime} onFileChange={loaded=>{setLocalLoaded(loaded);setFileEpoch(e=>e+1);setIncoming(null)}} onTrackChange={setLocalTrack} onDurationChange={duration=>setLocalTrack(p=>p?{...p,duration}:p)}/>
  <TrackFinder track={localTrack} onMetadataChange={value=>{setLocalTrack(value);saveTrackCorrection(value)}} onLyricsFound={acceptLyrics}/>
  <MicListener localPlaying={localPlaying}/>
  <SpotifyDiscovery/>
  <footer>LYRICFLOW <span>·</span> CINEMATIC ENGINE <span>·</span> 30 SCENE COLLECTION <aside>SONG-DRIVEN MOTION GRAPHICS</aside></footer>
 </div>
}