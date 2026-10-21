import type {LyricCue} from '../../lyrics/lyricTimeline';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {byId,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont} from './fonts';
import {contrastRatio,paintLyric,readableInk} from './contrast';
import {makeLyricProjection,STILL_CAMERA,type ProjectPoint} from './cameraRig';

export const LYRIC_MOTIONS=['dolly','rise','sweep','tilt','elastic','ribbon','stamp','cascade'] as const;
export type LyricMotion=typeof LYRIC_MOTIONS[number];

const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const hash=(s:string)=>{
 let n=2166136261;
 for(const ch of s)n=Math.imul(n^ch.charCodeAt(0),16777619);
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};

export function lyricMotionFor(scene:DirectedScene,text:string):LyricMotion{
 return LYRIC_MOTIONS[hash(scene.id+'|'+text+'|'+scene.variation)%LYRIC_MOTIONS.length];
}

const packs:readonly FontPack[]=['impact','rounded','ultra','glass','industrial','tech','noir','cyber'];
export function lyricFontFor(scene:DirectedScene,text:string):FontPack{
 return packs[hash(scene.id+'|'+text)%packs.length];
}

export interface LyricRun {
 text:string;
 start:number;
 end:number;
 importance:number;
 index:number;
}

export function lyricRuns(cue:LyricCue,mode:'original'|'romanized'|'both',emphasis:WordEmphasis):LyricRun[]{
 const visible=mode==='romanized'&&cue.romanized?cue.romanized:cue.text;
 const words=visible.trim().split(/\s+/).filter(Boolean);
 const timed=cue.words.flatMap(segment=>{
  const tokens=segment.text.trim().split(/\s+/).filter(Boolean),length=tokens.reduce((n,t)=>n+t.length,0)||1;
  let offset=0;
  return tokens.map(text=>{
   const start=segment.start+(segment.end-segment.start)*offset/length;
   offset+=text.length;
   return {start,end:segment.start+(segment.end-segment.start)*offset/length};
  });
 });
 const letters=words.reduce((n,word)=>n+word.length,0)||1;
 let cursor=0;
 return words.map((text,index)=>{
  const source=mode!=='romanized'&&timed.length===words.length?timed[index]:undefined;
  const start=source?.start??cue.time+(cue.end-cue.time)*cursor/letters;
  cursor+=text.length;
  return {
   text,
   index,
   start,
   end:source?.end??cue.time+(cue.end-cue.time)*cursor/letters,
   importance:wordEmphasis(emphasis,text)
  };
 });
}

export function lyricWordHit(cue:LyricCue|null,time:number,emphasis:WordEmphasis,mode:'original'|'romanized'|'both'){
 if(!cue)return 0;
 let hit=0;
 for(const word of lyricRuns(cue,mode,emphasis)){
  const age=time-word.start;
  if(age>=0&&age<.65){
   const baseWeight=Math.max(.22,word.importance);
   hit=Math.max(hit,baseWeight*Math.exp(-age*8.5));
  }
 }
 return hit;
}

export interface KineticArgs {
 c:CanvasRenderingContext2D;
 scene:DirectedScene;
 cue:LyricCue;
 time:number;
 mode:'original'|'romanized'|'both';
 w:number;
 h:number;
 intensity:number;
 reduced:boolean;
 emphasis:WordEmphasis;
 project?:ProjectPoint;
 animated?:boolean;
}

export interface KineticResult {
 motion:LyricMotion;
 words:number;
 drawn:number;
 highlights:number;
 font:FontPack;
 text:string;
}

interface WordPlacement {
 word:LyricRun;
 width:number;
 row:number;
 totalRows:number;
 rowX:number;
 rowWidth:number;
 colIndex:number;
 colCount:number;
}

