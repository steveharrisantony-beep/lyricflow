import type {LyricCue} from '../../lyrics/lyricTimeline';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {byId,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont} from './fonts';
import {contrastRatio,paintLyric,readableInk} from './contrast';
import {makeLyricProjection,STILL_CAMERA,type ProjectPoint} from './cameraRig';
export const LYRIC_MOTIONS=['dolly','rise','sweep','tilt','elastic','ribbon','stamp','cascade'] as const;
export type LyricMotion=typeof LYRIC_MOTIONS[number];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const hash=(s:string)=>{let n=2166136261;for(const ch of s)n=Math.imul(n^ch.charCodeAt(0),16777619);n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return (n^(n>>>16))>>>0};
export function lyricMotionFor(scene:DirectedScene,text:string):LyricMotion{return LYRIC_MOTIONS[hash(scene.id+'|'+text+'|'+scene.variation)%LYRIC_MOTIONS.length]}
const packs:readonly FontPack[]=['impact','rounded','ultra','glass','industrial','tech','noir','cyber'];
export function lyricFontFor(scene:DirectedScene,text:string):FontPack{return packs[hash(scene.id+'|'+text)%packs.length]}
export interface LyricRun {text:string;start:number;end:number;importance:number;index:number}
export function lyricRuns(cue:LyricCue,mode:'original'|'romanized'|'both',emphasis:WordEmphasis):LyricRun[]{
 const visible=mode==='romanized'&&cue.romanized?cue.romanized:cue.text;
 const words=visible.trim().split(/\s+/).filter(Boolean);
 const timed=cue.words.flatMap(segment=>{
  const tokens=segment.text.trim().split(/\s+/).filter(Boolean),length=tokens.reduce((n,t)=>n+t.length,0)||1;let offset=0;
  return tokens.map(text=>{const start=segment.start+(segment.end-segment.start)*offset/length;offset+=text.length;
   return {start,end:segment.start+(segment.end-segment.start)*offset/length}});
 });
 const letters=words.reduce((n,word)=>n+word.length,0)||1;
 let cursor=0;
 return words.map((text,index)=>{
  const source=mode!=='romanized'&&timed.length===words.length?timed[index]:undefined;
  const start=source?.start??cue.time+(cue.end-cue.time)*cursor/letters;cursor+=text.length;
  return {text,index,start,end:source?.end??cue.time+(cue.end-cue.time)*cursor/letters,importance:wordEmphasis(emphasis,text)};
 });
}
export function lyricWordHit(cue:LyricCue|null,time:number,emphasis:WordEmphasis,mode:'original'|'romanized'|'both'){
 if(!cue)return 0;
 let hit=0;for(const word of lyricRuns(cue,mode,emphasis)){
  const age=time-word.start;if(age>=0&&age<.6)hit=Math.max(hit,word.importance*Math.exp(-age*9));
 }return hit;
}
export interface KineticArgs {
 c:CanvasRenderingContext2D;scene:DirectedScene;cue:LyricCue;time:number;mode:'original'|'romanized'|'both';
 w:number;h:number;intensity:number;reduced:boolean;emphasis:WordEmphasis;project?:ProjectPoint;animated?:boolean;
}
export interface KineticResult {motion:LyricMotion;words:number;drawn:number;highlights:number;font:FontPack;text:string}
/** One continuous phrase, each word painted exactly once. No echoed word or duplicated subtitle. */
export function drawKineticLyrics({c,scene,cue,time,mode,w,h,intensity,reduced,emphasis,project=makeLyricProjection(w,h,STILL_CAMERA),animated=true}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text),font=lyricFontFor(scene,cue.text),runs=lyricRuns(cue,mode,emphasis);
 const theme=byId[scene.id],unit=Math.min(w,h),energy=reduced||!animated?0:intensity;
 const age=Math.max(0,time-cue.time),duration=Math.max(.15,cue.end-cue.time),progress=clamp(age/duration);
 const baseline=Math.min(112,unit*.16),space=baseline*.24;
 const widths=runs.map(word=>{applySceneFont(c,font,baseline*(1+word.importance*.23),word.text);return c.measureText(word.text).width});
 const rawWidth=widths.reduce((n,v)=>n+v,0)+Math.max(0,runs.length-1)*space;
 const fit=Math.min(1,w*.81/Math.max(1,rawWidth)),size=baseline*fit;
 const origin=project(0,0,0),one=project(1,0,0),pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));
 const accentChoices=[theme.accent,'#c9ff78','#ffcc79','#ff8f9b','#83e5ff','#d46420','#7a2cac','#087a61'];
 const accent=accentChoices.find(color=>contrastRatio(theme.background,color)>=4.5&&color!==readableInk(theme.background,theme.foreground))||readableInk(theme.background);
 const yaw=energy*(motion==='tilt'?.16*Math.sin(progress*Math.PI):motion==='sweep'?.12*(1-progress):motion==='dolly'?.1:0);
 const pitch=energy*(motion==='rise'?.1*(1-progress):motion==='cascade'?.07:0);
 const roll=energy*(motion==='ribbon'?-.055:motion==='tilt'?.045:0);
 const lineZ=energy*(motion==='dolly'?progress*.7:motion==='sweep'?.3*Math.sin(progress*Math.PI):0);
 const point=(x:number,y:number,z:number)=>{
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;
  return project(xx*cr-yy*sr,xx*sr+yy*cr,zz*cp+y*sp+lineZ);
 };
 let cursor=-rawWidth*fit/2,drawn=0,highlights=0;
 for(const word of runs){
  const wordAge=time-word.start,hit=wordAge>=0?Math.exp(-wordAge*10):0;
  const enter=energy*Math.exp(-age*15),stagger=energy*Math.exp(-Math.max(0,age-word.index*.009)*18);
  const impulse=hit*energy*(.02+word.importance*.055);
  const x=(cursor+widths[word.index]*fit/2)/pixelsPerWorld;
  let y=0,z=0,stretch=1;
  if(motion==='rise')y=-stagger*.6;
  else if(motion==='cascade')y=-stagger*.45+impulse*.6;
  else if(motion==='ribbon')y=Math.sin(word.index*.8+progress*2.3)*.14*energy;
  else if(motion==='elastic')stretch=1+Math.sin(age*21-word.index*.2)*enter*.12+impulse;
  else if(motion==='stamp')stretch=1+enter*.18+impulse;
  if(motion==='dolly'||motion==='tilt')z=word.importance*hit*.65*energy-enter*.7;
  const offset=motion==='sweep'?-enter*.75:0;
  const anchor=energy*(motion==='rise'?-.45:motion==='tilt'?.55:motion==='cascade'?-.2:0);
  const a=point(x+offset,y+anchor,z),b=point(x+offset+1,y+anchor,z),d=point(x+offset,y+anchor+1,z);
  const scaleX=(b.x-a.x)/pixelsPerWorld,scaleXY=(b.y-a.y)/pixelsPerWorld;
  const scaleYX=-(d.x-a.x)/pixelsPerWorld,scaleY=-(d.y-a.y)/pixelsPerWorld;
  if(a.visible&&Math.abs(scaleX*scaleY-scaleXY*scaleYX)>.08){
   c.save();c.transform(scaleX*stretch,scaleXY*stretch,scaleYX,scaleY,a.x,a.y);
   c.textAlign='center';c.textBaseline='middle';
   const wordSize=size*(1+word.importance*.23);
   applySceneFont(c,font,wordSize,word.text);
   const color=word.importance>0?accent:theme.foreground;
   paintLyric(c,word.text,0,0,widths[word.index]*fit,color);
   c.restore();drawn++;if(word.importance>0)highlights++;
  }
  cursor+=(widths[word.index]+space)*fit;
 }
 return {motion,words:runs.length,drawn,highlights,font,text:runs.map(word=>word.text).join(' ')};
}
