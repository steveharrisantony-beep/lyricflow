import {useEffect,useMemo,useRef,useState} from 'react';
import type {TrackInfo} from '../metadata/trackInfo';
import {detectLanguage,romanizeText} from '../romanization/romanize';
import {parseLRC} from './lrc';
import {buildCues,setLyricTimeline} from './lyricTimeline';
import {analyzeSections} from './sceneDirector';
import {buildCinematicSchedule,byId,type SceneId} from '../visualization/cinematic/catalog';
import {saveUserLyrics} from './userLibrary';
import {clampLyricDelay,effectiveLyricTime,formatLyricDelay} from './lyricTiming';
import {convertTtmlToEnhancedLrc} from './appleLyrics';
export {parseLRC} from './lrc';
export {normalizeTrack as cleanTrackTitle} from '../metadata/trackInfo';

export interface IncomingLyrics{
 original:string;
 romanized:string;
 plain?:string;
 source:string;
 sourceUrl?:string;
 hasWordSync?:boolean;
 token:number;
}

const SAMPLE='[00:00.00]<00:00.00>This <00:00.60>is <00:01.10>an <00:01.60>original <00:02.30>sample <00:02.90>lyric\n[00:03.50]<00:03.50>Watch <00:04.20>the <00:04.70>lights <00:05.40>begin <00:06.10>to <00:06.50>glow\n[00:07.00]<00:07.00>Moving <00:07.80>gently <00:08.60>with <00:09.10>the <00:09.60>music';

