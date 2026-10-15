/**
 * Lightweight spectral-flux onset / tempo tracker.
 * Uses actual frequency changes, not sensitivity-scaled volume oscillations.
 * All state remains on the device. Downbeats are *heuristic* four-beat groups.
 */
export interface BeatSample {
 onset:number;beat:number;downbeat:number;bpm:number;
 tempoConfidence:number;flux:number;threshold:number;beatCount:number;
}
const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
export class BeatDetector {
 private previous=new Float32Array(0);
 private fluxWindow=new Float32Array(64);
 private hits=new Float64Array(32);
 private fluxCursor=0;
 private fluxCount=0;
 private hitCount=0;
 private lastHit=-1e6;
 private lastTime=-1e6;
 private tempo=0;
 private tempoConfidence=0;
 private beats=0;
 private onsetPulse=0;
 private beatPulse=0;
 private downbeatPulse=0;
 private flux=0;
 private threshold=0;
 reset():void{
  this.previous.fill(0);this.fluxWindow.fill(0);this.hits.fill(0);
  this.fluxCursor=0;this.fluxCount=0;this.hitCount=0;this.lastHit=-1e6;
  this.lastTime=-1e6;this.tempo=0;this.tempoConfidence=0;this.beats=0;
  this.onsetPulse=0;this.beatPulse=0;this.downbeatPulse=0;this.flux=0;this.threshold=0;
 }
 private refreshTempo():void {
  if(this.hitCount<5)return;
  const n=Math.min(this.hitCount,this.hits.length);
  const deltas:number[]=[];
  const start=Math.max(0,this.hitCount-this.hits.length);
  for(let i=1;i<n;i++){
   const left=this.hits[(start+i-1)%this.hits.length];
   const right=this.hits[(start+i)%this.hits.length];
   const interval=right-left;
   if(interval>=.29&&interval<=1.45)deltas.push(interval);
  }
  if(deltas.length<4)return;
  deltas.sort((a,b)=>a-b);
  const median=deltas[Math.floor(deltas.length/2)];
  const filtered=deltas.filter(x=>Math.abs(x-median)<Math.max(.055,median*.18));
  if(filtered.length<3)return;
  const mean=filtered.reduce((sum,x)=>sum+x,0)/filtered.length;
  let bpm=60/mean;
  while(bpm<70)bpm*=2;
  while(bpm>180)bpm/=2;
  const strength=filtered.length/deltas.length;
  const deviation=filtered.reduce((sum,x)=>sum+Math.abs(x-mean),0)/filtered.length;
  const consistency=clamp(1-deviation/Math.max(.045,mean*.16));
  const confidence=clamp(strength*consistency*Math.min(1,filtered.length/8));
  if(this.tempo&&confidence>.35){
   // Prefer the established tempo unless the candidate is demonstrably stable.
   this.tempo=this.tempo*.72+bpm*.28;
  }else if(confidence>.22)this.tempo=bpm;
  this.tempoConfidence=confidence;
 }
 /**
  * freq = analyser byte spectrum, maxFreqHz = audio sampleRate/2.
  * Analyze spectrum *before* visual sensitivity gain; threshold adapts to noise.
  */
 update(freq:Uint8Array,time:number,maxFreqHz:number,rms:number,sensitivity=.5):BeatSample{
  if(this.lastTime>-1e5&&(time<this.lastTime-.3||time-this.lastTime>2)){
   this.reset();
  }
  const dt=this.lastTime<0?.016:clamp(time-this.lastTime,.008,.08);
  this.lastTime=time;
  const count=freq.length;
  if(this.previous.length!==count){
   this.previous=new Float32Array(count);
   this.fluxWindow.fill(0);this.fluxCount=0;this.fluxCursor=0;
  }
  const low=Math.max(1,Math.floor(55/maxFreqHz*count));
  const high=Math.min(count,Math.ceil(12000/maxFreqHz*count));
  let flux=0,weightSum=0;
  for(let i=low;i<high;i++){
   const hz=(i+.5)*maxFreqHz/count;
   const weight=hz<230?2.5:hz<2300?1.2:.55;
   // Log compression keeps quiet attacks visible without saturation.
   const value=Math.log1p(12*freq[i]/255)/Math.log1p(12);
   const delta=Math.max(0,value-this.previous[i]);
   flux+=delta*weight;
   weightSum+=weight;
   this.previous[i]=value;
  }
  const value=weightSum?flux/weightSum:0;
  this.flux=value;
  let mean=0;
  for(let i=0;i<this.fluxCount;i++)mean+=this.fluxWindow[i];
  mean/=Math.max(1,this.fluxCount);
  let variance=0;
  for(let i=0;i<this.fluxCount;i++){
   const v=this.fluxWindow[i]-mean;variance+=v*v;
  }
  const std=Math.sqrt(variance/Math.max(1,this.fluxCount));
  // Allow sensitivity to shift the threshold *slightly*, never turn silence into beats.
  const threshold=mean+Math.max(.0038,std*(1.5-.6*clamp(sensitivity)))+.0015;
  this.threshold=threshold;
  // One frame is enough to detect a sharp attack; use refractory period for flams.
  const minSpacing=this.tempo>0?Math.max(.20,Math.min(.32,30/this.tempo*.62)):.23;
  const hit=this.fluxCount>=6&&rms>.005&&value>threshold&&
   value>mean*1.35&&time-this.lastHit>=minSpacing;
  this.onsetPulse=Math.max(0,this.onsetPulse-dt*5.4);
  this.beatPulse=Math.max(0,this.beatPulse-dt*2.5);
  this.downbeatPulse=Math.max(0,this.downbeatPulse-dt*2.5);
  if(hit){
   this.lastHit=time;this.beats++;this.onsetPulse=1;this.beatPulse=1;
   if(this.beats%4===1)this.downbeatPulse=1; // NOT confirmed time-signature detection.
   this.hits[this.hitCount%this.hits.length]=time;
   this.hitCount++;
   if(this.hitCount%2===0)this.refreshTempo();
  }
  this.fluxWindow[this.fluxCursor]=value;
  this.fluxCursor=(this.fluxCursor+1)%this.fluxWindow.length;
  this.fluxCount=Math.min(this.fluxCount+1,this.fluxWindow.length);
  return {onset:this.onsetPulse,beat:this.beatPulse,downbeat:this.downbeatPulse,
   bpm:this.tempo?Math.round(this.tempo):0,
   tempoConfidence:this.tempoConfidence,flux:this.flux,threshold:this.threshold,
   beatCount:this.beats};
 }
}
