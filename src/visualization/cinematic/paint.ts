import type {AudioMetrics} from '../../audio/audioSignal';
import {byId,type DirectedScene,type SceneId} from './catalog';

export type Pulse=Pick<AudioMetrics,'loudness'|'bass'|'mids'|'treble'|'beat'|'onset'|'downbeat'>;
export const NO_AUDIO:Pulse={loudness:0,bass:0,mids:0,treble:0,beat:0,onset:0,downbeat:0};
type Painter=(c:CanvasRenderingContext2D,w:number,h:number,t:number,p:Pulse,density:number)=>void;
const PI=Math.PI,TAU=PI*2;
const fract=(v:number)=>v-Math.floor(v);
const rand=(i:number,seed=0)=>fract(Math.sin(i*127.1+seed*83.77)*43758.5453);
const rect=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
function gradient(c:CanvasRenderingContext2D,w:number,h:number,a:string,b:string){
 const g=c.createLinearGradient(0,0,w*.82,h);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(0,0,w,h);
}
function line(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number,color:string,width=1){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function circle(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){
 c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);c.fill();
}
function poly(c:CanvasRenderingContext2D,coords:readonly number[],color:string){
 c.beginPath();c.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)c.lineTo(coords[i],coords[i+1]);c.closePath();c.fillStyle=color;c.fill();
}
const crimson:Painter=(c,w,h,_t,p,d)=>{
 gradient(c,w,h,'#530007','#120306');
 const pulse=1+p.beat*.14+p.bass*.08;
 c.save();c.translate(w*.51,h*.51);c.rotate(-.075);
 for(let i=5;i>=0;i--){
  const width=w*(.8+i*.24)*pulse;
  rect(c,-width/2,-h*(.16+i*.033),width,h*(.32+i*.066),i%2===0?'#c60b18':'#69010b');
 }
 c.restore();
 rect(c,0,h*.71,w,h*.31,'#080507');
 for(let i=0;i<14*d;i++){
  const x=rand(i,20)*w,y=rand(i,21)*h;
  line(c,x,y,x+w*(.04+rand(i,22)*.09),y-h*.05,'rgba(255,110,82,.14)',1+p.onset*2);
 }
};
const concrete:Painter=(c,w,h,t,_p,_d)=>{
 gradient(c,w,h,'#292b29','#121718');
 const brick=w/10;
 c.lineWidth=1;c.strokeStyle='rgba(215,207,189,.14)';
 for(let j=0;j<12;j++)for(let i=0;i<12;i++){
  c.strokeRect(i*brick-(j%2)*brick*.5,j*h/11,brick,h/11);
 }
 c.save();c.translate(w*.50,h*.49);c.rotate(-.045+Math.sin(t*.08)*.009);
 rect(c,-w*.4,-h*.31,w*.82,h*.66,'#e5dfc9');
 for(let i=0;i<12;i++)rect(c,-w*.4+rand(i,24)*w*.8,-h*.31+rand(i,25)*h*.66,w*.006,h*.05,'rgba(22,28,29,.1)');
 rect(c,-w*.4,-h*.32,w*.82,h*.036,'#f9c62e');
 rect(c,-w*.4,h*.27,w*.82,h*.044,'#272522');
 c.restore();
};
const rain:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#102938','#030c18');
 for(let i=0;i<38*d;i++){
  const x=rand(i,2)*w,y=rand(i,3)*h,r=(.5+rand(i,4)*3)*w/400;
  circle(c,x,y,r,'rgba(137,216,236,.09)');
 }
 c.save();c.strokeStyle='rgba(139,210,233,.35)';c.lineWidth=Math.max(.7,w/1250);
 for(let i=0;i<155*d;i++){
  const x=rand(i,5)*w;
  const y=((rand(i,6)*h+t*(80+p.mids*270)*(1+rand(i,7)))%h+h)%h;
  c.beginPath();c.moveTo(x,y);c.lineTo(x-w*.006,y+h*(.035+p.bass*.012));c.stroke();
 }
 c.restore();
 for(let i=0;i<15*d;i++){
  const x=rand(i,8)*w,y=rand(i,9)*h;
  circle(c,x,y,4+rand(i,10)*12,'rgba(145,217,231,.12)');
  circle(c,x-2,y-3,1.2,'rgba(236,255,255,.45)');
 }
};
const neon:Painter=(c,w,h,t,p,_d)=>{
 gradient(c,w,h,'#1b0934','#070718');
 const cx=w*.53,cy=h*.5;
 c.lineJoin='miter';
 for(let i=11;i>=0;i--){
  const z=((i/12+t*(.06+p.bass*.1))%1+1)%1;
  const r=(.12+z*z*1.1);
  const rw=w*r,rh=h*r;
  c.strokeStyle=i%3===0?'rgba(38,234,255,.8)':'rgba(253,72,211,.6)';
  c.lineWidth=1+(z*2+p.beat*2);c.strokeRect(cx-rw/2,cy-rh/2,rw,rh);
 }
 for(let i=0;i<12;i++){
  const x=cx+(i-6)*w*.18;
  line(c,cx,cy,x,h,'rgba(67,145,235,.34)');
 }
 rect(c,0,h*.82,w,h*.18,'rgba(7,1,30,.5)');
};
const ink:Painter=(c,w,h,_t,p,d)=>{
 rect(c,0,0,w,h,'#eeeae0');
 for(let i=0;i<55*d;i++){
  const x=rand(i,60)*w,y=rand(i,61)*h,r=(2+rand(i,62)*16)*(1+p.onset*.4);
  circle(c,x,y,r,'rgba(20,16,17,.09)');
 }
 for(let i=0;i<14*d;i++){
  const x=rand(i,63)*w,y=rand(i,64)*h;
  circle(c,x,y,w*(.014+rand(i,65)*.05),'rgba(22,20,20,.8)');
  for(let j=0;j<7;j++){
   const a=rand(i*8+j,66)*TAU,len=w*(.01+rand(i*8+j,67)*.08);
   line(c,x,y,x+Math.cos(a)*len,y+Math.sin(a)*len,'rgba(14,12,12,.65)',1.3+rand(j,68)*2);
  }
 }
 rect(c,0,h*.1,w*.1,h*.8,'#d62b2a');
};
const ocean:Painter=(c,w,h,t,_p,d)=>{
 const g=c.createLinearGradient(0,0,0,h);
 g.addColorStop(0,'#1a3a66');g.addColorStop(.49,'#c78985');g.addColorStop(.53,'#ffbb83');g.addColorStop(.56,'#1a6484');g.addColorStop(1,'#061928');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 circle(c,w*.71,h*.49,h*.12,'rgba(255,231,180,.67)');
 for(let i=0;i<42*d;i++){
  const y=h*(.55+i*.013);
  const length=w*(.1+rand(i,14)*.55)/(1+i*.03);
  const offset=Math.sin(t*.3+i*.8)*(10+i*.6);
  line(c,w*.69-length*.5+offset,y,w*.69+length*.5+offset,y,i%3?'rgba(255,217,180,.16)':'rgba(255,232,190,.38)',Math.max(1,h*.003));
 }
};
const pop:Painter=(c,w,h,t,_p,_d)=>{
 rect(c,0,0,w,h,'#ffdb44');
 for(let i=0;i<11;i++){
  c.save();const x=rand(i,77)*w,y=rand(i,78)*h;const rot=(rand(i,79)-.5)*.4+Math.sin(t*.1+i)*.06;
  c.translate(x,y);c.rotate(rot);
  const colors=['#fc5477','#4932b6','#33bfb3','#ffffff','#161839'];
  rect(c,-w*.13,-h*.13,w*(.11+rand(i,80)*.17),h*(.12+rand(i,81)*.2),colors[i%colors.length]);
  c.restore();
 }
 rect(c,w*.07,h*.13,w*.12,h*.024,'#1b1839');
};
const analog:Painter=(c,w,h,t,_p,d)=>{
 gradient(c,w,h,'#18222b','#060909');
 rect(c,w*.07,h*.09,w*.86,h*.82,'#0e1a20');
 c.strokeStyle='rgba(138,255,221,.21)';c.lineWidth=2;c.strokeRect(w*.07,h*.09,w*.86,h*.82);
 for(let i=0;i<Math.round(h/5);i++)rect(c,0,i*5,w,1,'rgba(0,0,0,.28)');
 for(let i=0;i<6*d;i++){
  const y=rand(i,91)*h;const shift=Math.sin(t*1.3+i)*w*.09;
  rect(c,shift,y,w*.7,1+rand(i,92)*4,'rgba(254,103,126,.12)');
 }
 c.fillStyle='#a0d9b5';c.font='12px monospace';c.textAlign='left';c.fillText('PLAY   ▸     00:'+Math.floor(t%60).toString().padStart(2,'0'),w*.1,h*.17);
};
const clouds:Painter=(c,w,h,t,_p,d)=>{
 gradient(c,w,h,'#646fa7','#e1b4b3');
 const light=c.createRadialGradient(w*.7,h*.27,5,w*.7,h*.27,w*.65);
 light.addColorStop(0,'rgba(255,250,221,.8)');light.addColorStop(1,'rgba(255,250,221,0)');
 c.fillStyle=light;c.fillRect(0,0,w,h);
 for(let i=0;i<17*d;i++){
  const x=((rand(i,102)*w+t*(3+i%4)*.18)%(w*1.45))-w*.22;
  const y=(rand(i,103)*h*.9);
  const r=w*(.07+rand(i,104)*.09);
  c.fillStyle=i%3===0?'rgba(255,233,226,.52)':'rgba(240,219,242,.35)';
  for(let k=0;k<4;k++){
   c.beginPath();c.ellipse(x+k*r*.4,y+Math.sin(k)*r*.15,r*.7,r*.32,0,0,TAU);c.fill();
  }
 }
};
const stellar:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#151444','#030519');
 const g=c.createRadialGradient(w*.52,h*.53,1,w*.52,h*.53,w*.7);
 g.addColorStop(0,'rgba(125,84,246,.31)');g.addColorStop(.4,'rgba(45,17,91,.16)');g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<200*d;i++){
  const a=rand(i,109)*TAU;
  const depth=((rand(i,110)+t*(.012+p.bass*.03))%1+1)%1;
  const x=w*.52+Math.cos(a)*depth*depth*w*.8;
  const y=h*.53+Math.sin(a)*depth*depth*h*.9;
  const r=(.3+depth*2)*(i%7===0?1.6:1);
  circle(c,x,y,r,'rgba(225,222,255,.7)');
  if(depth>.55&&i%4===0)line(c,x,y,x-Math.cos(a)*depth*w*.04,y-Math.sin(a)*depth*h*.04,'rgba(201,181,255,.45)',1);
 }
};
const fragment:Painter=(c,w,h,t,p,d)=>{
 rect(c,0,0,w,h,'#111318');
 const cx=w*.52,cy=h*.47;
 for(let i=0;i<29*d;i++){
  const a=rand(i,119)*TAU,r=Math.sqrt(rand(i,120))*w*.55;
  const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.7;
  const size=w*(.008+rand(i,121)*.09);
  c.save();c.translate(x,y);c.rotate(a+t*.015*(i%3));
  poly(c,[-size,-size*.4,size*.45,-size*.65,size*.9,size*.3],
   i%7===0?'rgba(251,83,63,.57)':'rgba(220,218,210,.13)');
  c.restore();
 }
 line(c,w*.18,h*.1,w*.85,h*.85,'rgba(248,87,76,.3)',1+p.onset*3);
};
const quiet:Painter=(c,w,h,_t,_p,d)=>{
 rect(c,0,0,w,h,'#ede9df');
 for(let i=0;i<68*d;i++){
  const x=rand(i,129)*w,y=rand(i,130)*h;
  rect(c,x,y,1+rand(i,131)*2,1,'rgba(49,39,33,.13)');
 }
 line(c,w*.11,h*.12,w*.88,h*.12,'rgba(63,48,47,.19)',1);
 line(c,w*.11,h*.88,w*.88,h*.88,'rgba(63,48,47,.19)',1);
 rect(c,w*.11,h*.16,w*.008,h*.67,'#b78677');
};
const PAINTERS:Record<SceneId,Painter>={
 'crimson-impact':crimson,'concrete-manifesto':concrete,'rain-on-glass':rain,
 'neon-velocity':neon,'ink-rebellion':ink,'ocean-reverie':ocean,
 'color-riot':pop,'analog-breakdown':analog,'cloud-cathedral':clouds,
 'stellar-expansion':stellar,'fragmented-thoughts':fragment,'quiet-pages':quiet
};
/** All coordinate-based effects use song time, so seeking yields reproducible frames. */
export function drawScene(c:CanvasRenderingContext2D,scene:DirectedScene,w:number,h:number,t:number,p:Pulse,quality:'High'|'Balanced'|'Performance'){
 const density=quality==='High'?1:quality==='Balanced'?.7:.35;
 c.save();c.beginPath();c.rect(0,0,w,h);c.clip();
 PAINTERS[scene.id](c,w,h,t,p,density);
 c.restore();
}
/** Gradient used by overlays and controls to match the active template palette. */
export function sceneColors(id:SceneId){return byId[id]}
