import type {LyricCue} from '../../lyrics/lyricTimeline';
import type {DirectedScene} from './catalog';
import {sceneColors} from './paint';
import type {Pulse} from './paint';
import {applySceneFont} from './fonts';
import {drawExpandedTypography} from './extraTypography';

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const v=clamp(x);return 1-(1-v)**3};
const setFont=applySceneFont;
function readableText(c:CanvasRenderingContext2D,text:string,x:number,y:number,maxW:number,color:string,stroke?:string){
 if(stroke){c.lineWidth=Math.max(3,Math.min(12,maxW*.012));c.strokeStyle=stroke;c.lineJoin='round';c.strokeText(text,x,y,maxW)}
 c.fillStyle=color;c.fillText(text,x,y,maxW);
}
function chooseTexts(cue:LyricCue,mode:'original'|'romanized'|'both',now:number){
 const index=cue.words.findIndex(word=>now>=word.start&&now<word.end);
 let activeIndex=index;
 if(activeIndex<0)activeIndex=now<cue.words[0]?.start?0:cue.words.length-1;
 const words=mode==='romanized'&&cue.romanized?cue.romanized.trim().split(/\s+/):cue.words.map(word=>word.text);
 const current=words[Math.min(activeIndex,Math.max(0,words.length-1))]||cue.text;
 const whole=mode==='romanized'&&cue.romanized?cue.romanized:cue.text;
 const secondary=mode==='both'&&cue.romanized?cue.romanized:'';
 const segment=cue.words[activeIndex];
 const progress=segment?clamp((now-segment.start)/Math.max(.18,segment.end-segment.start)):1;
 return {current,whole,secondary,index:activeIndex,progress};
}
interface DrawTextArgs{
 c:CanvasRenderingContext2D;scene:DirectedScene;cue:LyricCue;
 mode:'original'|'romanized'|'both';time:number;width:number;height:number;pulse:Pulse;
 intensity:number;reducedMotion:boolean;
}
export function drawTypography({c,scene,cue,mode,time,width:w,height:h,pulse:_pulse,intensity,reducedMotion}:DrawTextArgs){
 const template=sceneColors(scene.id),tx=chooseTexts(cue,mode,time);
 const progress=ease(tx.progress);
 // Independent of beat/bass: motion is keyed to the lyric word's own timestamp.
 const force=reducedMotion?0:Math.sin(Math.PI*tx.progress)*.22*intensity;
 const step=(1-progress)*(reducedMotion?0:1);
 const full=tx.whole;
 const main=tx.current.length>30?full:tx.current;
 const base=Math.min(h*.185,w*.13);
 const fontSize=Math.max(25,Math.min(132,base*(main.length>17?.66:main.length>10?.82:1.3)));
 const text=main.toLocaleUpperCase();
 const isQuiet=scene.id==='quiet-pages'||scene.id==='rain-on-glass'||scene.id==='ocean-reverie'||scene.id==='cloud-cathedral'||scene.id==='midnight-confession'||scene.id==='petal-memory'||scene.id==='monochrome-memory';
 c.save();
 c.textBaseline='middle';
 c.shadowBlur=0;
 c.globalAlpha=1;
 // Per-template layout direction, not a generic centered subtitle.
 if(drawExpandedTypography({c,scene,current:tx.current,whole:full,width:w,height:h,time,pulse:_pulse,step,force})){
  // Remaining templates render their typography in an isolated scene module.
 }else if(scene.id==='crimson-impact'){
  c.textAlign='center';c.translate(w*.5,h*.47);
  c.scale(1+force*.09+step*.15,1+force*.07);
  setFont(c,'impact',fontSize*1.7,text);c.shadowColor='#000';c.shadowBlur=18;
  readableText(c,text,0,0,w*.92,'#fffdfb');
  c.shadowBlur=0;
  setFont(c,'impact',fontSize*.56,full);readableText(c,full.toUpperCase(),0,h*.17,w*.82,'#ffc6c3');
 }else if(scene.id==='concrete-manifesto'){
  c.translate(w*.5,h*.45);c.rotate(-.035+step*.07);c.textAlign='center';
  setFont(c,'street',fontSize*1.4,text);readableText(c,text,-step*w*.09,0,w*.76,'#181818');
  setFont(c,'mono',fontSize*.5,full);readableText(c,full,0,h*.17,w*.73,'#1b1b1b');
 }else if(scene.id==='rain-on-glass'){
  c.textAlign='left';const x=w*.14;
  setFont(c,'editorial',fontSize*.95,text,true);
  c.shadowColor='#9dd9ec';c.shadowBlur=14;
  readableText(c,full,x-step*w*.035,h*.48,w*.74,'#effbff');
  c.shadowBlur=0;
 }else if(scene.id==='neon-velocity'){
  c.textAlign='center';c.translate(w*.5,h*.5);c.scale(1+step*.45+force*.11,1+step*.30);
  setFont(c,'tech',fontSize*1.27,text);
  c.shadowColor='#f54bdf';c.shadowBlur=25;
  readableText(c,text,0,-h*.05,w*.9,'#ffffff','#2f1157');
  c.shadowBlur=0;
  setFont(c,'tech',fontSize*.43,full);readableText(c,full.toUpperCase(),0,h*.17,w*.78,'#8ff0ff');
 }else if(scene.id==='ink-rebellion'){
  c.textAlign='left';c.translate(w*.16,h*.45);c.rotate(-.045+step*.07);
  setFont(c,'grunge',fontSize*1.35,text);
  readableText(c,text,-step*w*.12,0,w*.76,'#101010');
  setFont(c,'mono',fontSize*.38,full);readableText(c,full.toUpperCase(),0,h*.18,w*.69,'#ce292f');
 }else if(scene.id==='ocean-reverie'){
  c.textAlign='center';setFont(c,'editorial',fontSize*.91,full,true);
  c.shadowColor='#fbe2cc';c.shadowBlur=8;
  readableText(c,full,w*.5,h*.43+step*h*.07,w*.77,'#fff8ee');
  c.save();c.translate(0,h*.99);c.scale(1,-.5);c.globalAlpha=.16;
  readableText(c,full,w*.5,h*.43,w*.77,'#fae8de');c.restore();
 }else if(scene.id==='color-riot'){
  c.textAlign='center';c.translate(w*.53,h*.5);c.rotate((scene.variation%2?1:-1)*.07);
  c.scale(1+force*.16,1+force*.05);
  setFont(c,'rounded',fontSize*1.2,text);
  readableText(c,text,-step*w*.06,0,w*.86,'#fffdf2','#181423');
  setFont(c,'rounded',fontSize*.48,full);readableText(c,full,0,h*.18,w*.77,'#181423');
 }else if(scene.id==='analog-breakdown'){
  c.textAlign='left';c.translate(w*.17,h*.51);
  setFont(c,'mono',fontSize*1.02,text);
  c.shadowColor='#aeffca';c.shadowBlur=8;
  readableText(c,text,step*w*.07,0,w*.72,'#bfffe4');
  c.shadowBlur=0;setFont(c,'mono',fontSize*.42,full);
  readableText(c,full.toUpperCase(),0,h*.17,w*.72,'#edafa9');
 }else if(scene.id==='cloud-cathedral'){
  c.textAlign='center';setFont(c,'editorial',fontSize*.95,full,true);
  c.shadowColor='#554d71';c.shadowBlur=15;
  readableText(c,full,w*.5,h*.5+step*h*.06,w*.82,'#fffefa');c.shadowBlur=0;
 }else if(scene.id==='stellar-expansion'){
  c.textAlign='center';c.translate(w*.5,h*.48);
  c.scale(1+step*.28+force*.12,1+step*.2);
  setFont(c,'tech',fontSize*1.15,text);c.shadowBlur=21;c.shadowColor='#9d8bff';
  readableText(c,text,0,0,w*.87,'#fffaff');c.shadowBlur=0;
  setFont(c,'tech',fontSize*.41,full);readableText(c,full,0,h*.2,w*.74,'#bdb9ff');
 }else if(scene.id==='fragmented-thoughts'){
  c.textAlign='left';c.translate(w*.17,h*.48);
  setFont(c,'grunge',fontSize*1.32,text);
  c.save();c.translate(step*w*.07,-step*h*.06);readableText(c,text,0,0,w*.77,'#f8f5ef');c.restore();
  setFont(c,'grunge',fontSize*.53,full);
  readableText(c,full.toUpperCase(),0,h*.19,w*.78,'#fa6857');
 }else{
  c.textAlign='left';const x=w*.21;
  setFont(c,'literary',fontSize*.88,full,true);
  readableText(c,full,x,h*.49-step*h*.025,w*.66,'#302a27');
  setFont(c,'mono',Math.min(15,h*.024),'01 / A MOMENT');
  readableText(c,'01 / A MOMENT',x,h*.27,w*.6,'#996d62');
 }
 // Secondary native/Romanized line, only when both are requested.
 if(tx.secondary&&tx.secondary!==full){
  c.restore();c.save();
  c.textBaseline='middle';c.textAlign='center';
  const subtle=template.background==='#e9e4d9'||template.background==='#ede9df';
  setFont(c,'tech',Math.min(27,h*.049),tx.secondary);
  readableText(c,tx.secondary,w*.5,h*.80,w*.83,subtle?'#38383c':'#e0e2ee',subtle?undefined:'#0b0b13');
 }
 // Faint progress rail allows smooth word changes without imposing another text block.
 if(!isQuiet&&cue.words.length>1){
  const ratio=clamp((time-cue.time)/Math.max(.1,cue.end-cue.time));
  c.globalAlpha=.45;c.fillStyle=template.foreground;
  c.fillRect(w*.21,h*.9,w*.58*ratio,2);
 }
 c.restore();
}
/** For songs without lyrics, avoid fabricating lyric text. */
export function drawInstrumentalMark(c:CanvasRenderingContext2D,scene:DirectedScene,w:number,h:number,energy:number){
 const template=sceneColors(scene.id);
 c.save();c.textAlign='center';c.textBaseline='middle';c.globalAlpha=.35+energy*.3;
 setFont(c,scene.font,Math.min(35,h*.06),'LYRICFLOW');
 c.fillStyle=template.foreground;c.fillText('LYRICFLOW',w*.5,h*.52,w*.7);
 c.restore();
}