/** Partition a phrase into balanced typographic rows for poster-grade staging. */
function buildWordRows(runs:LyricRun[],widths:number[],space:number,motion:LyricMotion):WordPlacement[]{
 const count=runs.length;
 if(count===0)return [];
 // Choose target row count based on motion grammar and phrase length
 const maxPerRow=
  motion==='stamp'||motion==='dolly'?3:
  motion==='cascade'||motion==='tilt'?3:
  count>=8?4:count>=5?3:4;
 const numRows=count<=3?1:Math.min(3,Math.ceil(count/maxPerRow));
 const rows:number[][]=Array.from({length:numRows},()=>[]);
 for(let i=0;i<count;i++){
  const r=Math.min(numRows-1,Math.floor(i*numRows/count));
  rows[r].push(i);
 }
 const nonEmpty=rows.filter(r=>r.length>0);
 const placements:WordPlacement[]=[];
 for(let r=0;r<nonEmpty.length;r++){
  const indices=nonEmpty[r];
  const rowWidth=indices.reduce((sum,idx)=>sum+widths[idx],0)+Math.max(0,indices.length-1)*space;
  let cursor=-rowWidth/2;
  for(let cIdx=0;cIdx<indices.length;cIdx++){
   const idx=indices[cIdx];
   const w=widths[idx];
   const centerX=cursor+w/2;
   cursor+=w+space;
   placements.push({
    word:runs[idx],
    width:w,
    row:r,
    totalRows:nonEmpty.length,
    rowX:centerX,
    rowWidth,
    colIndex:cIdx,
    colCount:indices.length
   });
  }
 }
 return placements;
}

/** Draw precision plotter framing, karaoke word-progress bar, and impact shockwaves using pure vector paths. */
function drawWordPlotterAccents(
 c:CanvasRenderingContext2D,
 halfW:number,
 halfH:number,
 wordProgress:number,
 isActive:boolean,
 isSung:boolean,
 hit:number,
 importance:number,
 accent:string,
 ink:string,
 energy:number,
 motion:LyricMotion
){
 if(typeof c.beginPath!=='function'||typeof c.fillRect!=='function')return;
 c.save();
 // 1. Active word luminous backing plate & precision corner brackets (baseline / pdoom-video HUD style)
 if(isActive&&energy>0.05){
  const padX=halfW*0.16+8;
  const padY=halfH*0.24+6;
  const bx=-halfW-padX,by=-halfH-padY,bw=(halfW+padX)*2,bh=(halfH+padY)*2;
  c.fillStyle=accent;
  c.globalAlpha=0.10+0.12*hit;
  c.fillRect(bx,by,bw,bh);

  // Corner target reticles [ ]
  const tick=Math.min(14,Math.max(5,halfH*0.32));
  c.strokeStyle=accent;
  c.lineWidth=Math.max(1.5,halfH*0.055);
  c.globalAlpha=0.72+0.25*hit;
  c.beginPath();
  // Top-left
  c.moveTo(bx,by+tick);c.lineTo(bx,by);c.lineTo(bx+tick,by);
  // Top-right
  c.moveTo(bx+bw-tick,by);c.lineTo(bx+bw,by);c.lineTo(bx+bw,by+tick);
  // Bottom-left
  c.moveTo(bx,by+bh-tick);c.lineTo(bx,by+bh);c.lineTo(bx+tick,by+bh);
  // Bottom-right
  c.moveTo(bx+bw-tick,by+bh);c.lineTo(bx+bw,by+bh);c.lineTo(bx+bw,by+bh-tick);
  c.stroke();
 }

 // 2. Expanding vector shockwave frame on emphasized or stamp/elastic word onset
 if(hit>0.08&&energy>0.05&&(importance>0||motion==='stamp'||motion==='elastic')){
  const expand=(1-hit)*(halfH*0.65+importance*18);
  const sx=-halfW-expand,sy=-halfH*0.85-expand*0.6;
  const sw=(halfW+expand)*2,sh=(halfH*0.85+expand*0.6)*2;
  c.strokeStyle=importance>0?accent:ink;
  c.lineWidth=Math.max(1.2,halfH*0.045);
  c.globalAlpha=hit*0.55*energy;
  c.strokeRect(sx,sy,sw,sh);
 }

 // 3. Karaoke word-level progress sweep bar underneath active & sung words
 const barY=halfH*0.78;
 const barH=Math.max(2.2,halfH*(importance>0?0.10:0.065));
 if(isActive|| (isSung&&importance>0)){
  // Track rail
  c.fillStyle=ink;
  c.globalAlpha=0.18;
  c.fillRect(-halfW,barY,halfW*2,barH);
  // Sweeping karaoke fill
  const fillW=halfW*2*clamp(isActive?wordProgress:1,0.08,1);
  c.fillStyle=importance>0||isActive?accent:ink;
  c.globalAlpha=isActive?0.92:0.58;
  c.fillRect(-halfW,barY,fillW,barH);
 }

 // 4. Hook word brutalist overline marker
 if(importance>0){
  const topY=-halfH*0.86;
  c.fillStyle=accent;
  c.globalAlpha=isSung?0.85:0.42;
  c.fillRect(-halfW*0.45,topY,halfW*0.9,Math.max(2,halfH*0.06));
 }
 c.restore();
}

