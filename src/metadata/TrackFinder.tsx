import {useEffect,useRef,useState} from 'react';
import type {TrackInfo, TrackCandidate} from '../metadata/trackInfo';
import {lrclibProvider,retrievePermittedLyrics,resolveStashLyricsChain} from '../lyrics/providers';
import {findUserLyrics,type LibraryEntry} from '../lyrics/userLibrary';
import {fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';

export default function TrackFinder({
 track,
 savedCustomLrc,
 customEditOpen,
 onMetadataChange,
 onLyricsFound,
 onStatusChange
}:{
 track:TrackInfo|null;
 savedCustomLrc?:string;
 customEditOpen?:boolean;
 onMetadataChange:(next:TrackInfo)=>void;
 onLyricsFound:(source:{original:string;romanized:string;source:string;sourceUrl?:string;plain?:string;hasWordSync?:boolean})=>void;
 onStatusChange?:(status:string)=>void;
}){
 const [candidates,setCandidates]=useState<TrackCandidate[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const latestLyrics=useRef(onLyricsFound);latestLyrics.current=onLyricsFound;
 const latestStatus=useRef(onStatusChange);latestStatus.current=onStatusChange;
 const [matches,setMatches]=useState<LibraryEntry[]>([]);
 const pending=useRef<AbortController|null>(null);
 const automaticRequest=useRef<AbortController|null>(null);

 const updateStatus=(msg:string)=>{
  setMessage(msg);
  latestStatus.current?.(msg);
 };

 useEffect(()=>()=>{
  pending.current?.abort();
  automaticRequest.current?.abort();
 },[]);

 const key=track?[track.title,track.artist,Math.round(track.duration)].join('|'):'';

 // Automatic Stash-inspired lyrics lookup:
 // 1. User saved custom lyrics for this song
 // 2. Local browser library exact match
 // 3. Apple Music Word-Synced TTML/Syllable library
 // 4. LRCLIB exact match & top ranked fallback
 useEffect(()=>{
  if(!track||track.title.trim().length<2)return;
  if(savedCustomLrc&&savedCustomLrc.trim()){
   latestLyrics.current({
    original:savedCustomLrc,
    romanized:'',
    source:'Saved Custom Override',
    hasWordSync:savedCustomLrc.includes('<')
   });
   updateStatus('Loaded your saved custom lyrics for this track.');
   return;
  }

  const saved=findUserLyrics(track).filter(
   entry=>entry.original&&entry.title.toLowerCase()===track.title.toLowerCase()
  );
  if(saved.length>=1){
   latestLyrics.current({
    original:saved[0].original,
    romanized:saved[0].romanized,
    source:'Saved Library',
    hasWordSync:saved[0].original.includes('<')
   });
   updateStatus('Synchronized from your saved lyrics library.');
   return;
  }

  const controller=new AbortController();
  automaticRequest.current?.abort();
  automaticRequest.current=controller;

  const timer=setTimeout(()=>{
   updateStatus('Searching Apple Music word-synced lyrics & LRCLIB…');
   void resolveStashLyricsChain(track,controller.signal)
    .then(resolved=>{
     if(controller.signal.aborted)return;
     if(resolved){
      setCandidates(resolved.candidates);
      latestLyrics.current({
       original:resolved.original,
       romanized:resolved.romanized,
       plain:resolved.plain,
       source:resolved.source,
       sourceUrl:resolved.sourceUrl,
       hasWordSync:resolved.hasWordSync
      });
      updateStatus(
       resolved.hasWordSync
        ?'Apple Music / enhanced word-by-word sync active.'
        :'Timed line lyrics matched automatically.'
      );
     }else{
      updateStatus('No automatic lyrics found. Click "Custom Edit / Change Lyrics" to search or paste lyrics.');
     }
    })
    .catch(error=>{
     if(!controller.signal.aborted){
      updateStatus(error instanceof Error?error.message:'Automatic lyrics lookup unavailable.');
     }
    });
  },220);

  return()=>{
   clearTimeout(timer);
   controller.abort();
  };
 },[key,savedCustomLrc]);

 const canSearch=Boolean(track&&track.title.trim().length>=2);

 useEffect(()=>{
  pending.current?.abort();
  setBusy(false);
  setMatches(track?findUserLyrics(track):[]);
 },[key]);

 async function search(){
  if(!track||!canSearch)return;
  setBusy(true);
  updateStatus('Searching Apple Music word-sync & LRCLIB candidates…');
  setCandidates([]);
  automaticRequest.current?.abort();
  pending.current?.abort();
  const controller=new AbortController();
  pending.current=controller;
  try{
   const [apple,found]=await Promise.all([
    fetchAppleMusicWordSyncedLyrics(track,controller.signal).catch(()=>null),
    lrclibProvider.search(track,controller.signal).catch(()=>[])
   ]);
   if(controller.signal.aborted)return;
   setCandidates(found);
   if(apple&&apple.lrc){
    onLyricsFound({
     original:apple.lrc,
     romanized:'',
     source:apple.source,
     sourceUrl:apple.sourceUrl,
     hasWordSync:apple.hasWordSync
    });
    updateStatus(`Loaded ${apple.source}. ${found.length} alternative LRCLIB candidate(s) listed below.`);
   }else{
    updateStatus(
     found.length
      ?`${found.length} candidate(s) found. Select a version below if the default lyrics did not match.`
      :'No matching candidates found; paste custom LRC in the editor below.'
    );
   }
  }catch(e){
   if(!controller.signal.aborted)updateStatus(e instanceof Error?e.message:'Lyrics search failed.');
  }finally{
   if(pending.current===controller)setBusy(false);
  }
 }

 async function selectCandidate(c:TrackCandidate){
  automaticRequest.current?.abort();
  pending.current?.abort();
  const controller=new AbortController();
  pending.current=controller;
  setBusy(true);
  updateStatus('Loading selected lyrics version…');
  try{
   const lyric=await retrievePermittedLyrics(c,controller.signal);
   if(controller.signal.aborted)return;
   if(!lyric.synced&&!lyric.plain){
    updateStatus('The selected candidate has no lyric text.');
    return;
   }
   onLyricsFound({
    original:lyric.synced,
    romanized:'',
    plain:lyric.plain,
    source:lyric.source,
    sourceUrl:lyric.sourceUrl,
    hasWordSync:lyric.synced.includes('<')
   });
   updateStatus(lyric.synced?'Alternative timed lyrics loaded.':'Plain lyrics loaded — click "Create approximate timestamps" below.');
  }catch(e){
   if(!controller.signal.aborted)updateStatus(e instanceof Error?e.message:'Unable to load lyrics.');
  }finally{
   if(pending.current===controller)setBusy(false);
  }
 }

 if(!customEditOpen)return null;

 return <section className="local-player track-finder" aria-label="Track identification and lyrics override">
  <div className="player-heading">
   <div className="heading-left">
    <span className="heading-icon">⌕</span>
    <div>
     <b>CHANGE LYRICS MATCH (STASH APPLE MUSIC + LRCLIB)</b>
     <small>Adjust song title/artist or pick an alternative recording if automatic lyrics did not match</small>
    </div>
   </div>
   <span className="local-badge">ALTERNATIVE MATCHER</span>
  </div>
  {!track?<p className="player-footnote">Load a local audio file or play a song from the Built-in Online Player first.</p>:<>
   <div className="track-form">
    <label>Song title<input value={track.title} onChange={e=>onMetadataChange({...track,title:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Artist<input value={track.artist} placeholder="Enter artist" onChange={e=>onMetadataChange({...track,artist:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Album / version<input value={track.album} placeholder="Optional" onChange={e=>onMetadataChange({...track,album:e.target.value,source:'manual',confidence:1})}/></label>
   </div>
   <div className="track-search-row">
    <span>Metadata source: {track.source} · {track.duration?Math.round(track.duration)+'s':''}</span>
    <button className="upload-button" disabled={busy||!canSearch} onClick={()=>void search()}>{busy?'Searching…':'Re-fetch Apple Music / LRCLIB Lyrics'}</button>
   </div>
   {matches.length>0&&<div className="library-match">
    <strong>Saved in your library</strong>
    {matches.map(e=><button key={e.id} onClick={()=>{automaticRequest.current?.abort();pending.current?.abort();onLyricsFound({original:e.original,romanized:e.romanized,source:'My library',hasWordSync:e.original.includes('<')});updateStatus('Loaded saved library lyrics.')}}>{e.title} — {e.artist||'Unknown artist'}</button>)}
   </div>}
   {candidates.length>0&&<div className="track-candidates">
    <div className="candidate-heading">Alternative recordings ({candidates.length}) <small>Choose if the auto-loaded lyrics do not match your audio</small></div>
    {candidates.map(c=><div className="candidate" key={c.id}>
      <div>
       <strong>{c.title}</strong>
       <small>{c.artist} {c.album?'· '+c.album:''} · {Math.round(c.duration)}s · {Math.round(c.confidence*100)}% match</small>
       <small>{c.instrumental?'Instrumental':c.hasWordSync?'Word timestamps':'Line timestamps'} · <a href={c.url} target="_blank" rel="noreferrer">Source ↗</a></small>
      </div>
      <button className="upload-button" disabled={busy||c.instrumental} onClick={()=>void selectCandidate(c)}>Use this version</button>
     </div>)}
   </div>}
   {message&&<p className="player-footnote" role="status">{message}</p>}
  </>}
 </section>;
}
