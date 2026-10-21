import {byId,type SceneId} from '../catalog';
import type {Pulse} from '../paint';
export const MOTION_SCENES:readonly SceneId[]=[
 'paper-cut','orbital-score','silk-waves','bauhaus-beat','star-map',
 'halftone-club','ribbon-dance','vinyl-groove','pixel-garden','contour-flow'
];
const TAU=Math.PI*2;

/**
 * Ten art-directed 2D motion graphics plates inspired by mexicat/pdoom-video
 * and Tunai-0511/baseline. Combines multi-layer architectural composition,
 * precision plotter hairlines, and distinct instrument-role reactivity.
 */
export function drawMotionGraphics(
 c:CanvasRenderingContext2D,
 w:number,
 h:number,
 time:number,
 p:Pulse,
 id:SceneId,
 intensity:number,
 reduced:boolean
){
 const theme=byId[id],u=Math.min(w,h),k=intensity*(reduced?.12:1);
 const bass=p.bass*k,mid=p.mids*k,high=p.treble*k,hit=p.beat*k,onset=(p.onset??0)*k;
 const t=time*(reduced?.1:1);

 c.save();
 c.fillStyle=theme.background;
 c.fillRect(0,0,w,h);

 // Multi-stop atmospheric backdrop + radial stage glow
 const gradient=c.createLinearGradient(0,h,w,0);
 gradient.addColorStop(0,theme.accent+'2c');
 gradient.addColorStop(.52,theme.background);
 gradient.addColorStop(1,theme.accent+'4a');
 c.fillStyle=gradient;
 c.fillRect(0,0,w,h);

 const glow=c.createRadialGradient(w*.5,h*.5,u*.04,w*.5,h*.5,u*.68);
 glow.addColorStop(0,theme.accent+'28');
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

 // Subtle architectural plotter grid behind all 2D plates
 c.save();
 c.strokeStyle=theme.foreground+'12';
 c.lineWidth=1;
 for(let gx=1;gx<8;gx++)line(w*gx/8,h*.08,w*gx/8,h*.92);
 for(let gy=1;gy<6;gy++)line(w*.06,h*gy/6,w*.94,h*gy/6);
 c.restore();

 c.lineWidth=Math.max(1.2,u*.0022);
 c.strokeStyle=theme.accent;

 switch(id){
 case 'paper-cut': {
  // Multi-layered brutalist paper diorama canyon + floating geometric shards
  for(let i=0;i<10;i++){
   const side=i%2===0?-1:1;
   const layer=Math.floor(i/2);
   c.save();
   c.translate(w*(side<0?.11:.89)+side*layer*u*.015,h*(.10+layer*.19));
   c.rotate(side*(.22+mid*.38)+Math.sin(t*.34+i)*.07);
   c.shadowColor='rgba(18,22,34,0.28)';
   c.shadowBlur=u*.032;
   c.shadowOffsetY=u*.014;
   c.fillStyle=i%3===0?theme.accent:i%3===1?'#d5c8ae':'#6e9896';
   const rw=u*(.46+bass*.22),rh=u*(.16+hit*.09);
   c.fillRect(-rw*.5,-rh*.5,rw,rh);
   // Plotter bevel rule along each paper slab
   c.strokeStyle=theme.foreground+'55';
   c.lineWidth=1.2;
   c.strokeRect(-rw*.46,-rh*.42,rw*.92,rh*.84);
   c.restore();
  }
  // Central aperture framing rings
  c.strokeStyle=theme.accent+'66';
  circle(w*.5,h*.5,u*(.33+bass*.06),theme.accent+'55',true);
  circle(w*.5,h*.5,u*(.39+hit*.05),theme.foreground+'33',true);
  break;
 }
 case 'orbital-score': {
  // Celestial astrolabe & pdoom-video spacetime gyroscope
  c.save();
  c.translate(w*.5,h*.5);
  // Outer degree calibration ticks
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
   const r=u*(.16+i*.042+bass*.075);
   c.beginPath();
   c.ellipse(0,0,r,r*(.48+(i%3)*.12),0,0,TAU);
   c.stroke();
   const ang=t*(.24+i*.05)+i*1.1;
   const sx=Math.cos(ang)*r,sy=Math.sin(ang)*r*(.48+(i%3)*.12);
   circle(sx,sy,u*(.009+high*.018),theme.accent);
   circle(sx,sy,u*(.022+hit*.025),theme.foreground+'55',true);
   nodes.push({
    x:sx*Math.cos(rot)-sy*Math.sin(rot),
    y:sx*Math.sin(rot)+sy*Math.cos(rot)
   });
   c.restore();
  }
  // Plotter vector chords linking orbital satellites
  c.strokeStyle=theme.accent+'44';
  c.lineWidth=1;
  for(let i=0;i<nodes.length-1;i++){
   line(nodes[i].x,nodes[i].y,nodes[i+1].x,nodes[i+1].y);
  }
  c.restore();
  break;
 }
 case 'silk-waves':
 case 'ribbon-dance': {
  const ribbonCount=id==='silk-waves'?12:15;
  for(let i=0;i<ribbonCount;i++){
   const yBase=h*(.09+i*(.82/(ribbonCount-1)));
   c.beginPath();
   for(let x=-12;x<=w+12;x+=10){
    const nx=x/w;
    const wave1=Math.sin(nx*TAU*(id==='silk-waves'?1.2:1.8)+t*.48+i*.55)*u*(.042+bass*.15);
    const wave2=Math.cos(nx*TAU*3.1-t*.72+i*.3)*u*(.018+high*.055);
    const y=yBase+wave1+wave2;
    if(x===-12)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.strokeStyle=i%2?theme.accent+'99':theme.foreground+'44';
   c.lineWidth=u*(id==='silk-waves'?.022:.0055)*(1+mid*.85);
   c.stroke();
   // Harmonic crest nodes along every third ribbon
   if(i%3===0){
    const nodeX=w*((.18+i*.11+t*.05)%0.84+0.08);
    const nx=nodeX/w;
    const nodeY=yBase+Math.sin(nx*TAU*(id==='silk-waves'?1.2:1.8)+t*.48+i*.55)*u*(.042+bass*.15);
    circle(nodeX,nodeY,u*(.007+hit*.015),theme.accent);
   }
  }
  break;
 }
 case 'bauhaus-beat': {
  // Constructivist architectural poster (Moholy-Nagy / baseline style)
  circle(w*.14,h*.22,u*(.20+bass*.11),'#d94c2e');
  circle(w*.14,h*.22,u*(.25+hit*.08),theme.foreground+'66',true);
  circle(w*.88,h*.80,u*(.21+hit*.09),'#315e81');
  // Diagonal constructivist beam
  c.save();
  c.translate(w*.5,h*.5);
  c.rotate(-0.32+Math.sin(t*.15)*.04);
  c.fillStyle=theme.foreground+'18';
  c.fillRect(-w*.6,-u*.045,w*1.2,u*.09);
  c.restore();
  // Rotating geometric kinetic square + inner reticle
  c.save();
  c.translate(w*.84,h*.20);
  c.rotate(t*.12+mid*.45);
  c.fillStyle='#d9aa35';
  const sq=u*(.26+bass*.06);
  c.fillRect(-sq*.5,-sq*.5,sq,sq);
  c.strokeStyle='#222728';
  c.lineWidth=u*.006;
  c.strokeRect(-sq*.36,-sq*.36,sq*.72,sq*.72);
  c.restore();
  // 16-bar rhythmic step ladder
  for(let i=0;i<16;i++){
   const barH=h*(.06+((i*7)%5)*.022+high*.14+bass*(i%2?.08:0));
   c.fillStyle=i%4===0?'#d94c2e': '#222728';
   c.fillRect(w*.05+i*u*.024,h*.90-barH,u*.014,barH);
  }
  break;
 }
 case 'star-map': {
  // Astrometric triangulation network + polar coordinate reticle
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
 case 'halftone-club': {
  // Radial frequency-modulated halftone matrix + club aperture rings
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
 case 'vinyl-groove': {
  // Mastering lathe & radial vector oscilloscope
  c.save();
  c.translate(w*.5,h*.5);
  c.scale(1+bass*.12,1+bass*.12);
  for(let i=0;i<28;i++){
   c.lineWidth=i%5===0?2.2:1;
   const r=u*(.10+i*.0135)+Math.sin(t*2+i*.5)*u*mid*.004;
   circle(0,0,r,theme.foreground+(i%5===0?'88':'2a'),true);
  }
  // Stroboscopic rim dots + 16 radial frequency needles
  for(let i=0;i<24;i++){
   const a=i*TAU/24+t*.18;
   const inner=u*.39,outer=u*(.43+(i%2?high:bass)*.095+hit*.04);
   c.strokeStyle=i%3===0?theme.foreground:theme.accent;
   c.lineWidth=u*.006;
   line(Math.cos(a)*inner,Math.sin(a)*inner,Math.cos(a)*outer,Math.sin(a)*outer);
  }
  circle(0,0,u*(.045+hit*.02),theme.accent);
  c.restore();
  break;
 }
 case 'pixel-garden': {
  // Cyber-botanical isometric voxel equalizer + bioluminescent spores
  const cols=28;
  for(let i=0;i<cols;i++){
   const x=i*w/(cols-1),step=u*.019;
   const harmonic=.5+.5*Math.sin(i*1.9+t*.7);
   const stem=h*(.08+harmonic*.14+bass*.22+(i%3===0?mid*.1:0));
   c.fillStyle=i%2?'#457c69':theme.accent;
   c.fillRect(x,h-stem,step,stem);
   const bloom=step*(2.1+high*3.2+hit*1.2);
   c.fillStyle=i%3?'#d9e78a':'#ef9d93';
   c.fillRect(x-bloom/2+step/2,h-stem-bloom,bloom,bloom);
   // Inner pixel core
   c.fillStyle=theme.foreground;
   c.fillRect(x-step*.3,h-stem-bloom*.65,step*1.6,step*1.6);
   if(i%2===0){
    const sy=h*(.12+((i*17)%60)/100)+Math.sin(t*.55+i)*u*(.04+mid*.08);
    c.fillStyle=theme.accent+'88';
    c.fillRect(x,sy,step*.85,step*.85);
   }
  }
  break;
 }
 case 'contour-flow': {
  // Multi-harmonic topographic isoline field
  for(let i=0;i<22;i++){
   c.beginPath();
   for(let j=0;j<=120;j++){
    const a=j/120*TAU;
    const r=u*(.13+i*.0175)*(1+bass*.16)
     +Math.sin(a*3+t*.45+i*.24)*u*(.028+mid*.052)
     +Math.cos(a*7-t*.6+i*.15)*u*(.010+high*.018);
    const x=w*.5+Math.cos(a)*r*1.32;
    const y=h*.5+Math.sin(a)*r;
    if(j===0)c.moveTo(x,y);else c.lineTo(x,y);
   }
   c.closePath();
   c.strokeStyle=i%5===0?theme.foreground+'88':theme.accent+(i%3?'55':'aa');
   c.lineWidth=i%5===0?2:1.1;
   c.stroke();
  }
  break;
 }
 }

 // Beat-reactive HUD corner brackets & edge telemetry bars (pdoom-video / baseline style)
 const pulseBar=u*(.055+hit*.14+onset*.08);
 c.globalAlpha=.28+hit*.68;
 c.fillStyle=theme.accent;
 c.fillRect(w*.045,h*.05,pulseBar,Math.max(2.5,u*.0045));
 c.fillRect(w*.045,h*.05,Math.max(2.5,u*.0045),u*(.035+bass*.06));
 c.fillRect(w*.955-pulseBar,h*.945,pulseBar,Math.max(2.5,u*.0045));
 c.fillRect(w*.955-Math.max(2.5,u*.0045),h*.945-u*(.035+bass*.06),Math.max(2.5,u*.0045),u*(.035+bass*.06));
 c.restore();
}
