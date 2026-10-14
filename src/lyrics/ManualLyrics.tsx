import {useEffect,useMemo,useState} from 'react';
type Line={time:number;text:string;romanized?:string};
export function cleanTrackTitle(input:string){
 return input.replace(/\s*\(\s*From\s+["“][^"”]+["”]\s*\)/gi,'').replace(/\s*[-–]\s*(Official|Lyric|Audio|Video)\s*(Video)?\s*$/gi,'').trim();
}
export function parseLRC(source:string):Line[]{
 const entries:Line[]=[];
 for(const raw of source.split(/\r?\n/)){
  const times=[...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
  if(!times.length)continue;
  const text=raw.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g,'').trim();
  for(const match of times){
   const fraction=match[3]||'0';
   const time=Number(match[1])*60+Number(match[2])+Number(fraction.padEnd(3,'0'))/1000;
   if(Number.isFinite(time))entries.push({time,text});
  }
 }
 return entries.sort((a,b)=>a.time-b.time);
}
const SAMPLE='[00:00.00]This is an original sample lyric\n[00:03.50]Watch the lights begin to glow\n[00:07.00]Moving gently with the music';
export default function ManualLyrics({time,trackLoaded}:{time:number;trackLoaded:boolean}){
 const [raw,setRaw]=useState('');
 const [roman,setRoman]=useState('');
 const [mode,setMode]=useState<'original'|'romanized'|'both'>('original');
 const [offset,setOffset]=useState(0);
 const [show,setShow]=useState(false);
 const lines=useMemo(()=>parseLRC(raw),[raw]);
 const romanLines=useMemo(()=>parseLRC(roman),[roman]);
 const index=useMemo(()=>{let i=-1;for(let j=0;j<lines.length;j++){if(lines[j].time<=time+offset)i=j;else break}return i},[lines,time,offset]);
 const current=lines[index];
 const rom=romanLines[index]?.text||'Romanization not supplied';
 const next=lines[index+1]?.text||'';
 useEffect(()=>{if(!trackLoaded)setOffset(0)},[trackLoaded]);
 return <section className="local-player lyrics-panel">
   <div className="player-heading"><div className="heading-left"><span className="heading-icon">文</span><div><b>LOCAL TIMED LYRICS</b><small>Manual LRC · Original script · Romanization</small></div></div><button className="upload-button" onClick={()=>setShow(v=>!v)}>{show?'Hide editor':'Edit lyrics'}</button></div>
   <div className="lyric-display" aria-live="off">{current?<><p>{mode!=='romanized'?current.text:null}</p>{mode!=='original'&&<p className="romanized">{rom}</p>}</>:<p>{lines.length?'Waiting for the first timestamp…':'Paste your permitted lyrics in LRC format to begin.'}</p>}{next&&<small>UP NEXT · {next}</small>}</div>
   <div className="lyrics-tools"><label>Text mode <select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="original">Original</option><option value="romanized">Romanized</option><option value="both">Both</option></select></label><label>Timing offset (seconds) <input type="number" step=".1" min="-30" max="30" value={offset} onChange={e=>setOffset(Number(e.target.value)||0)}/></label><span>{lines.length} lines · {trackLoaded?'Local player clock':'Load a local track to synchronize'}</span></div>
   {show&&<div className="lyrics-editor"><label>Original lyrics with timestamps<textarea rows={5} value={raw} onChange={e=>setRaw(e.target.value)} placeholder="[00:12.50]Your permitted lyric line"/></label><label>Romanized lyrics with matching timestamps<textarea rows={5} value={roman} onChange={e=>setRoman(e.target.value)} placeholder="[00:12.50]Romanized line"/></label><div className="player-row"><button className="upload-button" onClick={()=>{setRaw(SAMPLE);setRoman('');}}>Load original sample</button><button className="player-remove" onClick={()=>{setRaw('');setRoman('')}}>Clear</button></div></div>}
   <p className="player-footnote">Manual content only. We do not upload, permanently store, or automatically translate lyrics. Timestamps synchronize exclusively with your local audio player's playback clock, not Spotify.</p>
 </section>;
}