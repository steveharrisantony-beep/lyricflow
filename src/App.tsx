import { useEffect,useState } from 'react';
import Visualizer,{type Scene} from './Visualizer';
import ThreeLyrics from './ThreeLyrics';
import {setAudioSensitivity} from './audio/audioSignal';
import LocalPlayer from './audio/LocalPlayer';
import SpotifyDiscovery from './spotify/SpotifyDiscovery';
import ManualLyrics, {type IncomingLyrics} from './lyrics/ManualLyrics';
import TrackFinder from './metadata/TrackFinder';
import type {TrackInfo} from './metadata/trackInfo';
import {AudioLines,Settings2,Expand,Pause,Play,Waves,SlidersHorizontal} from 'lucide-react';
const choices:{value:Scene;label:string;subtitle:string;symbol:string}[]=[
 {value:'Particles',label:'Atmosphere',subtitle:'Luminous particles',symbol:'✳'},
 {value:'Light trails',label:'Light trails',subtitle:'Fluid light ribbons',symbol:'〰'},
 {value:'Geometry',label:'Geometry',subtitle:'Resonant structures',symbol:'◇'},
 {value:'Kinetic type',label:'Kinetic type',subtitle:'Animated lettering',symbol:'Aa'}];
type Quality='High'|'Balanced'|'Performance';
export default function App(){
 const [scene,setScene]=useState<Scene>('Particles'),[intensity,setIntensity]=useState(65),[speed,setSpeed]=useState(55);
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
 const [sensitivity,setSensitivity]=useState(14);
 const [autoScenes,setAutoScenes]=useState(true);
 const [cameraMode,setCameraMode]=useState<'Automatic'|'Front'|'Orbit'|'Side'|'Top'>('Automatic');
 const [performance,setPerformance]=useState(false);
 useEffect(()=>{setAudioSensitivity(sensitivity/100)},[sensitivity]);
 useEffect(()=>{const onFullscreen=()=>{if(!document.fullscreenElement)setPerformance(false)};document.addEventListener('fullscreenchange',onFullscreen);return()=>document.removeEventListener('fullscreenchange',onFullscreen)},[]);
 const [audioReadout,setAudioReadout]=useState({source:'IDLE',level:0,bass:0,mids:0,treble:0,beat:0,bpm:0,tempoConfidence:0,onset:0,downbeat:0,section:'unknown'});
 useEffect(()=>{
   const id=window.setInterval(()=>{
     const canvas=document.querySelector<HTMLCanvasElement>('canvas.visual-canvas');
     if(!canvas)return;
     const numeric=(key:string)=>Number(canvas.dataset[key]||0);
     setAudioReadout({source:canvas.dataset.audioSource||'IDLE',level:numeric('audioLevel'),bass:numeric('audioBass'),mids:numeric('audioMids'),treble:numeric('audioTreble'),beat:numeric('audioBeat'),bpm:numeric('audioBpm'),tempoConfidence:numeric('audioTempoConfidence'),onset:numeric('audioOnset'),downbeat:numeric('audioDownbeat'),section:canvas.dataset.audioSection||'unknown'});
   },140);
   return()=>clearInterval(id);
 },[]);
 useEffect(()=>{const id=setInterval(()=>{const v=document.querySelector<HTMLCanvasElement>('.visual-canvas')?.dataset.fps;if(v)setFps(Number(v))},1000);return()=>clearInterval(id)},[]);
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();setFullscreenError('')}catch{setFullscreenError('Fullscreen is not supported in this browser preview. Try opening the app in its own browser tab.')}};
 const togglePerformance=async()=>{if(performance){setPerformance(false);if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return;}setPerformance(true);try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{setFullscreenError('Browser fullscreen was blocked. Cinema mode still hides the controls; tap the canvas to exit.')}};
 return <div className={"shell "+(performance?"performance-mode":"")}>
  <header className="header"><div className="logo"><span className="logo-mark"><AudioLines size={21}/></span><div><strong>lyric<span>flow</span></strong><small>VISUAL SOUNDSTAGE</small></div></div>
   <div className="track"><i className="dot"/> {localTrack?.title||'Untitled session'} <span>/</span> {localPlaying?'Local audio':'Demo mode'}</div>
   <div className="header-right"><span className="demo-status"><i className="dot"/>{localPlaying?'LOCAL AUDIO':demo?'DEMO ACTIVE':'DEMO OFF'}</span><button className="icon-btn" aria-label="Settings" onClick={()=>setSettings(v=>!v)}><Settings2 size={19}/></button></div>
  </header>
  <section className="stage" onClick={performance?()=>void togglePerformance():undefined} aria-label={performance?"Tap anywhere to exit cinema mode":"Music visualizer"}>
   <Visualizer scene={scene} intensity={intensity/100} speed={speed/50} quality={quality} demo={demo} paused={paused} reducedMotion={reducedMotion} autoScenes={autoScenes}/>
   <ThreeLyrics quality={quality} intensity={intensity/100} speed={speed/50} reducedMotion={reducedMotion} demo={demo} paused={paused} autoScenes={autoScenes} cameraMode={cameraMode}/>
   <div className="vignette"/>
   <div className="stage-title"><p className="eyebrow">— YOUR SOUND, REIMAGINED</p><h1>Let the music<br/><em>become visible.</em></h1><p className="summary">A living canvas for every frequency, feeling and fleeting moment.</p></div>
   <div className="meter"><small>VISUAL OUTPUT</small><div><i style={{width:intensity+'%'}}/></div><span>{intensity}%</span></div>
   <div className="scene-chip"><span className="chip-icon">{choices.find(c=>c.value===scene)?.symbol}</span><div><b>{choices.find(c=>c.value===scene)?.label}</b><small>{choices.find(c=>c.value===scene)?.subtitle}</small></div><span>0{choices.findIndex(c=>c.value===scene)+1} / 04</span></div>
   <div className="stage-bottom"><span><i className="dot"/> CANVAS ENGINE READY</span><span>{fps} FPS</span></div>
   {settings&&<aside className="settings-panel"><div className="settings-title"><SlidersHorizontal size={16}/> VISUAL SETTINGS <button aria-label="Close settings" onClick={()=>setSettings(false)}>×</button></div><label className="check"><span><b>Reduced motion</b><small>Calmer animation</small></span><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label><p>RENDERING QUALITY</p><div className="quality-options">{(['High','Balanced','Performance'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} onClick={()=>setQuality(q)}>{q}</button>)}</div><p className="note">Graphics are generated locally in your browser. Stage 1 does not access your microphone.</p></aside>}
  </section>
  <LocalPlayer onActiveChange={setLocalPlaying} onTimeChange={setLocalTime} onFileChange={loaded=>{setLocalLoaded(loaded);setFileEpoch(e=>e+1);setIncoming(null)}} onTrackChange={setLocalTrack} onDurationChange={duration=>setLocalTrack(p=>p?{...p,duration}:p)}/>
  <TrackFinder track={localTrack} onMetadataChange={setLocalTrack} onLyricsFound={acceptLyrics}/>
  <section className="signal-panel" aria-label="Live audio analysis">
    <div className="signal-header"><strong>LIVE AUDIO REACTIVITY</strong><span className={'signal-mode '+(audioReadout.source==='LOCAL AUDIO'?'connected':'')}>{audioReadout.source==='LOCAL AUDIO'?'● Local audio detected':audioReadout.source==='DEMO'?'◌ Simulated energy':'○ No audio source'}</span></div>
    <div className="signal-bars">{([['LOUDNESS',audioReadout.level],['BASS',audioReadout.bass],['MID',audioReadout.mids],['TREBLE',audioReadout.treble],['BEAT',audioReadout.beat]] as const).map(([label,value])=><div className="signal-band" key={label}><span>{label}<b>{value}%</b></span><div className="signal-track"><i style={{width:value+'%'}}/></div></div>)}</div>
    <div className="music-metrics"><span>Tempo <b>{audioReadout.bpm?audioReadout.bpm+' BPM':'Estimating…'}</b></span><span>Tempo confidence <b>{audioReadout.tempoConfidence}%</b></span><span>Section <b>{audioReadout.section}</b></span><span>Onset <b>{audioReadout.onset}%</b></span><span>Downbeat <b>{audioReadout.downbeat}%</b></span></div>
    <p className="signal-hint">{audioReadout.source==='LOCAL AUDIO'?'Analyzing the audio file locally. Try a bass-heavy section and watch the bars and visuals change.':'To react to real music, choose an MP3 above and press Play. Demo mode produces simulated movement, not real audio analysis.'}</p>
  </section>
  <ManualLyrics key={fileEpoch} time={localTime} trackLoaded={localLoaded} track={localTrack} incoming={incoming}/>
  <SpotifyDiscovery/>
  <section className="control-panel">
   <div className="control-heading"><div className="heading-left"><span className="heading-icon"><Waves size={16}/></span><div><b>SCENE SELECTOR</b><small>Choose your atmosphere</small></div></div><label className="demo-toggle"><div><b>Demo mode</b><small>Simulated music energy</small></div><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/></label></div>
   <div className="scene-director-controls"><label className="auto-scenes"><input type="checkbox" checked={autoScenes} onChange={e=>setAutoScenes(e.target.checked)}/> Auto scenes from lyrics <small>(available when timed lyrics are supplied)</small></label><label className="camera-picker">Camera view <select value={cameraMode} onChange={e=>setCameraMode(e.target.value as typeof cameraMode)}>{(['Automatic','Front','Orbit','Side','Top'] as const).map(v=><option key={v}>{v}</option>)}</select></label></div>
   <div className="scene-grid">{choices.map((item,i)=><button className={'scene-card '+(scene===item.value?'selected':'')} key={item.value} onClick={()=>setScene(item.value)}><span className={'scene-art art-'+i}>{item.symbol}</span><span className="scene-copy"><b>{item.label}</b><small>{item.subtitle}</small></span><small className="scene-number">0{i+1}</small></button>)}</div>
   <div className="control-bottom"><label className="slider"><span><span>◉ &nbsp; Audio sensitivity</span><b>{sensitivity}%</b></span><input aria-label="Audio sensitivity" type="range" min="0" max="100" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))}/></label><label className="slider"><span><span>✧ &nbsp; Visual intensity</span><b>{intensity}%</b></span><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/></label><label className="slider"><span><span>ϟ &nbsp; Animation speed</span><b>{speed}%</b></span><input type="range" min="10" max="100" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label><div className="transport"><button aria-label={paused?'Resume':'Pause'} className="play" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17} fill="currentColor"/>:<Pause size={17} fill="currentColor"/>}</button><div><b>{paused?'Resume visuals':'Pause visuals'}</b><small>{paused?'Animation is paused':'Canvas in motion'}</small></div><button onClick={fullscreen} className="fullscreen"><Expand size={16}/> Fullscreen</button><button onClick={()=>void togglePerformance()} className="fullscreen cinema-button">◈ Cinema Mode</button></div></div>
   {fullscreenError&&<p className="error" role="alert">{fullscreenError}</p>}
  </section>
  <footer>LYRICFLOW <span>·</span> EARLY PREVIEW <span>·</span> STAGE 01 <aside>MADE TO BE FELT, NOT JUST HEARD</aside></footer>
 </div>
}