import {byId,resolveThemePalette,TEMPLATES,type SceneId} from '../catalog';
import type {Pulse} from '../paint';

export const MOTION_SCENES:readonly SceneId[]=TEMPLATES
 .map(t=>t.id)
 .filter((id):id is SceneId=>id!=='signal-chamber'&&id!=='color-riot');

const TAU=Math.PI*2;

/**
 * 21 genuinely distinct VoxelWall 2D music-reactive live backgrounds across 7 categories.
 * Every single theme ID has its own unique procedural geometry and honours the active colour palette.
 */
export function drawMotionGraphics(
 c:CanvasRenderingContext2D,
 w:number,
 h:number,
 time:number,
 p:Pulse,
 id:SceneId,
 intensity:number,
 reduced:boolean,
 paletteId?:string
){
 const baseTheme=byId[id]||TEMPLATES[0];
 const theme=resolveThemePalette(baseTheme.id,paletteId);
 const u=Math.min(w,h),k=intensity*(reduced?.12:1);
 const bass=p.bass*k,mid=p.mids*k,high=p.treble*k,hit=p.beat*k;
 const t=time*(reduced?.1:1);

 c.save();
 c.fillStyle=theme.background;
 c.fillRect(0,0,w,h);

 // Multi-stop atmospheric backdrop + radial stage glow
 const gradient=c.createLinearGradient(0,h,w,0);
 gradient.addColorStop(0,theme.accent+'2c');
 gradient.addColorStop(.52,theme.background);
 gradient.addColorStop(1,theme.accent+'48');
 c.fillStyle=gradient;
 c.fillRect(0,0,w,h);

 const glow=c.createRadialGradient(w*.5,h*.5,u*.04,w*.5,h*.5,u*.68);
 glow.addColorStop(0,theme.accent+'2a');
 glow.addColorStop(1,'transparent');
 c.fillStyle=glow;
 c.fillRect(0,0,w,h);

 const circle=(x:number,y:number,r:number,fill:string,stroke=false)=>{
  c.beginPath();
  c.arc(x,y,Math.max(.1,r),0,TAU);
  if(stroke){c.strokeStyle=fill;c.stroke()}
  else{c.fillStyle=fill;c.fill()}
 };
 const line=(x:number,y:number,x2:number,y2:number)=>{
  c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
 };

 // Subtle architectural plotter grid behind all VoxelWall plates
 c.save();
 c.strokeStyle=theme.foreground+'10';
 c.lineWidth=1;
 for(let gx=1;gx<8;gx++)line(w*gx/8,h*.08,w*gx/8,h*.92);
 for(let gy=1;gy<6;gy++)line(w*.06,h*gy/6,w*.94,h*gy/6);
 c.restore();

 c.lineWidth=Math.max(1.2,u*.0022);
 c.strokeStyle=theme.accent;

 switch(id){
 // ==================== FLOW (3 UNIQUE DESIGNS) ====================
 case 'holographic-tide': {
  const ribbonCount=16;
  for(let i=0;i<ribbonCount;i++){
   const yBase=h*(.08+i*(.84/(ribbonCount-1)));
   c.beginPath();
   for(let x=-12;x<=w+12;x+=10){
    const nx=x/w;
    const wave1=Math.sin(nx*TAU*1.35+t*.52+i*.48)*u*(.042+bass*.16);
    const wave2=Math.cos(nx*TAU*3.2-t*.74+i*.32)*u*(.018+high*.058);
    const y=yBase+wave1+wave2;
    if(x===-12)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=i%3===0?theme.accent+'cc':i%2?theme.accent+'77':theme.foreground+'44';
   c.lineWidth=u*.0062*(1+mid*.85);
   c.stroke();
   if(i%3===0){
    const nodeX=w*((.16+i*.11+t*.05)%0.84+0.08);
    const nx=nodeX/w;
    const nodeY=yBase+Math.sin(nx*TAU*1.35+t*.52+i*.48)*u*(.042+bass*.16);
    circle(nodeX,nodeY,u*(.007+hit*.016),theme.accent);
   }
  }
  break;
 }

 case 'gilded-whirlpool': {
  c.save();
  c.translate(w*.5,h*.5);
  const arms=6;
  for(let arm=0;arm<arms;arm++){
   c.beginPath();
   for(let s=0;s<=90;s++){
    const frac=s/90;
    const angle=arm*(TAU/arms)+frac*TAU*2.1-t*(.65+mid*.35);
    const radius=u*(.02+frac*.46)*(1+bass*.14)+Math.sin(frac*12-t*2.4)*u*.012*high;
    const x=Math.cos(angle)*radius*1.22;
    const y=Math.sin(angle)*radius;
    if(s===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=arm%2===0?theme.accent+'cc':theme.foreground+'66';
   c.lineWidth=u*(.004+hit*.006);
   c.stroke();
  }
  for(let r=1;r<=5;r++){
   circle(0,0,u*(.06*r+bass*.04),theme.accent+'44',true);
  }
  c.restore();
  break;
 }

 case 'ribbon-dance': {
  // Parametric Lissajous figure-8 harmonic weave & pendulum silk loops
  c.save();
  c.translate(w*.5,h*.5);
  const loops=7;
  for(let l=0;l<loops;l++){
   const phase=l*.42+t*.38;
   const rx=w*(.24+l*.022+bass*.06);
   const ry=h*(.16+l*.025+mid*.05);
   c.beginPath();
   for(let step=0;step<=120;step++){
    const a=(step/120)*TAU;
    const x=Math.sin(a*2+phase)*rx;
    const y=Math.sin(a*3-phase*.7)*ry;
    if(step===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.closePath();
   c.strokeStyle=l%2===0?theme.accent+'bb':theme.foreground+'55';
   c.lineWidth=u*(.0035+(l===0?hit*.006:0));
   c.stroke();
   const orbAngle=t*(.6+l*.08)+l;
   const ox=Math.sin(orbAngle*2+phase)*rx;
   const oy=Math.sin(orbAngle*3-phase*.7)*ry;
   circle(ox,oy,u*(.008+high*.014),l%2===0?theme.accent:theme.foreground);
  }
  c.restore();
  break;
 }

 // ==================== CONTOURS (3 UNIQUE DESIGNS) ====================
 case 'chroma-moire-voids': {
  const shift=u*(.04+bass*.09);
  const centers=[
   {x:w*.5+Math.cos(t*.42)*shift,y:h*.5+Math.sin(t*.36)*shift,col:theme.accent+'88'},
   {x:w*.5-Math.cos(t*.38)*shift,y:h*.5-Math.sin(t*.48)*shift,col:theme.foreground+'55'}
  ];
  for(const center of centers){
   for(let i=1;i<=18;i++){
    const r=u*(.03*i+mid*.02)+Math.sin(t*1.4+i*.4)*u*high*.012;
    c.lineWidth=i%4===0?2.0:1.0;
    circle(center.x,center.y,r,center.col,true);
   }
  }
  break;
 }

 case 'cobalt-contours': {
  const rings=21;
  const lobes=4;
  for(let i=0;i<rings;i++){
   c.beginPath();
   for(let j=0;j<=120;j++){
    const a=j/120*TAU;
    const r=u*(.11+i*.018)*(1+bass*.16)
     +Math.sin(a*lobes+t*.48+i*.24)*u*(.028+mid*.054)
     +Math.cos(a*7-t*.62+i*.15)*u*(.010+high*.020);
    const x=w*.5+Math.cos(a)*r*1.32;
    const y=h*.5+Math.sin(a)*r;
    if(j===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.closePath();
   c.strokeStyle=i%4===0?theme.foreground+'99':theme.accent+(i%2?'66':'bb');
   c.lineWidth=i%4===0?2.2:1.15;
   c.stroke();
  }
  break;
 }

 case 'contour-flow': {
  // Isobaric pulsar horizon ridgelines (stacked elevation scanlines)
  const ridges=18;
  const leftX=w*.10,rightX=w*.90,spanW=rightX-leftX;
  for(let r=0;r<ridges;r++){
   const baseY=h*(.18+r*(.68/(ridges-1)));
   c.beginPath();
   for(let s=0;s<=64;s++){
    const frac=s/64;
    const x=leftX+frac*spanW;
    const envelope=Math.exp(-Math.pow((frac-.5)*3.1,2));
    const ridgeWave=Math.abs(Math.sin(frac*TAU*3.5+t*1.1+r*.55))*u*(.045+bass*.14)*envelope
     +Math.cos(frac*TAU*8-t*1.6+r)*u*.012*high*envelope;
    const y=baseY-ridgeWave;
    if(s===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=r%3===0?theme.accent:theme.foreground+'88';
   c.lineWidth=r%3===0?2.2+hit*1.5:1.2;
   c.stroke();
  }
  break;
 }

 // ==================== SCULPTURES (3 UNIQUE DESIGNS) ====================
 case 'crystal-resonance': {
  c.save();
  c.translate(w*.5,h*.5);
  const shards=12;
  for(let i=0;i<shards;i++){
   const a=i*(TAU/shards)+t*.18;
   const len=u*(.16+(i%3)*.08+bass*.16+hit*.06);
   const spread=.22+mid*.14;
   c.beginPath();
   c.moveTo(0,0);
   c.lineTo(Math.cos(a-spread)*len*.58,Math.sin(a-spread)*len*.58);
   c.lineTo(Math.cos(a)*len,Math.sin(a)*len);
   c.lineTo(Math.cos(a+spread)*len*.58,Math.sin(a+spread)*len*.58);
   c.closePath();
   c.fillStyle=i%2===0?theme.accent+'38':theme.foreground+'22';
   c.fill();
   c.strokeStyle=i%2===0?theme.accent:theme.foreground+'88';
   c.lineWidth=1.4;
   c.stroke();
  }
  c.restore();
  break;
 }

 case 'tidal-bloom': {
  c.save();
  c.translate(w*.5,h*.5);
  const petals=14;
  for(let layer=4;layer>=1;layer--){
   const baseR=u*(.08*layer+bass*.07);
   for(let i=0;i<petals;i++){
    const a=i*(TAU/petals)+t*(.14*layer*(layer%2?1:-1));
    const px=Math.cos(a)*baseR*.55;
    const py=Math.sin(a)*baseR*.55;
    c.save();
    c.translate(px,py);
    c.rotate(a);
    c.beginPath();
    c.ellipse(0,0,baseR*(.52+mid*.18),baseR*(.24+high*.10),0,0,TAU);
    c.fillStyle=layer%2===0?theme.accent+'28':theme.foreground+'1c';
    c.fill();
    c.strokeStyle=layer%2===0?theme.accent+'aa':theme.foreground+'66';
    c.lineWidth=1.3;
    c.stroke();
    c.restore();
   }
  }
  circle(0,0,u*(.045+hit*.025),theme.accent);
  c.restore();
  break;
 }

 case 'paper-cut': {
  for(let i=0;i<10;i++){
   const side=i%2===0?-1:1;
   const layer=Math.floor(i/2);
   c.save();
   c.translate(w*(side<0?.11:.89)+side*layer*u*.015,h*(.10+layer*.19));
   c.rotate(side*(.22+mid*.38)+Math.sin(t*.34+i)*.07);
   c.shadowColor='rgba(18,22,34,0.28)';
   c.shadowBlur=u*.032;
   c.shadowOffsetY=u*.014;
   c.fillStyle=i%3===0?theme.accent:i%3===1?theme.foreground+'33':theme.accent+'66';
   const rw=u*(.46+bass*.22),rh=u*(.16+hit*.09);
   c.fillRect(-rw*.5,-rh*.5,rw,rh);
   c.strokeStyle=theme.foreground+'55';
   c.lineWidth=1.2;
   c.strokeRect(-rw*.46,-rh*.42,rw*.92,rh*.84);
   c.restore();
  }
  circle(w*.5,h*.5,u*(.33+bass*.06),theme.accent+'55',true);
  circle(w*.5,h*.5,u*(.39+hit*.05),theme.foreground+'33',true);
  break;
 }

 // ==================== SPACE (4 UNIQUE DESIGNS) ====================
 case 'celestial-orbit': {
  c.save();
  c.translate(w*.5,h*.5);
  const outerR=u*(.42+bass*.04);
  c.strokeStyle=theme.foreground+'38';
  for(let deg=0;deg<72;deg++){
   const a=deg*TAU/72+t*.02;
   const inner=deg%6===0?outerR*.93:outerR*.965;
   line(Math.cos(a)*inner,Math.sin(a)*inner,Math.cos(a)*outerR,Math.sin(a)*outerR);
  }
  const nodes:{x:number;y:number}[]=[];
  for(let i=0;i<8;i++){
   c.save();
   const rot=i*.39+t*(.045+i*.008)*(i%2?1:-1);
   c.rotate(rot);
   c.strokeStyle=i%2?theme.accent+'99':theme.foreground+'66';
   c.lineWidth=u*(i%3===0?.0032:.0018);
   const r=u*(.15+i*.042+bass*.075);
   c.beginPath();
   c.ellipse(0,0,r,r*(.46+(i%3)*.12),0,0,TAU);
   c.stroke();
   const ang=t*(.24+i*.05)+i*1.1;
   const sx=Math.cos(ang)*r,sy=Math.sin(ang)*r*(.46+(i%3)*.12);
   circle(sx,sy,u*(.009+high*.018),theme.accent);
   circle(sx,sy,u*(.022+hit*.025),theme.foreground+'55',true);
   nodes.push({
    x:sx*Math.cos(rot)-sy*Math.sin(rot),
    y:sx*Math.sin(rot)+sy*Math.cos(rot)
   });
   c.restore();
  }
  c.strokeStyle=theme.accent+'44';
  c.lineWidth=1;
  for(let i=0;i<nodes.length-1;i++){
   line(nodes[i].x,nodes[i].y,nodes[i+1].x,nodes[i+1].y);
  }
  c.restore();
  break;
 }

 case 'orbital-halo': {
  c.save();
  c.translate(w*.5,h*.5);
  const baseR=u*(.22+bass*.07);
  for(let ray=0;ray<64;ray++){
   const a=ray*TAU/64+t*.12;
   const harmonic=.5+.5*Math.sin(ray*1.7+t*2.4);
   const len=baseR+u*(.04+harmonic*.12*(.3+bass+high)+hit*.05);
   c.strokeStyle=ray%2===0?theme.accent+'cc':theme.foreground+'66';
   c.lineWidth=u*.004;
   line(Math.cos(a)*baseR*.88,Math.sin(a)*baseR*.88,Math.cos(a)*len,Math.sin(a)*len);
  }
  circle(0,0,baseR,theme.accent+'aa',true);
  circle(0,0,baseR*1.28,theme.foreground+'44',true);
  c.restore();
  break;
 }

 case 'infinite-tunnel': {
  c.save();
  c.translate(w*.5,h*.5);
  const depthCount=16;
  for(let i=0;i<depthCount;i++){
   const phase=((i/depthCount)+(t*.24))%1;
   const r=u*(.03+Math.pow(phase,1.7)*.62)*(1+bass*.12);
   c.save();
   c.rotate(phase*1.2+t*.15*(i%2?1:-1));
   c.strokeStyle=i%2===0?theme.accent:theme.foreground;
   c.globalAlpha=Math.sin(phase*Math.PI)*.85;
   c.lineWidth=1.2+phase*2.6+hit*2;
   c.strokeRect(-r,-r*.68,r*2,r*1.36);
   c.restore();
  }
  c.restore();
  break;
 }

 case 'star-map': {
  c.save();
  c.strokeStyle=theme.accent+'33';
  circle(w*.5,h*.5,u*(.22+mid*.05),theme.accent+'33',true);
  circle(w*.5,h*.5,u*(.36+bass*.09),theme.accent+'55',true);
  line(w*.5-u*.42,h*.5,w*.5+u*.42,h*.5);
  line(w*.5,h*.5-u*.42,w*.5,h*.5+u*.42);
  c.restore();
  const pts:{x:number;y:number}[]=[];
  for(let i=0;i<60;i++){
   const x=w*(.05+((i*37)%97)/108)+Math.sin(t*.16+i)*u*mid*.038;
   const y=h*(.08+((i*23)%89)/105)+Math.cos(t*.21+i)*u*high*.055;
   pts.push({x,y});
   c.globalAlpha=.38+.55*(.5+.5*Math.sin(i*3.1+t*1.4))*(.4+high);
   if(i>0&&i%2===0){
    c.strokeStyle=theme.accent+'55';
    line(x,y,pts[i-1].x,pts[i-1].y);
   }
   if(i>3&&i%5===0){
    c.strokeStyle=theme.foreground+'33';
    line(x,y,pts[i-3].x,pts[i-3].y);
   }
   circle(x,y,u*(.003+high*.007+(i%7===0?hit*.008:0)),i%7===0?theme.accent:theme.foreground);
  }
  c.globalAlpha=1;
  break;
 }

 // ==================== NATURE (3 UNIQUE DESIGNS) ====================
 case 'aurora-field': {
  const curtains=7;
  for(let cIdx=0;cIdx<curtains;cIdx++){
   const baseY=h*(.22+cIdx*.08);
   c.beginPath();
   for(let x=0;x<=w;x+=14){
    const nx=x/w;
    const sway=Math.sin(nx*TAU*1.6+t*.45+cIdx*.7)*u*(.05+bass*.12)
     +Math.cos(nx*TAU*4.2-t*.8+cIdx)*u*(.018+high*.04);
    const y=baseY+sway;
    if(x===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=cIdx%2===0?theme.accent+'aa':theme.foreground+'55';
   c.lineWidth=u*(.018+mid*.016);
   c.stroke();
  }
  break;
 }

 case 'glow-lagoon': {
  const swells=16;
  for(let i=0;i<swells;i++){
   const yBase=h*(.18+i*.046);
   c.beginPath();
   for(let x=0;x<=w;x+=12){
    const nx=x/w;
    const swell=Math.sin(nx*TAU*2.1+t*.65+i*.42)*u*(.022+bass*.09);
    const ripple=Math.cos(nx*TAU*5.5-t*1.1+i)*u*(.008+high*.025);
    const y=yBase+swell+ripple;
    if(x===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=i%3===0?theme.accent+'bb':theme.foreground+'40';
   c.lineWidth=1.4+(i/swells)*2.4+mid*2;
   c.stroke();
  }
  for(let s=0;s<28;s++){
   const sx=w*((s*19/28+t*.02)%1);
   const sy=h*(.25+((s*13)%65)/100)+Math.sin(t*1.2+s)*u*.03;
   circle(sx,sy,u*(.004+high*.009),s%2===0?theme.accent:theme.foreground);
  }
  break;
 }

 case 'pixel-garden': {
  const cols=28;
  for(let i=0;i<cols;i++){
   const x=i*w/(cols-1),step=u*.019;
   const harmonic=.5+.5*Math.sin(i*1.9+t*.7);
   const stem=h*(.08+harmonic*.14+bass*.22+(i%3===0?mid*.1:0));
   c.fillStyle=i%2?theme.foreground+'55':theme.accent;
   c.fillRect(x,h-stem,step,stem);
   const bloom=step*(2.1+high*3.2+hit*1.2);
   c.fillStyle=i%3?theme.accent:theme.foreground;
   c.fillRect(x-bloom/2+step/2,h-stem-bloom,bloom,bloom);
   c.fillStyle=theme.background;
   c.fillRect(x-step*.3,h-stem-bloom*.65,step*1.6,step*1.6);
   if(i%2===0){
    const sy=h*(.12+((i*17)%60)/100)+Math.sin(t*.55+i)*u*(.04+mid*.08);
    c.fillStyle=theme.accent+'88';
    c.fillRect(x,sy,step*.85,step*.85);
   }
  }
  break;
 }

 // ==================== ARCHITECTURE (3 MOTION2D + 1 SPECTRUM) ====================
 case 'neon-metal-matrix': {
  const cols=18,rows=10;
  const cellW=w*.84/cols,cellH=h*.76/rows;
  const startX=w*.08,startY=h*.12;
  for(let r=0;r<rows;r++){
   for(let col=0;col<cols;col++){
    const cx=startX+(col+.5)*cellW;
    const cy=startY+(r+.5)*cellH;
    const wave=Math.sin(col*.45+r*.55-t*2.1);
    const scale=.28+.38*(.5+.5*wave)+bass*.32;
    const bw=cellW*scale,bh=cellH*scale;
    c.strokeStyle=(r+col)%3===0?theme.accent+'cc':theme.foreground+'44';
    c.lineWidth=1.2;
    c.strokeRect(cx-bw*.5,cy-bh*.5,bw,bh);
    if((r+col)%4===0){
     circle(cx,cy,u*(.004+high*.008),theme.accent);
    }
   }
  }
  break;
 }

 case 'bauhaus-beat': {
  circle(w*.14,h*.22,u*(.20+bass*.11),theme.accent);
  circle(w*.14,h*.22,u*(.25+hit*.08),theme.foreground+'66',true);
  circle(w*.88,h*.80,u*(.21+hit*.09),theme.foreground+'55');
  c.save();
  c.translate(w*.5,h*.5);
  c.rotate(-0.32+Math.sin(t*.15)*.04);
  c.fillStyle=theme.foreground+'18';
  c.fillRect(-w*.6,-u*.045,w*1.2,u*.09);
  c.restore();
  c.save();
  c.translate(w*.84,h*.20);
  c.rotate(t*.12+mid*.45);
  c.fillStyle=theme.accent+'bb';
  const sq=u*(.26+bass*.06);
  c.fillRect(-sq*.5,-sq*.5,sq,sq);
  c.strokeStyle=theme.foreground;
  c.lineWidth=u*.006;
  c.strokeRect(-sq*.36,-sq*.36,sq*.72,sq*.72);
  c.restore();
  for(let i=0;i<16;i++){
   const barH=h*(.06+((i*7)%5)*.022+high*.14+bass*(i%2?.08:0));
   c.fillStyle=i%4===0?theme.accent:theme.foreground;
   c.fillRect(w*.05+i*u*.024,h*.90-barH,u*.014,barH);
  }
  break;
 }

 case 'halftone-club': {
  for(let row=0;row<16;row++)for(let col=0;col<26;col++){
   const x=(col+.5)*w/26,y=(row+.5)*h/16;
   const dist=Math.hypot(x-w*.5,y-h*.5)/u;
   const wave=.5+.5*Math.sin(dist*10-t*1.8+col*.25);
   const radius=u*(.003+wave*.010+((row+col)%3===0?bass:high)*.014);
   c.globalAlpha=.16+wave*.48;
   circle(x,y,radius,(row+col)%5===0?theme.foreground:theme.accent);
  }
  c.globalAlpha=1;
  c.lineWidth=u*(.004+hit*.009);
  circle(w*.5,h*.5,u*(.36+bass*.07),theme.foreground+'66',true);
  circle(w*.5,h*.5,u*(.24+mid*.06),theme.accent+'88',true);
  break;
 }

 // ==================== JOURNEYS (2 MOTION2D + 1 GEOMETRY) ====================
 case 'chromatic-drive': {
  const horizon=h*.46;
  circle(w*.5,horizon,u*(.16+bass*.06),theme.accent+'55');
  circle(w*.5,horizon,u*(.21+hit*.05),theme.accent,true);
  for(let lane=-8;lane<=8;lane++){
   c.strokeStyle=lane%2===0?theme.accent+'88':theme.foreground+'44';
   c.lineWidth=lane===0?2.2:1.2;
   line(w*.5+lane*w*.022,horizon,w*.5+lane*w*.13,h);
  }
  for(let row=1;row<=10;row++){
   const pRow=((row/10)+(t*.35))%1;
   const yy=horizon+(h-horizon)*Math.pow(pRow,1.75);
   c.strokeStyle=theme.accent+'77';
   c.lineWidth=1+pRow*2.2;
   line(0,yy,w,yy);
  }
  break;
 }

 case 'origami-flight': {
  const flock=14;
  for(let i=0;i<flock;i++){
   const px=w*((.08+i*.068+t*.045)%0.88+0.06);
   const py=h*(.18+((i*29)%64)/100)+Math.sin(t*1.1+i)*u*(.03+mid*.05);
   const wing=u*(.028+bass*.025+(i%3)*0.008);
   const flap=Math.sin(t*3.2+i*1.3)*(.25+high*.35);
   c.save();
   c.translate(px,py);
   c.rotate(-.18+Math.cos(t*.5+i)*.08);
   c.beginPath();
   c.moveTo(wing,0);
   c.lineTo(-wing*.7,-wing*(.65+flap));
   c.lineTo(-wing*.2,0);
   c.lineTo(-wing*.7,wing*(.65-flap));
   c.closePath();
   c.fillStyle=i%3===0?theme.accent:theme.foreground+'cc';
   c.fill();
   c.restore();
  }
  break;
 }
 }

 c.restore();
}

