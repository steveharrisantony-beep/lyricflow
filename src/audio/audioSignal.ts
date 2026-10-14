/** Live, local-only Web Audio measurements. Values are 0..1 and share one reusable object. */
export interface AudioMetrics {
 loudness:number; bass:number; mids:number; treble:number; beat:number; rms:number;
}
const metrics:AudioMetrics={loudness:0,bass:0,mids:0,treble:0,beat:0,rms:0};
let analyser:AnalyserNode|null=null;
let sensitivity=0.35;
export function setAudioSensitivity(value:number){sensitivity=Math.max(0,Math.min(1,value));}
export function getAudioSensitivity(){return sensitivity;}
let frequency:Uint8Array<ArrayBuffer>|null=null;
let waveform:Uint8Array<ArrayBuffer>|null=null;
let playing=false,previousEnergy=0,averageEnergy=0,beatCooldown=0,lastSample=0;
let mediaElement:HTMLAudioElement|null=null;
export function setLocalMediaElement(element:HTMLAudioElement|null){mediaElement=element;}
export function getLocalMediaTime(){return mediaElement&&mediaElement.currentSrc?mediaElement.currentTime:null;}
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
export function setLocalAudioPlaying(value:boolean){
 playing=value;
 if(!value) {previousEnergy=0;beatCooldown=0;}
}
export function isLocalAudioPlaying(){return playing&&analyser!==null;}
export function connectLocalAudio(node:AnalyserNode|null){
 analyser=node;playing=false;previousEnergy=0;averageEnergy=0;beatCooldown=0;lastSample=0;
 frequency=node?new Uint8Array(new ArrayBuffer(node.frequencyBinCount)):null;
 waveform=node?new Uint8Array(new ArrayBuffer(node.fftSize)):null;
 for(const key of Object.keys(metrics) as (keyof AudioMetrics)[]) metrics[key]=0;
}
export function readLocalAudio(now=performance.now()):AudioMetrics|null{
 if(!analyser||!frequency||!waveform||!playing)return null;
 // Prevent duplicate analyzer samples if multiple visual consumers request the same frame.
 if(now-lastSample<8)return metrics;
 const dt=Math.min(.1,Math.max(.008,(now-(lastSample||now-16))/1000));
 lastSample=now;
 analyser.getByteFrequencyData(frequency);
 analyser.getByteTimeDomainData(waveform);
 const nyquist=analyser.context.sampleRate/2;
 const band=(low:number,high:number)=>{
   const lo=Math.min(frequency!.length-1,Math.floor(low/nyquist*frequency!.length));
   const hi=Math.min(frequency!.length,Math.max(lo+1,Math.ceil(high/nyquist*frequency!.length)));
   let sum=0;
   for(let i=lo;i<hi;i++)sum+=frequency![i];
   return sum/(hi-lo)/255;
 };
 let squared=0;
 for(let i=0;i<waveform.length;i++){const n=(waveform[i]-128)/128;squared+=n*n;}
 const rms=Math.sqrt(squared/waveform.length);
 const gain=.24+sensitivity*1.5;
 const bass=clamp(band(35,220)*1.7*gain);
 const mids=clamp(band(220,2300)*2.0*gain);
 const treble=clamp(band(2300,11000)*2.2*gain);
 const loudness=clamp(rms*5*gain);
 const rawEnergy=.57*bass+.29*mids+.14*treble;
 const attack=(rawEnergy>metrics.loudness)?0.42:0.14;
 const smooth=(key:keyof AudioMetrics,target:number,k=0.28)=>{
   metrics[key]+= (target-metrics[key])*k;
 };
 smooth('bass',bass,attack);smooth('mids',mids,attack);smooth('treble',treble,attack);
 smooth('rms',clamp(rms*4),attack);smooth('loudness',loudness,attack);
 averageEnergy+=(rawEnergy-averageEnergy)*Math.min(1,dt*1.4);
 beatCooldown=Math.max(0,beatCooldown-dt);
 const onset=rawEnergy-previousEnergy;
 const isBeat=rawEnergy>0.08&&onset>0.045&&rawEnergy>averageEnergy*1.22&&beatCooldown===0;
 if(isBeat){beatCooldown=0.14;metrics.beat=1;}
 else metrics.beat*=Math.exp(-dt*9);
 previousEnergy=rawEnergy;
 return metrics;
}
