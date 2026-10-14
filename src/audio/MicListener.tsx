import {useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {connectMicrophoneAudio} from './audioSignal';
export default function MicListener({localPlaying}:{localPlaying:boolean}){
 const streamRef=useRef<MediaStream|null>(null),contextRef=useRef<AudioContext|null>(null);
 const [status,setStatus]=useState<'idle'|'requesting'|'listening'|'denied'|'error'>('idle');
 const [message,setMessage]=useState('Microphone input is off.');
 const stop=()=>{
  connectMicrophoneAudio(null);
  streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
  const ctx=contextRef.current;contextRef.current=null;
  if(ctx)void ctx.close().catch(()=>{});
  setStatus('idle');setMessage('Microphone stopped. No audio was recorded.');
 };
 const start=async()=>{
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   setStatus('error');setMessage('Microphone requires HTTPS and a browser with media permissions. Open the preview in its own tab.');return;
  }
  setStatus('requesting');setMessage('Waiting for microphone permission…');
  let stream:MediaStream|null=null;
  let context:AudioContext|null=null;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   context=new AudioContext();
   const input=context.createMediaStreamSource(stream);
   const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.55;
   input.connect(analyser); // intentionally NOT connected to speakers (feedback prevention)
   await context.resume();
   streamRef.current=stream;contextRef.current=context;
   connectMicrophoneAudio(analyser);
   setStatus('listening');setMessage('Microphone active. Audio is analyzed locally, never saved or uploaded.');
  }catch(e){
   stream?.getTracks().forEach(t=>t.stop());if(context)void context.close().catch(()=>{});
   const denied=e instanceof DOMException&&e.name==='NotAllowedError';
   setStatus(denied?'denied':'error');
   setMessage(denied?'Microphone permission denied. Use the browser site settings to allow it.':e instanceof Error?e.message:'Unable to access the microphone.');
  }
 };
 const stopRef=useRef(stop);stopRef.current=stop;
 useEffect(()=>{if(localPlaying)stopRef.current()},[localPlaying]);
 useEffect(()=>{
  const hidden=()=>{if(document.hidden)stopRef.current()};
  document.addEventListener('visibilitychange',hidden);
  return()=>{document.removeEventListener('visibilitychange',hidden);stopRef.current()};
 },[]);
 return <section className="local-player mic-panel">
  <div className="player-heading"><div className="heading-left"><span className="heading-icon"><Mic size={18}/></span><div><b>LIVE MICROPHONE VISUALIZER</b><small>For nearby music · independent of streaming services</small></div></div><span className="local-badge">ON-DEVICE ONLY</span></div>
  <div className="mic-row"><button className="upload-button" disabled={status==='requesting'||(localPlaying&&status!=='listening')} onClick={()=>status==='listening'?stop():void start()}>{status==='listening'?<MicOff size={16}/>:<Mic size={16}/>} {status==='listening'?'Stop Listening':status==='requesting'?'Requesting…':'Start Listening'}</button><span className={status==='listening'?'mic-on':''}>{message}</span></div>
  <p className="player-footnote">Play music through another device near your Xiaomi Pad. The tablet hears the room; beat and tempo estimates may vary. Microphone listening is independent of Spotify metadata and cannot provide exact Spotify lyric playback timing. Stop Listening closes the audio stream.</p>
 </section>;
}
