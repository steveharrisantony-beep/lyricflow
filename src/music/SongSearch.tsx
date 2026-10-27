import {useEffect,useRef,useState} from 'react';
import {Search,Play,ExternalLink,Disc3,Video} from 'lucide-react';
import {BUILTIN_PLAYER_SOURCES,MUSIC_SOURCES,searchStashCatalog,resolveSong,resolverBase,type SongResult,type PlayableSong} from './providers';
import {isLyricVideoTrack} from '../metadata/trackInfo';

const initialBase=()=>{try{return resolverBase(localStorage.getItem('lyricflow.resolver')||import.meta.env.VITE_MUSIC_RESOLVER||'')}catch{return ''}};

export default function SongSearch({onPlay}:{onPlay:(song:PlayableSong)=>Promise<void>}){
 const [query,setQuery]=useState(''),[base,setBase]=useState(initialBase);
 const [provider,setProvider]=useState<keyof typeof BUILTIN_PLAYER_SOURCES>('jiosaavn');
 const [songs,setSongs]=useState<SongResult[]>([]),[busy,setBusy]=useState(false),[playing,setPlaying]=useState('');
 const [message,setMessage]=useState(''),[settings,setSettings]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const cancel=()=>{request.current?.abort();request.current=null;setBusy(false);setPlaying('');setSongs([]);setMessage('')};

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
       ? `${result.length} YouTube videos found · click Play to watch video background with synced lyrics overlay`
       : `${result.length} JioSaavn tracks found · click Play to stream 320kbps AAC with synced lyrics`
     : 'No playable songs found for this query. Try switching between JioSaavn and YouTube.'
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
   const effectiveBase=base.trim()||(typeof location!=='undefined'?`${location.origin}/music`:'');
   const resolved=await resolveSong(song,effectiveBase,controller.signal);
   if(!controller.signal.aborted)await onPlay(resolved);
  }catch(e){
   if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to start song.');
  }finally{
   if(request.current===controller){setPlaying('');setBusy(false)}
  }
 }

 return <section className="song-search" aria-label="Built-in online music player">
  <div className="song-search-heading">
   <div>
    <b><Disc3 size={15} style={{verticalAlign:'-2px',marginRight:6}}/>BUILT-IN ONLINE PLAYER (JIOSAAVN &amp; YOUTUBE VIDEO)</b>
    <small>Stream JioSaavn 320kbps AAC or play YouTube video backgrounds with VoxelVerse lyrics on top</small>
   </div>
   <button type="button" onClick={()=>setSettings(v=>!v)}>{settings?'Hide resolver':'Resolver settings'}</button>
  </div>
  <form className="song-search-form" onSubmit={e=>{e.preventDefault();void search()}}>
   <Search size={18}/><input aria-label="Search songs" value={query} placeholder={provider==='resolver'?'Search YouTube songs, music videos, or lyric videos…':'Search JioSaavn songs, artists, or albums…'} maxLength={180} onChange={e=>{cancel();setQuery(e.target.value)}}/>
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
    <input aria-label="Music resolver URL" value={base} onChange={e=>{cancel();setBase(e.target.value)}} placeholder="https://your-music-resolver.example"/>
   </label>
   <button type="button" onClick={()=>{try{const valid=resolverBase(base);localStorage.setItem('lyricflow.resolver',valid);setBase(valid);setMessage(valid?'Custom resolver saved.':'Using built-in JioSaavn & YouTube resolver.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save resolver.')}}}>Save resolver</button>
   <p>Built-in Online Player supports JioSaavn (320kbps AAC) and YouTube (plays the YouTube video as the stage background with optional Built-in Theme switching and automatic lyric-video detection).</p>
  </div>}
  {message&&<p role="status" className="source-message">{message}</p>}
  <div className="song-results">
   {songs.map(song=>{
    const lyricVideo=song.provider==='resolver'&&isLyricVideoTrack(song);
    return <div className="song-result" key={song.provider+song.id}>
     {song.artwork?<img src={song.artwork} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="song-result-cover">♪</span>}
     <div>
      <strong>{song.title}</strong>
      <small>
       {song.artist||'Unknown artist'}
       {song.album?` · ${song.album}`:''} · {Math.floor(song.duration/60)}:{String(Math.floor(song.duration%60)).padStart(2,'0')} · {MUSIC_SOURCES[song.provider]}
       {lyricVideo?' · Lyric Video Detected':''}
      </small>
      <a href={song.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={10}/></a>
     </div>
     <button type="button" className="source-primary" disabled={busy} onClick={()=>void play(song)} aria-label={'Play '+song.title}>
      <Play size={15}/>{playing===song.id?'Loading…':song.provider==='resolver'?'Play Video':'Play'}
     </button>
    </div>;
   })}
  </div>
 </section>;
}