/** Draw subtle stage-level plotter crosshairs and phrase timeline rule (mexicat/pdoom-video HUD style). */
function drawStagePlotterFrame(
 c:CanvasRenderingContext2D,
 w:number,
 h:number,
 progress:number,
 accent:string,
 ink:string,
 energy:number,
 motion:LyricMotion
){
 if(typeof c.beginPath!=='function'||typeof c.fillRect!=='function'||energy<=0.02)return;
 const u=Math.min(w,h);
 c.save();
 // Architectural horizon hairlines & corner registration ticks
 const marginX=w*0.08,marginY=h*0.14;
 const tick=u*0.018;
 c.strokeStyle=ink;
 c.lineWidth=1;
 c.globalAlpha=0.16*energy;
 c.beginPath();
 c.moveTo(marginX,marginY+tick);c.lineTo(marginX,marginY);c.lineTo(marginX+tick,marginY);
 c.moveTo(w-marginX-tick,marginY);c.lineTo(w-marginX,marginY);c.lineTo(w-marginX,marginY+tick);
 c.moveTo(marginX,h-marginY-tick);c.lineTo(marginX,h-marginY);c.lineTo(marginX+tick,h-marginY);
 c.moveTo(w-marginX-tick,h-marginY);c.lineTo(w-marginX,h-marginY);c.lineTo(w-marginX,h-marginY-tick);
 c.stroke();

 // Phrase timing progress filament at bottom of lyric safe zone
 const railW=w*0.26;
 const railX=(w-railW)*0.5;
 const railY=h*0.84;
 c.fillStyle=ink;
 c.globalAlpha=0.14*energy;
 c.fillRect(railX,railY,railW,1.5);
 c.fillStyle=accent;
 c.globalAlpha=0.68*energy;
 c.fillRect(railX,railY-0.5,railW*clamp(progress),2.5);

 // Motion-specific subtle vector datum
 if(motion==='cascade'||motion==='tilt'||motion==='sweep'){
  c.strokeStyle=accent;
  c.globalAlpha=0.12*energy;
  c.beginPath();
  c.moveTo(w*0.18,h*0.58);
  c.lineTo(w*0.82,h*0.42);
  c.stroke();
 }
 c.restore();
}

