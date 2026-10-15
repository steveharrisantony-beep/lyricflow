import {useEffect,useMemo,useRef,useState} from 'react';
import type {TrackInfo} from '../metadata/trackInfo';
import {detectLanguage,romanizeText} from '../romanization/romanize';
import {parseLRC} from './lrc';
import {buildCues,setLyricTimeline} from './lyricTimeline';
import {analyzeSections} from './sceneDirector';
import {buildCinematicSchedule,byId} from '../visualization/cinematic/catalog';
import {saveUserLyrics} from './userLibrary';
import {clampLyricDelay,effectiveLyricTime,formatLyricDelay} from './lyricTiming';
export {parseLRC} from './lrc';
export {normalizeTrack as cleanTrackTitle} from '../metadata/trackInfo';
export interface IncomingLyrics{original:string;romanized:string;plain?:string;source:string;sourceUrl?:string;token:number}
const SAMPLE='[00:00.00]This is an original sample lyric\n[00:03.50]Watch the lights begin to glow\n[00:07.00]Moving gently with the music';
export default function ManualLyrics({time,trackLoaded,track,incoming,delay,onDelayChange}:{time:number;trackLoaded:boolean;track:TrackInfo|null;incoming:IncomingLyrics|null;delay:number;onDelayChange:(value:number)=>void}){
 const [raw,setRaw]=useState('');
 const [roman,setRoman]=useState('');
 const [plain,setPlain]=useState('');
 const [mode,setMode]=useState<'original'|'romanized'|'both'>('both');
 const [offset,setOffset]=useState(0);
 const [show,setShow]=useState(false);
 const [genre,setGenre]=useState('');
 const [source,setSource]=useState('Manual');
 const [sourceUrl,setSourceUrl]=useState('');
 const [corrected,setCorrected]=useState(false);
 const [saveRights,setSaveRights]=useState(false);
 const [message,setMessage]=useState('');
 const [autoRoman,setAutoRoman]=useState(true);
 const fileRef=useRef<HTMLInputElement>(null);
 const lines=useMemo(()=>parseLRC(raw),[raw]);
 const romanLines=useMemo(()=>parseLRC(roman),[roman]);
 const language=useMemo(()=>detectLanguage(raw||plain),[raw,plain]);
 const sections=useMemo(()=>analyzeSections(lines,genre),[lines,genre]);
 const storyboard=useMemo(()=>buildCinematicSchedule(sections,buildCues(lines,romanLines,genre),genre,lines.map(l=>l.text).join('|').slice(0,1500)),[sections,lines,romanLines,genre]);
 useEffect(()=>{setLyricTimeline(buildCues(lines,romanLines,genre),offset-delay,mode,genre);return()=>setLyricTimeline([]);},[lines,romanLines,offset,delay,mode,genre]);
 useEffect(()=>{if(!incoming)return;
   setRaw(incoming.original);setPlain(incoming.plain||'');
   setRoman(incoming.romanized||(!incoming.romanized&&autoRoman?romanizeText(incoming.original).text:''));
   setSource(incoming.source);setSourceUrl(incoming.sourceUrl||'');
   setSaveRights(false);setCorrected(false);setMessage('Lyrics loaded. Verify text and timestamps before saving.');
 },[incoming?.token]);
 useEffect(()=>{if(!trackLoaded)setOffset(0)},[trackLoaded]);
 function updateRaw(value:string){
  setRaw(value);setPlain('');setSource('Manual / edited');
  if(autoRoman&&!corrected)setRoman(romanizeText(value).text);
 }
 function autoGenerate(){
  if(!raw){setMessage('Add original lyrics before romanization.');return}
  setRoman(romanizeText(raw).text);setCorrected(false);setMessage('Romanization generated locally. It is an estimate; please correct names and pronunciation.');
 }
 async function importLocal(){
  const file=fileRef.current?.files?.[0];if(!file)return;
  if(file.size>250000){setMessage('LRC file too large (maximum 250 KB).');return}
  try{const text=await file.text();if(parseLRC(text).length){updateRaw(text);setSource('Local LRC file');}else{setPlain(text);setRaw('');setRoman('');setSource('Local untimed text file');}setMessage('Imported '+file.name+' from your device.');setShow(true)}
  catch{setMessage('The lyric file could not be read.')}
  if(fileRef.current)fileRef.current.value='';
 }
 function estimatePlain(){
  const rows=plain.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,300);
  if(!rows.length){setMessage('No untimed lines available.');return}
  const interval=track?.duration&&track.duration>0?Math.max(1,track.duration/rows.length):4;
  const lrc=rows.map((line,i)=>{const t=i*interval;const mm=String(Math.floor(t/60)).padStart(2,'0');const ss=(t%60).toFixed(2).padStart(5,'0');return '['+mm+':'+ss+']'+line}).join('\n');
  setRaw(lrc);if(autoRoman&&!corrected)setRoman(romanizeText(lrc).text);
  setPlain('');setSource(source+' · estimated timing');
  setMessage('Approximate line timestamps generated. Adjust them manually; they are not verified vocal timing.');
 }
 function save(){
  if(!track){setMessage('Choose an MP3 to establish the song title before saving.');return}
  try{saveUserLyrics({title:track.title,artist:track.artist,album:track.album,duration:track.duration,
   original:raw,romanized:roman,language,rightsConfirmed:saveRights,source});
   setMessage('Saved in your browser library. It will not sync across devices.')}
  catch(e){setMessage(e instanceof Error?e.message:'Unable to save lyrics.')}
 }
 const lyricTime=effectiveLyricTime(time,offset,delay);
 let idx=-1;for(let i=0;i<lines.length;i++){if(lines[i].time<=lyricTime)idx=i;else break}
 const current=lines[idx],next=lines[idx+1];
 const rom=romanLines[idx]?.text||'Romanized text unavailable';
 const selected=sections.filter(s=>s.start<=lyricTime).at(-1)||null;
 return <section className="local-player lyrics-panel">
  <div className="player-heading"><div className="heading-left"><span className="heading-icon">文</span><div><b>LYRICS & SCENE DIRECTOR</b><small>Original / Romanized · contextual cinematic sections</small></div></div><button className="upload-button" onClick={()=>setShow(v=>!v)}>{show?'Hide editor':'Edit / import lyrics'}</button></div>
  <div className="lyric-display">
   {current?<>{mode!=='romanized'&&<p>{current.text}</p>}{mode!=='original'&&(mode==='romanized'||rom.trim()!==current.text.trim())&&<p className="romanized">{rom}</p>}</>:
    <p>{plain?'Untimed lyrics loaded — add LRC timestamps for synchronization.':lines.length?'Waiting for the first lyric timestamp…':'No lyrics yet. Search by filename or import a permitted LRC file.'}</p>}
   {next&&<small>UP NEXT · {next.text}</small>}
  </div>
  <div className="lyrics-tools">
   <label>Lyrics display<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="original">Original</option><option value="romanized">Romanized</option><option value="both">Both</option></select></label>
   <label>Visual genre preset<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Auto / unknown</option>{['Ambient','Cinematic','Pop','EDM','Rock','Hip-hop','Ballad','Classical'].map(g=><option key={g}>{g}</option>)}</select></label>
   <label>File timestamp offset (sec)<input type="number" step=".1" min="-30" max="30" value={offset} onChange={e=>setOffset(Number(e.target.value)||0)}/></label>
   <div className="lyric-delay-tool">
    <div><strong>LYRICS DELAY</strong><small>Positive = show words later · independent of LRC offset</small></div>
    <div className="lyric-delay-actions">
     <button type="button" aria-label="Advance lyrics 0.25 seconds" onClick={()=>onDelayChange(clampLyricDelay(delay-.25))}>−</button>
     <label><span>Delay (seconds)</span><input aria-label="Lyrics delay seconds" type="number" step=".05" min="-30" max="30" value={delay} onChange={e=>onDelayChange(clampLyricDelay(Number(e.target.value)))}/></label>
     <button type="button" aria-label="Delay lyrics 0.25 seconds" onClick={()=>onDelayChange(clampLyricDelay(delay+.25))}>+</button>
     <button type="button" className="lyric-delay-reset" onClick={()=>onDelayChange(0)}>Reset</button>
    </div>
    <small className="lyric-delay-feedback">Current delay: {formatLyricDelay(delay)}. {delay>0?'Lyrics display later.':delay<0?'Lyrics display earlier.':'Original display timing.'} File offset: {offset.toFixed(2)}s.</small>
   </div>
   <span>{lines.length} timed lines · {language} · {trackLoaded?'Playback clock synchronized':'Choose a song or audio file'}</span>
  </div>
  <div className="scene-summary"><strong>SCENE ANALYSIS</strong>
   <span>{selected?selected.mood.toUpperCase()+' · '+selected.motion+' · '+selected.camera+' camera · '+Math.round(selected.confidence*100)+'% confidence':'No timed lyric scene yet — audio-reactive fallback'}</span>
   <small>{sections.length} grouped section(s) · section-based transitions · not one scene per word</small>
  </div>
  {storyboard.length>0&&<div className="storyboard">
   <div className="storyboard-title"><strong>SONG STORYBOARD</strong><span>{storyboard.length} planned scene(s) · timeline-driven · automatic anti-repetition</span></div>
   <div className="storyboard-track">{storyboard.map((item,i)=><div className="storyboard-item" key={item.start+'-'+i} style={{borderTopColor:byId[item.id].accent}}>
     <span className="storyboard-time">{Math.floor(item.start/60)}:{String(Math.floor(item.start%60)).padStart(2,'0')} – {Math.floor(item.end/60)}:{String(Math.floor(item.end%60)).padStart(2,'0')}</span>
     <strong>{byId[item.id].label}</strong>
     <span>{byId[item.id].family} · {item.font}</span>
     <small>{item.transition} · {item.camera} camera · variation {item.variation+1}</small>
    </div>)}</div>
   <p className="player-footnote">This is a planned visual treatment generated from your lyrics and selected genre. Scene timing follows supplied lyric sections; musical beat analysis adds motion but does not guarantee accurate vocal alignment.</p>
  </div>}
  {show&&<div className="lyrics-editor">
   <label>Original lyrics / LRC<textarea rows={7} value={raw} onChange={e=>updateRaw(e.target.value)} placeholder="[00:12.50]Your permitted lyric line&#10;[00:15.20]Next line"/></label>
   <label>Romanization (editable, not translation)<textarea rows={7} value={roman} onChange={e=>{setRoman(e.target.value);setCorrected(true)}} placeholder="Auto-generated or corrected Romanized lyrics"/></label>
   <div className="editor-actions"><input className="visually-hidden" ref={fileRef} type="file" accept=".lrc,.txt,text/plain" aria-label="Import LRC file" onChange={()=>void importLocal()}/>
    <button className="upload-button" onClick={()=>fileRef.current?.click()}>Import LRC</button>
    <button className="upload-button" onClick={()=>{updateRaw(SAMPLE);setSource('Original sample')}}>Load original sample</button>
    <button className="upload-button" onClick={autoGenerate}>Romanize locally</button>
    <button className="player-remove" onClick={()=>{setRaw('');setRoman('');setPlain('');setSource('Manual')}}>Clear</button>
   </div>
   <label className="rights-check"><input type="checkbox" checked={autoRoman} onChange={e=>setAutoRoman(e.target.checked)}/>Automatically Romanize new input (results are approximate)</label>
   <label className="rights-check"><input type="checkbox" checked={saveRights} onChange={e=>setSaveRights(e.target.checked)}/>I have permission to store this lyric text in my local browser library.</label>
   <div className="editor-actions"><button className="upload-button" disabled={!saveRights||!raw} onClick={save}>Save permitted lyrics to my library</button></div>
  </div>}
  {plain&&!lines.length&&<div className="plain-lyrics-fallback"><textarea rows={5} readOnly value={plain} aria-label="Untimed lyrics" className="plain-preview"/><button className="upload-button" onClick={estimatePlain}>Create approximate timestamps</button><small>Estimated distribution across the local track duration; not synchronized to vocals.</small></div>}
  {sourceUrl&&<p className="player-footnote">Source: <a href={sourceUrl} target="_blank" rel="noreferrer">{source} ↗</a> · not cached automatically</p>}
  {message&&<p role="status" className="player-footnote">{message}</p>}
  <p className="player-footnote">Original text is preserved. Local transliteration is approximate and editable. Without genuine word timings, highlighted word positions are estimates, not verified vocal alignment.</p>
 </section>;
}
