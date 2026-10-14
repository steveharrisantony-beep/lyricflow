export interface AudioMetrics { loudness:number; bass:number; mids:number; treble:number; beat:number }
const zero:AudioMetrics={loudness:0,bass:0,mids:0,treble:0,beat:0};
let analyser:AnalyserNode|null=null;
let playing=false;
export function setLocalAudioPlaying(value:boolean){playing=value;}
let data:Uint8Array<ArrayBuffer>|null=null;
let last=0,peak=0;
let values:AudioMetrics={...zero};
export function connectLocalAudio(node:AnalyserNode|null){
 analyser=node;data=node?new Uint8Array(new ArrayBuffer(node.frequencyBinCount)):null;
 last=0;peak=0;values={...zero};
}
export function readLocalAudio():AudioMetrics|null {
 if(!analyser || !data || !playing)return null;
 analyser.getByteFrequencyData(data);
 const nyquist=analyser.context.sampleRate/2;
 const band=(low:number,high:number)=>{
  const lo=Math.max(0,Math.floor(low/nyquist*data!.length)),hi=Math.min(data!.length,Math.max(lo+1,Math.ceil(high/nyquist*data!.length)));
  let sum=0;for(let i=lo;i<hi;i++)sum+=data![i];return sum/Math.max(1,hi-lo)/255;
 };
 const bass=band(35,220),mids=band(220,2500),treble=band(2500,11000);
 const raw=Math.min(1,bass*.42+mids*.43+treble*.15);
 const smoothing=.19;
 values.bass+=(bass-values.bass)*smoothing;
 values.mids+=(mids-values.mids)*smoothing;
 values.treble+=(treble-values.treble)*smoothing;
 values.loudness+=(raw-values.loudness)*smoothing;
 const rise=Math.max(0,raw-last);
 peak=Math.max(peak*.88,rise>.12?rise:0);
 values.beat+=(Math.min(1,peak*4)-values.beat)*.22;
 last=raw;
 return values;
}