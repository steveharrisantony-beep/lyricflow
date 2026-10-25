import type {LyricCue} from '../../lyrics/lyricTimeline';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {hasDistinctRomanized} from '../../romanization/romanize';
import {byId,TEMPLATES,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont} from './fonts';
import {contrastRatio,paintLyric,readableInk} from './contrast';
import {makeLyricProjection,STILL_CAMERA,type ProjectPoint} from './cameraRig';

/**
 * 19 VoxelVerse lyric animation styles (https://voxelwall.app/verse#verse-styles)
 * organized across four families: Signature, Spatial, Kinetic, and Editorial.
 */
export const LYRIC_MOTIONS=[
 // Signature (4)
 'ship',
 'fisheye',
 'visual',
 'fisheye-visual',
 // Spatial (4)
 'orbit',
 'cascade',
 'prism',
 'scatter',
 // Kinetic (4)
 'surge',
 'elastic',
 'echo',
 'halo',
 // Editorial (7)
 'reel',
 'hinge',
 'fable',
 'carnival',
 'broadside',
 'portal',
 'mosaic'
] as const;

export type LyricMotion=typeof LYRIC_MOTIONS[number];
export type VoxelVerseFamily='signature'|'spatial'|'kinetic'|'editorial';

export interface VoxelVerseStyleMeta {
 id:LyricMotion;
 name:string;
 family:VoxelVerseFamily;
 detail:string;
 featured?:boolean;
}

export const VOXELVERSE_FAMILIES:readonly {id:VoxelVerseFamily;name:string;count:number}[]=[
 {id:'signature',name:'Signature',count:4},
 {id:'spatial',name:'Spatial',count:4},
 {id:'kinetic',name:'Kinetic',count:4},
 {id:'editorial',name:'Editorial',count:7}
] as const;

export const VOXELVERSE_STYLES:readonly VoxelVerseStyleMeta[]=[
 {id:'ship',name:'Ship',family:'signature',detail:'3D motion · Word by word',featured:true},
 {id:'fisheye',name:'Fisheye',family:'signature',detail:'Fisheye lens · Centered lyrics',featured:true},
 {id:'visual',name:'Visual',family:'signature',detail:'Icons from lyrics · Gentle motion',featured:true},
 {id:'fisheye-visual',name:'Fisheye Visual',family:'signature',detail:'Fisheye lens · Icons from lyrics',featured:true},
 {id:'orbit',name:'Orbit',family:'spatial',detail:'Orbital plane · Oversized words',featured:true},
 {id:'cascade',name:'Cascade',family:'spatial',detail:'Stepped type · Sculpted depth',featured:true},
 {id:'prism',name:'Prism',family:'spatial',detail:'Color extrusion · Dimensional type'},
 {id:'scatter',name:'Scatter',family:'spatial',detail:'Asymmetric clusters · Playful angles'},
 {id:'surge',name:'Surge',family:'kinetic',detail:'Rising word wave · Fluid motion',featured:true},
 {id:'elastic',name:'Elastic',family:'kinetic',detail:'Stretch and settle · Bold emphasis',featured:true},
 {id:'echo',name:'Echo',family:'kinetic',detail:'Receding contours · Layered words'},
 {id:'halo',name:'Halo',family:'kinetic',detail:'Luminous rings · Word by word'},
 {id:'reel',name:'Reel',family:'editorial',detail:'Rolling type · Expanding word column',featured:true},
 {id:'hinge',name:'Hinge',family:'editorial',detail:'Folded word walls · Turning perspective'},
 {id:'fable',name:'Fable',family:'editorial',detail:'Painted words · Expressive emblems',featured:true},
 {id:'carnival',name:'Carnival',family:'editorial',detail:'Bold type · Star-sticker collage'},
 {id:'broadside',name:'Broadside',family:'editorial',detail:'Tracking type · Angled paper tickets'},
 {id:'portal',name:'Portal',family:'editorial',detail:'Folding windows · Lyric capsules',featured:true},
 {id:'mosaic',name:'Mosaic',family:'editorial',detail:'Curved type · Moving lyric grids'}
] as const;

export const VOXELVERSE_STYLE_BY_ID=Object.fromEntries(
 VOXELVERSE_STYLES.map(s=>[s.id,s])
) as Record<LyricMotion,VoxelVerseStyleMeta>;

