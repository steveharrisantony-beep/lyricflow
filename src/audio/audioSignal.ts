/** Shared local-only Web Audio analyzer. No recording or network requests. */
export interface AudioMetrics{
 loudness:number;bass:number;mids:number;treble:number;beat:number;rms:number;
 onset:number;downbeat:number;bpm:number;tempoConfidence:number;
 section:'unknown'|'quiet'|'steady'|'building'|'energetic';sectionConfidence:number;
}
const metrics:AudioMetrics={loudness:0,bass:0,mids:0,treble:0,beat:0,rms:0,onset:0,downbeat:0,bpm:0,tempoConfidence:0,section:'unknown',sectionConfidence:0};
let analyser:AnalyserNode|null=null,frequency:Uint8Array<ArrayBuffer>|null=null,waveform:Uint8Array<ArrayBuffer>|null=null;
let localAnalyser:AnalyserNode|null=null,microphoneAnalyser:AnalyserNode|null=null,microphonePlaying=false;
let mediaElement:HTMLAudioElement|null=null,playing=false,sensitivity=.50;
let lastSample=0,previousEnergy=0,averageEnergy=0,lastHit=0,lastSongTime=0;
let beatCounter=0,sectionAt=0,historyCount=0,historyCursor=0;
const hitTimes=new Float64Array(24);
const energyHistory=new Float32Array(48);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function setAudioSensitivity(value:number){sensitivity=clamp(value)}
export function getAudioSensitivity(){return sensitivity}
export function setLocalMediaElement(element:HTMLAudioElement|null){mediaElement=element}
export function getLocalMediaTime(){return mediaElement&&mediaElement.currentSrc&&(!microphonePlaying||playing)?mediaElement.currentTime:null}
function activate(node:AnalyserNode|null){
 if(node===analyser)return;
 analyser=node;frequency=node?new Uint8Array(new ArrayBuffer(node.frequencyBinCount)):null;
 waveform=node?new Uint8Array(new ArrayBuffer(node.fftSize)):null;
 lastSample=0;previousEnergy=0;averageEnergy=0;lastHit=0;lastSongTime=0;
 beatCounter=0;historyCount=0;historyCursor=0;sectionAt=0;hitTimes.fill(0);energyHistory.fill(0);
 metrics.bpm=0;metrics.tempoConfidence=0;metrics.section='unknown';metrics.sectionConfidence=0;
 for(const field of ['loudness','bass','mids','treble','rms','beat','onset','downbeat'] as const)metrics[field]=0;
}
export function setLocalAudioPlaying(value:boolean){playing=value;activate(value?localAnalyser:microphonePlaying?microphoneAnalyser:null)}
export function isLocalAudioPlaying(){return playing&&localAnalyser!==null}
export function isMicrophonePlaying(){return !playing&&microphonePlaying&&microphoneAnalyser!==null}
export function getInputSource(){return isLocalAudioPlaying()?'LOCAL AUDIO':isMicrophonePlaying()?'MICROPHONE':'IDLE'}
export function connectLocalAudio(node:AnalyserNode|null){localAnalyser=node;if(playing||!microphonePlaying)activate(playing?node:null)}
export function connectMicrophoneAudio(node:AnalyserNode|null){microphoneAnalyser=node;microphonePlaying=Boolean(node);if(!playing)activate(node)}
function estimateTempo(){
 const intervals:number[]=[]; // only allocated on infrequent beat events
 for(let i=1;i<hitTimes.length;i++){
  const a=hitTimes[i-1],b=hitTimes[i],dt=b-a;
  if(a>0&&dt>=.25&&dt<=1.5)intervals.push(dt);
 }
 if(intervals.length<4)return;
 intervals.sort((a,b)=>a-b);
 const median=intervals[Math.floor(intervals.length/2)];
 const deviation=intervals.reduce((sum,v)=>sum+Math.abs(v-median),0)/intervals.length;
 let bpm=60/median;
 while(bpm<76)bpm*=2;
 while(bpm>172)bpm/=2;
 const consistency=clamp(1-deviation/Math.max(.10,median*.6));
 metrics.bpm=Math.round(bpm);
 metrics.tempoConfidence=clamp(consistency*Math.min(1,intervals.length/8))*.8; // never claim exact tempo
}
export function readLocalAudio(now=performance.now()):AudioMetrics|null{
 if(!analyser||!frequency||!waveform||(!playing&&!microphonePlaying))return null;
 if(now-lastSample<8)return metrics;
 const dt=Math.min(.08,Math.max(.008,(now-(lastSample||now-16))/1000));
 lastSample=now;
 const songTime=getLocalMediaTime();
 if(songTime!==null){
  if(lastSongTime&&Math.abs(songTime-lastSongTime)>1.0){
   hitTimes.fill(0);beatCounter=0;lastHit=0;metrics.bpm=0;metrics.tempoConfidence=0;
  }
  lastSongTime=songTime;
 }
 analyser.getByteFrequencyData(frequency);
 analyser.getByteTimeDomainData(waveform);
 const nyquist=analyser.context.sampleRate*.5;
 const band=(lo:number,hi:number)=>{
  const start=Math.max(0,Math.min(frequency!.length-1,Math.floor(lo/nyquist*frequency!.length)));
  const end=Math.min(frequency!.length,Math.max(start+1,Math.ceil(hi/nyquist*frequency!.length)));
  let value=0;
  for(let i=start;i<end;i++)value+=frequency![i];
  return value/(end-start)/255;
 };
 let sum=0;
 for(let i=0;i<waveform.length;i++){const v=(waveform[i]-128)/128;sum+=v*v}
 const amplitude=Math.sqrt(sum/waveform.length);
 // User sensitivity: 0 means no reaction, default 50% for the tablet.
 const gain=1.6*Math.pow(sensitivity,1.3);
 const bass=clamp(band(35,220)*1.7*gain),mids=clamp(band(220,2300)*2*gain);
 const treble=clamp(band(2300,11000)*2.2*gain);
 const loudness=clamp(amplitude*5*gain);
 const energy=.56*bass+.31*mids+.13*treble;
 const attack=energy>.56*metrics.bass+.31*metrics.mids+.13*metrics.treble?.40:.14;
 metrics.bass+=(bass-metrics.bass)*attack;
 metrics.mids+=(mids-metrics.mids)*attack;
 metrics.treble+=(treble-metrics.treble)*attack;
 metrics.loudness+=(loudness-metrics.loudness)*attack;
 metrics.rms+=(clamp(amplitude*4*gain)-metrics.rms)*attack;
 averageEnergy+=(energy-averageEnergy)*Math.min(1,dt*1.5);
 const change=Math.max(0,energy-previousEnergy);
 const nowSeconds=songTime??now/1000;
 const onset=energy>.006&&change>Math.max(.003,averageEnergy*.13)&&nowSeconds-lastHit>.20;
 metrics.onset=Math.max(metrics.onset*Math.exp(-dt*13),onset?clamp(change/(averageEnergy+.006)):0);
 metrics.beat*=Math.exp(-dt*8);metrics.downbeat*=Math.exp(-dt*7);
 if(onset){
  lastHit=nowSeconds;metrics.beat=1;beatCounter++;
  if(beatCounter%4===1)metrics.downbeat=1; // heuristic grouping, not a true meter analysis
  hitTimes.copyWithin(0,1);hitTimes[hitTimes.length-1]=nowSeconds;
  if(beatCounter%2===0)estimateTempo();
 }
 previousEnergy=energy;
 if(now-sectionAt>250){
  sectionAt=now;energyHistory[historyCursor]=energy;historyCursor=(historyCursor+1)%energyHistory.length;
  historyCount=Math.min(energyHistory.length,historyCount+1);
  let recent=0,older=0;
  const n=Math.min(12,Math.floor(historyCount/2));
  for(let i=0;i<n;i++){
   recent+=energyHistory[(historyCursor-1-i+energyHistory.length)%energyHistory.length];
   older+=energyHistory[(historyCursor-1-i-n+energyHistory.length)%energyHistory.length];
  }
  recent/=Math.max(1,n);older/=Math.max(1,n);
  if(historyCount>=16){
   const shift=recent-older;
   metrics.section=recent<.023?'quiet':shift>.018?'building':recent>.115?'energetic':'steady';
   metrics.sectionConfidence=clamp(Math.abs(shift)*8+.3);
  }
 }
 return metrics;
}
