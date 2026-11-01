import {musicBackendBase} from '../network/backend';
import {useEffect,useRef,useState} from 'react';
import {Search,Play,ExternalLink,Disc3,Video,ListPlus,Check} from 'lucide-react';
import {BUILTIN_PLAYER_SOURCES,MUSIC_SOURCES,searchStashCatalog,resolveSong,resolverBase,type SongResult,type PlayableSong} from './providers';
import {isLyricVideoTrack} from '../metadata/trackInfo';
import {cleanYouTubeTitleForLyrics} from '../lyrics/lyricFlowEngine';
import YouTubeAccountControl from '../auth/YouTubeAccountControl';

const initialBase=()=>{try{return resolverBase(localStorage.getItem('lyricflow.resolver')||import.meta.env.VITE_MUSIC_RESOLVER||'')}catch{return ''}};

export default function SongSearch({
 onPlay,
 onAddToQueue
}:{
 onPlay:(song:PlayableSong)=>Promise<void>;
 onAddToQueue?:(song:PlayableSong)=>void;
}){
 const [query,setQuery]=useState(''),[base,setBase]=useState(initialBase);
 const [provider,setProvider]=useState<keyof typeof BUILTIN_PLAYER_SOURCES>(()=>{
  try{
   const saved=localStorage.getItem('lyricflow.onlineProvider');
   if(saved==='jiosaavn'||saved==='resolver')return saved;
  }catch{}
  return 'jiosaavn';
 });
 useEffect(()=>{try{localStorage.setItem('lyricflow.onlineProvider',provider);}catch{}},[provider]);
 const [songs,setSongs]=useState<SongResult[]>([]),[busy,setBusy]=useState(false),[playing,setPlaying]=useState('');
 const [queuing,setQueuing]=useState(''),[queuedIds,setQueuedIds]=useState<Record<string,boolean>>({});
 const [message,setMessage]=useState(''),[settings,setSettings]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const cancel=()=>{request.current?.abort();request.current=null;setBusy(false);setPlaying('');setQueuing('');setSongs([]);setMessage('')};

 async function search(){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setSongs([]);setMessage(`Searching ${BUILTIN_PLAYER_SOURCES[provider]}…`);
  try{
   const result=await searchStashCatalog(query,provider,base,controller.signal);
   if(controller.signal.aborted)return;
   setSongs(result);
   setMessage(
    result.length
     ? provider==='resolver'
       ? `${result.length} YouTube videos found · click "Play Now" or "+ Queue" to build your video song queue`
       : `${result.length} JioSaavn tracks found · click "Play Now" or "+ Queue" to stream 320kbps AAC`
     : 'No playable songs found for this query. Try signing in to your YouTube account or pasting a YouTube video link.'
   );
  }catch(e){
   if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Search unavailable.');
  }finally{
   if(request.current===controller)setBusy(false);
  }
 }

 async function play(song:SongResult){
  request.current?.abort();const controller=new AbortController();request.current=controller;setPlaying(song.id);setBusy(true);
  try{
   const effectiveBase=base.trim()||musicBackendBase();
   const resolved=await resolveSong(song,effectiveBase,controller.signal);
   if(!controller.signal.aborted)await onPlay(resolved);
  }catch(e){
   if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to start song.');
  }finally{
   if(request.current===controller){setPlaying('');setBusy(false)}
  }
 }

 async function addToQueue(song:SongResult){
  if(!onAddToQueue)return;
  setQueuing(song.id);
  try{
   const effectiveBase=base.trim()||musicBackendBase();
   const resolved=await resolveSong(song,effectiveBase);
   onAddToQueue(resolved);
   setQueuedIds(prev=>({...prev,[song.provider+song.id]:true}));
   setMessage(`Added "${cleanYouTubeTitleForLyrics(song.title)||song.title}" to Queue (Q).`);
  }catch(e){
   setMessage(e instanceof Error?e.message:'Unable to add song to queue.');
  }finally{
   setQueuing('');
  }
 }

 return <section className="song-search" aria-label="Built-in online music player">
  <div className="song-search-heading">
   <div>
    <b><Disc3 size={15} style={{verticalAlign:'-2px',marginRight:6}}/>BUILT-IN ONLINE PLAYER (JIOSAAVN &amp; YOUTUBE VIDEO)</b>
    <small>Stream JioSaavn 320kbps AAC or play YouTube video backgrounds with VoxelVerse lyrics &amp; Queue (Q)</small>
   </div>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
    <YouTubeAccountControl compact onSignedIn={()=>{if(query.trim().length>=2&&provider==='resolver')void search();}}/>
    <button type="button" onClick={()=>setSettings(v=>!v)}>{settings?'Hide resolver':'Resolver settings'}</button>
   </div>
  </div>
  <form className="song-search-form" onSubmit={e=>{e.preventDefault();void search()}}>
   <Search size={18}/><input aria-label="Search songs" value={query} placeholder={provider==='resolver'?'Search YouTube songs, music videos, or paste a YouTube URL…':'Search JioSaavn songs, artists, or albums…'} maxLength={180} onKeyDown={e=>e.stopPropagation()} onChange={e=>{cancel();setQuery(e.target.value)}}/>
   <button className="source-primary" type="submit" disabled={busy||query.trim().length<2}>{busy?'Searching…':'Search'}</button>
  </form>
  <div className="song-source-tabs" role="tablist" aria-label="Online catalog sources">
   {(Object.entries(BUILTIN_PLAYER_SOURCES) as [keyof typeof BUILTIN_PLAYER_SOURCES, string][]).map(([id,label])=>(
    <button
     key={id}
     type="button"
     aria-pressed={provider===id}
     onClick={()=>{cancel();setProvider(id)}}
    >
     {id==='resolver'?<><Video size={13} style={{verticalAlign:'-2px',marginRight:5}}/>{label} (Video + Lyrics)</>:label}
    </button>
   ))}
  </div>
  {settings&&<div className="song-search-settings">
   <label>Optional custom resolver URL
    <input aria-label="Music resolver URL" value={base} onKeyDown={e=>e.stopPropagation()} onChange={e=>{cancel();setBase(e.target.value)}} placeholder="https://your-music-resolver.example"/>
   </label>
   <button type="button" onClick={()=>{try{const valid=resolverBase(base);localStorage.setItem('lyricflow.resolver',valid);setBase(valid);setMessage(valid?'Custom resolver saved.':'Using built-in JioSaavn & YouTube resolver.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save resolver.')}}}>Save resolver</button>
   <p>Built-in Online Player supports JioSaavn (320kbps AAC) and YouTube (plays the YouTube video as the stage background with SponsorBlock non-music skipping, Queue management, and LyricFlow hybrid word-sync).</p>
  </div>}
  {message&&<p role="status" className="source-message">{message}</p>}
  <div className="song-results">
   {songs.map(song=>{
    const lyricVideo=song.provider==='resolver'&&isLyricVideoTrack(song);
    const cleanedTitle=song.provider==='resolver'?cleanYouTubeTitleForLyrics(song.title,song.artist):'';
    const isAdded=Boolean(queuedIds[song.provider+song.id]);
    return <div className="song-result" key={song.provider+song.id}>
     {song.artwork?<img src={song.artwork} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="song-result-cover">♪</span>}
     <div>
      <strong>{song.title}</strong>
      <small>
       {song.artist||'Unknown artist'}
       {song.album?` · ${song.album}`:''} · {Math.floor(song.duration/60)}:{String(Math.floor(song.duration%60)).padStart(2,'0')} · {MUSIC_SOURCES[song.provider]}
       {lyricVideo?' · Lyric Video Detected':''}
       {cleanedTitle&&cleanedTitle.toLowerCase()!==song.title.toLowerCase()?` · Lyric Search: "${cleanedTitle}"`:''}
      </small>
      <a href={song.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={10}/></a>
     </div>
     <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <button type="button" className="source-primary" disabled={busy} onClick={()=>void play(song)} aria-label={'Play now '+song.title}>
       <Play size={14}/>{playing===song.id?'Loading…':'Play Now'}
      </button>
      {onAddToQueue&&(
       <button
        type="button"
        className="upload-button"
        disabled={queuing===song.id}
        onClick={()=>void addToQueue(song)}
        aria-label={'Add to queue '+song.title}
        style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 10px',fontSize:12}}
       >
        {isAdded?<Check size={13}/>:<ListPlus size={14}/>}
        {queuing===song.id?'Adding…':isAdded?'Queued (+1)':'+ Queue'}
       </button>
      )}
     </div>
    </div>;
   })}
  </div>
 </section>;
}
