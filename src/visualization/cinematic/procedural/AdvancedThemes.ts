import type {SceneId,ThemePalette} from '../catalog';
import type {Pulse} from '../paint';

export interface MotionDetail {bands?:Float32Array;detail?:number}
const TAU=Math.PI*2;
const advancedIds=new Set<SceneId>(['fluid-ink','spectral-terrain','resonance-plate','mycelium-network']);
const clamp=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;

/** Bands are already logarithmically spaced by the shared analyzer. Never create another audio graph. */
export function frequencyDrive(p:Pulse,bands:Float32Array|undefined,position:number){
 const x=clamp(position);
 if(!bands?.length)return clamp(x<.3?p.bass:x<.7?p.mids:p.treble);
 const index=x*(bands.length-1),lo=Math.floor(index),mix=index-lo;
 return clamp(bands[lo]??0)*(1-mix)+clamp(bands[Math.min(lo+1,bands.length-1)]??0)*mix;
}

// Fixed, repeatable seeds; no per-frame particle arrays or random re-seeding.
const seeds=Float32Array.from({length:3200},(_,i)=>(i*(i%2?.754877666:.569840291))%1);
interface Branch {parent:number;angle:number;length:number;depth:number}
const branches:Branch[]=[];
function branch(parent:number,angle:number,length:number,depth:number){
 const index=branches.push({parent,angle,length,depth})-1;
 if(depth<5){
  branch(index,angle-.35-depth*.026,length*.73,depth+1);
  branch(index,angle+.43-depth*.018,length*.71,depth+1);
 }
}
for(let i=0;i<5;i++)branch(-1,i*TAU/5,.15,0);
const branchXY=new Float32Array(branches.length*2);

