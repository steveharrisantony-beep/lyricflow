import type {DirectedScene,FontPack} from './catalog';
import {applySceneFont} from './fonts';
import type {Pulse} from './paint';

export interface ExpandedTypeArgs {
 c:CanvasRenderingContext2D;scene:DirectedScene;current:string;whole:string;
 width:number;height:number;time:number;pulse:Pulse;step:number;force:number;
}
const max=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
function type(c:CanvasRenderingContext2D,text:string,x:number,y:number,size:number,color:string,width:number,
 pack:FontPack,align:CanvasTextAlign='center',italic=false,outline?:string){
 c.save();c.textBaseline='middle';c.textAlign=align;
 applySceneFont(c,pack,size,text,italic);
 if(outline){c.strokeStyle=outline;c.lineWidth=Math.max(2,size*.09);c.lineJoin='round';c.strokeText(text,x,y,width)}
 c.fillStyle=color;c.fillText(text,x,y,width);c.restore();
}
const upper=(s:string)=>s.toLocaleUpperCase();
const extraNames=new Set<string>([
 'monochrome-memory','monument-titles','midnight-confession','glass-architecture',
 'ransom-poetry','type-collision','petal-memory','submerged-words',
 'inferno-letterforms','holographic-frequency','pixel-pulse','marker-diary',
 'bubble-pop','word-playground','sunset-frequency','typographic-vortex',
 'midnight-transit','final-ascension'
]);
export function drawExpandedTypography({c,scene,current,whole,width:w,height:h,time:t,pulse:p,step,force}:ExpandedTypeArgs):boolean{
 if(!extraNames.has(scene.id))return false;
 const word=upper(current),all=whole;
 const f=Math.min(w,h),size=max(f*.16,26,142),delta=step*w*.08;
 c.save();c.textBaseline='middle';
 switch(scene.id){
 case 'monochrome-memory':{
  type(c,all,w*.15-delta,h*.49,size*.70,'#f4f1e9',w*.7,'noir','left',true);
  type(c,word,w*.15,h*.68,size*.32,'rgba(245,239,232,.6)',w*.68,'mono','left');
  type(c,'— A MEMORY',w*.15,h*.30,Math.max(11,size*.15),'#c6bcb6',w*.55,'mono','left');
  break;
 }
 case 'monument-titles':{
  c.shadowColor='#cfa369';c.shadowBlur=18;
  type(c,word,w*.5,h*.47,size*1.35,'#fff1d0',w*.89,'monument');
  c.shadowBlur=0;
  type(c,upper(all),w*.5,h*.71,size*.27,'#dbc4a3',w*.8,'glass');
  for(let i=0;i<2;i++){c.strokeStyle='rgba(255,219,149,.4)';c.lineWidth=1;c.strokeRect(w*(.09+i*.014),h*(.17+i*.015),w*(.82-i*.028),h*(.65-i*.03))}
  break;
 }
 case 'midnight-confession':{
  const x=w*.18;
  type(c,all,x,h*.50+step*h*.026,size*.62,'#ffece6',w*.7,'literary','left',true);
  type(c,word,x,h*.68,size*.26,'#ee657b',w*.55,'handwritten','left');
  c.fillStyle='#c5545a';c.fillRect(x,h*.74,w*(.11+force*.08),2);
  break;
 }
 case 'glass-architecture':{
  c.globalAlpha=.24;
  type(c,word,w*.52+delta*.17,h*.45-delta*.19,size*.98,'#a8e3ff',w*.78,'glass');
  c.globalAlpha=1;
  type(c,word,w*.5,h*.5,size*.85,'#f4ffff',w*.78,'glass');
  type(c,upper(all),w*.5,h*.69,size*.3,'#a9d9e4',w*.70,'cyber');
  break;
 }
 case 'ransom-poetry':{
  const parts=all.trim().split(/\s+/).slice(0,9);
  const size2=max(size*.35,20,50);
  const each=w*.74/Math.max(3,Math.min(parts.length,4));
  for(let i=0;i<parts.length;i++){
   const row=Math.floor(i/4),col=i%4;
   const x=w*.14+col*each,y=h*.35+row*h*.14+Math.sin(i*4+t*.1)*2;
   const pack:FontPack=i%3===0?'collage':i%3===1?'street':'mono';
   c.save();c.translate(x,y);c.rotate((i%2?1:-1)*.04);
   c.fillStyle=i%3===0?'#181618':i%3===1?'#eee9db':'#f2c744';
   c.fillRect(-8,-size2*.55,each*.95,size2*1.15);
   type(c,parts[i],0,0,size2,i%3===0?'#f9f1e5':'#161313',each*.87,pack,'left');
   c.restore();
  }
  break;
 }
 case 'type-collision':{
  type(c,word,w*.12-delta,h*.42,size*1.11,'#131318',w*.8,'ultra','left');
  c.save();c.translate(w*.52,h*.62);c.rotate(-.065);
  c.fillStyle='#f5ce43';c.fillRect(-w*.4,-size*.41,w*.8,size*.88);
  type(c,upper(all),0,0,size*.53,'#161519',w*.72,'impact');
  c.restore();
  break;
 }
 case 'petal-memory':{
  type(c,all,w*.5,h*.47+step*h*.035,size*.7,'#fff1f1',w*.8,'editorial','center',true);
  type(c,word,w*.5,h*.66,size*.32,'#f9b8da',w*.64,'handwritten');
  break;
 }
 case 'submerged-words':{
  c.shadowColor='#a1ecff';c.shadowBlur=15;
  type(c,all,w*.5+Math.sin(t*.38)*w*.007,h*.47+step*h*.055,size*.64,'#e8fbff',w*.76,'glass');
  c.shadowBlur=0;c.save();c.globalAlpha=.25;c.translate(0,h*.99);c.scale(1,-.45);
  type(c,all,w*.5,h*.47,size*.64,'#b7f0ff',w*.76,'glass');c.restore();
  break;
 }
 case 'inferno-letterforms':{
  c.save();c.translate(w*.5,h*.46);c.rotate(-.045);
  c.shadowColor='#ff4d04';c.shadowBlur=22+p.beat*28;
  type(c,word,0,0,size*1.45,'#fff0c8',w*.92,'industrial');
  c.shadowBlur=0;
  type(c,upper(all),0,h*.20,size*.36,'#ffa44a',w*.75,'impact');
  c.restore();
  break;
 }
 case 'holographic-frequency':{
  c.shadowColor='#3affcb';c.shadowBlur=16;
  type(c,word,w*.5,h*.43,size*.95,'#c7ffed',w*.81,'cyber');
  c.shadowBlur=0;
  type(c,upper(all),w*.5,h*.67,size*.34,'#67edd0',w*.7,'mono');
  c.fillStyle='#3affcb';for(let i=0;i<30;i++)c.fillRect(w*.2+i*w*.019,h*.77,w*.003,h*(.011+i%5*.004));
  break;
 }
 case 'pixel-pulse':{
  c.save();c.translate(w*.5,h*.49);c.scale(1+force*.08,1+force*.06);
  type(c,word,0,0,size*.50,'#f9f5ce',w*.89,'pixel','center',false,'#281655');
  type(c,upper(all),0,h*.20,size*.19,'#ffb9ef',w*.83,'pixel');
  c.restore();
  break;
 }
 case 'marker-diary':{
  const x=w*.20;
  type(c,all,x,h*.48+step*h*.04,size*.96,'#30313b',w*.73,'handwritten','left');
  type(c,word,x,h*.67,size*.47,'#ce6634',w*.7,'handwritten','left');
  c.strokeStyle='#f5b23c';c.lineWidth=7;c.lineCap='round';
  c.beginPath();c.moveTo(x,h*.75);c.quadraticCurveTo(w*.47,h*.73,w*.70,h*.75);c.stroke();
  break;
 }
 case 'bubble-pop':{
  c.save();c.translate(w*.5,h*.47+Math.sin(t*.7)*h*.01);
  c.scale(1+force*.12,1+force*.10);
  c.shadowColor='#8149c0';c.shadowBlur=13;
  type(c,word,0,0,size*.95,'#fff8df',w*.85,'rounded','center',false,'#734fc4');
  c.shadowBlur=0;
  type(c,upper(all),0,h*.20,size*.32,'#fff8fe',w*.76,'retro');
  c.restore();
  break;
 }
 case 'word-playground':{
  const pieces=all.trim().split(/\s+/).slice(0,10);
  for(let i=0;i<pieces.length;i++){
   const x=w*(.17+(i%3)*.3),y=h*(.31+Math.floor(i/3)*.15);
   const pack:FontPack=i%2===0?'ultra':'retro',active=pieces[i].toLowerCase()===current.toLowerCase();
   c.save();c.translate(x,y);c.rotate(Math.sin(i*1.8)*.12);
   type(c,upper(pieces[i]),0,0,size*(active?.6:.33),active?'#e73f43':'#202134',w*.27,pack,'center');
   c.restore();
  }
  break;
 }
 case 'sunset-frequency':{
  c.shadowColor='#641a6a';c.shadowBlur=12;
  type(c,word,w*.51,h*.39,size*.98,'#fff4cf',w*.89,'retro');
  c.shadowBlur=0;
  type(c,upper(all),w*.5,h*.63,size*.31,'#fbdcc6',w*.75,'editorial','center',true);
  break;
 }
 case 'typographic-vortex':{
  const chars=Array.from(word).slice(0,25);
  const radius=Math.min(w*.29,h*.28);
  for(let i=0;i<chars.length;i++){
   const a=i/Math.max(1,chars.length)*Math.PI*1.6-Math.PI*.82+t*.03;
   const r=radius+Math.sin(i*1.9+t*.19)*h*.023;
   const x=w*.5+Math.cos(a)*r,y=h*.49+Math.sin(a)*r*.68;
   c.save();c.translate(x,y);c.rotate(a+Math.PI*.5);
   type(c,chars[i],0,0,size*.43,'#f4d4fc',size*.5,'tech');c.restore();
  }
  type(c,upper(all),w*.5,h*.5,size*.32,'#ffffff',w*.68,'glass');
  break;
 }
 case 'midnight-transit':{
  c.save();c.translate(w*.18,h*.49);c.rotate(-.04);
  c.shadowColor='#020308';c.shadowBlur=15;
  type(c,word,0,0,size*1.15,'#fff2e5',w*.78,'street','left');
  c.shadowBlur=0;
  type(c,upper(all),0,h*.19,size*.38,'#ffba6c',w*.76,'cyber','left');
  c.restore();
  break;
 }
 case 'final-ascension':{
  c.shadowColor='#f7e5b8';c.shadowBlur=18+p.downbeat*21;
  type(c,word,w*.5,h*.45-step*h*.045,size*1.15,'#fff9e5',w*.86,'monument');
  c.shadowBlur=0;
  type(c,upper(all),w*.5,h*.7,size*.30,'#d6bd90',w*.72,'literary');
  break;
 }
 default:break;
 }
 c.restore();return true;
}
