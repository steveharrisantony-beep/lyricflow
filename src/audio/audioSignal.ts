/** Shared on-device Web Audio signal pipeline. Never records or uploads audio. */
import {BeatDetector} from './beatDetector';

export interface AudioMetrics {
 loudness:number;bass:number;mids:number;treble:number;beat:number;rms:number;
 onset:number;downbeat:number;bpm:number;tempoConfidence:number;
 section:'unknown'|'quiet'|'steady'|'building'|'energetic';sectionConfidence:number;
 flux:number;threshold:number;beatCount:number;
}
const metrics:AudioMetrics={loudness:0,bass:0,mids:0,treble:0,beat:0,rms:0,
 onset:0,downbeat:0,bpm:0,tempoConfidence:0,section:'unknown',sectionConfidence:0,
 flux:0,threshold:0,beatCount:0};
let analyser:AnalyserNode|null=null;
let frequency:Uint8Array<ArrayBuffer>|null=null;
let waveform:Uint8Array<ArrayBuffer>|null=null;
let localAnalyser:AnalyserNode|null=null;
let microphoneAnalyser:AnalyserNode|null=null;
let microphonePlaying=false;
let mediaElement:HTMLAudioElement|null=null,playing=false,sensitivity=.5;
let lastSample=0,sectionAt=0,historyCursor=0,historyCount=0,lastSongTime=0;
const detector=new BeatDetector();
const history=new Float32Array(48);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function setAudioSensitivity(value:number){sensitivity=clamp(value)}
export function getAudioSensitivity(){return sensitivity}
export function setLocalMediaElement(element:HTMLAudioElement|null){mediaElement=element}
export function getLocalMediaTime(){
 return mediaElement&&mediaElement.currentSrc&&(!microphonePlaying||playing)?mediaElement.currentTime:null
}
function activate(node:AnalyserNode|null){
 if(node===analyser)return;
 analyser=node;
 frequency=node?new Uint8Array(new ArrayBuffer(node.frequencyBinCount)):null;
 waveform=node?new Uint8Array(new ArrayBuffer(node.fftSize)):null;
 lastSample=0;sectionAt=0;historyCursor=0;historyCount=0;lastSongTime=0;
 history.fill(0);detector.reset();
 for(const field of ['loudness','bass','mids','treble','beat','rms','onset','downbeat',
 'bpm','tempoConfidence','flux','threshold','beatCount'] as const)metrics[field]=0;
 metrics.section='unknown';metrics.sectionConfidence=0;
}
export function setLocalAudioPlaying(value:boolean){
 playing=value;activate(value?localAnalyser:microphonePlaying?microphoneAnalyser:null);
}
export function isLocalAudioPlaying(){return playing&&localAnalyser!==null}
export function isMicrophonePlaying(){return !playing&&microphonePlaying&&microphoneAnalyser!==null}
export function getInputSource(){return isLocalAudioPlaying()?'LOCAL AUDIO':isMicrophonePlaying()?'MICROPHONE':'IDLE'}
export function connectLocalAudio(node:AnalyserNode|null){
 localAnalyser=node;
 if(playing||!microphonePlaying)activate(playing?node:null);
}
export function connectMicrophoneAudio(node:AnalyserNode|null){
 microphoneAnalyser=node;microphonePlaying=Boolean(node);
 if(!playing)activate(node);
}
export function readLocalAudio(now=performance.now()):AudioMetrics|null{
 if(!analyser||!frequency||!waveform||(!playing&&!microphonePlaying))return null;
 if(now-lastSample<11)return metrics;
 const dt=Math.min(.08,Math.max(.008,(now-(lastSample||now-16))/1000));
 lastSample=now;
 const songTime=playing?getLocalMediaTime():null;
 if(songTime!==null){
  if(lastSongTime&&Math.abs(songTime-lastSongTime)>1.2)detector.reset();
  lastSongTime=songTime;
 }
 analyser.getByteFrequencyData(frequency);
 analyser.getByteTimeDomainData(waveform);
 const nyquist=analyser.context.sampleRate*.5;
 const band=(lo:number,hi:number)=>{
  const start=Math.max(0,Math.min(frequency!.length-1,Math.floor(lo/nyquist*frequency!.length)));
  const end=Math.min(frequency!.length,Math.max(start+1,Math.ceil(hi/nyquist*frequency!.length)));
  let total=0;
  for(let i=start;i<end;i++)total+=frequency![i];
  return total/(end-start)/255;
 };
 let sum=0;
 for(let i=0;i<waveform.length;i++){
  const v=(waveform[i]-128)/128;sum+=v*v;
 }
 const amplitude=Math.sqrt(sum/waveform.length);
 // Raw spectrum is analyzed independently of sensitivity; UI control scales visuals.
 const gain=1.75*Math.pow(sensitivity,1.05);
 const bass=clamp(band(35,230)*1.7*gain);
 const mids=clamp(band(230,2400)*2*gain);
 const treble=clamp(band(2400,11500)*2.25*gain);
 const loudness=clamp(amplitude*4.4*gain);
 const attack=0.58,release=.19;
 for(const [field,value] of [['bass',bass],['mids',mids],['treble',treble],
  ['loudness',loudness],['rms',clamp(amplitude*4*gain)]] as const){
  metrics[field]+=(value-metrics[field])*(value>metrics[field]?attack:release);
 }
 const estimate=detector.update(frequency,songTime??now/1000,nyquist,amplitude,sensitivity);
 metrics.beat=estimate.beat;metrics.onset=estimate.onset;
 metrics.downbeat=estimate.downbeat;metrics.bpm=estimate.bpm;
 metrics.tempoConfidence=estimate.tempoConfidence;
 metrics.flux=estimate.flux;metrics.threshold=estimate.threshold;
 metrics.beatCount=estimate.beatCount;
 if(now-sectionAt>=250){
  sectionAt=now;
  const energy=.52*bass+.32*mids+.16*treble;
  history[historyCursor]=energy;
  historyCursor=(historyCursor+1)%history.length;
  historyCount=Math.min(historyCount+1,history.length);
  const count=Math.min(12,Math.floor(historyCount/2));
  let recent=0,older=0;
  for(let i=0;i<count;i++){
   recent+=history[(historyCursor-1-i+history.length)%history.length];
   older+=history[(historyCursor-1-i-count+history.length)%history.length];
  }
  recent/=Math.max(1,count);older/=Math.max(1,count);
  if(historyCount>=16){
   const rise=recent-older;
   metrics.section=recent<.03?'quiet':rise>.055?'building':recent>.26?'energetic':'steady';
   metrics.sectionConfidence=clamp(Math.abs(rise)*4+.25);
  }
 }
 return metrics;
}