/** One continuous phrase, each word painted on a 3D projected world plane exactly once. */
export function drawKineticLyrics({
 c,
 scene,
 cue,
 time,
 mode,
 w,
 h,
 intensity,
 reduced,
 emphasis,
 project=makeLyricProjection(w,h,STILL_CAMERA),
 animated=true
}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text);
 const font=lyricFontFor(scene,cue.text);
 const runs=lyricRuns(cue,mode,emphasis);
 const theme=byId[scene.id];
 const unit=Math.min(w,h);
 const energy=reduced||!animated?0:clamp(intensity,0,1.25);
 const age=Math.max(0,time-cue.time);
 const duration=Math.max(.18,cue.end-cue.time);
 const progress=clamp(age/duration);

 // Larger, bolder poster-grade base size since multi-row staging prevents cramped single lines
 const baseline=Math.min(126,unit*(runs.length<=3?0.185:runs.length<=6?0.155:0.135));
 const space=baseline*0.28;
 const widths=runs.map(word=>{
  applySceneFont(c,font,baseline*(1+word.importance*0.28),word.text);
  return c.measureText(word.text).width;
 });

 const placements=buildWordRows(runs,widths,space,motion);
 const widestRow=placements.reduce((m,p)=>Math.max(m,p.rowWidth),1);
 const fit=Math.min(1,w*0.82/Math.max(1,widestRow));
 const size=baseline*fit;

 const origin=project(0,0,0),one=project(1,0,0);
 const pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));

 const primaryInk=readableInk(theme.background,theme.foreground);
 const accentChoices=[theme.accent,'#c9ff78','#ffcc79','#ff8f9b','#83e5ff','#ff5e3a','#00f5d4','#b5179e'];
 const accent=accentChoices.find(color=>contrastRatio(theme.background,color)>=4.5&&color!==primaryInk)||primaryInk;

 // Stage-level plotter HUD overlays
 drawStagePlotterFrame(c,w,h,progress,accent,primaryInk,energy,motion);

 // 3D Plane orientation (Tunai-0511/baseline _v.ts text3 world-plane camera projection)
 const yaw=energy*(
  motion==='tilt'?0.22*Math.sin(progress*Math.PI-0.4):
  motion==='sweep'?0.18*(0.5-progress):
  motion==='dolly'?0.11*Math.sin(progress*Math.PI*2):
  motion==='cascade'?-0.14*(1-progress*0.6):0
 );
 const pitch=energy*(
  motion==='rise'?0.15*(1-progress):
  motion==='cascade'?0.09:
  motion==='dolly'?-0.06*Math.cos(progress*Math.PI):0
 );
 const roll=energy*(
  motion==='ribbon'?-0.065*Math.cos(progress*Math.PI):
  motion==='tilt'?0.06:
  motion==='stamp'?-0.035*Math.sin(age*6)*Math.exp(-age*3):0
 );
 const lineZ=energy*(
  motion==='dolly'?0.95*(progress-0.35):
  motion==='sweep'?0.42*Math.sin(progress*Math.PI):
  motion==='stamp'?0.55*Math.exp(-age*5):0
 );

 const point=(x:number,y:number,z:number)=>{
  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  const cr=Math.cos(roll),sr=Math.sin(roll);
  const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;
  return project(xx*cr-yy*sr,xx*sr+yy*cr,zz*cp+y*sp+lineZ);
 };

 const rowSpacingWorld=(size*1.32)/pixelsPerWorld;
 let drawn=0,highlights=0;

 for(const item of placements){
  const {word,width,row,totalRows,rowX}=item;
  const wordDuration=Math.max(0.08,word.end-word.start);
  const wordAge=time-word.start;
  const wordProgress=clamp(wordAge/wordDuration,0,1);
  const isSung=wordAge>=0;
  const isActive=wordAge>=0&&time<=word.end+0.08;

  // Critically-damped & spring-oscillating onset physics (pdoom-video / baseline style)
  const hit=wordAge>=0?Math.exp(-wordAge*8.5):0;
  const spring=wordAge>=0?Math.exp(-wordAge*7.5)*Math.cos(wordAge*24):0;
  const preWait=wordAge<0?clamp(-wordAge/0.45,0,1):0;
  const enter=energy*Math.exp(-age*12);
  const stagger=energy*Math.exp(-Math.max(0,age-word.index*0.045)*14);
  const impulse=hit*energy*(0.06+word.importance*0.14);

  // Base world coordinates from multi-row layout
  const baseRowY=((totalRows-1)*0.5-row)*rowSpacingWorld;
  let x=(rowX*fit)/pixelsPerWorld;
  let y=baseRowY;
  let z=0;
  let stretchX=1;
  let stretchY=1;
  let wordShear=0;

  if(motion==='rise'){
   y+=-(stagger*0.85+preWait*0.28*energy)+hit*0.18*energy;
   z=hit*0.45*energy-preWait*0.35*energy;
   stretchY=1+spring*0.16*energy;
  }else if(motion==='cascade'){
   const stepX=(row-(totalRows-1)*0.5)*0.55*energy;
   x+=stepX-stagger*0.45;
   y+=-stagger*0.52+impulse*0.65+(word.index%2===0?0.06:-0.06)*energy;
   z=hit*0.55*energy;
  }else if(motion==='ribbon'){
   const wavePhase=word.index*0.85+progress*Math.PI*2.2;
   y+=Math.sin(wavePhase)*0.24*energy+hit*0.15*energy;
   z=Math.cos(wavePhase)*0.38*energy+impulse*0.5;
   wordShear=Math.cos(wavePhase)*0.12*energy;
  }else if(motion==='elastic'){
   stretchX=1+spring*0.26*energy+impulse*0.8;
   stretchY=1-spring*0.18*energy+impulse*0.95;
   y+=spring*0.14*energy;
   z=hit*0.65*energy;
  }else if(motion==='stamp'){
   const slam=enter*0.35+hit*(0.24+word.importance*0.18)*energy;
   stretchX=1+slam;
   stretchY=1+slam*1.12;
   z=hit*(0.85+word.importance*0.55)*energy-preWait*0.5*energy;
  }else if(motion==='dolly'){
   z=(word.importance*0.55+hit*0.95)*energy-enter*0.8-preWait*0.45*energy;
   stretchX=1+impulse*0.65;
   stretchY=1+impulse*0.65;
  }else if(motion==='tilt'){
   z=(word.importance*0.45+hit*0.75)*energy-enter*0.55;
   y+=(word.index%2===0?1:-1)*0.08*energy*(1-progress*0.5)+hit*0.14*energy;
   wordShear=(1-hit)*0.11*energy*(row%2===0?1:-1);
  }else if(motion==='sweep'){
   x+=-enter*0.95-preWait*0.22*energy+hit*0.12*energy;
   wordShear=-enter*0.22+spring*0.10*energy;
   z=hit*0.5*energy;
  }

  const anchor=energy*(motion==='rise'?-0.18:motion==='tilt'?0.18:motion==='cascade'?-0.08:0);
  const a=point(x,y+anchor,z);
  const b=point(x+1,y+anchor,z);
  const d=point(x,y+anchor+1,z);
  const scaleX=(b.x-a.x)/pixelsPerWorld;
  const scaleXY=(b.y-a.y)/pixelsPerWorld;
  const scaleYX=-(d.x-a.x)/pixelsPerWorld;
  const scaleY=-(d.y-a.y)/pixelsPerWorld;

  if(a.visible&&Math.abs(scaleX*scaleY-scaleXY*scaleYX)>.08){
   c.save();
   c.transform(
    scaleX*stretchX,
    scaleXY*stretchX,
    scaleYX+wordShear*scaleX,
    scaleY*stretchY,
    a.x,
    a.y
   );
   c.textAlign='center';
   c.textBaseline='middle';
   const wordSize=size*(1+word.importance*0.26+(isActive?0.06*energy:0));
   applySceneFont(c,font,wordSize,word.text);
   const measuredW=width*fit*(1+(isActive?0.05*energy:0));

   // Draw plotter reticles, karaoke word sweep bar, and shockwave frames
   drawWordPlotterAccents(
    c,
    measuredW*0.5,
    wordSize*0.52,
    wordProgress,
    isActive,
    isSung,
    hit,
    word.importance,
    accent,
    primaryInk,
    energy,
    motion
   );

   const color=word.importance>0||isActive?accent:theme.foreground;
   paintLyric(c,word.text,0,0,measuredW*1.08,color);
   c.restore();
   drawn++;
   if(word.importance>0)highlights++;
  }
 }
 return {
  motion,
  words:runs.length,
  drawn,
  highlights,
  font,
  text:runs.map(word=>word.text).join(' ')
 };
}
