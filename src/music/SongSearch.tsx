import {useEffect,useRef,useState} from 'react';
import {Search,Play,ExternalLink,Disc3} from 'lucide-react';
import {MUSIC_SOURCES,searchStashCatalog,resolveSong,resolverBase,type SongResult,type PlayableSong} from './providers';

const initialBase=()=>{try{return resolverBase(localStorage.getItem('lyricflow.resolver')||import.meta.env.VITE_MUSIC_RESOLVER||'')}catch{return ''}};

export default function SongSearch({onPlay}:{onPlay:(song:PlayableSong)=>Promise<void>}){
 const [query,setQuery]=useState(''),[base,setBase]=useState(initialBase);
 const [provider,setProvider]=useState<SongResult['provider']>('jiosaavn');
 const [songs,setSongs]=useState<SongResult[]>([]),[busy,setBusy]=useState(false),[playing,setPlaying]=useState('');
 const [message,setMessage]=useState(''),[settings,setSettings]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const cancel=()=>{request.current?.abort();request.current=null;setBusy(false);setPlaying('');setSongs([]);setMessage('')};

 async function search(){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setSongs([]);setMessage('Searching Stash catalog…');
  try{
   const result=await searchStashCatalog(query,provider,base,controller.signal);
   if(controller.signal.aborted)return;
   setSongs(result);
   setMessage(result.length?`${result.length} tracks found · click Play to stream with automatic Apple Music / LRCLIB synced lyrics`:'No playable songs found for this query. Try another catalog tab or spelling.');
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

 return <section className="song-search" aria-label="Built-in Stash online music player">
  <div className="song-search-heading">
   <div>
    <b><Disc3 size={15} style={{verticalAlign:'-2px',marginRight:6}}/>BUILT-IN ONLINE PLAYER (STASH ENGINE)</b>
    <small>Multi-source catalog search · automatic Apple Music word-synced &amp; LRCLIB lyrics</small>
   </div>
   <button type="button" onClick={()=>setSettings(v=>!v)}>{settings?'Hide resolver':'Resolver settings'}</button>
  </div>
  <form className="song-search-form" onSubmit={e=>{e.preventDefault();void search()}}>
   <Search size={18}/><input aria-label="Search songs" value={query} placeholder="Search any song, artist, or album…" maxLength={180} onChange={e=>{cancel();setQuery(e.target.value)}}/>
   <button className="source-primary" type="submit" disabled={busy||query.trim().length<2}>{busy?'Searching…':'Search'}</button>
  </form>
  <div className="song-source-tabs" role="tablist" aria-label="Online catalog sources">
   {Object.entries(MUSIC_SOURCES).map(([id,label])=>(
    <button
     key={id}
     type="button"
     aria-pressed={provider===id}
     onClick={()=>{cancel();setProvider(id as SongResult['provider'])}}
    >
     {label}
    </button>
   ))}
  </div>
  {settings&&<div className="song-search-settings">
   <label>Optional custom Stash/yt-dlp resolver URL
    <input aria-label="Music resolver URL" value={base} onChange={e=>{cancel();setBase(e.target.value)}} placeholder="https://your-music-resolver.example"/>
   </label>
   <button type="button" onClick={()=>{try{const valid=resolverBase(base);localStorage.setItem('lyricflow.resolver',valid);setBase(valid);setMessage(valid?'Custom resolver saved.':'Using built-in Stash catalog mirrors.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save resolver.')}}}>Save resolver</button>
   <p>Stash Online Player automatically queries JioSaavn, Audius, YouTube Music, and Apple Music metadata/lyrics. Connect your own Python resolver URL for custom yt-dlp extraction.</p>
  </div>}
  {message&&<p role="status" className="source-message">{message}</p>}
  <div className="song-results">
   {songs.map(song=><div className="song-result" key={song.provider+song.id}>
    {song.artwork?<img src={song.artwork} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="song-result-cover">♪</span>}
    <div>
     <strong>{song.title}</strong>
     <small>{song.artist||'Unknown artist'}{song.album?` · ${song.album}`:''} · {Math.floor(song.duration/60)}:{String(Math.floor(song.duration%60)).padStart(2,'0')} · {MUSIC_SOURCES[song.provider]}</small>
     <a href={song.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={10}/></a>
    </div>
    <button type="button" className="source-primary" disabled={busy} onClick={()=>void play(song)} aria-label={'Play '+song.title}>
     <Play size={15}/>{playing===song.id?'Loading…':'Play'}
    </button>
   </div>)}
  </div>
 </section>;
}
