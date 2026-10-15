import type {LyricCue} from '../../lyrics/lyricTimeline';
import type {DirectedScene,FontPack} from './catalog';
import {sceneColors} from './paint';
import type {Pulse} from './paint';
import {applySceneFont,usesNativeScript} from './fonts';

export type SpatialLayout=
 'asymmetric'|'diagonal'|'vertical'|'collage'|'orbit'|'poster'|'editorial'|'echo';
const layouts:readonly SpatialLayout[]=['asymmetric','diagonal','vertical','collage','orbit','poster','editorial','echo'];
const featured:readonly FontPack[]=['couture','vogue','engraved','techno','manuscript','typewriter','retrograde','ultra'];
const hash=(s:string)=>{
 let n=2166136261;
 for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);
 return n>>>0;
};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
/** Stable per-lyric decision; scene-seeking and replay produce identical compositions. */
export function spatialLayoutFor(scene:DirectedScene,text:string):SpatialLayout{
 return layouts[hash(scene.id+'|'+scene.variation+'|'+text)%layouts.length];
}
export function spatialFontFor(scene:DirectedScene,text:string):FontPack {
 const idx=hash(scene.id+':'+text+':'+scene.variation)%featured.length;
 if(scene.font==='editorial'||scene.font==='literary')return ['couture','vogue','engraved','manuscript'][idx%4];
 return featured[idx];
}
function write(c:CanvasRenderingContext2D,text:string,x:number,y:number,size:number,color:string,width:number,font:FontPack,angle=0,outline=false){
 c.save();c.translate(x,y);c.rotate(angle);c.textBaseline='middle';
 c.textAlign='center';applySceneFont(c,font,Math.max(10,size),text);
 if(outline){
  c.strokeStyle=color;c.lineWidth=Math.max(1,size*.024);c.strokeText(text,0,0,width);
 }else{
  c.fillStyle=color;c.fillText(text,0,0,width);
 }c.restore();
}
function visualWord(cue:LyricCue,time:number,mode:'original'|'romanized'|'both'){
 const visible=mode==='romanized'&&cue.romanized?cue.romanized:cue.text;
 const nativeWords=cue.words.map(w=>w.text);
 const index=Math.max(0,cue.words.findIndex(w=>time>=w.start&&time<w.end));
 const safeIndex=cue.words.length&&time>=cue.words[cue.words.length-1].end?cue.words.length-1:index;
 const words=mode==='romanized'&&cue.romanized?cue.romanized.split(/\s+/):nativeWords;
 const word=words[safeIndex]||visible;
 const interval=cue.words[safeIndex];
 const pct=interval?clamp((time-interval.start)/Math.max(.15,interval.end-interval.start)):1;
 return {line:visible,word,index:safeIndex,percent:pct,roman:mode==='both'?cue.romanized:''};
}
export interface SpatialArgs{
 c:CanvasRenderingContext2D;scene:DirectedScene;cue:LyricCue;time:number;
 mode:'original'|'romanized'|'both';w:number;h:number;p:Pulse;intensity:number;reduced:boolean;
}
/**
 * Cotodama-inspired spatial arrangement, not a copy of proprietary layouts.
 * Whole lyric is legible while its active word shifts scale/angle on the timeline.
 */
