/**
 * Art-directed 2D visual engines.
 *
 * PRECISION: Monstercat-inspired high-resolution spectral sculpture, not a bar
 * plugin or copied look. Each of 64 log bins drives a separate visible blade.
 * GEOMETRY: Party Mode-inspired frequency-mapped geometric collage; every
 * material, polygon and color is drawn in Canvas code (no raster assets).
 *
 * Copyright © LyricFlow contributors. Independent original implementations.
 */
import type {Pulse} from '../paint';
export type GraphicSystem='spectrum'|'geometry';
const TAU=Math.PI*2;
const clamp=(x:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
const fract=(x:number)=>x-Math.floor(x);
const hash=(n:number)=>fract(Math.sin(n*127.1+13.27)*43758.5453);
export type GraphicAudio=Pulse & {bands?:Float32Array};
function fillRound(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,color:string){
 c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,Math.min(r,Math.abs(w)/2,Math.abs(h)/2));c.fill();
}
function hex(c:CanvasRenderingContext2D,x:number,y:number,r:number,rotation=0){
 c.beginPath();
 for(let i=0;i<6;i++){
  const theta=rotation+(i/6)*TAU;
  const a=x+r*Math.cos(theta),b=y+r*Math.sin(theta);
  if(i===0)c.moveTo(a,b);else c.lineTo(a,b);
 }c.closePath();
}
function rgb(color:string,a:number){return 'rgba('+color+','+clamp(a)+')'}
export class GraphicCompositions {
 private lastMode:GraphicSystem|null=null;
 private smoothed=new Float32Array(64);
 private lastTime=0;
 private beatGlow=0;
 private geometricPulse=0;
 private hasDrawn=false;
 constructor(){}
 reset(){
  this.lastMode=null;this.smoothed.fill(0);this.lastTime=0;
  this.beatGlow=0;this.geometricPulse=0;this.hasDrawn=false;
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
   const speed=target>this.smoothed[i]?0.36:0.115;
   const step=1-Math.pow(1-speed,Math.max(.1,dt*60));
   this.smoothed[i]+=(clamp(target)-this.smoothed[i])*step;
  }
  const onset=clamp(p.onset*.5+p.beat*.85);
  this.beatGlow=Math.max(this.beatGlow*Math.exp(-dt*6),onset);
  this.geometricPulse+=((p.bass*.8+p.mids*.25)-this.geometricPulse)*clamp(dt*6);
 }
 render(c:CanvasRenderingContext2D,w:number,h:number,time:number,p:GraphicAudio,
  mode:GraphicSystem,motionBlur:number,intensity:number,demo=false,reduced=false){
  if(this.lastMode!==mode){this.reset();this.lastMode=mode}
  const effectiveTime=reduced?time*.14:time;
  this.sample(p,effectiveTime,demo);
  if(!this.hasDrawn||!motionBlur||reduced){
   c.clearRect(0,0,w,h);
   this.hasDrawn=true;
  }
  if(mode==='spectrum')this.spectrum(c,w,h,effectiveTime,p,motionBlur,intensity,reduced);
  else this.geometry(c,w,h,effectiveTime,p,motionBlur,intensity,reduced);
 }
 private spectrum(c:CanvasRenderingContext2D,w:number,h:number,t:number,p:GraphicAudio,blur:number,intensity:number,reduced:boolean){
  const baseline=h*.63,center=w*.5;
  const dark=c.createLinearGradient(0,0,w,h);
  dark.addColorStop(0,'#080b16');dark.addColorStop(.52,'#0e0920');dark.addColorStop(1,'#02030a');
  c.globalAlpha=1-blur*.006;
  c.fillStyle=dark;c.fillRect(0,0,w,h);c.globalAlpha=1;
  const r=h*.88;
  const ambient=c.createRadialGradient(center,baseline*.94,0,center,baseline,r);
  ambient.addColorStop(0,rgb('229,69,112',.22+.12*p.bass));
  ambient.addColorStop(.5,'rgba(121,48,145,.06)');
  ambient.addColorStop(1,'rgba(5,7,18,0)');
  c.fillStyle=ambient;c.fillRect(0,0,w,h);
  // Restrained editorial grid gives scale and separates foreground from ambience.
  c.save();c.lineWidth=1;c.strokeStyle='rgba(252,225,222,.065)';
  const step=w/12;for(let k=1;k<12;k++){
   const x=Math.round(k*step)+.5;
   c.beginPath();c.moveTo(x,h*.19);c.lineTo(x,h*.93);c.stroke();
  }
  for(let k=0;k<5;k++){
   const y=h*(.29+k*.14)+.5;c.beginPath();c.moveTo(w*.075,y);c.lineTo(w*.925,y);c.stroke();
  }
  c.restore();
  // Audio architecture is based on frequency not merely a single bass amplitude.
  const total=64,area=Math.min(w*.77,1050);
  const left=(w-area)*.5,slot=area/total;
  const maxBar=h*.32,margin=w*.095;
  c.save();c.beginPath();c.rect(margin,h*.13,w-2*margin,h*.84);c.clip();
  for(let i=0;i<total;i++){
   const amp=this.smoothed[i];
   const peak=Math.pow(clamp(amp),.8);
   const lower=clamp((peak*.87+p.bass*.07)*intensity,0,1);
   const height=Math.max(1.7,lower*maxBar);
   const x=left+i*slot+slot*.23;
   const barW=Math.max(1.2,slot*.54);
   const rising=baseline-height;
   const grad=c.createLinearGradient(x,rising,x,baseline);
   grad.addColorStop(0,i<15?'#fff2e4':i<42?'#f9c6e7':'#cbb8fe');
   grad.addColorStop(.35,i<15?'#f79e75':i<42?'#fc577f':'#9e8dff');
   grad.addColorStop(1,i<15?'#dd3452':i<42?'#d43eaa':'#6656bf');
   c.fillStyle=grad;
   c.shadowColor=i<20?'#fe526c':i<44?'#ea4aae':'#b5abff';
   c.shadowBlur=4+peak*12+this.beatGlow*3;
   c.fillRect(x,rising,barW,height);
   c.shadowBlur=0;
   const reflectionHeight=height*.42;
   const refl=c.createLinearGradient(0,baseline,0,baseline+reflectionHeight);
   refl.addColorStop(0,'rgba(250,123,178,.18)');
   refl.addColorStop(1,'rgba(250,123,178,0)');
   c.fillStyle=refl;c.fillRect(x,baseline+3,barW,reflectionHeight);
   // Thin harmonic peak markers track each bin without strobing.
   c.fillStyle='rgba(255,239,225,.65)';
   c.fillRect(x,rising-4,barW,1.2);
  }
  c.restore();
  // One polished horizon line and architectural rings instead of random shapes.
  const beam=c.createLinearGradient(w*.08,0,w*.92,0);
  beam.addColorStop(0,'rgba(235,70,108,0)');
  beam.addColorStop(.45,'rgba(244,129,184,.8)');
  beam.addColorStop(.55,'rgba(245,204,209,.8)');
  beam.addColorStop(1,'rgba(235,70,108,0)');
  c.fillStyle=beam;c.fillRect(w*.08,baseline,w*.84,1.4);
  c.save();c.translate(center,baseline);
  c.strokeStyle=rgb('240,129,170',.12+this.beatGlow*.10);c.lineWidth=1.2;
  const rr=Math.min(h,w)*.38;
  for(let k=0;k<3;k++){
   const radius=rr*(1+k*.3);
   c.beginPath();c.ellipse(0,0,radius,radius*.44,0,TAU*.55,TAU*.98);c.stroke();
   c.beginPath();c.ellipse(0,0,radius,radius*.44,0,TAU*.05,TAU*.46);c.stroke();
  }
  c.restore();
  // Fine film atmosphere: scattered deterministic stars, no image textures.
  for(let i=0;i<85;i++){
   const px=hash(i*3.1)*w,py=hash(i*3.1+22)*h*.7;
   c.fillStyle=rgb('254,224,231',.07+hash(i*7)*.14);
   c.fillRect(px,py,1,1);
  }
  if(!reduced){
   const flash=this.beatGlow*.07;
   c.fillStyle=rgb('255,170,202',flash);
   c.fillRect(0,0,w,h);
  }
 }
 private geometry(c:CanvasRenderingContext2D,w:number,h:number,t:number,p:GraphicAudio,blur:number,intensity:number,reduced:boolean){
  const bg=c.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#f9e9bc');bg.addColorStop(.53,'#f6d9ac');bg.addColorStop(1,'#f9d0bc');
  c.globalAlpha=1-blur*.006;c.fillStyle=bg;c.fillRect(0,0,w,h);c.globalAlpha=1;
  const unit=Math.min(w,h),pulse=clamp(this.geometricPulse*intensity);
  // Poster-like large architectural fields: not a screen full of identical particles.
  c.save();
  c.translate(w*.52,h*.48);
  c.rotate(-.07+Math.sin(t*.06)*.025*(reduced?.1:1));
  c.fillStyle='#292b47';c.fillRect(-w*.65,-h*.48,w*.48,h*.65);
  c.fillStyle='#eb604a';c.fillRect(w*.12,-h*.55,w*.54,h*.56);
  c.fillStyle='#48b7ab';c.fillRect(-w*.33,h*.25,w*.8,h*.55);
  c.restore();
  // Overlapping concentric arcs create visual scale; they respond to specific
  // frequency groups rather than scaling as one monotonous bass pulse.
  c.save();c.translate(w*.45,h*.43);
  const minRadius=unit*.13;
  for(let ring=0;ring<8;ring++){
   const a=this.smoothed[(ring*9+5)%64]*intensity;
   c.strokeStyle=ring%2?'rgba(37,42,78,.35)':'rgba(255,253,231,.83)';
   c.lineWidth=1.4+ring*.6+a*3;
   const rr=minRadius*(1+ring*.27)+a*unit*.026;
   c.beginPath();c.arc(0,0,rr,t*.014*(reduced?.1:1)+ring*.09,TAU*.8+ring*.12);
   c.stroke();
  }
  c.restore();
  // D3-style data-to-mark mapping, but implemented independently in Canvas:
  // hexagon heights, sizes and colors are mapped to 64 distinct log bands.
  const cols=12,rows=6;
  const spaceX=w*.053,spaceY=h*.077;
  const offsetX=w*.19,offsetY=h*.33;
  c.save();
  for(let row=0;row<rows;row++){
   for(let col=0;col<cols;col++){
    const n=row*cols+col,band=(n*13+row*3)%64;
    const v=this.smoothed[band]*intensity;
    const x=offsetX+col*spaceX+(row%2)*spaceX*.5;
    const y=offsetY+row*spaceY+Math.sin(t*.12+n*.72)*(reduced?.1:1)*h*.006;
    if(x>w*.9)continue;
    const radius=Math.min(spaceX,spaceY)*(.19+.32*v)+pulse*unit*.005;
    c.fillStyle=n%5===0?'rgba(255,253,239,.94)':n%4===0?'rgba(35,38,70,.85)':
      n%3===0?'rgba(35,157,153,.78)':'rgba(237,84,83,.65)';
    c.strokeStyle='rgba(38,38,66,.22)';c.lineWidth=.8;
    hex(c,x,y,radius,-Math.PI/6+t*.03*(reduced?.1:1));
    c.fill();c.stroke();
   }
  }
  c.restore();
  // Central kinetic sculpture: a handful of genuinely constructed 3D-looking
  // polygons, extruded in depth instead of a field of random cubes.
  c.save();
  const cx=w*.57,cy=h*.5;
  const size=unit*(.12+pulse*.038);
  c.translate(cx,cy);c.rotate(t*.045*(reduced?.1:1));
  for(let k=5;k>=0;k--){
   const shift=k*unit*.013;
   const rr=size*(1+k*.055);
   hex(c,shift,-shift*.9,rr,t*.035+k*.09);
   c.fillStyle=k===0?'#272b46':k%2?'#e95e4d':'#229a9c';
   c.fill();c.strokeStyle='rgba(255,255,239,.4)';c.lineWidth=1.4;c.stroke();
  }
  c.restore();
  // Beat events affect only graphics, never the independent lyric layer.
  const burst=this.beatGlow;
  if(burst>.03){
   c.save();c.translate(cx,cy);
   for(let i=0;i<12;i++){
    const a=i*TAU/12+t*.13;
    const dist=unit*(.17+(.16*(1-burst)));
    c.strokeStyle=rgb('38,42,74',burst*.6);
    c.lineWidth=1.1;
    c.beginPath();c.moveTo(Math.cos(a)*dist,Math.sin(a)*dist);
    c.lineTo(Math.cos(a)*(dist+unit*.03),Math.sin(a)*(dist+unit*.03));c.stroke();
   }
   c.restore();
  }
  // Minimal editorial baselines and corner calibrators hold the collage together.
  c.save();c.strokeStyle='rgba(34,40,70,.23)';c.lineWidth=1;
  for(let k=0;k<5;k++){
   const x=w*(.085+.026*k);
   c.beginPath();c.moveTo(x,h*.13);c.lineTo(x,h*.2);c.stroke();
  }
  for(let k=0;k<4;k++){
   const y=h*(.82+k*.022);
   c.beginPath();c.moveTo(w*.08,y);c.lineTo(w*.27,y);c.stroke();
  }
  fillRound(c,w*.89,h*.12,w*.038,3,1,'#282b45');
  c.restore();
 }
}
