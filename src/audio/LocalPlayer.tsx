import type Hls from 'hls.js';
import { forwardRef,useEffect,useImperativeHandle,useRef,useState } from 'react';
import { Upload, Play, Pause, Volume2, Music2, X } from 'lucide-react';
import { connectLocalAudio, setLocalAudioPlaying, setLocalMediaElement } from './audioSignal';
import type {TrackInfo} from '../metadata/trackInfo';
import type {PlayableSong} from '../music/providers';
import {resolveTrackFilename} from '../metadata/metadataStore';

const format=(seconds:number)=>Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'0:00';
export interface LocalPlayerHandle{chooseFile:()=>void;pause:()=>void;stop:()=>void;play:()=>Promise<void>;loadRemote:(song:PlayableSong)=>Promise<void>;seek:(time:number)=>void}
type Props={onActiveChange:(active:boolean)=>void;onTimeChange:(time:number)=>void;onFileChange:(loaded:boolean)=>void;onTrackChange:(track:TrackInfo|null)=>void;onDurationChange:(duration:number)=>void};
function LocalPlayer({onActiveChange,onTimeChange,onFileChange,onTrackChange,onDurationChange}:Props,ref:React.Ref<LocalPlayerHandle>){
 const hlsRef=useRef<Hls|null>(null);
 const loadEpoch=useRef(0);
 const audioRef=useRef<HTMLAudioElement>(null);
 const urlRef=useRef<string|null>(null);
 const ctxRef=useRef<AudioContext|null>(null);
 const fileRef=useRef<HTMLInputElement>(null);
 const [name,setName]=useState('');
 const [active,setActive]=useState(false);
 const [duration,setDuration]=useState(0);
 const [time,setTime]=useState(0);
 const [volume,setVolume]=useState(85);
 const [error,setError]=useState('');
 const [remote,setRemote]=useState(false);
 const loadRemote=async(song:PlayableSong)=>{
  const player=audioRef.current;if(!player)throw Error('Player unavailable');
  const epoch=++loadEpoch.current;hlsRef.current?.destroy();hlsRef.current=null;
  player.pause();setLocalAudioPlaying(false);
  if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null}
  player.crossOrigin='anonymous';
  player.removeAttribute('src');player.load();
  setRemote(true);setName(song.title+' — '+song.artist);setTime(0);setDuration(song.duration);setError('');
  onTrackChange({...song,source:'provider',confidence:1});onFileChange(true);onTimeChange(0);
  try{
   await initialize();
   if(epoch!==loadEpoch.current)return;
   if(song.format==='hls'&&!player.canPlayType('application/vnd.apple.mpegurl')){
    const {default:HlsPlayer}=await import('hls.js');
    if(epoch!==loadEpoch.current)return;
    if(!HlsPlayer.isSupported())throw Error('HLS is not supported by this browser');
    const hls=new HlsPlayer({maxBufferLength:30,maxMaxBufferLength:60});hlsRef.current=hls;
    hls.on(HlsPlayer.Events.ERROR,(_event,data)=>{if(data.fatal){setError('The stream was interrupted. Choose the song again or try another source.');player.pause();hls.destroy();if(hlsRef.current===hls)hlsRef.current=null}});
    await new Promise<void>((resolve,reject)=>{
     const timer=setTimeout(()=>{hls.destroy();reject(Error('Stream timed out'))},20000);
     hls.once(HlsPlayer.Events.MANIFEST_PARSED,()=>{clearTimeout(timer);resolve()});
     hls.once(HlsPlayer.Events.DESTROYING,()=>{clearTimeout(timer);reject(Error('Stream closed'))});
     hls.loadSource(song.streamUrl);hls.attachMedia(player);
    });
   }else{player.src=song.streamUrl;player.load()}
   if(epoch!==loadEpoch.current)return;
   player.volume=volume/100;await player.play();
  }catch{if(epoch!==loadEpoch.current)return;setError('This source could not play in your browser. Try another result or a local file.');throw Error('Playback failed. The source may be unavailable or block browser audio access.')}
 };
 const initialize=async()=>{
  const element=audioRef.current;if(!element)throw new Error('Audio player is unavailable');
  if(!ctxRef.current){
   const context=new AudioContext();
   const source=context.createMediaElementSource(element);
   const analyser=context.createAnalyser();
   analyser.fftSize=2048;
   analyser.smoothingTimeConstant=.42;
   source.connect(analyser);
   analyser.connect(context.destination);
   ctxRef.current=context;
   setLocalMediaElement(element);
   connectLocalAudio(analyser);
  }
  setLocalMediaElement(element);
  await ctxRef.current.resume();
 };
 const play=async()=>{
  const element=audioRef.current;if(!element||!element.src)return;
  try{setError('');await initialize();await element.play()}catch(e){setError(e instanceof Error?e.message:'Audio playback was blocked. Tap Play again.')}
 };
 const load=(file:File|undefined)=>{
  if(!file)return;
  if(!(file.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name))){setError('Please choose a supported audio file.');return}
  const player=audioRef.current;if(!player)return;
  ++loadEpoch.current;hlsRef.current?.destroy();hlsRef.current=null;
  player.pause();setLocalAudioPlaying(false);onActiveChange(false);setActive(false);
  if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  urlRef.current=URL.createObjectURL(file);
  player.removeAttribute('crossorigin');player.src=urlRef.current;player.load();setRemote(false);
  setName(file.name.replace(/\.[^.]+$/,''));onTrackChange(resolveTrackFilename(file.name));onFileChange(true);onTimeChange(0);
  setTime(0);setDuration(0);setError('');
 };
 const stop=()=>{
  ++loadEpoch.current;hlsRef.current?.destroy();hlsRef.current=null;
  const player=audioRef.current;player?.pause();
  if(player){player.removeAttribute('src');player.load()}
  if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null}
  setLocalAudioPlaying(false);setLocalMediaElement(null);onTrackChange(null);onFileChange(false);onTimeChange(0);setName('');setTime(0);setDuration(0);setActive(false);onActiveChange(false);setError('');
 };
 useImperativeHandle(ref,()=>({chooseFile:()=>fileRef.current?.click(),pause:()=>{audioRef.current?.pause();setLocalAudioPlaying(false);onActiveChange(false)},stop,play,loadRemote,seek:(time:number)=>{const player=audioRef.current;if(player&&Number.isFinite(player.duration)){player.currentTime=Math.max(0,Math.min(player.duration,time));onTimeChange(player.currentTime);setTime(player.currentTime)}}}),[onActiveChange]);
 useEffect(()=>()=>{++loadEpoch.current;hlsRef.current?.destroy();audioRef.current?.pause();setLocalAudioPlaying(false);setLocalMediaElement(null);connectLocalAudio(null);if(urlRef.current)URL.revokeObjectURL(urlRef.current);void ctxRef.current?.close()},[]);
 return <section className="local-player">
   <div className="player-heading"><div className="heading-left"><span className="heading-icon"><Music2 size={17}/></span><div><b>MUSIC PLAYER</b><small>Local files & searched songs · shared playback clock</small></div></div><span className="local-badge">{remote?'STREAMING':'NO UPLOADS'}</span></div>
   <audio ref={audioRef} preload="metadata" onTimeUpdate={e=>{setTime(e.currentTarget.currentTime);onTimeChange(e.currentTarget.currentTime)}} onLoadedMetadata={e=>{const d=e.currentTarget.duration;setDuration(d);if(Number.isFinite(d))onDurationChange(d)}} onPlay={()=>{setLocalAudioPlaying(true);setActive(true);onActiveChange(true)}} onPause={()=>{setLocalAudioPlaying(false);setActive(false);onActiveChange(false)}} onEnded={()=>{setLocalAudioPlaying(false);setActive(false);onActiveChange(false)}} onError={()=>setError('This audio format could not be decoded by the browser.')} />
   <input className="visually-hidden" ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" onChange={e=>{load(e.target.files?.[0]);e.target.value=''}} aria-label="Select local audio file"/>
   <div className="player-row">
    <button className="upload-button" onClick={()=>fileRef.current?.click()}><Upload size={17}/>{name?'Change audio file':'Choose MP3 / Audio'}</button>
    <div className="player-details"><b title={name}>{name||'No audio selected'}</b><small>{name?remote?'Streaming from selected source':'Playing from your device · not uploaded':'Choose an audio file stored on this tablet'}</small></div>
    {name&&<><button className="player-round" aria-label={active?'Pause track':'Play track'} onClick={()=>active?audioRef.current?.pause():void play()}>{active?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button className="player-remove" aria-label="Remove audio file" onClick={stop}><X size={17}/></button></>}
   </div>
   {name&&<div className="player-seek"><span>{format(time)}</span><input aria-label="Song position" type="range" min="0" max={Number.isFinite(duration)?duration:0} step=".1" value={Math.min(time,Number.isFinite(duration)?duration:0)} onChange={e=>{if(audioRef.current){audioRef.current.currentTime=Number(e.target.value);onTimeChange(Number(e.target.value))}}}/><span>{format(duration)}</span><label className="volume-label"><Volume2 size={16}/><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e=>{const n=Number(e.target.value);setVolume(n);if(audioRef.current)audioRef.current.volume=n/100}}/></label></div>}
   {error&&<p className="player-error" role="alert">{error}</p>}
   <p className="player-footnote">Audio analysis stays on device. Online playback contacts the selected source. Use music you are authorized to play.</p>
 </section>;
}
export default forwardRef(LocalPlayer);