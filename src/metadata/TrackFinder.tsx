import type {LyricsSourceReference, LyricsSelection} from '../firebase/correctionModel';
import {useEffect,useRef,useState} from 'react';
import type {TrackInfo, TrackCandidate} from '../metadata/trackInfo';
import {lrclibProvider,retrievePermittedLyrics,resolveStashLyricsChain} from '../lyrics/providers';
import {findUserLyrics,type LibraryEntry} from '../lyrics/userLibrary';
import {fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';
import {
 LYRIC_ENGINE_OPTIONS,
 cleanYouTubeTitleForLyrics,
 type LyricEngineOption,
 type YouTubeSubtitleTrackItem
} from '../lyrics/lyricFlowEngine';

export default function TrackFinder({
 track,
 preferredSelection,
 preferredSourceFile,
 onSelectionChange,
 savedCustomLrc,
 customEditOpen,
 lyricEngineOption='lyricflow',
 onLyricEngineOptionChange,
 selectedSubtitleTrackId,
 onSelectSubtitleTrackId,
 onAvailableLyricEnginesChange,
 onSubtitleTracksChange,
 leadingNonMusicOffsetSec=0,
 onMetadataChange,
 onLyricsFound,
 onStatusChange
}:{
 track:TrackInfo|null;
 preferredSelection?:LyricsSelection|null;
 preferredSourceFile?:LyricsSourceReference|null;
 onSelectionChange?:(selection:LyricsSelection)=>void;
 savedCustomLrc?:string;
 customEditOpen?:boolean;
 lyricEngineOption?:LyricEngineOption;
 onLyricEngineOptionChange?:(next:LyricEngineOption)=>void;
 selectedSubtitleTrackId?:string;
 onSelectSubtitleTrackId?:(id:string)=>void;
 onAvailableLyricEnginesChange?:(engines:LyricEngineOption[])=>void;
 onSubtitleTracksChange?:(tracks:YouTubeSubtitleTrackItem[])=>void;
 leadingNonMusicOffsetSec?:number;
 onMetadataChange:(next:TrackInfo)=>void;
 onLyricsFound:(source:{original:string;romanized:string;source:string;sourceUrl?:string;plain?:string;hasWordSync?:boolean})=>void;
 onStatusChange?:(status:string)=>void;
}){
 const [candidates,setCandidates]=useState<TrackCandidate[]>([]);
 const [availableEngines,setAvailableEngines]=useState<LyricEngineOption[]>([]);
 const [subtitleTracks,setSubtitleTracks]=useState<YouTubeSubtitleTrackItem[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const latestLyrics=useRef(onLyricsFound);latestLyrics.current=onLyricsFound;
 const latestStatus=useRef(onStatusChange);latestStatus.current=onStatusChange;
 const latestAvailableEngines=useRef(onAvailableLyricEnginesChange);latestAvailableEngines.current=onAvailableLyricEnginesChange;
 const latestSubtitleTracks=useRef(onSubtitleTracksChange);latestSubtitleTracks.current=onSubtitleTracksChange;
 const latestEngineChange=useRef(onLyricEngineOptionChange);latestEngineChange.current=onLyricEngineOptionChange;
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

 const key=track?[track.title,track.artist,Math.round(track.duration),track.videoId||''].join('|'):'';

 // Automatic lyrics lookup across the 4 selectable Lyrics Engine options:
 // 1. lyricflow ("LyricFlow Engine"): Hybrid YouTube Subtitles + Apple Library word-sync (with fallback to YT Subtitles or LRC Library)
 // 2. apple ("Apple Library"): Direct Apple Music word-synced TTML/syllable library
 // 3. lrclib ("LRC Library"): Direct LRCLIB timed LRC library
 // 4. youtube ("YouTube Subtitles"): Creator-uploaded YouTube video closed captions
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
  if(saved.length>=1&&!preferredSelection){
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

  const engineLabel=LYRIC_ENGINE_OPTIONS.find(o=>o.id===lyricEngineOption)?.label||'LyricFlow Engine';
  const cleanedYtTitle=track.videoId?cleanYouTubeTitleForLyrics(track.videoTitle||track.title,track.artist):track.title;

  const timer=setTimeout(()=>{
   updateStatus(
    track.videoId
     ?`[${engineLabel}] Searching lyrics for "${cleanedYtTitle}" (artist/album skipped for YouTube)…`
     :`[${engineLabel}] Searching synced lyrics for "${track.title}"…`
   );
   const selectedId=preferredSelection?.lrclibId;
   const resolvePreferred=async()=>{
    if(selectedId){
     const lyric=await retrievePermittedLyrics({id:selectedId,title:track.title,artist:track.artist,album:track.album,duration:track.duration,instrumental:false,hasSynced:true,hasWordSync:false,url:`https://lrclib.net/api/get/${selectedId}`,confidence:1},controller.signal);
     if(!lyric.synced&&!lyric.plain)throw new Error('Saved lyrics selection is unavailable. Use default lyrics selection or choose another match.');
     return {original:lyric.synced,romanized:'',plain:lyric.plain,source:lyric.source,sourceUrl:lyric.sourceUrl,hasWordSync:lyric.synced.includes('<'),candidates:[],availableEngines:['lrclib' as LyricEngineOption],subtitleTracks:[] as YouTubeSubtitleTrackItem[]};
    }
    return resolveStashLyricsChain(track,controller.signal,lyricEngineOption,leadingNonMusicOffsetSec,selectedSubtitleTrackId);
   };
   void resolvePreferred(
   )
    .then(resolved=>{
     if(controller.signal.aborted)return;
     if(resolved){
      if(preferredSourceFile?.url && resolved.sourceUrl !== preferredSourceFile.url){ updateStatus('The saved lyrics source file is unavailable. Select another source explicitly.'); return; }
      const nextEngines=resolved.availableEngines||['lyricflow'];
      const nextSubTracks=resolved.subtitleTracks||[];
      setAvailableEngines(nextEngines);
      setSubtitleTracks(nextSubTracks);
      latestAvailableEngines.current?.(nextEngines);
      latestSubtitleTracks.current?.(nextSubTracks);
      if(nextEngines.length>0&&!nextEngines.includes(lyricEngineOption)){
       latestEngineChange.current?.(nextEngines[0]);
      }
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
        ?`${resolved.source} — word-by-word sync active.`
        :`${resolved.source} — line-by-line sync active.`
      );
     }else{
      setAvailableEngines([]);
      setSubtitleTracks([]);
      latestAvailableEngines.current?.([]);
      latestSubtitleTracks.current?.([]);
      updateStatus(`No automatic lyrics found via ${engineLabel}. Click "Custom Edit / Change Lyrics" to paste or choose lyrics.`);
     }
    })
    .catch(error=>{
     if(!controller.signal.aborted){
      updateStatus(error instanceof Error?error.message:'Automatic lyrics lookup unavailable.');
     }
    });
  },180);

  return()=>{
   clearTimeout(timer);
   controller.abort();
  };
 },[key,savedCustomLrc,lyricEngineOption,selectedSubtitleTrackId,preferredSelection?.lrclibId,preferredSourceFile?.url,Math.round(leadingNonMusicOffsetSec)]);

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
     romanized:apple.romanizedLrc||'',
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
   onSelectionChange?.({engine:'lrclib',lrclibId:c.id,subtitleTrackId:null});
   updateStatus(lyric.synced?'Alternative timed lyrics loaded.':'Plain lyrics loaded — click "Create approximate timestamps" below.');
  }catch(e){
   if(!controller.signal.aborted)updateStatus(e instanceof Error?e.message:'Unable to load lyrics.');
  }finally{
   if(pending.current===controller)setBusy(false);
  }
 }

 if(!customEditOpen)return null;

 const visibleEngineOptions=availableEngines.length>0
  ?LYRIC_ENGINE_OPTIONS.filter(opt=>availableEngines.includes(opt.id))
  :[];

 return <section className="local-player track-finder" aria-label="Track identification and lyrics override">
  <div className="player-heading">
   <div className="heading-left">
    <span className="heading-icon">⌕</span>
    <div>
     <b>CHANGE LYRICS MATCH ({visibleEngineOptions.length>0?`${visibleEngineOptions.length} AVAILABLE`:'OVERRIDE'})</b>
     <small>Choose between available lyrics engines or select an alternative candidate</small>
    </div>
   </div>
   <span className="local-badge">ALTERNATIVE MATCHER</span>
  </div>
  {!track?<p className="player-footnote">Load a local audio file or play a song from the Built-in Online Player first.</p>:<>
   {onLyricEngineOptionChange&&visibleEngineOptions.length>0&&<div style={{marginBottom:12,padding:'10px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)'}}>
    <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'#94a3b8',marginBottom:8}}>AVAILABLE LYRICS ENGINE SOURCES</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8}}>
     {visibleEngineOptions.map(opt=>(
      <button
       key={opt.id}
       type="button"
       onClick={()=>{onSelectionChange?.({engine:opt.id,lrclibId:null,subtitleTrackId:null});onLyricEngineOptionChange(opt.id);}}
       style={{
        textAlign:'left',
        padding:'8px 10px',
        borderRadius:6,
        border:lyricEngineOption===opt.id?'1px solid #38bdf8':'1px solid rgba(255,255,255,0.1)',
        background:lyricEngineOption===opt.id?'rgba(56,189,248,0.16)':'rgba(255,255,255,0.03)',
        color:'#f8fafc',
        cursor:'pointer'
       }}
      >
       <div style={{fontSize:12,fontWeight:700}}>{opt.label} <span style={{fontSize:10,opacity:0.75}}>({opt.badge})</span></div>
       <div style={{fontSize:10,color:'#cbd5e1',marginTop:2,lineHeight:1.3}}>{opt.description}</div>
      </button>
     ))}
    </div>
    {subtitleTracks.length>1&&onSelectSubtitleTrackId&&<div style={{marginTop:10,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
     <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.06em',color:'#94a3b8',marginBottom:6}}>
      CREATOR-UPLOADED YOUTUBE SUBTITLE TRACKS ({subtitleTracks.length}):
     </div>
     <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
      {subtitleTracks.map(st=>{
       const activeSt=(selectedSubtitleTrackId||subtitleTracks[0]?.id)===st.id;
       return (
        <button
         key={st.id}
         type="button"
         onClick={()=>onSelectSubtitleTrackId(st.id)}
         style={{
          padding:'4px 9px',
          borderRadius:5,
          fontSize:11,
          fontWeight:activeSt?700:500,
          border:activeSt?'1px solid #38bdf8':'1px solid rgba(255,255,255,0.12)',
          background:activeSt?'rgba(56,189,248,0.18)':'rgba(255,255,255,0.04)',
          color:activeSt?'#e0f2fe':'#cbd5e1',
          cursor:'pointer'
         }}
        >
         {st.label} ({st.lineCount} lines)
        </button>
       );
      })}
     </div>
    </div>}
   </div>}
   <div className="track-form">
    <label>Song title<input value={track.title} onChange={e=>onMetadataChange({...track,title:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Artist<input value={track.artist} placeholder="Enter artist" onChange={e=>onMetadataChange({...track,artist:e.target.value,source:'manual',confidence:1})}/></label>
    <label>Album / version<input value={track.album} placeholder="Optional" onChange={e=>onMetadataChange({...track,album:e.target.value,source:'manual',confidence:1})}/></label>
   </div>
   <div className="track-search-row">
    <span>
     Metadata source: {track.source} · {track.duration?Math.round(track.duration)+'s':''}
     {track.videoId?` · Cleaned YT Query: "${cleanYouTubeTitleForLyrics(track.videoTitle||track.title,track.artist)}"`:''}
    </span>
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