const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const hash=(s:string)=>{
 let n=2166136261;
 for(const ch of s)n=Math.imul(n^ch.charCodeAt(0),16777619);
 n=Math.imul(n^(n>>>16),0x85ebca6b);
 n=Math.imul(n^(n>>>13),0xc2b2ae35);
 return (n^(n>>>16))>>>0;
};

export function lyricMotionFor(scene:DirectedScene,text:string,enabledMotions?:readonly LyricMotion[]):LyricMotion{
 const pool=enabledMotions&&enabledMotions.length>0?enabledMotions:LYRIC_MOTIONS;
 return pool[(hash(scene.id+'|'+text)+scene.variation)%pool.length];
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

/**
 * Prefer romanized lyrics whenever available (unless mode is explicitly 'original').
 */
export function lyricRuns(cue:LyricCue,mode:'original'|'romanized'|'both',emphasis:WordEmphasis):LyricRun[]{
 const preferRoman=mode!=='original'&&hasDistinctRomanized(cue.text,cue.romanized);
 const visible=preferRoman?cue.romanized:cue.text;
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
  const source=timed.length===words.length?timed[index]:undefined;
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
 if(cue.timing!=='sourced'){
  const lineAge=time-cue.time;
  return lineAge>=0&&lineAge<.55?0.45*Math.exp(-lineAge*7.5):0;
 }
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
 enabledMotions?:readonly LyricMotion[];
}

export interface KineticResult {
 motion:LyricMotion;
 words:number;
 drawn:number;
 highlights:number;
 font:FontPack;
 text:string;
 rows?:number;
 activeColor?:string;
}

export interface WordPlacement {
 word:LyricRun;
 width:number;
 row:number;
 totalRows:number;
 rowX:number;
 rowWidth:number;
 colIndex:number;
 colCount:number;
}

/**
 * Partition a phrase into balanced multi-line typographic rows so long lines
 * are never rendered as a single cramped or overflowing line.
 */
export function buildWordRows(
 runs:LyricRun[],
 widths:number[],
 space:number,
 motion:LyricMotion,
 maxRowWidthPx=Infinity
):WordPlacement[]{
 const count=runs.length;
 if(count===0)return [];
 const totalChars=runs.reduce((sum,r)=>sum+r.text.length,0)+Math.max(0,count-1);
 const totalPx=widths.reduce((sum,w)=>sum+w,0)+Math.max(0,count-1)*space;

 const maxWordsPerRow=
  motion==='ship'||motion==='orbit'||motion==='cascade'||motion==='reel'||motion==='hinge'?3:
  count>=7?3:4;
 const maxCharsPerRow=24;

 const rowsByWords=count<=3&&totalChars<=maxCharsPerRow&&totalPx<=maxRowWidthPx
  ?1
  :Math.ceil(count/maxWordsPerRow);
 const rowsByChars=totalChars>maxCharsPerRow?Math.ceil(totalChars/maxCharsPerRow):1;
 const rowsByPx=Number.isFinite(maxRowWidthPx)&&maxRowWidthPx>0&&totalPx>maxRowWidthPx
  ?Math.ceil(totalPx/maxRowWidthPx)
  :1;

 const numRows=Math.min(count,Math.min(5,Math.max(rowsByWords,rowsByChars,rowsByPx)));
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

/** Draw VoxelVerse style-specific vector embellishments, capsules, stickers, prisms, halos, and emblems. */
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
 motion:LyricMotion,
 hasWordSync:boolean,
 wordText:string
){
 if(typeof c.beginPath!=='function'||typeof c.fillRect!=='function')return;
 c.save();

 // 1. Portal / Broadside / Mosaic framing plates
 if(motion==='portal'&&(isActive||importance>0)){
  const padX=halfW*0.22+12,padY=halfH*0.32+8;
  c.strokeStyle=accent;
  c.lineWidth=Math.max(1.8,halfH*0.07);
  c.globalAlpha=0.65+0.25*hit;
  if(typeof c.roundRect==='function'){
   c.beginPath();
   c.roundRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2,halfH*0.85);
   c.stroke();
  }else{
   c.strokeRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2);
  }
 }else if(motion==='broadside'&&(isActive||importance>0)){
  const padX=halfW*0.18+10,padY=halfH*0.26+6;
  c.fillStyle=accent;
  c.globalAlpha=0.14+0.12*hit;
  c.fillRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2);
  c.strokeStyle=accent;
  c.lineWidth=1.5;
  c.globalAlpha=0.72;
  c.strokeRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2);
 }else if(motion==='mosaic'){
  const padX=halfW*0.14+6,padY=halfH*0.22+5;
  c.strokeStyle=isActive?accent:ink;
  c.lineWidth=1.1;
  c.globalAlpha=isActive?0.55:0.18;
  c.strokeRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2);
 }

 // 2. Halo / Orbit luminous rings around active or emphasized words
 if((motion==='halo'||motion==='orbit')&&(isActive||importance>0)&&typeof c.arc==='function'){
  c.strokeStyle=accent;
  c.lineWidth=Math.max(1.4,halfH*0.05);
  c.globalAlpha=0.45+0.35*hit;
  c.beginPath();
  c.arc(0,0,Math.max(halfW,halfH)*(1.05+0.18*(1-hit)),0,Math.PI*2);
  c.stroke();
 }

 // 3. Echo / Prism dimensional contour offset frames
 if((motion==='echo'||motion==='prism')&&(isActive||importance>0)&&energy>0.05){
  for(let layer=1;layer<=2;layer++){
   const off=layer*(motion==='prism'?4.5:7.5)*(1+hit*0.5);
   c.strokeStyle=layer===1?accent:ink;
   c.lineWidth=1.2;
   c.globalAlpha=(0.38/layer)*energy;
   c.strokeRect(-halfW-6+off,-halfH*0.82-4-off*.6,(halfW+6)*2,halfH*1.64+8);
  }
 }

 // 4. Visual / Fisheye-Visual / Carnival / Fable semantic lyric icon & star-sticker emblems
 if((motion==='visual'||motion==='fisheye-visual'||motion==='carnival'||motion==='fable')&&(isActive||importance>0)){
  const r=Math.max(6,halfH*0.28);
  const cx=halfW+r*0.9,cy=-halfH*0.72;
  c.fillStyle=accent;
  c.strokeStyle=accent;
  c.lineWidth=1.5;
  c.globalAlpha=0.82;
  const lower=wordText.toLowerCase();
  if(/heart|love|kiss/.test(lower)&&typeof c.arc==='function'){
   c.beginPath();
   c.arc(cx-r*.3,cy,r*.35,0,Math.PI*2);
   c.arc(cx+r*.3,cy,r*.35,0,Math.PI*2);
   c.fill();
  }else if(typeof c.moveTo==='function'&&typeof c.lineTo==='function'){
   // 4-point VoxelVerse star sticker / emblem
   c.beginPath();
   for(let i=0;i<8;i++){
    const a=(i*Math.PI)/4;
    const rad=i%2===0?r:r*0.38;
    const px=cx+Math.cos(a)*rad,py=cy+Math.sin(a)*rad;
    if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
   }
   c.closePath();
   c.fill();
  }
 }

 // 5. Active word luminous backing plate & precision corner brackets (when word-synced)
 if(hasWordSync&&isActive&&energy>0.05&&motion!=='portal'){
  const padX=halfW*0.16+8;
  const padY=halfH*0.24+6;
  const bx=-halfW-padX,by=-halfH-padY,bw=(halfW+padX)*2,bh=(halfH+padY)*2;
  c.fillStyle=accent;
  c.globalAlpha=0.10+0.12*hit;
  c.fillRect(bx,by,bw,bh);

  const tick=Math.min(14,Math.max(5,halfH*0.32));
  c.strokeStyle=accent;
  c.lineWidth=Math.max(1.5,halfH*0.055);
  c.globalAlpha=0.72+0.25*hit;
  c.beginPath();
  c.moveTo(bx,by+tick);c.lineTo(bx,by);c.lineTo(bx+tick,by);
  c.moveTo(bx+bw-tick,by);c.lineTo(bx+bw,by);c.lineTo(bx+bw,by+tick);
  c.moveTo(bx,by+bh-tick);c.lineTo(bx,by+bh);c.lineTo(bx+tick,by+bh);
  c.moveTo(bx+bw-tick,by+bh);c.lineTo(bx+bw,by+bh);c.lineTo(bx+bw,by+bh-tick);
  c.stroke();
 }

 // 6. Karaoke word-level progress sweep bar ONLY when real word-sync timestamps are present
 if(hasWordSync&&(isActive||(isSung&&importance>0))){
  const barY=halfH*0.78;
  const barH=Math.max(2.2,halfH*(importance>0?0.10:0.065));
  c.fillStyle=ink;
  c.globalAlpha=0.18;
  c.fillRect(-halfW,barY,halfW*2,barH);
  const fillW=halfW*2*clamp(isActive?wordProgress:1,0.08,1);
  c.fillStyle=importance>0||isActive?accent:ink;
  c.globalAlpha=isActive?0.92:0.58;
  c.fillRect(-halfW,barY,fillW,barH);
 }

 // 7. Hook word overline marker
 if(importance>0){
  const topY=-halfH*0.86;
  c.fillStyle=accent;
  c.globalAlpha=isSung?0.85:0.42;
  c.fillRect(-halfW*0.45,topY,halfW*0.9,Math.max(2,halfH*0.06));
 }
 c.restore();
}

