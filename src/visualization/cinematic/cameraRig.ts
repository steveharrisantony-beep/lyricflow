import type {Pulse} from './paint';
export interface CameraFrame {x:number;y:number;zoom:number;roll:number;yaw:number;pitch:number;impact:number}
export const STILL_CAMERA:CameraFrame={x:0,y:0,zoom:1,roll:0,yaw:0,pitch:0,impact:0};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Decaying camera impulses are timed in song seconds, not frame counts. */
export class MusicCameraRig {
 private hitAt=-100;private strength=0;private previousOnset=0;private previousBeat=0;private previousTime=-1;
 reset(){this.hitAt=-100;this.strength=0;this.previousOnset=0;this.previousBeat=0;this.previousTime=-1}
 sample(time:number,p:Pulse,intensity:number,reduced:boolean,wordHit=0):CameraFrame{
  if(time<this.previousTime-.15||time-this.previousTime>1.5)this.reset();
  if((p.onset>.7&&this.previousOnset<=.7||p.beat>.75&&this.previousBeat<=.75)&&p.loudness>.015){this.hitAt=time;this.strength=clamp(.35+p.bass*.65)}
  this.previousOnset=p.onset;this.previousBeat=p.beat;this.previousTime=time;
  if(reduced||intensity<=0)return {...STILL_CAMERA};
  const age=Math.max(0,time-this.hitAt),hit=this.strength*Math.exp(-age*10)*intensity;
  const emphasis=clamp(wordHit)*intensity;
  const kick=clamp(p.beat)*clamp(p.bass)*intensity;
  return {
   x:Math.sin(age*63)*hit*.005+Math.sin(time*.27)*.004*intensity,
   y:Math.sin(age*47)*hit*.007+Math.cos(time*.21)*.003*intensity,
   roll:Math.sin(age*39)*hit*.009+Math.sin(time*.18)*.003*intensity,
   yaw:Math.sin(time*.23)*.11*intensity,
   pitch:Math.sin(time*.19)*.065*intensity,
   zoom:1+kick*.018+emphasis*.032+hit*.025,
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
  return {x:w*.5+(xx*Math.cos(roll)-yy*Math.sin(roll))*scale+camera.x*w,
   y:h*.5-(xx*Math.sin(roll)+yy*Math.cos(roll))*scale+camera.y*h,visible:depth>2};
 };
}
