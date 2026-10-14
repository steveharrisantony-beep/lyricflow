import type {Pulse} from './paint';

type ExtraId=
 'monochrome-memory'|'monument-titles'|'midnight-confession'|'glass-architecture'
 |'ransom-poetry'|'type-collision'|'petal-memory'|'submerged-words'
 |'inferno-letterforms'|'holographic-frequency'|'pixel-pulse'|'marker-diary'
 |'bubble-pop'|'word-playground'|'sunset-frequency'|'typographic-vortex'
 |'midnight-transit'|'final-ascension';
type Painter=(c:CanvasRenderingContext2D,w:number,h:number,t:number,p:Pulse,d:number)=>void;
const TAU=Math.PI*2;
const rnd=(n:number,k=1)=>{const z=Math.sin(n*126.23+k*67.17)*29841.179;return z-Math.floor(z)};
const fill=(c:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
const circle=(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string|CanvasGradient)=>{
 c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(.2,r),0,TAU);c.fill()
};
const stroke=(c:CanvasRenderingContext2D,a:number,b:number,x:number,y:number,color:string,width=1)=>{
 c.beginPath();c.moveTo(a,b);c.lineTo(x,y);c.strokeStyle=color;c.lineWidth=width;c.stroke()
};
const gradient=(c:CanvasRenderingContext2D,w:number,h:number,a:string,b:string)=>{
 const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(0,0,w,h)
};
const polygon=(c:CanvasRenderingContext2D,pts:number[],color:string)=>{
 c.beginPath();c.moveTo(pts[0],pts[1]);for(let k=2;k<pts.length;k+=2)c.lineTo(pts[k],pts[k+1]);c.closePath();c.fillStyle=color;c.fill()
};
const monochrome:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#323032','#070709');
 const g=c.createRadialGradient(w*.67,h*.33,5,w*.67,h*.33,w*.65);
 g.addColorStop(0,'rgba(242,244,237,.36)');g.addColorStop(1,'rgba(25,25,25,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<85*d;i++){
  const x=rnd(i,2)*w,y=rnd(i,3)*h,r=.5+rnd(i,4)*2.1;
  circle(c,x,y,r,'rgba(230,231,224,.18)');
 }
 fill(c,'rgba(0,0,0,.68)',0,0,w,h*.11);
 fill(c,'rgba(0,0,0,.68)',0,h*.89,w,h*.11);
 for(let i=0;i<8;i++){
  const x=rnd(i,5)*w;
  stroke(c,x,0,x+Math.sin(t*.13+i)*w*.012,h,'rgba(254,251,233,.055)',1.5);
 }
 fill(c,'rgba(242,240,228,.12)',w*.09,h*.19,w*.015,h*.62);
 // Silhouette of a distant cinematic light shaft.
 polygon(c,[w*.67,0,w*.73,0,w*.83,h,w*.49,h],'rgba(224,224,216,.065)');
};
const monument:Painter=(c,w,h,_t,p,d)=>{
 gradient(c,w,h,'#182035','#05070f');
 const g=c.createRadialGradient(w*.52,h*.28,1,w*.52,h*.35,w*.6);
 g.addColorStop(0,'rgba(244,217,170,.36)');g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<6;i++){
  const x=w*(.13+i*.145),col=w*.067,height=h*(.26+rnd(i,7)*.42);
  polygon(c,[x,h*.89,x+col,h*.89,x+col,h*.89-height,x,h*.89-height],'rgba(156,159,164,.11)');
  polygon(c,[x+col,h*.89,x+col+w*.018,h*.86,x+col+w*.018,h*.86-height,x+col,h*.89-height],'rgba(255,250,223,.13)');
  stroke(c,x,h*.89-height,x+col,h*.89-height,'rgba(234,211,182,.45)');
  stroke(c,x,h*.89,x+col,h*.89,'rgba(234,211,182,.2)');
 }
 for(let i=0;i<18*d;i++)circle(c,rnd(i,8)*w,rnd(i,9)*h,1+rnd(i,10)*1.5,'rgba(255,233,188,.18)');
 const width=w*(.4+p.bass*.12);
 polygon(c,[w*.5-width/2,0,w*.5+width/2,0,w*.7,h,w*.3,h],'rgba(254,230,187,.04)');
};
const midnight:Painter=(c,w,h,t,_p,d)=>{
 gradient(c,w,h,'#1b0911','#030304');
 const x=w*(.23+.13*Math.sin(t*.07));
 const g=c.createRadialGradient(x,h*.5,2,x,h*.5,w*.48);
 g.addColorStop(0,'rgba(211,63,84,.26)');g.addColorStop(.3,'rgba(98,19,34,.12)');g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 stroke(c,w*.13,h*.16,w*.13,h*.84,'rgba(247,214,202,.34)',1);
 stroke(c,w*.13,h*.16,w*.24,h*.16,'rgba(247,214,202,.34)',1);
 for(let i=0;i<25*d;i++)circle(c,rnd(i,11)*w,rnd(i,12)*h,.7+rnd(i,13),'rgba(252,235,225,.22)');
};
const glass:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#111e2b','#040914');
 c.save();c.translate(w*.53,h*.53);c.rotate(Math.sin(t*.12)*.025);
 for(let i=0;i<10*d;i++){
  const r=w*(.07+rnd(i,16)*.19);
  const x=(rnd(i,14)-.5)*w*.8,y=(rnd(i,15)-.5)*h*.8;
  const depth=r*.36;
  polygon(c,[x-r,y-r*.45,x,y-r*.75,x+r,y-r*.45,x,y-r*.12],'rgba(184,240,249,.14)');
  polygon(c,[x-r,y-r*.45,x,y-r*.12,x,y+r*.9,x-r,y+r*.5],'rgba(128,190,224,.08)');
  polygon(c,[x,y-r*.12,x+r,y-r*.45,x+r,y+r*.5,x,y+r*.9],'rgba(245,251,255,.06)');
  c.strokeStyle='rgba(186,238,255,.5)';c.lineWidth=.8+p.treble*.9;
  c.beginPath();c.moveTo(x-r,y-r*.45);c.lineTo(x,y-r*.75);c.lineTo(x+r,y-r*.45);c.lineTo(x+r,y+r*.5);
  c.lineTo(x,y+r*.9);c.lineTo(x-r,y+r*.5);c.closePath();c.stroke();
  stroke(c,x,y-r*.12,x,y+r*.9,'rgba(202,252,255,.36)');
  stroke(c,x-r,y-r*.45,x,y-r*.12,'rgba(202,252,255,.36)');
  stroke(c,x+r,y-r*.45,x,y-r*.12,'rgba(202,252,255,.36)');
  stroke(c,x+r+depth,y-r*.45,x+r+depth,y+r*.3,'rgba(157,194,224,.08)');
 }
 c.restore();
};
const ransom:Painter=(c,w,h,t,_p,d)=>{
 fill(c,'#b6ad9a',0,0,w,h);
 for(let j=0;j<15*d;j++){
  const x=rnd(j,21)*w,y=rnd(j,22)*h;
  stroke(c,x,y,x+rnd(j,23)*w*.24,y,'rgba(58,42,38,.18)',1);
 }
 for(let i=0;i<18*d;i++){
  const x=rnd(i,24)*w,y=rnd(i,25)*h;
  c.save();c.translate(x,y);c.rotate((rnd(i,26)-.5)*.38+Math.sin(t*.1+i)*.016);
  fill(c,i%3===0?'#181817':i%3===1?'#eae3d2':'#d6b947',-w*.07,-h*.038,w*(.06+rnd(i,27)*.13),h*.07);
  c.restore();
 }
 for(let i=0;i<5;i++)fill(c,'rgba(253,246,220,.25)',rnd(i,28)*w,rnd(i,29)*h,w*.13,h*.02);
};
const collision:Painter=(c,w,h,t,p,_d)=>{
 fill(c,'#f3edce',0,0,w,h);
 c.save();c.translate(w*.52,h*.53);c.rotate(-.14+Math.sin(t*.07)*.025);
 fill(c,'#ec3e23',-w*.46,-h*.21,w*.94,h*.43);
 fill(c,'#202025',-w*.46,-h*.25,w*.5,h*.065);
 fill(c,'#ffd049',w*.3,-h*.26,w*.19,h*.62);
 c.restore();
 for(let i=0;i<12;i++){
  c.strokeStyle='rgba(22,24,26,.6)';c.lineWidth=Math.max(1,h*.006);
  c.beginPath();c.arc(w*.13,h*.23,w*(.037+i*.015)*(1+p.beat*.035),0,TAU);c.stroke();
 }
};
const petal:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#443157','#0e0b24');
 circle(c,w*.73,h*.22,h*.12,'rgba(244,225,238,.66)');
 c.strokeStyle='rgba(31,18,36,.75)';c.lineWidth=Math.max(2,w*.009);
 c.beginPath();c.moveTo(0,h*.18);c.bezierCurveTo(w*.24,h*.26,w*.27,h*.17,w*.49,h*.4);c.stroke();
 c.beginPath();c.moveTo(w,h*.15);c.bezierCurveTo(w*.8,h*.25,w*.8,h*.15,w*.56,h*.29);c.stroke();
 for(let i=0;i<75*d;i++){
  const x=((rnd(i,31)*w+t*(3+i%4))%(w+80))-40;
  const y=((rnd(i,32)*h+t*(7+i%5)*(1+p.treble*.5))%(h+80))-40;
  c.save();c.translate(x,y);c.rotate(t*.12+i);
  c.fillStyle=i%4?'rgba(255,177,212,.64)':'rgba(253,229,241,.74)';
  c.beginPath();c.ellipse(0,0,2+rnd(i,33)*5,2+rnd(i,34)*2,.3,0,TAU);c.fill();c.restore();
 }
};
const submerged:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#06506a','#011223');
 const light=c.createLinearGradient(w*.3,0,w*.65,h);
 light.addColorStop(0,'rgba(153,251,251,.19)');light.addColorStop(1,'rgba(90,196,225,0)');
 c.fillStyle=light;c.fillRect(0,0,w,h);
 for(let j=0;j<17*d;j++){
  const y=h*(.1+j*.055);
  c.beginPath();c.moveTo(-10,y);
  for(let x=0;x<=w+20;x+=16)c.lineTo(x,y+Math.sin(x*.018+t*.42+j)*h*.012*(1+p.bass*.8));
  c.lineWidth=j%3===0?2:1;c.strokeStyle=j%3===0?'rgba(137,255,253,.29)':'rgba(165,238,255,.12)';c.stroke();
 }
 for(let i=0;i<40*d;i++){
  const x=rnd(i,41)*w+Math.sin(t*.25+i)*w*.006;
  const y=((rnd(i,42)*h-t*(13+rnd(i,43)*18))%h+h)%h;
  c.lineWidth=1;c.strokeStyle='rgba(202,255,255,.37)';c.beginPath();c.arc(x,y,2+rnd(i,44)*8,0,TAU);c.stroke();
 }
};
const inferno:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#4d0c08','#090306');
 const g=c.createRadialGradient(w*.5,h*.88,4,w*.5,h*.8,w*.68);
 g.addColorStop(0,'rgba(255,120,20,.60)');g.addColorStop(.42,'rgba(255,43,12,.17)');g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<30*d;i++){
  const x=rnd(i,47)*w,wide=w*(.015+rnd(i,48)*.04),height=h*(.18+rnd(i,49)*.34)*(1+p.bass*.25);
  const base=h*.92+Math.sin(i*2+t)*h*.018;
  c.fillStyle=i%3===0?'rgba(255,187,27,.45)':i%3===1?'rgba(240,70,11,.5)':'rgba(184,18,7,.54)';
  c.beginPath();c.moveTo(x-wide,base);
  c.quadraticCurveTo(x-wide*.32,base-height*.72,x+Math.sin(t*.8+i)*wide,base-height);
  c.quadraticCurveTo(x+wide*.72,base-height*.29,x+wide,base);c.closePath();c.fill();
 }
 for(let i=0;i<60*d;i++){
  const x=rnd(i,51)*w,y=((rnd(i,52)*h-t*(20+rnd(i,53)*40))%h+h)%h;
  circle(c,x,y,1+rnd(i,54)*2,'rgba(255,176,50,.75)');
 }
};
const hologram:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#083841','#020c1b');
 const cx=w*.52,cy=h*.43;
 for(let i=-10;i<=10;i++){
  const bottom=cx+i*w*.115;
  stroke(c,cx,cy,bottom,h,'rgba(55,247,206,.27)',1);
 }
 for(let j=0;j<18;j++){
  const y=cy+h*Math.pow(j/18,1.65)*.58;
  stroke(c,0,y,w,y,'rgba(55,248,218,.27)',1);
 }
 for(let k=0;k<6;k++){
  const r=h*(.13+k*.075)+Math.sin(t*.3+k)*h*.004;
  c.strokeStyle=k%2?'rgba(78,228,251,.37)':'rgba(68,250,169,.49)';
  c.lineWidth=.7+p.onset*2;c.beginPath();c.ellipse(cx,cy,r*1.6,r*.38,0,0,TAU);c.stroke();
 }
 for(let i=0;i<28*d;i++){
  const x=rnd(i,59)*w,y=rnd(i,60)*h;
  fill(c,'rgba(59,255,218,.38)',x,y,2+rnd(i,61)*10,1);
 }
};
const pixel:Painter=(c,w,h,t,_p,d)=>{
 fill(c,'#1c1845',0,0,w,h);
 const u=Math.max(5,Math.floor(Math.min(w,h)/90));
 for(let i=0;i<65*d;i++){
  const x=Math.floor(rnd(i,65)*w/u)*u,y=Math.floor(rnd(i,66)*h*.66/u)*u;
  fill(c,i%4?'#d9bdf5':'#f5db73',x,y,u,u);
 }
 const cx=w*.52,cy=h*.61;
 for(let layer=4;layer>=0;layer--){
  const y=cy+layer*u*5;
  c.fillStyle=['#271b61','#46308b','#7945a4','#a94fb3','#ea69b6'][layer];
  c.beginPath();c.moveTo(0,h);
  for(let x=0;x<=w+u;x+=u*4){
   const peak=Math.floor((Math.sin(x*.025+layer*.6)+1.3)*u*6);
   c.lineTo(x,y-peak);
  }
  c.lineTo(w,h);c.closePath();c.fill();
 }
 fill(c,'#e9a954',0,h*.87,w,h*.13);
 for(let i=0;i<11;i++){
  const x=(i*w/11+(t*8)%(w/11))%w;
  fill(c,'#2e175f',x,h*.84,u*2,u*3);
 }
};
const diary:Painter=(c,w,h,t,_p,d)=>{
 fill(c,'#f6e9ce',0,0,w,h);
 for(let j=0;j<15;j++)stroke(c,0,h*.12+j*h*.053,w,h*.12+j*h*.053,'rgba(86,133,166,.24)',1);
 stroke(c,w*.12,0,w*.12,h,'rgba(223,85,77,.31)',2);
 c.lineCap='round';
 for(let i=0;i<20*d;i++){
  const x=rnd(i,68)*w,y=rnd(i,69)*h,r=w*(.013+rnd(i,70)*.028);
  c.strokeStyle=i%3===0?'rgba(250,162,46,.62)':i%3===1?'rgba(239,111,129,.36)':'rgba(62,154,141,.36)';
  c.lineWidth=1.5;
  c.beginPath();c.arc(x,y,r,Math.sin(t*.13+i),Math.sin(t*.13+i)+Math.PI*1.45);c.stroke();
 }
 c.strokeStyle='#edae50';c.lineWidth=7;
 c.beginPath();c.moveTo(w*.23,h*.76);c.quadraticCurveTo(w*.44,h*.71,w*.65,h*.75);c.stroke();
};
const bubble:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#f2b6d8','#8c7af2');
 const g=c.createRadialGradient(w*.74,h*.28,3,w*.74,h*.28,w*.7);
 g.addColorStop(0,'rgba(255,241,251,.5)');g.addColorStop(1,'rgba(251,238,255,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<35*d;i++){
  const x=rnd(i,73)*w;
  const y=((rnd(i,74)*h-t*(7+rnd(i,75)*14))%h+h)%h;
  const r=h*(.014+rnd(i,76)*.07)*(1+p.treble*.16);
  const grad=c.createRadialGradient(x-r*.3,y-r*.25,1,x,y,r);
  grad.addColorStop(0,'rgba(255,255,255,.24)');grad.addColorStop(.7,'rgba(255,255,255,.05)');grad.addColorStop(1,'rgba(255,239,249,.36)');
  circle(c,x,y,r,grad as unknown as string);
  c.strokeStyle='rgba(255,255,255,.56)';c.lineWidth=1.3;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();
 }
};
const playground:Painter=(c,w,h,t,p,_d)=>{
 fill(c,'#d9f4dc',0,0,w,h);
 const colors=['#fa5e44','#23278c','#e3b32c','#322d30','#ffffff'];
 for(let i=0;i<13;i++){
  const x=rnd(i,81)*w,y=rnd(i,82)*h;
  const rot=Math.sin(t*.11+i)*.1;
  c.save();c.translate(x,y);c.rotate(rot);
  if(i%3===0)circle(c,0,0,w*.06*(1+p.beat*.09),colors[i%5]);
  else if(i%3===1)fill(c,colors[i%5],-w*.11,-h*.02,w*.22,h*.04);
  else{
   c.lineWidth=h*.026;c.strokeStyle=colors[i%5];
   c.beginPath();c.arc(0,0,w*.09,0,Math.PI*1.45);c.stroke()
  }
  c.restore();
 }
};
const sunset:Painter=(c,w,h,_t,p,d)=>{
 gradient(c,w,h,'#6139a0','#ef6990');
 const sunY=h*.58,sunR=h*.27;
 circle(c,w*.56,sunY,sunR,'#ffc58a');
 for(let j=0;j<11;j++)fill(c,'rgba(235,104,141,.9)',w*.56-sunR,sunY+j*sunR*.13,sunR*2,sunR*.03);
 fill(c,'#261340',0,h*.79,w,h*.21);
 for(let i=0;i<22*d;i++){
  const y=h*(.8+i*.009);
  stroke(c,0,y,w,y,'rgba(255,150,209,.29)',1+p.bass);
 }
 // Stylized palm silhouettes with long diagonal blades.
 for(const right of [false,true]){
  const x=w*(right?.89:.1),top=h*.30;
  stroke(c,x,h*.9,x+(right?-1:1)*w*.045,top,'#1d143d',Math.max(5,w*.008));
  for(let j=0;j<7;j++){
   const a=(-Math.PI*.95)+j*.37+(right?.3:-.3);
   stroke(c,x+(right?-1:1)*w*.045,top,
   x+(right?-1:1)*w*.045+Math.cos(a)*w*.15,top+Math.sin(a)*h*.14,'rgba(15,11,39,.96)',3);
  }
 }
};
const vortex:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#310c38','#08040c');
 const cx=w*.5,cy=h*.5;
 c.save();c.translate(cx,cy);
 for(let layer=0;layer<20*d;layer++){
  const radius=Math.min(w,h)*(.03+layer*.048);
  const offset=t*(.17+p.beat*.07)+layer*.65;
  c.strokeStyle=layer%2?'rgba(239,136,250,.27)':'rgba(252,229,255,.48)';
  c.lineWidth=1+layer*.15;
  c.beginPath();c.arc(0,0,radius,offset,offset+Math.PI*1.38);c.stroke();
  for(let i=0;i<4;i++){
   const a=offset+i*TAU/4;
   stroke(c,Math.cos(a)*radius*.73,Math.sin(a)*radius*.73,Math.cos(a)*radius,Math.sin(a)*radius,'rgba(250,155,255,.26)',1);
  }
 }
 c.restore();
};
const transit:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#10243b','#02040c');
 const cx=w*.52,cy=h*.4;
 const dx=Math.sin(t*.05)*w*.015;
 for(let i=0;i<18;i++){
  const x=rnd(i,91)*w,height=h*(.12+rnd(i,92)*.26);
  fill(c,'#0b1426',x,h*.45-height,w*.03+20,height);
  for(let j=0;j<5;j++)fill(c,'rgba(252,174,105,.22)',x+7,h*.45-height+j*17+9,4,6);
 }
 polygon(c,[cx+dx,cy,w*.95,h,0,h],'#080b18');
 for(let i=0;i<13*d;i++){
  const z=((rnd(i,93)+t*(.03+p.bass*.06))%1+1)%1;
  const y=cy+z*z*(h-cy);
  const width=z*w*.63;
  stroke(c,cx-width,y,cx+width,y,'rgba(245,150,102,.2)',1+z*2);
 }
 for(let i=-7;i<=7;i++){
  stroke(c,cx+dx,cy,cx+i*w*.135,h,'rgba(251,178,114,.25)',1);
 }
 stroke(c,cx-23,cy,cx-w*.23,h,'rgba(240,195,145,.62)',2);
 stroke(c,cx+23,cy,cx+w*.23,h,'rgba(240,195,145,.62)',2);
};
const ascension:Painter=(c,w,h,t,p,d)=>{
 gradient(c,w,h,'#14131c','#050509');
 const g=c.createRadialGradient(w*.5,h*.28,5,w*.5,h*.29,w*.7);
 g.addColorStop(0,'rgba(255,237,184,.55)');g.addColorStop(.42,'rgba(197,159,104,.10)');g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<12*d;i++){
  const x=w*(i+1)/(12+1);
  const spread=w*(.015+rnd(i,101)*.015);
  polygon(c,[x-spread,0,x+spread,0,x+w*.07,h,x-w*.07,h],'rgba(255,242,201,.028)');
 }
 const lift=(Math.sin(t*.2)+1)*h*.013+p.bass*h*.018;
 for(let j=0;j<5;j++){
  const y=h*(.84-j*.13)-lift;
  const left=w*(.20+j*.056),right=w*(.80-j*.056);
  polygon(c,[left,y,right,y,right-w*.03,y+h*.075,left+w*.03,y+h*.075],
   j%2?'rgba(189,170,143,.17)':'rgba(248,227,183,.21)');
  stroke(c,left,y,right,y,'rgba(255,232,189,.55)',1.4);
 }
 for(let i=0;i<25*d;i++)circle(c,rnd(i,104)*w,rnd(i,105)*h,1+rnd(i,106)*2,'rgba(250,225,175,.35)');
};
export const EXTRA_PAINTERS:Record<ExtraId,Painter>={
 'monochrome-memory':monochrome,'monument-titles':monument,'midnight-confession':midnight,
 'glass-architecture':glass,'ransom-poetry':ransom,'type-collision':collision,
 'petal-memory':petal,'submerged-words':submerged,'inferno-letterforms':inferno,
 'holographic-frequency':hologram,'pixel-pulse':pixel,'marker-diary':diary,
 'bubble-pop':bubble,'word-playground':playground,'sunset-frequency':sunset,
 'typographic-vortex':vortex,'midnight-transit':transit,'final-ascension':ascension,
};
export type {ExtraId};
