/**
 * Art-directed 2D visual engines.
 *
 * PRECISION: High-resolution 64-band spectral sculpture with upper harmonic plotter
 * trace, mirrored reflection floor, orbital phase rings, and telemetry calibration.
 * GEOMETRY: Constructivist & pdoom-video inspired kinetic geometry poster with
 * 3D-extruded hex sculptures, frequency-mapped lattices, and beat shockwaves.
 */
import type {Pulse} from '../paint';
export type GraphicSystem='spectrum'|'geometry';
const TAU=Math.PI*2;
const clamp=(x:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
const fract=(x:number)=>x-Math.floor(x);
const hash=(n:number)=>fract(Math.sin(n*127.1+13.27)*43758.5453);
export type GraphicAudio=Pulse & {bands?:Float32Array};

function hex(c:CanvasRenderingContext2D,x:number,y:number,r:number,rotation=0){
 c.beginPath();
 for(let i=0;i<6;i++){
  const theta=rotation+(i/6)*TAU;
  const a=x+r*Math.cos(theta),b=y+r*Math.sin(theta);
  if(i===0)c.moveTo(a,b);else c.lineTo(a,b);
 }
 c.closePath();
}
function rgb(color:string,a:number){return 'rgba('+color+','+clamp(a)+')'}

export class GraphicCompositions {
 private lastMode:GraphicSystem|null=null;
 private smoothed=new Float32Array(64);
 private peaks=new Float32Array(64);
 private lastTime=0;
 private beatGlow=0;
 private geometricPulse=0;
 private hasDrawn=false;

 constructor(){}

 reset(){
  this.lastMode=null;
  this.smoothed.fill(0);
  this.peaks.fill(0);
  this.lastTime=0;
  this.beatGlow=0;
  this.geometricPulse=0;
  this.hasDrawn=false;
 }

 private sample(p:GraphicAudio,time:number,demo:boolean){
  const dt=this.lastTime?clamp(time-this.lastTime,0,.12):.016;
  this.lastTime=time;
  const bands=p.bands;
  for(let i=0;i<64;i++){
   const simulated=Math.pow(Math.abs(Math.sin(time*2.1+i*.42)*Math.cos(time*.85+i*.19)),2)*
     (.3+.24*Math.max(0,Math.sin(time*3.6+i*.17)))+
     (p.bass+p.treble)*.16;
   const target=bands?.[i]??(demo?simulated:0);
   const speed=target>this.smoothed[i]?0.38:0.12;
   const step=1-Math.pow(1-speed,Math.max(.1,dt*60));
   this.smoothed[i]+=(clamp(target)-this.smoothed[i])*step;
   if(this.smoothed[i]>=this.peaks[i])this.peaks[i]=this.smoothed[i];
   else this.peaks[i]=Math.max(0,this.peaks[i]-dt*0.28);
  }
  const onset=clamp(p.onset*.55+p.beat*.88);
  this.beatGlow=Math.max(this.beatGlow*Math.exp(-dt*6.5),onset);
  this.geometricPulse+=((p.bass*.82+p.mids*.28)-this.geometricPulse)*clamp(dt*6.5);
 }

 render(
  c:CanvasRenderingContext2D,
  w:number,
  h:number,
  time:number,
  p:GraphicAudio,
  mode:GraphicSystem,
  motionBlur:number,
  intensity:number,
  demo=false,
  reduced=false,
  palette?:{background:string;foreground:string;accent:string}
 ){
  if(this.lastMode!==mode){this.reset();this.lastMode=mode}
  const effectiveTime=reduced?time*.14:time;
  this.sample(p,effectiveTime,demo);
  if(!this.hasDrawn||!motionBlur||reduced){
   c.clearRect(0,0,w,h);
   this.hasDrawn=true;
  }
  if(mode==='spectrum')this.spectrum(c,w,h,effectiveTime,p,motionBlur,intensity,reduced,palette);
  else this.geometry(c,w,h,effectiveTime,p,motionBlur,intensity,reduced,palette);
 }

 private spectrum(
  c:CanvasRenderingContext2D,
  w:number,
  h:number,
  t:number,
  p:GraphicAudio,
  blur:number,
  intensity:number,
  reduced:boolean,
  palette?:{background:string;foreground:string;accent:string}
 ){
  const baseline=h*.65,center=w*.5,u=Math.min(w,h);
  const bgCol=palette?.background||'#080b16';
  const accCol=palette?.accent||'#ff6e59';
  const dark=c.createLinearGradient(0,0,w,h);
  dark.addColorStop(0,bgCol);
  dark.addColorStop(.52,accCol+'22');
  dark.addColorStop(1,bgCol);
  c.globalAlpha=1-blur*.006;
  c.fillStyle=dark;
  c.fillRect(0,0,w,h);
  c.globalAlpha=1;

  const r=h*.9;
  const ambient=c.createRadialGradient(center,baseline*.92,0,center,baseline,r);
  ambient.addColorStop(0,accCol+'44');
  ambient.addColorStop(.48,accCol+'18');
  ambient.addColorStop(1,'rgba(5,7,18,0)');
  c.fillStyle=ambient;
  c.fillRect(0,0,w,h);

  // Precision telemetry grid + perspective floor lines (pdoom-video style)
  c.save();
  c.lineWidth=1;
  c.strokeStyle='rgba(252,225,222,.07)';
  const step=w/12;
  for(let k=1;k<12;k++){
   const x=Math.round(k*step)+.5;
   c.beginPath();c.moveTo(x,h*.16);c.lineTo(x,h*.94);c.stroke();
  }
  for(let k=0;k<5;k++){
   const y=h*(.26+k*.14)+.5;
   c.beginPath();c.moveTo(w*.065,y);c.lineTo(w*.935,y);c.stroke();
  }
  // Perspective runway rays below baseline
  c.strokeStyle=rgb('248,110,165',.08+.06*p.bass);
  for(let ray=-6;ray<=6;ray++){
   c.beginPath();
   c.moveTo(center+ray*w*.045,baseline);
   c.lineTo(center+ray*w*.14,h);
   c.stroke();
  }
  c.restore();

  // Orbital phase rings behind the spectral sculpture
  c.save();
  c.translate(center,baseline*.78);
  const haloR=u*(.26+p.bass*.045);
  c.strokeStyle=rgb('255,130,185',.16+this.beatGlow*.18);
  c.lineWidth=1.4;
  c.beginPath();c.arc(0,0,haloR,0,TAU);c.stroke();
  c.strokeStyle=rgb('170,150,255',.12+p.treble*.15);
  c.beginPath();c.arc(0,0,haloR*1.22,t*.08,t*.08+TAU*.72);c.stroke();
  c.restore();

  // 64-band spectral blades + upper continuous plotter contour trace
  const total=64,area=Math.min(w*.80,1080);
  const left=(w-area)*.5,slot=area/total;
  const maxBar=h*.35,margin=w*.085;
  c.save();
  c.beginPath();
  c.rect(margin,h*.11,w-2*margin,h*.85);
  c.clip();

  const contourPoints:{x:number;y:number}[]=[];
  for(let i=0;i<total;i++){
   const amp=this.smoothed[i];
   const peak=Math.pow(clamp(amp),.78);
   const lower=clamp((peak*.89+p.bass*.08)*intensity,0,1);
   const height=Math.max(2,lower*maxBar);
   const x=left+i*slot+slot*.20;
   const barW=Math.max(1.4,slot*.58);
   const rising=baseline-height;
   contourPoints.push({x:x+barW*.5,y:rising-6});

   const grad=c.createLinearGradient(x,rising,x,baseline);
   grad.addColorStop(0,i<15?'#fff4e8':i<42?'#ffd2ec':'#d5c6ff');
   grad.addColorStop(.35,i<15?'#ff986b':i<42?'#fe5182':'#9e8dff');
   grad.addColorStop(1,i<15?'#dd2c4c':i<42?'#d438a8':'#6250c0');
   c.fillStyle=grad;
   c.shadowColor=i<20?'#fe526c':i<44?'#ea4aae':'#b5abff';
   c.shadowBlur=5+peak*14+this.beatGlow*4;
   c.fillRect(x,rising,barW,height);
   c.shadowBlur=0;

   // Mirrored floor reflection blade
   const reflectionHeight=height*.46;
   const refl=c.createLinearGradient(0,baseline,0,baseline+reflectionHeight);
   refl.addColorStop(0,'rgba(250,123,178,.22)');
   refl.addColorStop(1,'rgba(250,123,178,0)');
   c.fillStyle=refl;
   c.fillRect(x,baseline+3,barW,reflectionHeight);

   // Held peak-hold cap
   const holdY=baseline-Math.max(height,this.peaks[i]*maxBar*intensity)-5;
   c.fillStyle='rgba(255,244,232,.82)';
   c.fillRect(x,holdY,barW,1.6);
  }

  // Upper plotter spline trace connecting all 64 spectral peaks
  if(contourPoints.length>1){
   c.strokeStyle='rgba(255,235,245,0.42)';
   c.lineWidth=1.2;
   c.beginPath();
   for(let i=0;i<contourPoints.length;i++){
    const pt=contourPoints[i];
    if(i===0)c.moveTo(pt.x,pt.y);else c.lineTo(pt.x,pt.y);
   }
   c.stroke();
  }
  c.restore();

  // Horizon laser beam & architectural elliptical rings
  const beam=c.createLinearGradient(w*.06,0,w*.94,0);
  beam.addColorStop(0,'rgba(235,70,108,0)');
  beam.addColorStop(.45,'rgba(255,140,195,.9)');
  beam.addColorStop(.55,'rgba(255,220,225,.95)');
  beam.addColorStop(1,'rgba(235,70,108,0)');
  c.fillStyle=beam;
  c.fillRect(w*.06,baseline,w*.88,1.8);

  c.save();
  c.translate(center,baseline);
  c.strokeStyle=rgb('245,135,180',.15+this.beatGlow*.14);
  c.lineWidth=1.3;
  const rr=u*.39;
  for(let k=0;k<4;k++){
   const radius=rr*(1+k*.26);
   c.beginPath();c.ellipse(0,0,radius,radius*.42,0,TAU*.54,TAU*.98);c.stroke();
   c.beginPath();c.ellipse(0,0,radius,radius*.42,0,TAU*.04,TAU*.47);c.stroke();
  }
  c.restore();

  for(let i=0;i<90;i++){
   const px=hash(i*3.1)*w,py=hash(i*3.1+22)*h*.72;
   c.fillStyle=rgb('254,224,231',.08+hash(i*7)*.12+.04*(1+Math.sin(t*.35+i*1.7)));
   c.fillRect(px,py,1.2,1.2);
  }
  if(!reduced){
   const flash=this.beatGlow*.075;
   c.fillStyle=rgb('255,170,202',flash);
   c.fillRect(0,0,w,h);
  }
 }

 private geometry(
  c:CanvasRenderingContext2D,
  w:number,
  h:number,
  t:number,
  p:GraphicAudio,
  blur:number,
  intensity:number,
  reduced:boolean,
  palette?:{background:string;foreground:string;accent:string}
 ){
  const bgCol=palette?.background||'#f9e9bc';
  const fgCol=palette?.foreground||'#292b47';
  const accCol=palette?.accent||'#eb604a';
  const bg=c.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,bgCol);
  bg.addColorStop(.53,bgCol);
  bg.addColorStop(1,accCol+'28');
  c.globalAlpha=1-blur*.006;
  c.fillStyle=bg;
  c.fillRect(0,0,w,h);
  c.globalAlpha=1;

  const unit=Math.min(w,h),pulse=clamp((this.geometricPulse+p.bass*.10)*intensity);

  // Poster-scale constructivist tectonic plates
  c.save();
  c.translate(w*.52,h*.48);
  c.rotate(-.075+Math.sin(t*.065)*.028*(reduced?.1:1));
  c.fillStyle=fgCol+'cc';
  c.fillRect(-w*.65,-h*.48,w*.48,h*.65);
  c.fillStyle=accCol;
  c.fillRect(w*.12,-h*.55,w*.54,h*.56);
  c.fillStyle=fgCol+'66';
  c.fillRect(-w*.33,h*.25,w*.8,h*.55);
  c.restore();

  // Concentric frequency-driven degree arcs
  c.save();
  c.translate(w*.45,h*.43);
  const minRadius=unit*.13;
  for(let ring=0;ring<9;ring++){
   const a=this.smoothed[(ring*9+5)%64]*intensity;
   c.strokeStyle=ring%2?'rgba(37,42,78,.38)':'rgba(255,253,231,.86)';
   c.lineWidth=1.5+ring*.65+a*3.4;
   const rr=minRadius*(1+ring*.25)+a*unit*.028;
   c.beginPath();
   c.arc(0,0,rr,t*.016*(reduced?.1:1)+ring*.11,TAU*.82+ring*.12);
   c.stroke();
  }
  c.restore();

  // 64-band mapped hexagonal lattice
  const cols=12,rows=6;
  const spaceX=w*.053,spaceY=h*.077;
  const offsetX=w*.19,offsetY=h*.33;
  c.save();
  for(let row=0;row<rows;row++){
   for(let col=0;col<cols;col++){
    const n=row*cols+col,band=(n*13+row*3)%64;
    const v=this.smoothed[band]*intensity;
    const x=offsetX+col*spaceX+(row%2)*spaceX*.5;
    const y=offsetY+row*spaceY+Math.sin(t*.14+n*.72)*(reduced?.1:1)*h*.007;
    if(x>w*.9)continue;
    const radius=Math.min(spaceX,spaceY)*(.19+.34*v)+pulse*unit*.006;
    c.fillStyle=n%5===0?'rgba(255,253,239,.94)':n%4===0?'rgba(35,38,70,.86)':
      n%3===0?'rgba(35,157,153,.80)':'rgba(237,84,83,.68)';
    c.strokeStyle='rgba(38,38,66,.26)';
    c.lineWidth=.9;
    hex(c,x,y,radius,-Math.PI/6+t*.035*(reduced?.1:1));
    c.fill();
    c.stroke();
   }
  }
  c.restore();

  // Extruded 3D kinetic hexagon stack with wireframe connectors
  c.save();
  const cx=w*.57,cy=h*.5;
  const size=unit*(.125+pulse*.042);
  c.translate(cx,cy);
  c.rotate(t*.048*(reduced?.1:1));
  for(let k=6;k>=0;k--){
   const shift=k*unit*.013;
   const rr=size*(1+k*.058);
   hex(c,shift,-shift*.9,rr,t*.038+k*.09);
   c.fillStyle=k===0?'#272b46':k%2?'#e95e4d':'#229a9c';
   c.fill();
   c.strokeStyle='rgba(255,255,239,.48)';
   c.lineWidth=1.5;
   c.stroke();
  }
  c.restore();

  // Beat shockwave rays
  const burst=this.beatGlow;
  if(burst>.03){
   c.save();
   c.translate(cx,cy);
   for(let i=0;i<16;i++){
    const a=i*TAU/16+t*.14;
    const dist=unit*(.17+(.18*(1-burst)));
    c.strokeStyle=rgb('38,42,74',burst*.68);
    c.lineWidth=1.3;
    c.beginPath();
    c.moveTo(Math.cos(a)*dist,Math.sin(a)*dist);
    c.lineTo(Math.cos(a)*(dist+unit*.038),Math.sin(a)*(dist+unit*.038));
    c.stroke();
   }
   c.restore();
  }
 }
}

