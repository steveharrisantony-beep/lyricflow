import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Computer,Mic,Music2,Radio,MonitorSpeaker,ExternalLink,Volume2,X,Square,ChevronRight,Headphones} from 'lucide-react';
import {connectExternalAudio} from './audioSignal';

export interface AudioSourceHubHandle{stop:()=>void}
type Source='system'|'radio'|null;
type Props={
 open:boolean;onClose:()=>void;
 onPickLocal:()=>void;onPickMic:()=>void;
 onExternalActivated:()=>void;
};
const messageFor=(e:unknown)=>e instanceof Error?e.message:'The browser cannot start this source.';
function AudioSourceHub({open,onClose,onPickLocal,onPickMic,onExternalActivated}:Props,ref:React.Ref<AudioSourceHubHandle>){
 const [source,setSource]=useState<Source>(null);
 const [url,setUrl]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [help,setHelp]=useState<'soundcloud'|'virtual'|null>(null);
 const systemStream=useRef<MediaStream|null>(null);
 const systemContext=useRef<AudioContext|null>(null);
 const radioContext=useRef<AudioContext|null>(null);
 const radioRef=useRef<HTMLAudioElement|null>(null);
 const closeSystem=()=>{
  systemStream.current?.getTracks().forEach(track=>track.stop());systemStream.current=null;
  if(systemContext.current){void systemContext.current.close().catch(()=>{});systemContext.current=null}
 };
 const closeRadio=()=>{
  const player=radioRef.current;
  if(player){player.pause();player.removeAttribute('src');player.load();radioRef.current=null}
  if(radioContext.current){void radioContext.current.close().catch(()=>{});radioContext.current=null}
 };
 const stop=()=>{
  // Detach Web Audio before closing AudioContexts: never upload or record audio.
  connectExternalAudio(null);
  closeSystem();closeRadio();setSource(null);setBusy(false);
 };
 const stopRef=useRef(stop);stopRef.current=stop;
 useImperativeHandle(ref,()=>({stop:()=>stopRef.current()}),[]);
 useEffect(()=>()=>{stopRef.current()},[]);
 const startSystem=async()=>{
  if(!window.isSecureContext||!navigator.mediaDevices?.getDisplayMedia){
   setMessage('System/tab audio capture is unsupported in this browser. Android browsers generally cannot capture another app’s audio. Use the microphone instead.');return;
  }
  setBusy(true);setMessage('Choose a tab or screen and enable Share audio in the browser prompt.');
  let stream:MediaStream|null=null,context:AudioContext|null=null;
  try{
   // User gesture required. Video is requested because many browsers refuse
   // display-media audio without an accompanying display capture track.
   stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
   if(!stream.getAudioTracks().length)throw new Error('The selected share has no audio track. Enable "Share tab audio" when supported.');
   context=new AudioContext();
   const input=context.createMediaStreamSource(stream);
   const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.38;
   input.connect(analyser); // No speaker route: avoid echo and feedback.
   await context.resume();
   stop();onExternalActivated();
   systemStream.current=stream;systemContext.current=context;
   for(const track of stream.getTracks())track.addEventListener('ended',()=>{
    if(systemStream.current===stream){stopRef.current();setMessage('System audio sharing ended.')}
   });
   connectExternalAudio(analyser,'SYSTEM AUDIO');setSource('system');
   setMessage('System/tab audio is being analyzed locally. Stop sharing to disconnect.');onClose();
  }catch(e){
   stream?.getTracks().forEach(track=>track.stop());if(context)void context.close().catch(()=>{});
   setMessage(messageFor(e)+ ' You can use local audio or the microphone instead.');
  }finally{setBusy(false)}
 };
 const startRadio=async()=>{
  const value=url.trim();
  try{
   const address=new URL(value);
   if(address.protocol!=='https:'&&address.protocol!=='http:')throw Error('Use an HTTP(S) audio stream URL.');
   if(location.protocol==='https:'&&address.protocol!=='https:')throw Error('HTTPS pages require an HTTPS radio stream.');
  }catch(e){setMessage(e instanceof Error?e.message:'Enter a valid direct station stream URL.');return}
  const audio=new Audio();radioRef.current=audio;
 audio.addEventListener('ended',()=>{if(radioRef.current===audio){stopRef.current();setMessage('Radio stream ended.')}});
 audio.addEventListener('error',()=>{if(radioRef.current===audio){stopRef.current();setMessage('Radio playback failed. Check the stream URL and CORS.')}});
  setBusy(true);setMessage('Connecting to station… The station must allow cross-origin audio analysis.');
  try{
   stop();
   radioRef.current=audio;
   const context=new AudioContext();
   const input=context.createMediaElementSource(audio);
   const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.38;
   input.connect(analyser);analyser.connect(context.destination);
   radioContext.current=context;
   audio.crossOrigin='anonymous';
   audio.src=value;audio.volume=.8;
   await context.resume();
   await audio.play();
   onExternalActivated();
   connectExternalAudio(analyser,'INTERNET RADIO');
   setSource('radio');setMessage('Internet radio is playing and analyzed on your device.');onClose();
  }catch(e){
   stop();setMessage('Unable to play or analyze this stream. Direct audio and CORS permission are required. '+messageFor(e));
  }finally{setBusy(false)}
 };
 const selectLocal=()=>{stop();onPickLocal();onClose()};
 const selectMic=()=>{stop();onPickMic();onClose()};
 const sourceRow=(name:string,detail:string,Icon:typeof Music2,action:()=>void,badge?:string,selected=false)=>
  <button className={'audio-source-choice '+(selected?'active':'')} type="button" onClick={action}>
   <span className="audio-source-icon"><Icon size={20}/></span>
   <span className="audio-source-copy"><strong>{name}</strong><small>{detail}</small></span>
   {badge&&<span className="audio-source-badge">{badge}</span>}<ChevronRight size={17}/>
  </button>;
 return <>
  {open&&<div className="source-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
   <div className="source-modal" role="dialog" aria-modal="true" aria-label="Select audio source">
    <div className="source-modal-head"><div><span>LYRICFLOW INPUTS</span><h2>Select an audio source</h2><small>All permitted audio analysis stays on this device</small></div><button type="button" aria-label="Close audio sources" className="source-close" onClick={onClose}><X size={21}/></button></div>
    <div className="audio-source-list">
     {sourceRow('Local music file','MP3, WAV, M4A and browser-supported formats',Music2,selectLocal,'RECOMMENDED')}
     {sourceRow('Microphone','Listen to a phone, speaker or nearby music',Mic,selectMic,'ANDROID')}
     {sourceRow('System / tab audio','Share tab sound where browser support exists',Computer,()=>{setHelp(null);void startSystem()},'DESKTOP',source==='system')}
     {sourceRow('Internet radio / direct stream','Play a station with a compatible audio stream URL',Radio,()=>setHelp(v=>v==='virtual'?null:'virtual'),source==='radio'?'ACTIVE':undefined,source==='radio')}
     {sourceRow('SoundCloud','Use its own player; microphone can listen nearby',Headphones,()=>setHelp(v=>v==='soundcloud'?null:'soundcloud'),'GUIDED')}
     {sourceRow('Virtual audio routing','External desktop setup; not installed by a webpage',MonitorSpeaker,()=>setHelp('virtual'),'ADVANCED')}
    </div>
    <div className="source-extra">
     <label htmlFor="stream-url">Direct radio/audio stream URL (HTTPS, CORS-enabled)</label>
     <div className="source-stream-row"><input id="stream-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/live.mp3" autoComplete="off"/>
      <button type="button" className="source-primary" disabled={busy||!url.trim()} onClick={()=>void startRadio()}>Play stream</button></div>
     {help==='soundcloud'&&<p>SoundCloud embeds do not provide unrestricted access to their audio samples. Open your music legally on SoundCloud and use the microphone for reactive visuals; no automatic lyrics sync is implied. <a href="https://soundcloud.com/" target="_blank" rel="noreferrer">Open SoundCloud <ExternalLink size={12}/></a></p>}
     {help==='virtual'&&<p>Advanced desktop setups can route approved system output to a virtual microphone, then select <b>Microphone</b> here. A browser cannot install virtual sound devices. Android support varies.</p>}
     {message&&<p className="source-message" role="status">{message}</p>}
    </div>
    <div className="source-modal-foot">{source&&<button type="button" className="source-stop" onClick={()=>{stop();setMessage('Disconnected external audio.')}}><Square size={13}/> Disconnect {source==='radio'?'radio':'system audio'}</button>}<span><Volume2 size={15}/> No recordings or uploads</span></div>
   </div>
  </div>}
 </>;
}
export default forwardRef(AudioSourceHub);
