import type {LyricsSourceReference, LyricsSelection} from '../firebase/correctionModel';
import {useEffect,useRef,useState} from 'react';
import {
 hasValidLrcTimestamps,
 isAdvertisementTrack,
 isYouTubeAudioTrack,
 normalizeTrackForLyricsLookup,
 type TrackInfo,
 type TrackCandidate
} from '../metadata/trackInfo';
import {afterCurrentLyricLine} from '../lyrics/lyricHandoff';
import {lrclibProvider,retrievePermittedLyrics,resolveStashLyricsChain,type StashResolvedLyrics} from '../lyrics/providers';
import {findUserLyrics,type LibraryEntry} from '../lyrics/userLibrary';
import {fetchAppleMusicCandidates,fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';
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
 const [manualTitle,setManualTitle]=useState(()=>track?.title||'');
 const [manualArtist,setManualArtist]=useState(()=>track?.artist||'');
 const [manualAlbum,setManualAlbum]=useState(()=>track?.album||'');
 const [overrideBracketFilter,setOverrideBracketFilter]=useState(true);
 const [autoSearchedSummary,setAutoSearchedSummary]=useState<{title:string;artist:string;album:string;isYt:boolean}>({
  title:'',
  artist:'',
  album:'',
  isYt:false
 });

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

 // Stable song identity for automatic search so typing in Manual Search inputs does not re-trigger auto-search or close the Android keyboard
 const autoTrackKey=track
  ?track.source==='manual'
   ?''
   :[track.title,track.artist,Math.round(track.duration),track.videoId||'',track.sourceTrackId||'',track.isAd?'ad':''].join('|')
  :'';

 // Pre-fill the manual search box with what was searched automatically before whenever a new automatic song loads
 useEffect(()=>{
  if(!track||track.source==='manual')return;
  const isYt=isYouTubeAudioTrack(track);
  const autoNorm=normalizeTrackForLyricsLookup(track,false);
  const searchedTitle=isYt
   ?cleanYouTubeTitleForLyrics(track.videoTitle||track.title,track.artist)
   :autoNorm.title||track.title;
  const searchedArtist=isYt?'':autoNorm.artist||track.artist;
  const searchedAlbum=isYt?'':autoNorm.album||track.album;

  setAutoSearchedSummary({
   title:searchedTitle,
   artist:searchedArtist,
   album:searchedAlbum,
   isYt
  });
  setManualTitle(searchedTitle||track.title);
  setManualArtist(track.artist||'');
  setManualAlbum(track.album||'');
 },[autoTrackKey]);

 // Automatic lyrics lookup across the 4 selectable Lyrics Engine options
 useEffect(()=>{
  if(!track||track.source==='manual'||track.title.trim().length<2)return;
  if(isAdvertisementTrack(track)){
   automaticRequest.current?.abort();
   pending.current?.abort();
   setCandidates([]);
   setAvailableEngines([]);
   setSubtitleTracks([]);
   latestAvailableEngines.current?.([]);
   latestSubtitleTracks.current?.([]);
   updateStatus('Advertisement playing — showing built-in themes (lyrics & video search paused).');
   return;
  }
  if(savedCustomLrc&&savedCustomLrc.trim()){
   const hasTimed=hasValidLrcTimestamps(savedCustomLrc);
   latestLyrics.current({
    original:hasTimed?savedCustomLrc:'',
    plain:hasTimed?undefined:savedCustomLrc,
    romanized:'',
    source:'Saved Custom Override',
    hasWordSync:hasTimed&&savedCustomLrc.includes('<')
   });
   updateStatus('Loaded your saved custom lyrics for this track.');
   return;
  }

  const saved=findUserLyrics(track).filter(
   entry=>entry.original&&entry.title.toLowerCase()===track.title.toLowerCase()
  );
  if(saved.length>=1&&!preferredSelection){
   const hasTimed=hasValidLrcTimestamps(saved[0].original);
   latestLyrics.current({
    original:hasTimed?saved[0].original:'',
    plain:hasTimed?undefined:saved[0].original,
    romanized:saved[0].romanized,
    source:'Saved Library',
    hasWordSync:hasTimed&&saved[0].original.includes('<')
   });
   updateStatus('Synchronized from your saved lyrics library.');
   return;
  }

  const controller=new AbortController();
  automaticRequest.current?.abort();
  automaticRequest.current=controller;

  const engineLabel=LYRIC_ENGINE_OPTIONS.find(o=>o.id===lyricEngineOption)?.label||'LyricFlow Engine';
  const cleanedYtTitle=track.videoId?cleanYouTubeTitleForLyrics(track.videoTitle||track.title,track.artist):track.title;

  let appliedSignature='',pendingSignature='';
  let cancelHandoff:(()=>void)|undefined;
  const applyResolved=(resolved:StashResolvedLyrics|null)=>{
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
      const hasTimedLines=hasValidLrcTimestamps(resolved.original);
      const payload={
       original:hasTimedLines?resolved.original:'',
       romanized:hasTimedLines?resolved.romanized:'',
       plain:resolved.plain||(!hasTimedLines&&resolved.original?resolved.original:undefined),
       source:resolved.source,
       sourceUrl:resolved.sourceUrl,
       hasWordSync:hasTimedLines&&resolved.hasWordSync
      };
      const signature=JSON.stringify(payload);
      if(signature===appliedSignature||signature===pendingSignature)return;
      cancelHandoff?.();
      pendingSignature=signature;
      const commit=()=>{
       if(controller.signal.aborted)return;
       appliedSignature=signature;pendingSignature='';
       latestLyrics.current(payload);
      updateStatus(
       hasTimedLines&&resolved.hasWordSync
        ?`${resolved.source} — word-by-word sync active.`
        :hasTimedLines
        ?`${resolved.source} — line-by-line sync active.`
        :`${resolved.source} — plain lyrics loaded (no line timestamps available).`
      );
      };
      if(lyricEngineOption==='lyricflow'&&appliedSignature){
       updateStatus('Preferred lyrics ready · switching after the current line finishes…');
       cancelHandoff=afterCurrentLyricLine(commit,controller.signal);
      }else commit();

     }else if(!appliedSignature){
      setAvailableEngines([]);
      setSubtitleTracks([]);
      latestAvailableEngines.current?.([]);
      latestSubtitleTracks.current?.([]);
      updateStatus(`No automatic lyrics found via ${engineLabel}. Click "Custom Edit / Change Lyrics" to paste or choose lyrics.`);
     }
  };

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
     return {original:lyric.synced,romanized:'',plain:lyric.plain,source:lyric.source,sourceUrl:lyric.sourceUrl,hasWordSync:Boolean(lyric.synced&&lyric.synced.includes('<')),candidates:[],availableEngines:['lrclib' as LyricEngineOption],subtitleTracks:[] as YouTubeSubtitleTrackItem[]};
    }
    return resolveStashLyricsChain(track,controller.signal,lyricEngineOption,leadingNonMusicOffsetSec,selectedSubtitleTrackId,applyResolved);
   };
   void resolvePreferred()
    .then(applyResolved)
    .catch(error=>{
     if(!controller.signal.aborted){
      updateStatus(error instanceof Error?error.message:'Automatic lyrics lookup unavailable.');
     }
    });
  },180);

  return()=>{
   clearTimeout(timer);
   cancelHandoff?.();
   controller.abort();
  };
 },[autoTrackKey,savedCustomLrc,lyricEngineOption,selectedSubtitleTrackId,preferredSelection?.lrclibId,preferredSourceFile?.url,Math.round(leadingNonMusicOffsetSec)]);

 const canSearch=Boolean(track&&manualTitle.trim().length>=2);

 useEffect(()=>{
  if(!autoTrackKey)return;
  pending.current?.abort();
  setBusy(false);
  setMatches(track?findUserLyrics(track):[]);
 },[autoTrackKey]);

 async function search(){
  if(!track||!canSearch)return;
  const searchTrack:TrackInfo={
   ...track,
   title:manualTitle.trim(),
   videoTitle:manualTitle.trim(),
   artist:manualArtist.trim(),
   album:manualAlbum.trim(),
   source:'manual',
   confidence:1
  };
  onMetadataChange(searchTrack);
  setBusy(true);
  updateStatus(
   overrideBracketFilter
    ?`Searching Apple Library & LRCLIB with exact query "${searchTrack.title}" (bracket filter overridden)…`
    :`Searching Apple Library & LRCLIB for "${searchTrack.title}"…`
  );
  setCandidates([]);
  automaticRequest.current?.abort();
  pending.current?.abort();
  const controller=new AbortController();
  pending.current=controller;
  try{
   const [appleDirect,appleCands,lrcCands]=await Promise.all([
    fetchAppleMusicWordSyncedLyrics(searchTrack,controller.signal,'apple',overrideBracketFilter).catch(()=>null),
    fetchAppleMusicCandidates(searchTrack,controller.signal,overrideBracketFilter).catch(()=>[]),
    lrclibProvider.search(searchTrack,controller.signal,overrideBracketFilter).catch(()=>[])
   ]);
   if(controller.signal.aborted)return;
   const combinedCandidates=[...appleCands,...lrcCands];
   setCandidates(combinedCandidates);
   if(appleDirect&&(appleDirect.lrc||appleDirect.plain)){
    const hasTimed=hasValidLrcTimestamps(appleDirect.lrc);
    onLyricsFound({
     original:hasTimed?appleDirect.lrc:'',
     plain:appleDirect.plain||(!hasTimed&&appleDirect.lrc?appleDirect.lrc:undefined),
     romanized:hasTimed?(appleDirect.romanizedLrc||''):'',
     source:appleDirect.source,
     sourceUrl:appleDirect.sourceUrl,
     hasWordSync:hasTimed&&appleDirect.hasWordSync
    });
    updateStatus(
     `Loaded ${appleDirect.source} (${hasTimed?(appleDirect.hasWordSync?'Word timestamps':'Line timestamps'):'Plain lyrics'}). ${combinedCandidates.length} Apple Library & LRCLIB candidate(s) listed below.`
    );
   }else if(appleCands.length>0&&appleCands[0].syncedLyrics){
    const topApple=appleCands[0];
    onLyricsFound({
     original:topApple.syncedLyrics!,
     romanized:'',
     source:topApple.hasWordSync?'Apple Library · Word-Synced TTML':'Apple Library · Synced',
     sourceUrl:topApple.url,
     hasWordSync:Boolean(topApple.hasWordSync)
    });
    updateStatus(`Loaded Apple Library lyrics for "${topApple.title}". ${combinedCandidates.length} candidate(s) listed below.`);
   }else{
    updateStatus(
     combinedCandidates.length
      ?`${combinedCandidates.length} candidate(s) found across Apple Library & LRCLIB. Select a version below.`
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
   const hasTimed=hasValidLrcTimestamps(lyric.synced);
   onLyricsFound({
    original:hasTimed?lyric.synced:'',
    romanized:'',
    plain:lyric.plain||(!hasTimed&&lyric.synced?lyric.synced:undefined),
    source:lyric.source,
    sourceUrl:lyric.sourceUrl,
    hasWordSync:hasTimed&&lyric.synced.includes('<')
   });
   onSelectionChange?.({
    engine:c.provider==='apple'?'apple':'lrclib',
    lrclibId:c.provider==='apple'?null:c.id,
    subtitleTrackId:null
   });
   updateStatus(
    hasTimed
     ?`Loaded ${lyric.source} (${lyric.synced.includes('<')?'Word timestamps':'Line timestamps'}).`
     :'Plain lyrics loaded (no line timestamps available) — click "Create approximate timestamps" below.'
   );
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
     <small>Choose between available lyrics engines or manually search Apple Library &amp; LRCLIB</small>
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

   {autoSearchedSummary.title&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:8,background:'rgba(56,189,248,0.08)',border:'1px solid rgba(56,189,248,0.22)',fontSize:12,color:'#e2e8f0'}}>
    <strong>Automatically searched before:</strong>{' '}
    <code>"{autoSearchedSummary.title}"</code>
    {autoSearchedSummary.artist?<> · Artist: <code>"{autoSearchedSummary.artist}"</code></>:autoSearchedSummary.isYt?' (artist & album skipped for YouTube automatic search)':''}
    {autoSearchedSummary.album?<> · Album: <code>"{autoSearchedSummary.album}"</code></>:''}
   </div>}

   <div className="track-form">
    <label>Song title
     <input
      type="text"
      inputMode="text"
      autoComplete="off"
      value={manualTitle}
      onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')void search();}}
      onChange={e=>setManualTitle(e.target.value)}
     />
    </label>
    <label>Artist
     <input
      type="text"
      inputMode="text"
      autoComplete="off"
      value={manualArtist}
      placeholder="Enter artist"
      onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')void search();}}
      onChange={e=>setManualArtist(e.target.value)}
     />
    </label>
    <label>Album / version
     <input
      type="text"
      inputMode="text"
      autoComplete="off"
      value={manualAlbum}
      placeholder="Optional"
      onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')void search();}}
      onChange={e=>setManualAlbum(e.target.value)}
     />
    </label>
   </div>
   <div style={{margin:'6px 0 10px',display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#cbd5e1'}}>
    <label style={{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer'}}>
     <input
      type="checkbox"
      checked={overrideBracketFilter}
      onChange={e=>setOverrideBracketFilter(e.target.checked)}
     />
     Override bracket/tag filter in manual search (keep brackets &amp; exact text)
    </label>
   </div>
   <div className="track-search-row">
    <span>
     Metadata source: {track.source} · {track.duration?Math.round(track.duration)+'s':''}
     {autoSearchedSummary.title?` · Auto Query: "${autoSearchedSummary.title}"`:''}
    </span>
    <button className="upload-button" disabled={busy||!canSearch} onClick={()=>void search()}>{busy?'Searching…':'Re-fetch Apple Music / LRCLIB Lyrics'}</button>
   </div>
   {matches.length>0&&<div className="library-match">
    <strong>Saved in your library</strong>
    {matches.map(e=><button key={e.id} onClick={()=>{automaticRequest.current?.abort();pending.current?.abort();const hasTimed=hasValidLrcTimestamps(e.original);onLyricsFound({original:hasTimed?e.original:'',plain:hasTimed?undefined:e.original,romanized:e.romanized,source:'My library',hasWordSync:hasTimed&&e.original.includes('<')});updateStatus('Loaded saved library lyrics.')}}>{e.title} — {e.artist||'Unknown artist'}</button>)}
   </div>}
   {candidates.length>0&&<div className="track-candidates">
    <div className="candidate-heading">Alternative recordings ({candidates.length}) <small>Apple Library &amp; LRCLIB results — choose if the auto-loaded lyrics do not match</small></div>
    {candidates.map(c=><div className="candidate" key={`${c.provider||'lrclib'}-${c.id}`}>
      <div>
       <strong>{c.title}</strong>
       <small>{c.artist} {c.album?'· '+c.album:''} · {Math.round(c.duration)}s · {Math.round(c.confidence*100)}% match</small>
       <small>
        {c.provider==='apple'?'[Apple Library] ':'[LRC Library] '}
        {c.instrumental?'Instrumental':c.hasWordSync?'Word timestamps':c.hasSynced?'Line timestamps':'Plain lyrics (no timestamps)'}
        {c.url?<> · <a href={c.url} target="_blank" rel="noreferrer">Source ↗</a></>:null}
       </small>
      </div>
      <button className="upload-button" disabled={busy||c.instrumental} onClick={()=>void selectCandidate(c)}>Use this version</button>
     </div>)}
   </div>}
   {message&&<p className="player-footnote" role="status">{message}</p>}
  </>}
 </section>;
}


