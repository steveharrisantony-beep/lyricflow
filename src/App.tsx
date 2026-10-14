import { useEffect,useState } from 'react';
import Visualizer,{type Scene} from './Visualizer';
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
 useEffect(()=>{const id=setInterval(()=>{const v=document.querySelector<HTMLCanvasElement>('.visual-canvas')?.dataset.fps;if(v)setFps(Number(v))},1000);return()=>clearInterval(id)},[]);
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();setFullscreenError('')}catch{setFullscreenError('Fullscreen is not supported in this browser preview. Try opening the app in its own browser tab.')}};
 return <div className="shell">
  <header className="header"><div className="logo"><span className="logo-mark"><AudioLines size={21}/></span><div><strong>lyric<span>flow</span></strong><small>VISUAL SOUNDSTAGE</small></div></div>
   <div className="track"><i className="dot"/> Untitled session <span>/</span> Demo mode</div>
   <div className="header-right"><span className="demo-status"><i className="dot"/>{demo?'DEMO ACTIVE':'DEMO OFF'}</span><button className="icon-btn" aria-label="Settings" onClick={()=>setSettings(v=>!v)}><Settings2 size={19}/></button></div>
  </header>
  <section className="stage">
   <Visualizer scene={scene} intensity={intensity/100} speed={speed/50} quality={quality} demo={demo} paused={paused} reducedMotion={reducedMotion}/>
   <div className="vignette"/>
   <div className="stage-title"><p className="eyebrow">— YOUR SOUND, REIMAGINED</p><h1>Let the music<br/><em>become visible.</em></h1><p className="summary">A living canvas for every frequency, feeling and fleeting moment.</p></div>
   <div className="meter"><small>VISUAL OUTPUT</small><div><i style={{width:intensity+'%'}}/></div><span>{intensity}%</span></div>
   <div className="scene-chip"><span className="chip-icon">{choices.find(c=>c.value===scene)?.symbol}</span><div><b>{choices.find(c=>c.value===scene)?.label}</b><small>{choices.find(c=>c.value===scene)?.subtitle}</small></div><span>0{choices.findIndex(c=>c.value===scene)+1} / 04</span></div>
   <div className="stage-bottom"><span><i className="dot"/> CANVAS ENGINE READY</span><span>{fps} FPS</span></div>
   {settings&&<aside className="settings-panel"><div className="settings-title"><SlidersHorizontal size={16}/> VISUAL SETTINGS <button aria-label="Close settings" onClick={()=>setSettings(false)}>×</button></div><label className="check"><span><b>Reduced motion</b><small>Calmer animation</small></span><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label><p>RENDERING QUALITY</p><div className="quality-options">{(['High','Balanced','Performance'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} onClick={()=>setQuality(q)}>{q}</button>)}</div><p className="note">Graphics are generated locally in your browser. Stage 1 does not access your microphone.</p></aside>}
  </section>
  <section className="control-panel">
   <div className="control-heading"><div className="heading-left"><span className="heading-icon"><Waves size={16}/></span><div><b>SCENE SELECTOR</b><small>Choose your atmosphere</small></div></div><label className="demo-toggle"><div><b>Demo mode</b><small>Simulated music energy</small></div><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/></label></div>
   <div className="scene-grid">{choices.map((item,i)=><button className={'scene-card '+(scene===item.value?'selected':'')} key={item.value} onClick={()=>setScene(item.value)}><span className={'scene-art art-'+i}>{item.symbol}</span><span className="scene-copy"><b>{item.label}</b><small>{item.subtitle}</small></span><small className="scene-number">0{i+1}</small></button>)}</div>
   <div className="control-bottom"><label className="slider"><span><span>✧ &nbsp; Visual intensity</span><b>{intensity}%</b></span><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/></label><label className="slider"><span><span>ϟ &nbsp; Animation speed</span><b>{speed}%</b></span><input type="range" min="10" max="100" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label><div className="transport"><button aria-label={paused?'Resume':'Pause'} className="play" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17} fill="currentColor"/>:<Pause size={17} fill="currentColor"/>}</button><div><b>{paused?'Resume visuals':'Pause visuals'}</b><small>{paused?'Animation is paused':'Canvas in motion'}</small></div><button onClick={fullscreen} className="fullscreen"><Expand size={16}/> Fullscreen</button></div></div>
   {fullscreenError&&<p className="error" role="alert">{fullscreenError}</p>}
  </section>
  <footer>LYRICFLOW <span>·</span> EARLY PREVIEW <span>·</span> STAGE 01 <aside>MADE TO BE FELT, NOT JUST HEARD</aside></footer>
 </div>
}