export default function ManualLyrics({
 time,
 trackLoaded,
 track,
 incoming,
 delay,
 onDelayChange,
 customEditOpen,
 onToggleCustomEdit,
 onSaveCustomOverride,
 enabledScenes
}:{
 time:number;
 trackLoaded:boolean;
 track:TrackInfo|null;
 incoming:IncomingLyrics|null;
 delay:number;
 onDelayChange:(value:number)=>void;
 customEditOpen?:boolean;
 onToggleCustomEdit?:()=>void;
 onSaveCustomOverride?:(lrc:string)=>void;
 enabledScenes?:readonly SceneId[];
}){
 const [raw,setRaw]=useState('');
 const [roman,setRoman]=useState('');
 const [plain,setPlain]=useState('');
 const [mode,setMode]=useState<'original'|'romanized'|'both'>('both');
 const [offset,setOffset]=useState(0);
 const [genre,setGenre]=useState('');
 const [source,setSource]=useState('Automatic (Apple Music / LRCLIB)');
 const [sourceUrl,setSourceUrl]=useState('');
 const [corrected,setCorrected]=useState(false);
 const [message,setMessage]=useState('');
 const [autoRoman,setAutoRoman]=useState(true);
 const fileRef=useRef<HTMLInputElement>(null);

 const lines=useMemo(()=>parseLRC(raw),[raw]);
 const romanLines=useMemo(()=>parseLRC(roman),[roman]);
 const language=useMemo(()=>detectLanguage(raw||plain),[raw,plain]);
 const sections=useMemo(()=>analyzeSections(lines,genre),[lines,genre]);
 const storyboard=useMemo(
  ()=>buildCinematicSchedule(sections,buildCues(lines,romanLines,genre),genre,lines.map(l=>l.text).join('|').slice(0,1500),enabledScenes),
  [sections,lines,romanLines,genre,enabledScenes]
 );

 useEffect(()=>{
  setLyricTimeline(buildCues(lines,romanLines,genre),offset-delay,mode,genre);
  return()=>setLyricTimeline([]);
 },[lines,romanLines,offset,delay,mode,genre]);

 useEffect(()=>{
  if(!incoming)return;
  setRaw(incoming.original);
  setPlain(incoming.plain||'');
  setRoman(incoming.romanized||(!incoming.romanized&&autoRoman?romanizeText(incoming.original).text:''));
  setSource(incoming.source);
  setSourceUrl(incoming.sourceUrl||'');
  setCorrected(false);
  setMessage(`Auto-loaded from ${incoming.source}.`);
 },[incoming?.token]);

 useEffect(()=>{if(!trackLoaded)setOffset(0)},[trackLoaded]);

 function updateRaw(value:string){
  // Automatically convert pasted TTML XML if user pastes Apple Music TTML directly
  if(value.includes('<tt')||value.includes('<p begin=')){
   const converted=convertTtmlToEnhancedLrc(value);
   if(converted.lrc){
    setRaw(converted.lrc);
    setPlain('');
    setSource('Custom Apple TTML Override');
    if(autoRoman&&!corrected)setRoman(romanizeText(converted.lrc).text);
    return;
   }
  }
  setRaw(value);
  setPlain('');
  setSource('Custom Edited');
  if(autoRoman&&!corrected)setRoman(romanizeText(value).text);
 }

 function autoGenerate(){
  if(!raw){setMessage('Add original lyrics before romanization.');return}
  setRoman(romanizeText(raw).text);
  setCorrected(false);
  setMessage('Romanization generated locally.');
 }

 async function importLocal(){
  const file=fileRef.current?.files?.[0];if(!file)return;
  if(file.size>250000){setMessage('Lyric file too large (maximum 250 KB).');return}
  try{
   const text=await file.text();
   if(text.includes('<p begin=')){
    const converted=convertTtmlToEnhancedLrc(text);
    if(converted.lrc){
     updateRaw(converted.lrc);
     setSource('Imported TTML file');
     setMessage('Imported word-synced TTML file '+file.name);
     return;
    }
   }
   if(parseLRC(text).length){
    updateRaw(text);
    setSource('Local LRC file');
   }else{
    setPlain(text);
    setRaw('');
    setRoman('');
    setSource('Local untimed text file');
   }
   setMessage('Imported '+file.name+' from your device.');
  }catch{
   setMessage('The lyric file could not be read.');
  }
  if(fileRef.current)fileRef.current.value='';
 }

 function estimatePlain(){
  const rows=plain.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,300);
  if(!rows.length){setMessage('No untimed lines available.');return}
  const interval=track?.duration&&track.duration>0?Math.max(1,track.duration/rows.length):4;
  const lrc=rows.map((line,i)=>{const t=i*interval;const mm=String(Math.floor(t/60)).padStart(2,'0');const ss=(t%60).toFixed(2).padStart(5,'0');return '['+mm+':'+ss+']'+line}).join('\n');
  setRaw(lrc);if(autoRoman&&!corrected)setRoman(romanizeText(lrc).text);
  setPlain('');setSource(source+' · estimated timing');
  setMessage('Approximate line timestamps generated.');
 }

 function saveOverride(){
  if(!raw.trim()){setMessage('Add or edit lyrics first before saving.');return}
  onSaveCustomOverride?.(raw);
  if(track){
   try{
    saveUserLyrics({
     title:track.title,
     artist:track.artist,
     album:track.album,
     duration:track.duration,
     original:raw,
     romanized:roman,
     language,
     rightsConfirmed:true,
     source:'Custom Override'
    });
   }catch{
    // Ignore local library duplicate issues
   }
  }
  setMessage('Custom lyrics override saved for this song.');
 }

 const lyricTime=effectiveLyricTime(time,offset,delay);
 let idx=-1;for(let i=0;i<lines.length;i++){if(lines[i].time<=lyricTime)idx=i;else break}
 const current=lines[idx],next=lines[idx+1];
 const rom=romanLines[idx]?.text||'Romanized text unavailable';
 const hasWordTags=useMemo(()=>lines.some(l=>l.words&&l.words.some(w=>w.timing==='sourced')),[lines]);

 return <section className="local-player lyrics-panel">
  <div className="player-heading">
   <div className="heading-left">
    <span className="heading-icon">文</span>
    <div>
     <b>AUTOMATIC WORD-SYNCED LYRICS</b>
     <small>{source} · {hasWordTags?'Syllable / Word-level timestamps active':'Line-level / estimated word choreography'}</small>
    </div>
   </div>
   <button className="upload-button" onClick={onToggleCustomEdit}>
    {customEditOpen?'Close Custom Edit':'Custom Edit (If Lyrics Mismatch)'}
   </button>
  </div>

  <div className="lyric-display">
   {current?<>
    {mode!=='romanized'&&<p>{current.text}</p>}
    {mode!=='original'&&(mode==='romanized'||rom.trim()!==current.text.trim())&&<p className="romanized">{rom}</p>}
   </>:
    <p>{plain?'Untimed lyrics loaded — click "Create approximate timestamps" below to synchronize.':lines.length?'Waiting for first vocal cue…':'Lyrics load automatically when you select a song from Stash Online Player or upload a local file.'}</p>}
   {next&&<small>UP NEXT · {next.text}</small>}
  </div>

  <div className="lyrics-tools">
   <label>Lyrics display<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="original">Original</option><option value="romanized">Romanized</option><option value="both">Both</option></select></label>
   <label>Visual genre preset<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Auto / unknown</option>{['Ambient','Cinematic','Pop','EDM','Rock','Hip-hop','Ballad','Classical'].map(g=><option key={g}>{g}</option>)}</select></label>
   <label>Song delay (sec)<input aria-label="Lyrics delay seconds" type="number" step=".05" min="-30" max="30" value={delay} onChange={e=>onDelayChange(clampLyricDelay(Number(e.target.value)))}/></label>
   <span>{lines.length} timed lines · {hasWordTags?'Word-synced':'Line-synced'} · {language} · Delay {formatLyricDelay(delay)}</span>
  </div>

  {plain&&!lines.length&&<div className="plain-lyrics-fallback">
   <textarea rows={4} readOnly value={plain} aria-label="Untimed lyrics" className="plain-preview"/>
   <button className="upload-button" onClick={estimatePlain}>Create approximate timestamps</button>
  </div>}

  {customEditOpen&&<div className="lyrics-editor">
   <label>Custom LRC or Apple TTML Lyrics (Edit only if auto-loaded lyrics do not match)
    <textarea rows={7} value={raw} onChange={e=>updateRaw(e.target.value)} placeholder="[00:12.50]<00:12.50>Word <00:13.00>synced <00:13.50>line"/>
   </label>
   <label>Romanization (editable)
    <textarea rows={7} value={roman} onChange={e=>{setRoman(e.target.value);setCorrected(true)}} placeholder="Auto-generated or corrected Romanized lyrics"/>
   </label>
   <div className="editor-actions">
    <input className="visually-hidden" ref={fileRef} type="file" accept=".lrc,.ttml,.xml,.txt,text/plain" aria-label="Import LRC or TTML file" onChange={()=>void importLocal()}/>
    <button className="upload-button" onClick={()=>fileRef.current?.click()}>Import LRC / TTML</button>
    <button className="upload-button" onClick={()=>{updateRaw(SAMPLE);setSource('Sample word-sync')}}>Load sample word-sync</button>
    <button className="upload-button" onClick={autoGenerate}>Romanize locally</button>
    <button className="upload-button" onClick={saveOverride}>Save custom lyrics for this song</button>
    <button className="player-remove" onClick={()=>{setRaw('');setRoman('');setPlain('');setSource('Cleared')}}>Clear</button>
   </div>
   <label className="rights-check">
    <input type="checkbox" checked={autoRoman} onChange={e=>setAutoRoman(e.target.checked)}/>
    Automatically Romanize non-Latin scripts
   </label>
  </div>}

  {storyboard.length>0&&<div className="storyboard">
   <div className="storyboard-title"><strong>AUTO-DIRECTED SCENE STORYBOARD</strong><span>{storyboard.length} planned scene(s) from your enabled themes</span></div>
   <div className="storyboard-track">{storyboard.map((item,i)=><div className="storyboard-item" key={item.start+'-'+i} style={{borderTopColor:byId[item.id].accent}}>
     <span className="storyboard-time">{Math.floor(item.start/60)}:{String(Math.floor(item.start%60)).padStart(2,'0')} – {Math.floor(item.end/60)}:{String(Math.floor(item.end%60)).padStart(2,'0')}</span>
     <strong>{byId[item.id].label}</strong>
     <span>{byId[item.id].family} · {item.font}</span>
     <small>{item.transition} · {item.camera} camera</small>
    </div>)}</div>
  </div>}

  {sourceUrl&&<p className="player-footnote">Source: <a href={sourceUrl} target="_blank" rel="noreferrer">{source} ↗</a></p>}
  {message&&<p role="status" className="player-footnote">{message}</p>}
 </section>;
}
