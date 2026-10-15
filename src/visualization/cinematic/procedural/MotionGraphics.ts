import {byId,type SceneId} from '../catalog';
import type {Pulse} from '../paint';
export const MOTION_SCENES:readonly SceneId[]=['paper-cut','orbital-score','silk-waves','bauhaus-beat','star-map','halftone-club','ribbon-dance','vinyl-groove','pixel-garden','contour-flow'];
const TAU=Math.PI*2;
/** Ten composed, resolution-independent drawing grammars. No random per-frame layout. */
export function drawMotionGraphics(c:CanvasRenderingContext2D,w:number,h:number,time:number,p:Pulse,id:SceneId,intensity:number,reduced:boolean){
 const theme=byId[id],u=Math.min(w,h),k=intensity*(reduced?.12:1);
 const bass=p.bass*k,mid=p.mids*k,high=p.treble*k,hit=p.beat*k;
 const t=time*(reduced?.1:1);
 c.save();c.fillStyle=theme.background;c.fillRect(0,0,w,h);
 const gradient=c.createLinearGradient(0,h,w,0);
 gradient.addColorStop(0,theme.accent+'26');gradient.addColorStop(.55,theme.background);gradient.addColorStop(1,theme.accent+'45');
 c.fillStyle=gradient;c.fillRect(0,0,w,h);
 const circle=(x:number,y:number,r:number,fill:string,stroke=false)=>{c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);if(stroke){c.strokeStyle=fill;c.stroke()}else{c.fillStyle=fill;c.fill()}};
 const line=(x:number,y:number,x2:number,y2:number)=>{c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke()};
 c.lineWidth=Math.max(1,u*.002);c.strokeStyle=theme.accent;
 switch(id){
 case 'paper-cut':
  for(let i=0;i<7;i++){
   c.save();c.translate(w*(i%2?.91:.09),h*(.12+i*.13));c.rotate((i%2?1:-1)*(.25+mid*.35)+Math.sin(t*.3+i)*.06);
   c.shadowColor='#1e233438';c.shadowBlur=u*.025;c.shadowOffsetY=u*.012;
   c.fillStyle=i%3===0?theme.accent:i%3===1?'#d5c8ae':'#789e9c';
   c.fillRect(-u*.24,-u*.10,u*(.48+bass*.18),u*(.18+hit*.08));c.restore();
  }break;
 case 'orbital-score':
  c.save();c.translate(w*.5,h*.5);
  for(let i=0;i<6;i++){
   c.save();c.rotate(i*.28+t*.035);c.strokeStyle=i%2?theme.accent+'88':theme.foreground+'55';
   const r=u*(.24+i*.055+bass*.07);c.beginPath();c.ellipse(0,0,r,r*.6,0,0,TAU);c.stroke();
   circle(Math.cos(t*(.18+i*.04)+i)*r,Math.sin(t*(.18+i*.04)+i)*r*.6,u*(.008+high*.018),theme.accent);c.restore();
  }c.restore();break;
 case 'silk-waves':case 'ribbon-dance':
  for(let i=0;i<8;i++){
   c.beginPath();const y=h*(.12+i*.115);
   for(let x=-10;x<=w+10;x+=8){const v=y+Math.sin(x/w*TAU+t*.4+i*.65)*u*(.035+bass*.14)+Math.sin(x/w*TAU*2-t*.6)*u*high*.045;x===-10?c.moveTo(x,v):c.lineTo(x,v)}
   c.strokeStyle=i%2?theme.accent+'88':theme.foreground+'22';c.lineWidth=u*(id==='silk-waves'?.028:.006)*(1+mid);c.stroke();
  }break;
 case 'bauhaus-beat':
  circle(w*.12,h*.2,u*(.19+bass*.1),'#d94c2e');circle(w*.9,h*.83,u*(.2+hit*.08),'#315e81');
  c.save();c.translate(w*.86,h*.18);c.rotate(t*.08+mid*.4);c.fillStyle='#d9aa35';c.fillRect(-u*.13,-u*.13,u*.26,u*.26);c.restore();
  for(let i=0;i<9;i++){c.lineWidth=u*.012;c.strokeStyle='#222728';line(w*.05+i*u*.027,h*.78,w*.05+i*u*.027,h*(.86+high*.1))}break;
 case 'star-map':
  for(let i=0;i<54;i++){
   const x=w*(.05+((i*37)%97)/108),y=h*(.08+((i*23)%89)/105);
   const dx=Math.sin(t*.12+i)*u*mid*.035,dy=Math.cos(t*.18+i)*u*high*.06;
   c.globalAlpha=.35+.5*(.5+.5*Math.sin(i*3.1+t))*high;
   if(i%3===0){c.strokeStyle=theme.accent+'55';line(x,y,w*(.05+(((i+1)*37)%97)/108),h*(.08+(((i+1)*23)%89)/105))}
   circle(x+dx,y+dy,u*(.0025+high*.006),theme.foreground);
  }c.globalAlpha=1;circle(w*.5,h*.5,u*(.34+bass*.09),theme.accent+'44',true);break;
 case 'halftone-club':
  for(let row=0;row<16;row++)for(let col=0;col<25;col++){
   const x=(col+.5)*w/25,y=(row+.5)*h/16;
   const wave=.5+.5*Math.sin(col*.35+row*.5+t*.7);
   const radius=u*(.003+wave*.009+((row+col)%3===0?bass:high)*.012);
   c.globalAlpha=.15+wave*.4;circle(x,y,radius,theme.accent);
  }c.globalAlpha=1;c.lineWidth=u*(.004+hit*.008);circle(w*.5,h*.5,u*(.36+bass*.06),theme.foreground+'55',true);break;
 case 'vinyl-groove':
  c.save();c.translate(w*.5,h*.5);c.scale(1+bass*.12,1+bass*.12);
  for(let i=0;i<25;i++){c.lineWidth=i%5===0?2:1;circle(0,0,u*(.12+i*.014),theme.foreground+(i%5===0?'77':'22'),true)}
  for(let i=0;i<8;i++){const a=i*TAU/8+t*.12;c.strokeStyle=theme.accent;c.lineWidth=u*.008;line(Math.cos(a)*u*.39,Math.sin(a)*u*.39,Math.cos(a)*u*(.42+high*.08),Math.sin(a)*u*(.42+high*.08))}c.restore();break;
 case 'pixel-garden':
  for(let i=0;i<26;i++){
   const x=i*w/25,step=u*.018,stem=h*(.07+(.5+.5*Math.sin(i*2.3))*.12+bass*.18);
   c.fillStyle=i%2?'#457c69':theme.accent;c.fillRect(x,h-stem,step,stem);
   const bloom=step*(2+high*3);c.fillStyle=i%3?'#d9e78a':'#ef9d93';c.fillRect(x-bloom/2+step/2,h-stem-bloom,bloom,bloom);
   if(i%3===0){c.fillStyle=theme.accent+'55';c.fillRect(x,h*.09+Math.sin(t*.4+i)*u*mid*.08,step,step)}
  }break;
 case 'contour-flow':
  for(let i=0;i<20;i++){
   c.beginPath();for(let j=0;j<=120;j++){
    const a=j/120*TAU,r=u*(.16+i*.018)*(1+bass*.15)+Math.sin(a*3+t*.4+i*.22)*u*(.025+mid*.045)+Math.sin(a*9-t*.5)*u*high*.012;
    const x=w*.5+Math.cos(a)*r*1.3,y=h*.5+Math.sin(a)*r;
    j?c.lineTo(x,y):c.moveTo(x,y);
   }c.closePath();c.strokeStyle=theme.accent+(i%4?'55':'aa');c.stroke();
  }break;
 }
 // Beat accents are small edge marks, leaving the lyric stage clear.
 c.globalAlpha=.2+hit*.65;c.fillStyle=theme.accent;
 c.fillRect(w*.055,h*.055,u*(.045+hit*.12),Math.max(2,u*.004));
 c.fillRect(w*.945-u*(.045+hit*.12),h*.94,u*(.045+hit*.12),Math.max(2,u*.004));
 c.restore();
}
