/** Shared on-device Web Audio signal pipeline. Never records or uploads audio. */
import {BandEnvelope} from './bandEnvelope';
import {BeatDetector} from './beatDetector';

export interface AudioMetrics {
 loudness:number;bass:number;mids:number;treble:number;beat:number;rms:number;
 onset:number;downbeat:number;bpm:number;tempoConfidence:number;
 section:'unknown'|'quiet'|'steady'|'building'|'energetic';sectionConfidence:number;
 flux:number;threshold:number;beatCount:number;
 /** Smoothed logarithmically spaced 32Hz–14kHz energy bins. */
 bands:Float32Array;
}
const metrics:AudioMetrics={loudness:0,bass:0,mids:0,treble:0,beat:0,rms:0,
 onset:0,downbeat:0,bpm:0,tempoConfidence:0,section:'unknown',sectionConfidence:0,
 flux:0,threshold:0,beatCount:0,bands:new Float32Array(64)};
let analyser:AnalyserNode|null=null;
let frequency:Uint8Array<ArrayBuffer>|null=null;
let waveform:Uint8Array<ArrayBuffer>|null=null;
let localAnalyser:AnalyserNode|null=null;
let microphoneAnalyser:AnalyserNode|null=null;
let externalAnalyser:AnalyserNode|null=null;
let externalKind:'SYSTEM AUDIO'|'INTERNET RADIO'|null=null;
let microphonePlaying=false;
let mediaElement:HTMLAudioElement|null=null,playing=false,sensitivity=.5;
let lastSample=0,sectionAt=0,historyCursor=0,historyCount=0,lastSongTime=0;
const detector=new BeatDetector();
const envelopes=[new BandEnvelope(),new BandEnvelope(),new BandEnvelope()];
const history=new Float32Array(48);
// Beat analysis must not rely on render FPS. The background can be GPU-bound
// while a lightweight 25ms Web Audio sampler continues to track onsets.
let audioPump:number|null=null;
function syncAudioPump(){
 if(typeof window==='undefined')return;
 const active=Boolean(analyser&&(playing||microphonePlaying||externalKind));
 if(active&&audioPump===null){
  audioPump=window.setInterval(()=>{
   if(!document.hidden)readLocalAudio(performance.now());
  },25);
 }else if(!active&&audioPump!==null){
  window.clearInterval(audioPump);audioPump=null;
 }
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function setAudioSensitivity(value:number){sensitivity=clamp(value)}
export function getAudioSensitivity(){return sensitivity}
let spectrumSensitivity=.35;
export function setSpectrumSensitivity(value:number){spectrumSensitivity=Number.isFinite(value)?clamp(value):.35}
export function getSpectrumSensitivity(){return spectrumSensitivity}
export function spectrumResponse(raw:number,gain=spectrumSensitivity){
 return clamp(Math.pow(Math.max(0,raw-.055),1.35)*2.2*clamp(gain));
}
/** Read-only by convention: stable, freshly smoothed 64-band spectrum from the active source. */
export function getAudioFrequencyBands():Float32Array{return metrics.bands}
let virtualMediaTime:number|null=null;
export function setVirtualMediaTime(time:number|null){virtualMediaTime=typeof time==='number'&&Number.isFinite(time)?Math.max(0,time):null}
export function setLocalMediaElement(element:HTMLAudioElement|null){mediaElement=element}
export function getLocalMediaTime(){
 if(mediaElement&&mediaElement.currentSrc&&(playing||(!microphonePlaying&&!externalKind)))return mediaElement.currentTime;
 return virtualMediaTime;
}
function activate(node:AnalyserNode|null){
 if(node===analyser)return;
 analyser=node;
 frequency=node?new Uint8Array(new ArrayBuffer(node.frequencyBinCount)):null;
 waveform=node?new Uint8Array(new ArrayBuffer(node.fftSize)):null;
 lastSample=0;sectionAt=0;historyCursor=0;historyCount=0;lastSongTime=0;
 history.fill(0);metrics.bands.fill(0);detector.reset();envelopes.forEach(e=>e.reset());
 for(const field of ['loudness','bass','mids','treble','beat','rms','onset','downbeat',
 'bpm','tempoConfidence','flux','threshold','beatCount'] as const)metrics[field]=0;
 metrics.section='unknown';metrics.sectionConfidence=0;
 syncAudioPump();
}
export function setLocalAudioPlaying(value:boolean){
 playing=value;activate(value?localAnalyser:externalKind?externalAnalyser:microphonePlaying?microphoneAnalyser:null);
}
export function isLocalAudioPlaying(){return playing&&localAnalyser!==null}
export function isMicrophonePlaying(){return !playing&&microphonePlaying&&microphoneAnalyser!==null}
export function getInputSource(){return isLocalAudioPlaying()?'LOCAL AUDIO':externalKind??(isMicrophonePlaying()?'MICROPHONE':'IDLE')}
export function connectLocalAudio(node:AnalyserNode|null){
 localAnalyser=node;
 activate(playing?node:externalKind?externalAnalyser:microphonePlaying?microphoneAnalyser:null);
}
export function connectMicrophoneAudio(node:AnalyserNode|null){
 microphoneAnalyser=node;microphonePlaying=Boolean(node);
 if(!playing&&!externalKind)activate(node);
}
/** External permitted audio sources enter the same local-only beat analyzer. */
export function connectExternalAudio(node:AnalyserNode|null,source:'SYSTEM AUDIO'|'INTERNET RADIO'='SYSTEM AUDIO'){
 externalAnalyser=node;externalKind=node?source:null;
 if(!playing)activate(node??(microphonePlaying?microphoneAnalyser:null));
}
export function readLocalAudio(now=performance.now()):AudioMetrics|null{
 if(!analyser||!frequency||!waveform||(!playing&&!microphonePlaying&&!externalKind))return null;
 if(now-lastSample<11)return metrics;
 const sampleDelta=lastSample?(now-lastSample)/1000:.025;
 lastSample=now;
 const songTime=playing?getLocalMediaTime():null;
 if(songTime!==null){
  if(lastSongTime&&Math.abs(songTime-lastSongTime)>1.2){detector.reset();envelopes.forEach(e=>e.reset())}
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
 // 64 log-spaced bands let visual compositions react to specific frequencies.
 const bands=metrics.bands;
 const minHz=32,maxHz=Math.min(14000,nyquist*.95);
 const ratio=maxHz/minHz;
 const gain=1.75*Math.pow(sensitivity,1.05);
 const rise=.52,fall=.16;
 for(let j=0;j<bands.length;j++){
  const startHz=minHz*Math.pow(ratio,j/bands.length);
  const endHz=minHz*Math.pow(ratio,(j+1)/bands.length);
  const a=Math.max(0,Math.min(frequency.length-1,Math.floor(startHz/nyquist*frequency.length)));
  const b=Math.max(a+1,Math.min(frequency.length,Math.ceil(endHz/nyquist*frequency.length)));
  let sum=0,peak=0;
  for(let i=a;i<b;i++){const v=frequency[i]/255;sum+=v;peak=Math.max(peak,v)}
  const raw=(sum/(b-a))*.72+peak*.28;
  const target=spectrumResponse(raw);
  bands[j]+=(target-bands[j])*(target>bands[j]?rise:fall);
 }
 const bass=envelopes[0].update(band(35,230),sampleDelta,gain);
 const mids=envelopes[1].update(band(230,2400),sampleDelta,gain);
 const treble=envelopes[2].update(band(2400,11500),sampleDelta,gain*1.25);
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
