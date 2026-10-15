import {useEffect,useRef,useState} from 'react';
import {Search,Play,ExternalLink} from 'lucide-react';
import {MUSIC_SOURCES,searchSongs,resolveSong,resolverBase,type SongResult,type PlayableSong} from './providers';
const initialBase=()=>{try{return resolverBase(localStorage.getItem('lyricflow.resolver')||import.meta.env.VITE_MUSIC_RESOLVER||'')}catch{return ''}};
export default function SongSearch({onPlay}:{onPlay:(song:PlayableSong)=>Promise<void>}){
 const [query,setQuery]=useState(''),[base,setBase]=useState(initialBase);
 const [provider,setProvider]=useState<SongResult['provider']>(base?'ytmusic':'audius');
 const [songs,setSongs]=useState<SongResult[]>([]),[busy,setBusy]=useState(false),[playing,setPlaying]=useState('');
 const [message,setMessage]=useState(''),[settings,setSettings]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const cancel=()=>{request.current?.abort();request.current=null;setBusy(false);setPlaying('');setSongs([]);setMessage('')};
 async function search(){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setSongs([]);setMessage('Searching songs…');
  try{
   const result=await searchSongs(query,provider,base,controller.signal);
   if(controller.signal.aborted)return;
   setSongs(result);setMessage(result.length?`${result.length} songs · select the exact recording`:'No playable songs found here. Try another source, a different spelling, or a local file.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Search unavailable.')}
  finally{if(request.current===controller)setBusy(false)}
 }
 async function play(song:SongResult){
  request.current?.abort();const controller=new AbortController();request.current=controller;setPlaying(song.id);setBusy(true);
  try{const resolved=await resolveSong(song,base,controller.signal);if(!controller.signal.aborted)await onPlay(resolved)}
  catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to start song.')}
  finally{if(request.current===controller){setPlaying('');setBusy(false)}}
 }
 return <section className="song-search" aria-label="Search and play songs">
  <div className="song-search-heading"><div><b>Find your next sound</b><small>Search · choose a recording · play with synced lyrics</small></div><button type="button" onClick={()=>setSettings(v=>!v)}>Search settings</button></div>
  <form className="song-search-form" onSubmit={e=>{e.preventDefault();void search()}}>
   <Search size={18}/><input aria-label="Search songs" value={query} placeholder="Song or artist…" maxLength={180} onChange={e=>{cancel();setQuery(e.target.value)}}/>
   <button className="source-primary" type="submit" disabled={busy||query.trim().length<2}>{busy?'Working…':'Search'}</button>
  </form>
  <div className="song-source-tabs">{Object.entries(MUSIC_SOURCES).map(([id,label])=><button key={id} type="button" aria-pressed={provider===id} onClick={()=>{cancel();setProvider(id as SongResult['provider']);if(id!=='audius'&&!base)setSettings(true)}}>{label}</button>)}</div>
  {provider!=='audius'&&!base&&<p className="source-message">Connect your music server in Search settings to use {MUSIC_SOURCES[provider]}. Audius works without it.</p>}
  {settings&&<div className="song-search-settings"><label>Music resolver URL<input aria-label="Music resolver URL" value={base} onChange={e=>{cancel();setBase(e.target.value)}} placeholder="https://your-music-resolver.example"/></label><button type="button" onClick={()=>{try{const valid=resolverBase(base);localStorage.setItem('lyricflow.resolver',valid);setBase(valid);setMessage(valid?'Music resolver saved on this device.':'Music resolver removed.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save resolver.')}}}>Save connection</button><p>Audius searches its own catalog. YouTube Music, SoundCloud and JioSaavn use your connected music server. Start it with npm run dev:full in your project, or enter its hosted URL here. Playback availability depends on the source. No Spotify audio extraction.</p></div>}
  {message&&<p role="status" className="source-message">{message}</p>}
  <div className="song-results">{songs.map(song=><div className="song-result" key={song.provider+song.id}>
   {song.artwork?<img src={song.artwork} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="song-result-cover">♪</span>}
   <div><strong>{song.title}</strong><small>{song.artist||'Unknown artist'} · {Math.floor(song.duration/60)}:{String(Math.floor(song.duration%60)).padStart(2,'0')} · {MUSIC_SOURCES[song.provider]}</small><a href={song.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={10}/></a></div>
   <button type="button" className="source-primary" disabled={busy} onClick={()=>void play(song)} aria-label={'Play '+song.title}><Play size={15}/>{playing===song.id?'Loading…':'Play'}</button>
  </div>)}</div>
  <p className="player-footnote">Lyrics follow the actual playback clock when a matching timed version exists. Word timing is estimated unless the source supplies it.</p>
 </section>;
}