export function drawSpatialTypography({c,scene,cue,time,mode,w,h,p,intensity,reduced}:SpatialArgs):SpatialLayout{
 const layout=spatialLayoutFor(scene,cue.text);
 const font=spatialFontFor(scene,cue.text);
 const design=sceneColors(scene.id),v=visualWord(cue,time,mode);
 const accent=design.accent,ink=design.foreground;
 const unit=Math.min(w,h);
 const motion=reduced?0:clamp(intensity);
 const enter=1-Math.min(1,v.percent*3);
 const punch=1+p.beat*.16*motion+p.bass*.14*motion;
 const title=v.word.toLocaleUpperCase().slice(0,90);
 const full=v.line.slice(0,320);
 const native=usesNativeScript(full);
 const large=unit*(title.length>18?.095:title.length>10?.13:.20);
 const small=unit*(full.length>85?.045:full.length>45?.062:.085);
 c.save();
 c.shadowBlur=0;c.lineJoin='round';
 const alpha=.14+.08*p.treble;
 switch(layout){
 case 'asymmetric':
  write(c,title,w*.66+(enter*w*.04),h*.41,large*1.38*punch,ink,w*.66,font,-.045);
  write(c,full,w*.30,h*.66,small,ink,w*.44,scene.font);
  write(c,title,w*.65,h*.55,large*1.12,accent,w*.65,font,-.04,true);
  break;
 case 'diagonal':{
  c.translate(w*.50,h*.49);c.rotate(-.24);
  write(c,full,0,0,small*1.03,ink,w*.81,'engraved');
  write(c,title,0,-h*.19,large*punch,accent,w*.73,font);
  c.globalAlpha=alpha;
  write(c,title,0,h*.20,large*1.55,ink,w*.87,font,0,true);
  break;
 }
 case 'vertical':
  write(c,title,w*.24,h*.5,large*1.23*punch,accent,w*.57,font,-Math.PI*.5);
  write(c,full,w*.65,h*.44,small*1.2,ink,w*.53,scene.font);
  c.globalAlpha=.36;
  write(c,title,w*.73,h*.60,large*.65,ink,w*.4,font,Math.PI*.5,true);
  break;
 case 'collage':{
  const words=full.split(/\s+/).slice(0,14);
  if(native||words.length<2){
   write(c,full,w*.52,h*.5,small*1.25,ink,w*.75,'couture');break;
  }
  words.forEach((word,i)=>{
   const row=Math.floor(i/4),col=i%4;
   const x=w*(.19+col*.21)+(Math.sin(i*2.7)*w*.027);
   const y=h*(.33+row*.13);
   const tilt=((i%3)-1)*.10;
   const f:FontPack=i%3===0?'manuscript':i%3===1?font:'engraved';
   if(i===v.index)c.fillStyle=accent;
   write(c,word.toLocaleUpperCase(),x,y,unit*(i===v.index?.094:.055)*(i===v.index?punch:1),
    i===v.index?accent:ink,w*.25,f,tilt);
  });
  break;
 }
 case 'orbit':{
  // Position text around a central negative-space circle / narrative object.
  c.globalAlpha=.31;c.strokeStyle=accent;c.lineWidth=1.6+p.treble*2;
  c.beginPath();c.ellipse(w*.50,h*.49,w*.22,h*.28,-.2,0,Math.PI*2);c.stroke();
  c.globalAlpha=1;
  write(c,title,w*.52,h*.21,large*.95*punch,ink,w*.75,font);
  write(c,full,w*.54,h*.79,small*.92,ink,w*.77,'couture',.05);
  break;
 }
 case 'poster':
  c.save();c.translate(w*.5,h*.48);c.rotate(-.055);
  c.globalAlpha=.83;c.fillStyle=accent;c.fillRect(-w*.39,-h*.19,w*.78,h*.36);
  c.globalAlpha=1;
  write(c,title,0,-h*.025,large*1.23*punch,design.background,w*.73,'techno');
  write(c,full,0,h*.25,small*.88,ink,w*.73,scene.font);
  c.restore();
  break;
 case 'editorial':
  write(c,full,w*.42,h*.47,small*1.22,ink,w*.66,'couture');
  write(c,title,w*.71,h*.66,large*1.1*punch,accent,w*.55,'vogue',-.055);
  c.strokeStyle=accent;c.lineWidth=2;c.beginPath();c.moveTo(w*.14,h*.22);c.lineTo(w*.43,h*.22);c.stroke();
  break;
 case 'echo':
  c.globalAlpha=.13;
  for(let i=0;i<5;i++){
   write(c,title,w*(.52+(i-2)*.026),h*(.46+(i-2)*.045),
    large*(1+i*.13),ink,w*.82,font,(i-2)*.025,true);
  }
  c.globalAlpha=1;
  write(c,title,w*.5,h*.49,large*1.25*punch,ink,w*.78,font);
  write(c,full,w*.5,h*.75,small,accent,w*.78,'engraved');
  break;
 }
 // Use a second line only for original-plus-Romanized mode.
 if(v.roman&&v.roman!==v.line){
  c.globalAlpha=.8;
  write(c,v.roman,w*.5,h*.90,Math.min(24,unit*.034),ink,w*.85,'couture');
 }
 c.restore();
 return layout;
}
