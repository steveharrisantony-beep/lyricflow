import {SmoothCurve} from './SmoothCurve';
import {isSpectrumScene} from './SpectrumThemes';
import {byId,resolveThemePalette,TEMPLATES,type SceneId} from '../catalog';
import type {Pulse} from '../paint';
import {drawAdvancedTheme,frequencyDrive,type MotionDetail} from './AdvancedThemes';

export const MOTION_SCENES:readonly SceneId[]=TEMPLATES
 .map(t=>t.id)
 .filter((id):id is SceneId=>id!=='color-riot'&&!isSpectrumScene(id));

const TAU=Math.PI*2;
const starPositions=new Float32Array(120);
const orbitPositions=new Float32Array(16);
const curve=new SmoothCurve();

/**
 * 23 distinct VoxelWall 2D music-reactive live backgrounds across 7 categories.
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
 paletteId?:string,
 options:MotionDetail={}
){
 const baseTheme=byId[id]||TEMPLATES[0];
 const theme=resolveThemePalette(baseTheme.id,paletteId);
 const u=Math.min(w,h),k=intensity*(reduced?.12:1);
 const bass=p.bass*k,mid=p.mids*k,high=p.treble*k,hit=p.beat*k;
 const t=time*(reduced?.1:1);
 const detail=Math.max(.3,Math.min(1,options.detail??1));
 const count=(full:number,min:number)=>Math.max(min,Math.round(full*detail));
 const band=(x:number)=>frequencyDrive(p,options.bands,x)*k;
 const segments=count(160,80);
 const waveSegments=Math.max(80,Math.min(256,Math.ceil(w/(detail<.6?18:12))));

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

 if(drawAdvancedTheme(c,w,h,time,p,id,theme,intensity,reduced,options)){c.restore();return;}

 // Keep the plotter grid within the architectural scenes.
 if(baseTheme.family==='architecture'){
 c.save();
 c.strokeStyle=theme.foreground+'10';
 c.lineWidth=1;
 for(let gx=1;gx<8;gx++)line(w*gx/8,h*.08,w*gx/8,h*.92);
 for(let gy=1;gy<6;gy++)line(w*.06,h*gy/6,w*.94,h*gy/6);
 c.restore();
 }

 c.lineWidth=Math.max(1.2,u*.0022);
 c.strokeStyle=theme.accent;

 switch(id){
 // ==================== FLOW (3 UNIQUE DESIGNS) ====================
 case 'holographic-tide': {
  const ribbonCount=count(16,8);
  for(let i=0;i<ribbonCount;i++){
   const yBase=h*(.08+i*(.84/(ribbonCount-1)));
   c.beginPath();
   curve.reset();
   for(let step=0;step<=waveSegments;step++){
    const x=-12+(w+24)*step/waveSegments;
    const nx=x/w;
    const voice=band(i/(ribbonCount-1));
    const wave1=Math.sin(nx*TAU*1.35+t*.52+i*.48)*u*(.042+bass*.10+voice*.10);
    const wave2=Math.cos(nx*TAU*3.2-t*.74+i*.32)*u*(.018+high*.058);
    const y=yBase+wave1+wave2;
    curve.add(x,y);
   }
   curve.trace(c);
   c.strokeStyle=i%3===0?theme.accent+'cc':i%2?theme.accent+'77':theme.foreground+'44';
   c.lineWidth=u*.0062*(1+mid*.85);
   c.stroke();
   if(i%3===0){
    const nodeX=w*((.16+i*.11+t*.05)%0.84+0.08);
    const nx=nodeX/w;
    const nodeY=yBase+Math.sin(nx*TAU*1.35+t*.52+i*.48)*u*(.042+bass*.10+band(i/(ribbonCount-1))*.10)
      +Math.cos(nx*TAU*3.2-t*.74+i*.32)*u*(.018+high*.058);
    circle(nodeX,nodeY,u*(.007+hit*.016),theme.accent);
   }
  }
  break;
 }

 case 'ribbon-dance': {
  // Parametric Lissajous figure-8 harmonic weave & pendulum silk loops
  c.save();
  c.translate(w*.5,h*.5);
  const loops=3;
  for(let l=0;l<loops;l++){
   const phase=l*.42+t*.38;
   const rx=w*(.24+l*.022+bass*.03+band(l/(loops-1))*.045);
   const ry=h*(.16+l*.025+mid*.05);
   c.beginPath();
   curve.reset();
   for(let step=0;step<segments;step++){
    const a=(step/segments)*TAU;
    const x=Math.sin(a*2+phase)*rx;
    const y=Math.sin(a*3-phase*.7)*ry;
    curve.add(x,y);
   }
   curve.trace(c,true);
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

 // ==================== CONTOURS ====================
 case 'cobalt-contours': {
  const rings=count(21,11);
  const lobes=4;
  for(let i=0;i<rings;i++){
   c.beginPath();
   curve.reset();
   for(let j=0;j<segments;j++){
    const a=j/segments*TAU;
    const r=u*(.11+i/(rings-1)*.36)*(1+bass*.10+band(i/(rings-1))*.09)
     +Math.sin(a*lobes+t*.48+i*.24)*u*(.028+mid*.054)
     +Math.cos(a*7-t*.62+i*.15)*u*(.010+high*.020);
    const x=w*.5+Math.cos(a)*r*1.32;
    const y=h*.5+Math.sin(a)*r;
    curve.add(x,y);
   }
   curve.trace(c,true);
   c.strokeStyle=i%4===0?theme.foreground+'99':theme.accent+(i%2?'66':'bb');
   c.lineWidth=i%4===0?2.2:1.15;
   c.stroke();
  }
  break;
 }

 case 'contour-flow': {
  // Isobaric pulsar horizon ridgelines (stacked elevation scanlines)
  const ridges=count(18,10);
  const leftX=w*.10,rightX=w*.90,spanW=rightX-leftX;
  for(let r=0;r<ridges;r++){
   const baseY=h*(.18+r*(.68/(ridges-1)));
   c.beginPath();
   curve.reset();
   for(let s=0;s<=96;s++){
    const frac=s/96;
    const x=leftX+frac*spanW;
    const envelope=Math.exp(-Math.pow((frac-.5)*3.1,2));
    const ridgeWave=Math.abs(Math.sin(frac*TAU*3.5+t*1.1+r*.55))*u*(.045+bass*.07+band(frac)*.10)*envelope
     +Math.cos(frac*TAU*8-t*1.6+r)*u*.012*high*envelope;
    const y=baseY-ridgeWave;
    curve.add(x,y);
   }
   curve.trace(c);
   c.strokeStyle=r%3===0?theme.accent:theme.foreground+'88';
   c.lineWidth=r%3===0?2.2+hit*1.5:1.2;
   c.stroke();
  }
  break;
 }

 // ==================== SCULPTURES ====================
 case 'crystal-resonance': {
  c.save();
  c.translate(w*.5,h*.5);
  const shards=12;
  for(let i=0;i<shards;i++){
   const a=i*(TAU/shards)+t*.18;
   const len=u*(.16+(i%3)*.08+bass*.07+band(i/(shards-1))*.13+hit*.04);
   const spread=.22+mid*.14;
   c.beginPath();
   c.moveTo(0,0);
   c.lineTo(Math.cos(a-spread)*len*.58,Math.sin(a-spread)*len*.58);
   c.lineTo(Math.cos(a)*len,Math.sin(a)*len);
   c.lineTo(Math.cos(a+spread)*len*.58,Math.sin(a+spread)*len*.58);
   c.closePath();
   const facet=c.createLinearGradient(0,0,Math.cos(a)*len,Math.sin(a)*len);
   facet.addColorStop(0,theme.background);facet.addColorStop(.55,theme.accent+'66');facet.addColorStop(1,theme.foreground+'99');
   c.fillStyle=facet;c.fill();
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
    c.ellipse(0,0,baseR*(.52+mid*.18),baseR*(.24+band(i/(petals-1))*.12),0,0,TAU);
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
   const voice=band(i/9);
   const driftX=Math.sin(t*.65+i*.9)*u*(bass*.04+voice*.04);
   const driftY=Math.sin(t*.83+i)*u*(mid*.035+voice*.035)+hit*u*.018*(i%2?-1:1);
   c.translate(w*(side<0?.11:.89)+side*layer*u*.015+driftX,h*(.10+layer*.19)+driftY);
   c.rotate(side*(.22+mid*.38)+Math.sin(t*.34+i)*.07);
   c.shadowColor='rgba(18,22,34,0.28)';
   c.shadowBlur=u*.032;
   c.shadowOffsetY=u*.014;
   c.fillStyle=i%3===0?theme.accent:i%3===1?theme.foreground+'33':theme.accent+'66';
   const rw=u*.46,rh=u*.16;
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
  const nodes=orbitPositions;
  for(let i=0;i<8;i++){
   c.save();
   const rot=i*.39+t*(.045+i*.008)*(i%2?1:-1);
   c.rotate(rot);
   c.strokeStyle=i%2?theme.accent+'99':theme.foreground+'66';
   c.lineWidth=u*(i%3===0?.0032:.0018);
   const r=u*(.15+i*.042+bass*.04+band(i/7)*.045);
   c.beginPath();
   c.ellipse(0,0,r,r*(.46+(i%3)*.12),0,0,TAU);
   c.stroke();
   const ang=t*(.24+i*.05)+i*1.1;
   const sx=Math.cos(ang)*r,sy=Math.sin(ang)*r*(.46+(i%3)*.12);
   circle(sx,sy,u*(.009+high*.018),theme.accent);
   circle(sx,sy,u*(.022+hit*.025),theme.foreground+'55',true);
   nodes[i*2]=sx*Math.cos(rot)-sy*Math.sin(rot);
   nodes[i*2+1]=sx*Math.sin(rot)+sy*Math.cos(rot);
   c.restore();
  }
  c.strokeStyle=theme.accent+'44';
  c.lineWidth=1;
  for(let i=0;i<7;i++){
   line(nodes[i*2],nodes[i*2+1],nodes[(i+1)*2],nodes[(i+1)*2+1]);
  }
  c.restore();
  break;
 }

 case 'orbital-halo': {
  c.save();
  c.translate(w*.5,h*.5);
  const baseR=u*(.22+bass*.07);
  const rays=count(64,32);
  for(let ray=0;ray<rays;ray++){
   const a=ray*TAU/rays+t*.12;
   const harmonic=.5+.5*Math.sin(ray*1.7+t*2.4);
   const len=baseR+u*(.04+harmonic*.04+band(ray/(rays-1))*.18+hit*.035);
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
  const depthCount=count(16,9);
  for(let i=0;i<depthCount;i++){
   const phase=((i/depthCount)+(t*.24))%1;
   const r=u*(.03+Math.pow(phase,1.7)*.62)*(1+bass*.06+band(i/(depthCount-1))*.08);
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
  const stars=count(60,32),pts=starPositions;
  for(let i=0;i<stars;i++){
   pts[i*2]=w*(.05+((i*37)%97)/108)+Math.sin(t*.16+i)*u*mid*.038;
   pts[i*2+1]=h*(.08+((i*23)%89)/105)+Math.cos(t*.21+i)*u*high*.055;
  }
  for(let i=0;i<stars;i++){
   const x=pts[i*2],y=pts[i*2+1];
   for(let j=i+1;j<stars;j++){
    const d=Math.hypot(x-pts[j*2],y-pts[j*2+1]);
    if(d<u*.19){
     c.globalAlpha=(1-d/(u*.19))*(.18+mid*.40);
     c.strokeStyle=theme.accent;line(x,y,pts[j*2],pts[j*2+1]);
    }
   }
   c.globalAlpha=.38+.55*(.5+.5*Math.sin(i*3.1+t*1.4))*(.4+high);
   circle(x,y,u*(.003+band(i/(stars-1))*.008+(i%7===0?hit*.006:0)),i%7===0?theme.accent:theme.foreground);
  }
  c.globalAlpha=1;
  break;
 }

 // ==================== NATURE ====================
 case 'aurora-field': {
  const curtains=count(7,4);
  for(let cIdx=0;cIdx<curtains;cIdx++){
   const baseY=h*(.22+cIdx/(curtains-1)*.48);
   c.beginPath();
   curve.reset();
   for(let step=0;step<=waveSegments;step++){
    const x=w*step/waveSegments,nx=x/w;
    const sway=Math.sin(nx*TAU*1.6+t*.45+cIdx*.7)*u*(.05+bass*.12)
     +Math.cos(nx*TAU*4.2-t*.8+cIdx)*u*(.018+high*.04);
    const y=baseY+sway;
    curve.add(x,y);
   }
   curve.trace(c);
   c.strokeStyle=cIdx%2===0?theme.accent+'88':theme.foreground+'44';
   c.lineWidth=u*(.004+band(cIdx/curtains)*.008);c.stroke();
   c.lineTo(w,h*.96);c.lineTo(0,h*.96);c.closePath();
   const curtain=c.createLinearGradient(0,baseY-u*.12,0,h*.96);
   curtain.addColorStop(0,theme.accent+'00');curtain.addColorStop(.24,theme.accent+'32');curtain.addColorStop(1,theme.accent+'00');
   c.fillStyle=curtain;c.fill();
  }
  break;
 }

 case 'glow-lagoon': {
  const swells=count(16,9);
  for(let i=0;i<swells;i++){
   const yBase=h*(.18+i/(swells-1)*.69);
   c.beginPath();
   curve.reset();
   for(let step=0;step<=waveSegments;step++){
    const x=w*step/waveSegments,nx=x/w;
    const swell=Math.sin(nx*TAU*2.1+t*.65+i*.42)*u*(.022+bass*.09);
    const ripple=Math.cos(nx*TAU*5.5-t*1.1+i)*u*(.008+high*.025);
    const y=yBase+swell+ripple;
    curve.add(x,y);
   }
   curve.trace(c);
   c.strokeStyle=i%3===0?theme.accent+'bb':theme.foreground+'40';
   c.lineWidth=1.4+(i/swells)*2.4+mid*2;
   c.stroke();
  }
  for(let s=0;s<28;s++){
   const sx=w*((s*19/28+t*.02)%1);
   const sy=h*(.25+((s*13)%65)/100)+Math.sin(t*1.2+s)*u*.03;
   circle(sx,sy,u*(.003+band(s/28)*.010),s%2===0?theme.accent:theme.foreground);
  }
  break;
 }

 case 'pixel-garden': {
  const flowers=count(26,14),backCount=Math.ceil(flowers/2);
  c.lineCap='round';
  for(let i=0;i<flowers;i++){
   const back=i<backCount,layer=back?.72:1;
   const variant=.5+.5*Math.sin(i*2.731+.8);
   const x=w*(.035+((i*.618033989)%1)*.93);
   const ground=h*1.025;
   const voice=band(i/(flowers-1));
   const stem=u*((back?.24:.13)+variant*(back?.04:.035)+bass*.024+voice*.020);
   const sway=Math.sin(t*.55+i*1.9)*u*(.004+mid*.018)*layer;
   const topX=x+Math.sin(i*1.37)*u*.018*layer+sway,topY=ground-stem;
   const lowerX=x+Math.sin(i*2.17+.7)*u*.065*layer+sway*.3;
   const upperX=topX+Math.cos(i*1.73+.4)*u*.055*layer-sway*.35;
   const lowerY=ground-stem*.32,upperY=topY+stem*.28;
   c.globalAlpha=back?.48:.94;
   c.strokeStyle=theme.accent;c.lineWidth=u*.0025*layer;
   c.beginPath();c.moveTo(x,ground);c.bezierCurveTo(lowerX,lowerY,upperX,upperY,topX,topY);c.stroke();
   // Attach leaves to the actual cubic stem rather than a straight approximation.
   for(let side=-1;side<=1;side+=2){
    const f=side<0?.35:.62,q=1-f;
    const lx=q*q*q*x+3*q*q*f*lowerX+3*q*f*f*upperX+f*f*f*topX;
    const ly=q*q*q*ground+3*q*q*f*lowerY+3*q*f*f*upperY+f*f*f*topY;
    const leaf=u*(back?.027:.032);
    c.beginPath();c.moveTo(lx,ly);
    c.quadraticCurveTo(lx+side*leaf,ly-leaf*.85,lx+side*leaf*1.2,ly-leaf*.2);
    c.quadraticCurveTo(lx+side*leaf*.6,ly+leaf*.3,lx,ly);
    c.fillStyle=theme.accent+'aa';c.fill();
   }
   const petals=i%3===0?8:5;
   const radius=u*(.010+variant*.005+high*.006+voice*.004)*layer;
   const open=1+hit*.15;
   c.save();c.translate(topX,topY);c.rotate(Math.sin(t*.35+i)*(.06+mid*.15));
   const petal=c.createRadialGradient(0,0,0,0,0,radius*2.2);
   petal.addColorStop(0,theme.accent);petal.addColorStop(.65,i%3===0?theme.foreground:theme.accent);petal.addColorStop(1,theme.foreground+'88');
   c.fillStyle=petal;
   for(let j=0;j<petals;j++){
    const a=j/petals*TAU;
    c.beginPath();c.ellipse(Math.cos(a)*radius*.95*open,Math.sin(a)*radius*.95*open,radius*1.05,radius*.51,a,0,TAU);c.fill();
   }
   circle(0,0,radius*.48,theme.foreground);
   circle(0,0,radius*.26,theme.accent);
   c.restore();
  }
  c.globalAlpha=1;
  // Treble-lit pollen stays round even in the pixel font theme.
  for(let i=0;i<count(32,12);i++){
   const x=w*((i*.618+t*.008)%1),y=h*(.15+((i*19)%65)/100)+Math.sin(t*.4+i)*u*.025;
   c.globalAlpha=.18+high*.55;circle(x,y,u*(.0018+high*.003),theme.foreground);
  }
  c.globalAlpha=1;
  break;
 }

 // ==================== ARCHITECTURE ====================
 case 'neon-metal-matrix': {
  const cols=count(18,11),rows=count(10,6);
  const cellW=w*.84/cols,cellH=h*.76/rows;
  const startX=w*.08,startY=h*.12;
  for(let r=0;r<rows;r++){
   for(let col=0;col<cols;col++){
    const cx=startX+(col+.5)*cellW;
    const cy=startY+(r+.5)*cellH;
    const wave=Math.sin(col*.45+r*.55-t*2.1);
    const voice=band((col+r*.45)/(cols+rows*.45));
    const scale=.24+.24*(.5+.5*wave)+voice*.48+bass*.12;
    const edge=Math.min(cellW,cellH)*scale;
    c.strokeStyle=(r+col)%3===0?theme.accent+'cc':theme.foreground+'44';
    c.lineWidth=1.2;
    c.fillStyle=theme.accent+'12';c.fillRect(cx-edge*.5,cy-edge*.5,edge,edge);
    c.strokeRect(cx-edge*.5,cy-edge*.5,edge,edge);
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
   const barH=h*(.06+((i*7)%5)*.022+band(i/15)*.18+bass*(i%2?.05:0));
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
   const radius=u*(.003+wave*.010+band((col+row*.4)/32)*.016);
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
   c.lineWidth=(lane===0?2.2:1.2)+band((lane+8)/16)*2;
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
  const margin=Math.max(w*.12,u*.12);
  const span=w+margin*2;
  for(let i=0;i<flock;i++){
   const phase=(((i/flock+t*.045)%1)+1)%1;
   const px=phase*span-margin;
   const py=h*(.18+((i*29)%64)/100)+Math.sin(t*1.1+i)*u*(.03+mid*.05);
   const wing=u*(.028+bass*.012+band(i/(flock-1))*.018+(i%3)*0.008);
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


