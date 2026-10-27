import type {Pulse} from './paint';

const clamp=(x:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));

export interface CameraFrame {
 x:number;
 y:number;
 roll:number;
 yaw:number;
 pitch:number;
 zoom:number;
 impact:number;
}

export const STILL_CAMERA:CameraFrame={x:0,y:0,roll:0,yaw:0,pitch:0,zoom:1,impact:0};

/**
 * Converts shakeSensitivity (either 0..100 UI percentage or 0..2 normalized)
 * into the bass threshold (0.15..0.82) required to trigger a camera shake.
 * Higher sensitivity => lower bass threshold required to trigger shake.
 */
export function computeBassThreshold(shakeSensitivity:number):number{
 if(!Number.isFinite(shakeSensitivity)||shakeSensitivity<=0)return 1;
 const norm=shakeSensitivity>2
  ?clamp(shakeSensitivity/100,0,1)
  :clamp(shakeSensitivity,0,1);
 return clamp(0.82-norm*0.64,0.16,0.82);
}

/**
 * Smooth bass-driven camera rig:
 * - Triggers camera shake strictly according to bass (p.bass) exceeding the sensitivity-controlled bass threshold.
 * - Uses critically-damped exponential smoothing and low-frequency harmonic curves for a smooth, fluid bass shake.
 */
export class MusicCameraRig {
 private smoothBass=0;
 private smoothX=0;
 private smoothY=0;
 private smoothRoll=0;
 private smoothPitch=0;
 private smoothYaw=0;
 private phase=0;
 private previousTime=-1;

 reset(){
  this.smoothBass=0;
  this.smoothX=0;
  this.smoothY=0;
  this.smoothRoll=0;
  this.smoothPitch=0;
  this.smoothYaw=0;
  this.phase=0;
  this.previousTime=-1;
 }

 sample(
  time:number,
  p:Pulse,
  intensity:number,
  reduced:boolean,
  wordHit=0,
  shakeEnabled=true,
  shakeSensitivity=1,
  _beatCount?:number
 ):CameraFrame{
  if(time<this.previousTime-.15||time-this.previousTime>1.5)this.reset();
  const dt=this.previousTime>=0?Math.max(0.004,Math.min(0.12,time-this.previousTime)):0.016;
  this.previousTime=time;

  if(reduced||intensity<=0||!shakeEnabled||shakeSensitivity<=0){
   this.smoothBass=0;
   this.smoothX=0;
   this.smoothY=0;
   this.smoothRoll=0;
   this.smoothPitch=0;
   this.smoothYaw=0;
   return {...STILL_CAMERA};
  }

  const bassThreshold=computeBassThreshold(shakeSensitivity);
  const bassLevel=clamp(p.bass,0,1);

  // Bass excess above the sensitivity-controlled threshold
  const rawExcess=bassLevel>bassThreshold
   ?clamp((bassLevel-bassThreshold)/Math.max(0.16,1-bassThreshold),0,1)
   :0;

  // Smooth attack and smooth release so the camera glides fluidly with the bass wave
  const rate=rawExcess>this.smoothBass?16:6.5;
  const alpha=1-Math.exp(-dt*rate);
  this.smoothBass+=((rawExcess-this.smoothBass)*alpha);
  if(this.smoothBass<0.003&&rawExcess===0){
   this.smoothBass=0;
  }

  const env=clamp(this.smoothBass*clamp(intensity,0,1.25),0,1);
  if(env===0){
   this.smoothX=0;
   this.smoothY=0;
   this.smoothRoll=0;
   this.smoothPitch=0;
   this.smoothYaw=0;
   return {...STILL_CAMERA};
  }

  // Advance smooth organic phase proportional to bass energy
  this.phase+=dt*(5.2+env*6.4);

  const targetX=Math.sin(this.phase)*env*0.011;
  const targetY=Math.cos(this.phase*0.78)*env*0.012;
  const targetRoll=Math.sin(this.phase*0.64)*env*0.014;
  const targetYaw=Math.cos(this.phase*0.52)*env*0.020;
  const targetPitch=Math.sin(this.phase*0.85)*env*0.016;

  const posAlpha=1-Math.exp(-dt*18);
  this.smoothX+=(targetX-this.smoothX)*posAlpha;
  this.smoothY+=(targetY-this.smoothY)*posAlpha;
  this.smoothRoll+=(targetRoll-this.smoothRoll)*posAlpha;
  this.smoothYaw+=(targetYaw-this.smoothYaw)*posAlpha;
  this.smoothPitch+=(targetPitch-this.smoothPitch)*posAlpha;

  const wordBoost=clamp(wordHit)*env*0.014;

  return {
   x:this.smoothX||0,
   y:this.smoothY||0,
   roll:this.smoothRoll||0,
   yaw:this.smoothYaw||0,
   pitch:this.smoothPitch||0,
   zoom:1+env*0.048+wordBoost,
   impact:env||0
  };
 }
}

export interface ProjectedPoint {x:number;y:number;visible:boolean}
export type ProjectPoint=(x:number,y:number,z:number)=>ProjectedPoint;

/** Canvas counterpart of a perspective camera for 2D worlds and the WebGL fallback. */
export function makeLyricProjection(w:number,h:number,camera:CameraFrame):ProjectPoint{
 const focal=Math.min(w,h)*1.75;
 return (x,y,z)=>{
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const xx=x*cy-z*sy,zz=x*sy+z*cy,yy=y*cp-zz*sp,depth=18/camera.zoom-(y*sp+zz*cp);
  const scale=focal/Math.max(2,depth),roll=camera.roll;
  return {
   x:w*.5+(xx*Math.cos(roll)-yy*Math.sin(roll))*scale+camera.x*w,
   y:h*.5-(xx*Math.sin(roll)+yy*Math.cos(roll))*scale+camera.y*h,
   visible:depth>2
  };
 };
}
