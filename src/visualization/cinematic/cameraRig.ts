import type {Pulse} from './paint';
export interface CameraFrame {
 x:number;
 y:number;
 zoom:number;
 roll:number;
 yaw:number;
 pitch:number;
 impact:number;
}
export const STILL_CAMERA:CameraFrame={x:0,y:0,zoom:1,roll:0,yaw:0,pitch:0,impact:0};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

/**
 * Decaying camera impulses timed in song seconds (Tunai-0511/baseline _wire.ts Rig style).
 * Combines restrained figure-8 handheld drift, snap reframes on downbeats,
 * focal punches on kick drums & important sung words, and decaying rotational shake.
 */
export class MusicCameraRig {
 private hitAt=-100;
 private strength=0;
 private downbeatAt=-100;
 private reframeIndex=0;
 private previousOnset=0;
 private previousBeat=0;
 private previousDownbeat=0;
 private previousTime=-1;

 reset(){
  this.hitAt=-100;
  this.strength=0;
  this.downbeatAt=-100;
  this.reframeIndex=0;
  this.previousOnset=0;
  this.previousBeat=0;
  this.previousDownbeat=0;
  this.previousTime=-1;
 }

 sample(time:number,p:Pulse,intensity:number,reduced:boolean,wordHit=0):CameraFrame{
  if(time<this.previousTime-.15||time-this.previousTime>1.5)this.reset();
  if((p.onset>.68&&this.previousOnset<=.68||p.beat>.72&&this.previousBeat<=.72)&&p.loudness>.015){
   this.hitAt=time;
   this.strength=clamp(.38+p.bass*.62);
  }
  if((p.downbeat??0)>.75&&this.previousDownbeat<=.75&&p.loudness>.02){
   this.downbeatAt=time;
   this.reframeIndex=(this.reframeIndex+1)%4;
  }
  this.previousOnset=p.onset;
  this.previousBeat=p.beat;
  this.previousDownbeat=p.downbeat??0;
  this.previousTime=time;

  if(reduced||intensity<=0)return {...STILL_CAMERA};

  const age=Math.max(0,time-this.hitAt);
  const hit=this.strength*Math.exp(-age*10)*intensity;
  const downAge=Math.max(0,time-this.downbeatAt);
  const downImpulse=Math.exp(-downAge*6)*intensity*0.35;
  const emphasis=clamp(wordHit)*intensity;
  const kick=clamp(p.beat)*clamp(p.bass)*intensity;

  // Subtle shot reframe angle biases per bar/downbeat (baseline Rig.base style)
  const shotBiasYaw=((this.reframeIndex%2===0?1:-1)*0.032)*downImpulse;
  const shotBiasRoll=((this.reframeIndex<2?1:-1)*0.012)*downImpulse;

  return {
   x:Math.sin(age*63)*hit*.0065+Math.sin(time*.31)*.0048*intensity,
   y:Math.sin(age*47)*hit*.0082+Math.cos(time*.23)*.0038*intensity,
   roll:Math.sin(age*39)*hit*.012+Math.sin(time*.19)*.0035*intensity+shotBiasRoll,
   yaw:Math.sin(time*.24)*.125*intensity+shotBiasYaw,
   pitch:Math.sin(time*.18)*.072*intensity,
   zoom:1+kick*.024+emphasis*.038+hit*.032+downImpulse*.018,
   impact:Math.max(hit,emphasis*.7,kick*.4)
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
