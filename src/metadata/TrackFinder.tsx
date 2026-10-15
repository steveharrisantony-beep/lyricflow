import {useEffect,useMemo,useRef,useState} from 'react';
import type {TrackInfo, TrackCandidate} from '../metadata/trackInfo';
import {lrclibProvider,retrievePermittedLyrics,resolveAutomaticLyrics} from '../lyrics/providers';
import {findUserLyrics,type LibraryEntry} from '../lyrics/userLibrary';

export default function TrackFinder({track,onMetadataChange,onLyricsFound}:{
 track:TrackInfo|null;
 onMetadataChange:(next:TrackInfo)=>void;
 onLyricsFound:(source:{original:string;romanized:string;source:string;sourceUrl?:string;plain?:string})=>void;
}){
 const [candidates,setCandidates]=useState<TrackCandidate[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [rights,setRights]=useState(false);
 const [automatic,setAutomatic]=useState(false);
 const latestLyrics=useRef(onLyricsFound);latestLyrics.current=onLyricsFound;
 const [matches,setMatches]=useState<LibraryEntry[]>([]);
 const pending=useRef<AbortController|null>(null);
 const automaticRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 const key=track?[track.title,track.artist,Math.round(track.duration)].join('|'):'';
 useEffect(()=>{
  if(!track||!automatic||!rights)return;
  const controller=new AbortController();automaticRequest.current=controller;
  const timer=setTimeout(()=>{
   const saved=findUserLyrics(track).filter(entry=>entry.original&&entry.duration>0&&Math.abs(entry.duration-track.duration)<=2&&entry.title===track.title&&entry.artist===track.artist);
   if(saved.length===1){latestLyrics.current({original:saved[0].original,romanized:saved[0].romanized,source:'My library'});setMessage('Saved permitted lyrics synchronized to playback.');return}
   setMessage('Matching timed lyrics to this recording…');
   void resolveAutomaticLyrics(track,controller.signal).then(lyrics=>{
    if(controller.signal.aborted)return;
    if(lyrics){latestLyrics.current(lyrics);setMessage('Timed lyrics matched automatically · following playback.');}
    else setMessage('No unique timed match. Use Search lyrics to choose a version, or import LRC; audio visuals continue.');
   }).catch(error=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Automatic lyrics unavailable.')});
  },500);
  return()=>{clearTimeout(timer);controller.abort()};
 },[key,automatic,rights]);
 const canSearch=Boolean(track&&track.title.trim().length>=2);
 useEffect(()=>{pending.current?.abort();setBusy(false);setCandidates([]);setMatches(track?findUserLyrics(track):[]);setMessage('')},[key]);
 async function search(){
  if(!track||!canSearch)return;
  setBusy(true);setMessage('Searching track candidates…');setCandidates([]);automaticRequest.current?.abort();
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  try{
   const found=await lrclibProvider.search(track,controller.signal);
   if(controller.signal.aborted)return;
   setCandidates(found);setMessage(found.length?found.length+' candidate(s) found. Confirm the correct version.':'No reliable match found; use the manual LRC editor.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Lyrics search failed. Manual lyrics still work.')}
  finally{if(pending.current===controller)setBusy(false)}
 }
 useEffect(()=>{
  if(!canSearch||!track||automatic&&rights)return;
  const id=setTimeout(()=>void search(),800);
  return()=>{clearTimeout(id);pending.current?.abort()};
 // Manual searches use the same parser, but each filename triggers only once.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,automatic,rights]);
 const selected=useMemo(()=>candidates[0]||null,[candidates]);
 async function selectCandidate(c:TrackCandidate){
  if(!rights){setMessage('Confirm permission to reproduce these lyrics first.');return}
  automaticRequest.current?.abort();
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  setBusy(true);setMessage('Retrieving selected lyrics in memory only…');
  try{
   const lyric=await retrievePermittedLyrics(c,controller.signal);
   if(controller.signal.aborted)return;
   if(!lyric.synced&&!lyric.plain){setMessage('The candidate has no lyric text.');return}
   onLyricsFound({original:lyric.synced,romanized:'',plain:lyric.plain,source:lyric.source,sourceUrl:lyric.sourceUrl});
   setMessage(lyric.synced?'Timed lyrics loaded for this session.':'Only plain lyrics available. Add timestamps manually to synchronize.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to load lyrics.')}
  finally{if(pending.current===controller)setBusy(false)}
 }
 return <section className="local-player track-finder" aria-label="Track identification and lyrics discovery">
  <div className="player-heading"><div className="heading-left"><span className="heading-icon">⌕</span><div><b>FIND LYRICS</b><small>Recording match → playback clock → synchronized lyrics</small></div></div><span className="local-badge">VERSION CHECK</span></div>
  {!track?<p className="player-footnote">Search a song from Audio Source, or choose a local audio file. Lyrics follow the selected recording.</p>:<>
   <div className="track-form">
    <label>Song title<input value={track.title} onChange={e=>onMetadataChange({...track,title:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Artist<input value={track.artist} placeholder="Enter if missing" onChange={e=>onMetadataChange({...track,artist:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Album / version<input value={track.album} placeholder="Optional" onChange={e=>onMetadataChange({...track,album:e.target.value,source:'manual',confidence:1})}/></label>
   </div>
   <div className="track-search-row"><span>Metadata: {track.source==='filename'?'filename guess':track.source==='provider'?'selected music source':'manually corrected'} · {Math.round(track.confidence*100)}% initial confidence · {track.duration?Math.round(track.duration)+'s':''}</span><button className="upload-button" disabled={busy||!canSearch} onClick={()=>void search()}>{busy?'Searching…':'Search lyrics'}</button></div>
   {matches.length>0&&<div className="library-match"><strong>Saved in your library</strong>{matches.map(e=><button key={e.id} onClick={()=>{automaticRequest.current?.abort();pending.current?.abort();onLyricsFound({original:e.original,romanized:e.romanized,source:'My library'});setMessage('Loaded saved permitted lyrics.')}}>{e.title} — {e.artist||'Unknown artist'} · Open saved entry</button>)}</div>}
   {candidates.length>0&&<div className="track-candidates">
    <div className="candidate-heading">Possible matches — choose the exact recording <small>Best match: {Math.round((selected?.confidence||0)*100)}%</small></div>
    {candidates.map(c=><div className="candidate" key={c.id}>
      <div><strong>{c.title}</strong><small>{c.artist} {c.album?'· '+c.album:''} · {Math.round(c.duration)}s · {Math.round(c.confidence*100)}% match</small><small>{c.instrumental?'Instrumental':c.hasWordSync?'Word timestamps listed':c.hasSynced?'Line timestamps listed':'Plain/unknown timing'} · <a href={c.url} target="_blank" rel="noreferrer">LRCLIB source ↗</a></small></div>
      <button className="upload-button" disabled={busy||!rights||c.instrumental} onClick={()=>void selectCandidate(c)}>Use match</button>
     </div>)}
   </div>}
   <label className="rights-check"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/><span>I confirm I have the necessary permission to retrieve and display the selected lyrics. Lyrics will not be automatically cached.</span></label>
   <label className="rights-check"><input type="checkbox" checked={automatic} disabled={!rights} onChange={e=>setAutomatic(e.target.checked)}/><span>Automatically load matching timed lyrics for songs I have permission to display (this session). Ambiguous recordings require selection.</span></label>
   {message&&<p className="player-footnote" role="status">{message}</p>}
   <p className="player-footnote">LRCLIB is an independent, public API. Search results are suggestions, not verified identities or proof of lyric rights. Automatic retrieval requires session permission and an exact title/artist with duration within five seconds. Lyrics are not automatically saved.</p>
  </>}
 </section>;
}