/** Draw subtle stage-level plotter crosshairs and phrase timeline rule. */
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

 const railW=w*0.26;
 const railX=(w-railW)*0.5;
 const railY=h*0.84;
 c.fillStyle=ink;
 c.globalAlpha=0.14*energy;
 c.fillRect(railX,railY,railW,1.5);
 c.fillStyle=accent;
 c.globalAlpha=0.68*energy;
 c.fillRect(railX,railY-0.5,railW*clamp(progress),2.5);

 if(motion==='cascade'||motion==='hinge'||motion==='broadside'||motion==='orbit'){
  c.strokeStyle=accent;
  c.globalAlpha=0.12*energy;
  c.beginPath();
  c.moveTo(w*0.18,h*0.58);
  c.lineTo(w*0.82,h*0.42);
  c.stroke();
 }
 c.restore();
}

export const LYRIC_COLOR_PALETTE=[
 '#72efdd',
 '#ff5e7e',
 '#ffd166',
 '#83e5ff',
 '#c9ff78',
 '#ff8f9b',
 '#d980fa',
 '#ff9f43'
] as const;

/** One continuous phrase, each word painted on a projected world plane with VoxelVerse choreography. */
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
 animated=true,
 enabledMotions
}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text,enabledMotions);
 const font=lyricFontFor(scene,cue.text);
 const runs=lyricRuns(cue,mode,emphasis);
 const theme=byId[scene.id]||TEMPLATES[0];
 const unit=Math.min(w,h);
 const energy=reduced||!animated?0:clamp(intensity,0,1.25);
 const age=Math.max(0,time-cue.time);
 const duration=Math.max(.18,cue.end-cue.time);
 const progress=clamp(age/duration);
 const hasWordSync=cue.timing==='sourced';

 const baseline=Math.min(118,unit*(runs.length<=3?0.175:runs.length<=6?0.142:runs.length<=10?0.118:0.102));
 const space=baseline*0.28;
 const widths=runs.map(word=>{
  applySceneFont(c,font,baseline*(1+word.importance*0.26),word.text);
  return c.measureText(word.text).width;
 });

 const placements=buildWordRows(runs,widths,space,motion,w*0.72);
 const totalRowsCount=placements[0]?.totalRows||1;
 const widestRow=placements.reduce((m,p)=>Math.max(m,p.rowWidth),1);
 const heightCap=totalRowsCount>2?Math.min(1,0.72/(totalRowsCount*0.24)):1;
 const fit=Math.min(heightCap,w*0.80/Math.max(1,widestRow));
 const size=baseline*fit;

 const origin=project(0,0,0),one=project(1,0,0);
 const pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));

 const primaryInk=readableInk(theme.background,theme.foreground);
 const candidateColors=[theme.accent,...LYRIC_COLOR_PALETTE];
 const validAccents=candidateColors.filter(
  color=>contrastRatio(theme.background,color)>=3.2&&color.toLowerCase()!==primaryInk.toLowerCase()
 );
 const pool=validAccents.length>0?validAccents:[theme.accent,primaryInk];
 const phraseIdx=hash(scene.id+'|'+cue.text+'|'+Math.round(cue.time*2))%pool.length;
 const phraseColor=pool[phraseIdx]||primaryInk;
 const highlightColor=pool[(phraseIdx+1)%pool.length]||phraseColor;

 drawStagePlotterFrame(c,w,h,progress,phraseColor,primaryInk,energy,motion);

 // 3D Plane orientation across the 19 VoxelVerse styles
 const yaw=energy*(
  motion==='orbit'?0.24*Math.sin(progress*Math.PI*2):
  motion==='hinge'?0.26*(0.5-progress):
  motion==='ship'?0.11*Math.sin(progress*Math.PI*2):
  motion==='cascade'?-0.14*(1-progress*0.6):
  motion==='broadside'?0.16*Math.sin(progress*Math.PI-0.4):0
 );
 const pitch=energy*(
  motion==='surge'?0.15*(1-progress):
  motion==='reel'?0.18*Math.sin(progress*Math.PI-0.5):
  motion==='cascade'?0.09:
  motion==='ship'?-0.06*Math.cos(progress*Math.PI):0
 );
 const roll=energy*(
  motion==='scatter'?0.06*Math.sin(progress*Math.PI*2):
  motion==='carnival'?-0.05*Math.cos(progress*Math.PI):
  motion==='broadside'?0.055:
  motion==='mosaic'?-0.04*Math.sin(progress*Math.PI):0
 );
 const lineZ=energy*(
  motion==='ship'?0.95*(progress-0.35):
  motion==='orbit'?0.52*Math.sin(progress*Math.PI):
  motion==='portal'?0.48*Math.exp(-age*4):0
 );

 const point=(x:number,y:number,z:number)=>{
  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  const cr=Math.cos(roll),sr=Math.sin(roll);
  const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;
  return project(xx*cr-yy*sr,xx*sr+yy*cr,zz*cp+y*sp+lineZ);
 };

 const rowSpacingWorld=(size*1.30)/pixelsPerWorld;
 let drawn=0,highlights=0;

 for(const item of placements){
  const {word,width,row,totalRows,rowX}=item;
  const wordDuration=hasWordSync?Math.max(0.08,word.end-word.start):duration;
  const wordAge=hasWordSync?time-word.start:age;
  const wordProgress=hasWordSync?clamp(wordAge/wordDuration,0,1):progress;
  const isSung=hasWordSync?wordAge>=0:age>=0;
  const isActive=hasWordSync?(wordAge>=0&&time<=word.end+0.08):false;

  const hit=wordAge>=0?Math.exp(-wordAge*(hasWordSync?8.5:6.0)):0;
  const spring=wordAge>=0?Math.exp(-wordAge*7.5)*Math.cos(wordAge*24):0;
  const preWait=hasWordSync&&wordAge<0?clamp(-wordAge/0.45,0,1):0;
  const enter=energy*Math.exp(-age*12);
  const stagger=energy*Math.exp(-Math.max(0,age-(hasWordSync?word.index*0.045:row*0.055))*14);
  const impulse=hit*energy*(0.06+word.importance*0.14);

  const baseRowY=((totalRows-1)*0.5-row)*rowSpacingWorld;
  let x=(rowX*fit)/pixelsPerWorld;
  let y=baseRowY;
  let z=0;
  let stretchX=1;
  let stretchY=1;
  let wordShear=0;

  switch(motion){
  case 'ship':
   z=(word.importance*0.55+hit*0.95)*energy-enter*0.8-preWait*0.45*energy;
   stretchX=1+impulse*0.65;
   stretchY=1+impulse*0.65;
   break;
  case 'fisheye':
  case 'fisheye-visual': {
   const radialDist=Math.hypot(x*0.35,y*0.45);
   const lensBulge=Math.max(0,1-radialDist*0.55);
   z=(lensBulge*0.75+hit*0.55)*energy;
   stretchX=1+(lensBulge*0.24+impulse*0.5)*energy;
   stretchY=1+(lensBulge*0.28+impulse*0.55)*energy;
   y+=Math.sin(x*0.9)*0.08*energy;
   break;
  }
  case 'visual':
   y+=Math.sin(word.index*0.9+progress*Math.PI*2)*0.12*energy+hit*0.14*energy;
   z=hit*0.42*energy;
   stretchX=1+impulse*0.35;
   stretchY=1+impulse*0.35;
   break;
  case 'orbit': {
   const theta=word.index*0.65+progress*Math.PI*1.6;
   x+=Math.cos(theta)*0.16*energy;
   y+=Math.sin(theta)*0.14*energy;
   z=(0.45+word.importance*0.45+hit*0.7)*energy;
   stretchX=1+(0.12+word.importance*0.16)*energy;
   stretchY=1+(0.12+word.importance*0.16)*energy;
   break;
  }
  case 'cascade': {
   const stepX=(row-(totalRows-1)*0.5)*0.55*energy;
   x+=stepX-stagger*0.45;
   y+=-stagger*0.52+impulse*0.65+(word.index%2===0?0.06:-0.06)*energy;
   z=hit*0.55*energy;
   break;
  }
  case 'prism':
   z=(hit*0.72+word.importance*0.45)*energy;
   wordShear=0.10*Math.sin(progress*Math.PI*2+word.index)*energy;
   stretchX=1+impulse*0.55;
   stretchY=1+impulse*0.55;
   break;
  case 'scatter': {
   const sSign=word.index%2===0?1:-1;
   x+=sSign*0.14*energy*(1-progress*0.4);
   y+=sSign*0.11*energy+hit*0.16*energy;
   wordShear=sSign*0.12*energy;
   z=hit*0.58*energy;
   break;
  }
  case 'surge': {
   const wavePhase=word.index*0.82+progress*Math.PI*2.2;
   y+=-(stagger*0.75)+Math.sin(wavePhase)*0.22*energy+hit*0.18*energy;
   z=Math.cos(wavePhase)*0.34*energy+hit*0.45*energy;
   stretchY=1+spring*0.16*energy;
   break;
  }
  case 'elastic':
   stretchX=1+spring*0.28*energy+impulse*0.85;
   stretchY=1-spring*0.18*energy+impulse*0.95;
   y+=spring*0.14*energy;
   z=hit*0.65*energy;
   break;
  case 'echo':
   z=(hit*0.82-preWait*0.38)*energy;
   y+=hit*0.12*energy;
   stretchX=1+hit*0.18*energy;
   stretchY=1+hit*0.18*energy;
   break;
  case 'halo':
   z=(hit*0.68+word.importance*0.4)*energy;
   stretchX=1+impulse*0.6;
   stretchY=1+impulse*0.6;
   break;
  case 'reel':
   y+=(0.5-progress)*0.45*energy-stagger*0.5+hit*0.15*energy;
   z=hit*0.48*energy;
   stretchY=1+hit*0.18*energy;
   break;
  case 'hinge':
   z=(word.importance*0.45+hit*0.72)*energy-enter*0.55;
   wordShear=(row%2===0?1:-1)*0.14*energy*(1-hit*0.5);
   break;
  case 'fable':
   y+=Math.sin(word.index*1.1+progress*Math.PI)*0.14*energy+hit*0.12*energy;
   z=hit*0.46*energy;
   break;
  case 'carnival': {
   const slam=enter*0.32+hit*(0.24+word.importance*0.18)*energy;
   stretchX=1+slam;
   stretchY=1+slam*1.12;
   z=hit*(0.82+word.importance*0.5)*energy;
   break;
  }
  case 'broadside':
   x+=-enter*0.85+hit*0.12*energy;
   wordShear=-0.10*energy+spring*0.08*energy;
   z=hit*0.5*energy;
   break;
  case 'portal':
   z=(hit*0.75-enter*0.65)*energy;
   stretchX=1+hit*0.20*energy;
   stretchY=1+hit*0.22*energy;
   break;
  case 'mosaic':
   y+=Math.cos(x*0.65+progress*Math.PI*2)*0.16*energy;
   z=hit*0.52*energy;
   break;
  }

  const anchor=energy*(motion==='surge'?-0.16:motion==='hinge'?0.14:motion==='cascade'?-0.08:0);
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

   drawWordPlotterAccents(
    c,
    measuredW*0.5,
    wordSize*0.52,
    wordProgress,
    isActive,
    isSung,
    hit,
    word.importance,
    highlightColor,
    primaryInk,
    energy,
    motion,
    hasWordSync,
    word.text
   );

   const color=
    word.importance>0||isActive
     ?highlightColor
     :hasWordSync
     ?(isSung?phraseColor:primaryInk)
     :phraseColor;

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
  text:runs.map(word=>word.text).join(' '),
  rows:totalRowsCount,
  activeColor:phraseColor
 };
}