/** Original Canvas interpretations of flow fields, spectral geometry and nodal patterns. */
export function drawAdvancedTheme(c:CanvasRenderingContext2D,w:number,h:number,time:number,
 p:Pulse,id:SceneId,palette:ThemePalette,intensity:number,reduced:boolean,options:MotionDetail):boolean{
 if(!advancedIds.has(id))return false;
 const u=Math.min(w,h),detail=Math.max(.3,Math.min(1,options.detail??1));
 const gain=Math.max(0,intensity)*(reduced?.12:1);
 const bass=clamp(p.bass)*gain,mid=clamp(p.mids)*gain,high=clamp(p.treble)*gain,hit=clamp(p.beat)*gain;
 const t=reduced?0:time;
 const {background,foreground,accent}=palette;
 const band=(x:number)=>frequencyDrive(p,options.bands,x)*gain;
 c.save();
 if(id==='fluid-ink'){
  // Translucent nested membranes, with independent bass mass and treble edge ripples.
  for(let l=5;l>=0;l--){
   const cx=w*(.5+Math.sin(t*.12+l*.45)*.12),cy=h*(.5+Math.cos(t*.15+l*.62)*.12);
   const radius=u*(.16+l*.035+bass*.075);
   c.beginPath();
   const steps=Math.round(64*detail);
   for(let j=0;j<=steps;j++){
    const a=j/steps*TAU;
    const r=radius*(1+Math.sin(a*3+t*.26+l*.5)*(.15+mid*.15)+Math.cos(a*7-t*.4)*high*.055);
    const x=cx+Math.cos(a)*r*1.35,y=cy+Math.sin(a)*r;
    if(j===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.closePath();
   const ink=c.createRadialGradient(cx-radius*.4,cy-radius*.3,0,cx,cy,radius*1.5);
   ink.addColorStop(0,foreground+'16');ink.addColorStop(.6,accent+'28');ink.addColorStop(1,accent+'88');
   c.fillStyle=ink;c.fill();c.strokeStyle=accent+'66';c.lineWidth=1+hit*2;c.stroke();
  }
  for(let i=0;i<Math.round(36*detail);i++){
   const a=i*2.39996+t*.07,r=u*(.30+seeds[i]*.30+band(i/36)*.08);
   c.beginPath();c.arc(w*.5+Math.cos(a)*r*1.4,h*.5+Math.sin(a)*r,u*(.002+high*.005),0,TAU);
   c.fillStyle=accent+'99';c.fill();
  }
 }else if(id==='spectral-terrain'){
  const rows=Math.round(24*detail),cols=Math.round(48*detail),horizon=h*.27;
  // Far-to-near opaque ridge fills supply depth without WebGL or a history framebuffer.
  for(let r=0;r<rows;r++){
   const z=r/(rows-1),depth=.08+z*z*.92;
   c.beginPath();
   for(let j=0;j<=cols;j++){
    const x=j/cols,energy=band(x);
    const ridge=Math.pow(.5+.5*Math.sin(x*14+t*.65-r*.43),2);
    const height=u*(.035+energy*.20+bass*.06)*depth*ridge;
    const px=w*.5+(x-.5)*w*(.2+depth*1.6);
    const py=horizon+depth*h*.78-height;
    if(j===0)c.moveTo(px,py);else c.lineTo(px,py);
   }
   c.lineTo(w*1.5,h*1.4);c.lineTo(-w*.5,h*1.4);c.closePath();
   c.fillStyle=background;c.fill();
   c.strokeStyle=r%4===0?foreground+'70':accent+'aa';c.lineWidth=.6+depth*1.3+hit*.7;c.stroke();
  }
  const fog=c.createLinearGradient(0,horizon-h*.08,0,horizon+h*.25);
  fog.addColorStop(0,background);fog.addColorStop(1,background+'00');c.fillStyle=fog;c.fillRect(0,0,w,horizon+h*.25);
 }else if(id==='resonance-plate'){
  const size=u*.43,m=3+mid*.4,n=5+bass*.5,rotation=Math.sin(t*.06)*.10;
  c.translate(w*.5,h*.5);c.rotate(rotation);
  c.strokeStyle=accent+'36';c.lineWidth=1;c.strokeRect(-size,-size,size*2,size*2);
  const count=Math.round(1600*detail);
  // Project deterministic grains toward standing-wave nodes with an analytic gradient.
  for(let i=0;i<count;i++){
   let x=seeds[i*2]*2-1,y=seeds[i*2+1]*2-1;
   for(let step=0;step<3;step++){
    const mx=m*Math.PI*x,my=m*Math.PI*y,nx=n*Math.PI*x,ny=n*Math.PI*y;
    const f=Math.cos(mx)*Math.cos(ny)-Math.cos(nx)*Math.cos(my);
    const gx=-m*Math.PI*Math.sin(mx)*Math.cos(ny)+n*Math.PI*Math.sin(nx)*Math.cos(my);
    const gy=-n*Math.PI*Math.cos(mx)*Math.sin(ny)+m*Math.PI*Math.cos(nx)*Math.sin(my);
    const correction=f/(gx*gx+gy*gy+.15);
    x=Math.max(-1,Math.min(1,x-correction*gx));y=Math.max(-1,Math.min(1,y-correction*gy));
   }
   const flutter=Math.sin(t*.6+i*1.7)*high*.007;
   c.fillStyle=i%6===0?foreground:accent;
   c.globalAlpha=.35+seeds[i]*.55;
   c.beginPath();c.arc((x+flutter)*size,y*size,u*(.001+seeds[i]*.0015+hit*.001),0,TAU);c.fill();
  }
 }else{
  const expand=1+bass*.22;
  c.lineCap='round';
  for(let i=0;i<branches.length;i++){
   const b=branches[i],parent=b.parent;
   const px=parent<0?0:branchXY[parent*2],py=parent<0?0:branchXY[parent*2+1];
   const angle=b.angle+Math.sin(t*.21+b.depth*.7+i*.03)*(.035+mid*.10);
   const x=px+Math.cos(angle)*b.length*expand,y=py+Math.sin(angle)*b.length*expand;
   branchXY[i*2]=x;branchXY[i*2+1]=y;
   if(b.depth>(detail<.6?3:detail<.85?4:5))continue;
   const x1=w*.5+px*u,y1=h*.5+py*u,x2=w*.5+x*u,y2=h*.5+y*u;
   c.strokeStyle=accent+(b.depth<3?'99':'55');c.lineWidth=Math.max(.6,(5-b.depth)*.6+band(i/branches.length)*2);
   c.beginPath();c.moveTo(x1,y1);c.quadraticCurveTo(x2,y1,x2,y2);c.stroke();
   const phase=(t*.23+b.depth*.16+i*.019)%1;
   const q=1-phase;
   c.beginPath();c.arc(q*q*x1+(1-q*q)*x2,(1-phase*phase)*y1+phase*phase*y2,u*(.0018+high*.003),0,TAU);
   c.fillStyle=foreground+'b0';c.fill();
  }
  if(hit>.02){c.strokeStyle=accent+'55';c.lineWidth=1;c.beginPath();c.arc(w*.5,h*.5,u*(.03+.18*(1-hit)),0,TAU);c.stroke();}
 }
 c.restore();return true;
}
