import type {LyricCue} from '../../lyrics/lyricTimeline';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {hasDistinctRomanized} from '../../romanization/romanize';
import {byId,resolveThemePalette,TEMPLATES,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont} from './fonts';
import {paintLyric,readableChromaticInk,readableInk} from './contrast';
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
export type LyricFillPaceMode='auto'|'letter'|'word';

export type LyricPlacementMode=
 |'auto'
 |'alternating'
 |'left'
 |'right'
 |'bottom-right'
 |'bottom-left'
 |'top-left'
 |'diagonal'
 |'center';

export const LYRIC_PLACEMENT_MODES:readonly {id:LyricPlacementMode;label:string;detail:string}[]=[
 {id:'auto',label:'Dynamic Stage (Auto)',detail:'Cycles Left, Right, Bottom-Right, Bottom-Left, Diagonal & Center with opposing line entries'},
 {id:'alternating',label:'Alternating Left ↔ Right',detail:'Line 1 enters from Left, Line 2 enters from Right; alternates stage sides'},
 {id:'left',label:'Left Stage Sweep',detail:'Anchored left with staggered left-to-right kinetic entry'},
 {id:'right',label:'Right Stage Sweep',detail:'Anchored right with staggered right-to-left kinetic entry'},
 {id:'bottom-right',label:'Bottom-Right Cinema',detail:'Lower-right cinema placement with rising slide motion'},
 {id:'bottom-left',label:'Bottom-Left Editorial',detail:'Lower-left placement with lateral & upward entry'},
 {id:'top-left',label:'Top-Left Headline',detail:'Upper-left editorial placement with cascading entry'},
 {id:'diagonal',label:'Diagonal Counter-Slide',detail:'Stepped diagonal rows sliding in from opposite sides'},
 {id:'center',label:'Center Stage',detail:'Centered stage layout with alternating left/right row slide'}
] as const;

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

/**
 * NEW LYRIC COLOUR MECHANISM:
 * 1. Computes a single uniform base line colour (`baseColor`) based strictly on the active background.
 * 2. Computes a single high-contrast sung/active fill colour (`sungColor`) based on the active background & accent.
 * 3. When `forceLightText` is true (e.g. overlaid on video with dark overlay), enforces crisp light-themed text
 *    (`#f8fafc` base + high-luminance light accent) so lyrics are always bright and legible over video.
 */
export function computeBackgroundAdaptiveLyricColors(
 backgroundHex:string,
 foregroundHex:string,
 accentHex:string,
 customAccentOverride?:string,
 forceLightText=false
):{baseColor:string;sungColor:string;effectiveBgHex:string}{
 if(forceLightText){
  const darkVideoBg='#07090e';
  const baseColor='#f8fafc';
  const targetAccent=customAccentOverride&&/^#[0-9a-f]{6}$/i.test(customAccentOverride)
   ?customAccentOverride
   :'#72efdd';
  let sungColor=readableChromaticInk(darkVideoBg,targetAccent);
  if(sungColor.toLowerCase()===baseColor.toLowerCase()){
   sungColor='#72efdd';
  }
  return {baseColor,sungColor,effectiveBgHex:darkVideoBg};
 }
 const baseColor=readableInk(backgroundHex,foregroundHex);
 const targetAccent=customAccentOverride&&/^#[0-9a-f]{6}$/i.test(customAccentOverride)
  ?customAccentOverride
  :accentHex;
 let sungColor=readableChromaticInk(backgroundHex,targetAccent);
 if(sungColor.toLowerCase()===baseColor.toLowerCase()){
  sungColor=readableChromaticInk(backgroundHex,'#72efdd');
 }
 return {baseColor,sungColor,effectiveBgHex:backgroundHex};
}

/**
 * Determine whether a word-synced lyric line should fill letter-by-letter (slow songs)
 * or word-by-word (fast-paced songs).
 */
export function resolveLyricFillPace(
 runs:readonly {start:number;end:number;text:string}[],
 bpm=0,
 paceMode:LyricFillPaceMode='auto'
):'letter'|'word'{
 if(paceMode==='letter')return 'letter';
 if(paceMode==='word')return 'word';
 if(runs.length===0)return 'word';
 const firstStart=runs[0].start;
 const lastEnd=runs[runs.length-1].end;
 const span=Math.max(0.25,lastEnd-firstStart);
 const wordsPerSec=runs.length/span;
 const avgWordDur=runs.reduce((sum,r)=>sum+Math.max(0.05,r.end-r.start),0)/runs.length;
 if(bpm>=112)return 'word';
 if(bpm>0&&bpm<=96&&wordsPerSec<2.8)return 'letter';
 if(wordsPerSec<2.35&&avgWordDur>=0.38)return 'letter';
 return 'word';
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
 paletteId?:string;
 customAccentColor?:string;
 bpm?:number;
 fillPaceMode?:LyricFillPaceMode;
 minFontSize?:number;
 maxFontSize?:number;
 forceLightText?:boolean;
 placementMode?:LyricPlacementMode;
 duetSide?:'left'|'right';
}

export interface KineticResult {
 motion:LyricMotion;
 words:number;
 drawn:number;
 highlights:number;
 font:FontPack;
 text:string;
 rows?:number;
 baseColor?:string;
 activeColor?:string;
 fillPace?:'letter'|'word'|'line';
 placement?:Exclude<LyricPlacementMode,'auto'>;
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

/**
 * Draw VoxelVerse style-specific vector embellishments without coloring random words.
 * When `hasWordSync` is false, no individual word is highlighted or given word-sync bars.
 */
function drawWordPlotterAccents(
 c:CanvasRenderingContext2D,
 halfW:number,
 halfH:number,
 wordProgress:number,
 isActive:boolean,
 isSung:boolean,
 hit:number,
 accent:string,
 ink:string,
 energy:number,
 motion:LyricMotion,
 hasWordSync:boolean,
 wordText:string
){
 if(typeof c.beginPath!=='function'||typeof c.fillRect!=='function')return;
 c.save();

 const showAccent=hasWordSync&&isActive;

 // 1. Portal / Broadside / Mosaic framing plates
 if(motion==='portal'&&showAccent){
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
 }else if(motion==='broadside'&&showAccent){
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
  c.strokeStyle=showAccent?accent:ink;
  c.lineWidth=1.1;
  c.globalAlpha=showAccent?0.55:0.18;
  c.strokeRect(-halfW-padX,-halfH-padY,(halfW+padX)*2,(halfH+padY)*2);
 }

 // 2. Halo / Orbit luminous rings around active spoken word
 if((motion==='halo'||motion==='orbit')&&showAccent&&typeof c.arc==='function'){
  c.strokeStyle=accent;
  c.lineWidth=Math.max(1.4,halfH*0.05);
  c.globalAlpha=0.45+0.35*hit;
  c.beginPath();
  c.arc(0,0,Math.max(halfW,halfH)*(1.05+0.18*(1-hit)),0,Math.PI*2);
  c.stroke();
 }

 // 3. Echo / Prism dimensional contour offset frames
 if((motion==='echo'||motion==='prism')&&showAccent&&energy>0.05){
  for(let layer=1;layer<=2;layer++){
   const off=layer*(motion==='prism'?4.5:7.5)*(1+hit*0.5);
   c.strokeStyle=layer===1?accent:ink;
   c.lineWidth=1.2;
   c.globalAlpha=(0.38/layer)*energy;
   c.strokeRect(-halfW-6+off,-halfH*0.82-4-off*.6,(halfW+6)*2,halfH*1.64+8);
  }
 }

 // 4. Visual / Fisheye-Visual / Carnival / Fable semantic lyric icon & star-sticker emblems
 if((motion==='visual'||motion==='fisheye-visual'||motion==='carnival'||motion==='fable')&&showAccent){
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

 // 5. Active word luminous backing plate & precision corner brackets (ONLY when word-synced)
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
 if(hasWordSync&&(isActive||isSung)){
  const barY=halfH*0.78;
  const barH=Math.max(2.2,halfH*0.075);
  c.fillStyle=ink;
  c.globalAlpha=0.18;
  c.fillRect(-halfW,barY,halfW*2,barH);
  const fillW=halfW*2*clamp(isActive?wordProgress:1,0.08,1);
  c.fillStyle=accent;
  c.globalAlpha=isActive?0.92:0.62;
  c.fillRect(-halfW,barY,fillW,barH);
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

/**
 * Paint a word on the canvas using the new lyric colour mechanism:
 * - If `hasWordSync` is false (line-synced only): paint the whole word in `baseColor` (uniform across the entire line).
 * - If `hasWordSync` is true and `fillPace === 'word'` (fast-paced song): paint the whole word in `sungColor` once spoken (`time >= word.start`), else `baseColor`.
 * - If `hasWordSync` is true and `fillPace === 'letter'` (slow song):
 *   - Before `word.start`: paint whole word in `baseColor`.
 *   - After `word.end`: paint whole word in `sungColor`.
 *   - During `[word.start, word.end)`: change the colour of letters one by one from `baseColor` to `sungColor` as each letter is said!
 */
function paintWordWithSequentialColor(
 c:CanvasRenderingContext2D,
 wordText:string,
 maxWidth:number,
 hasWordSync:boolean,
 fillPace:'letter'|'word'|'line',
 wordProgress:number,
 isSpokenStart:boolean,
 isSpokenEnd:boolean,
 baseColor:string,
 sungColor:string,
 backgroundHex:string
){
 if(!hasWordSync||fillPace==='line'){
  paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex);
  return;
 }
 if(fillPace==='word'){
  const col=isSpokenStart?sungColor:baseColor;
  paintLyric(c,wordText,0,0,maxWidth,col,backgroundHex);
  return;
 }
 // Slow song: letter-by-letter color transition as each letter is said
 if(!isSpokenStart||wordProgress<=0){
  paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex);
  return;
 }
 if(isSpokenEnd||wordProgress>=1){
  paintLyric(c,wordText,0,0,maxWidth,sungColor,backgroundHex);
  return;
 }
 const chars=Array.from(wordText);
 if(chars.length<=1){
  paintLyric(c,wordText,0,0,maxWidth,sungColor,backgroundHex);
  return;
 }
 const sungLetters=Math.max(1,Math.min(chars.length,Math.ceil(wordProgress*chars.length)));
 if(sungLetters>=chars.length){
  paintLyric(c,wordText,0,0,maxWidth,sungColor,backgroundHex);
  return;
 }
 // Measure character advances and paint each letter in its sequential color
 const totalW=c.measureText(wordText).width;
 let cursorX=-totalW/2;
 const prevAlign=c.textAlign;
 c.textAlign='left';
 for(let i=0;i<chars.length;i++){
  const ch=chars[i];
  const chW=c.measureText(ch).width;
  const letterCol=i<sungLetters?sungColor:baseColor;
  paintLyric(c,ch,cursorX,0,chW*1.5,letterCol,backgroundHex);
  cursorX+=chW;
 }
 c.textAlign=prevAlign;
}

export function resolveCuePlacement(
 cue:LyricCue,
 scene:DirectedScene,
 mode:LyricPlacementMode='auto'
):Exclude<LyricPlacementMode,'auto'>{
 if(mode!=='auto')return mode;
 const cueSeed=hash(cue.text+'|'+Math.round(cue.time*10));
 const pool:readonly Exclude<LyricPlacementMode,'auto'>[]=[
  'alternating',
  'left',
  'right',
  'bottom-right',
  'bottom-left',
  'diagonal',
  'top-left',
  'center'
 ];
 return pool[(cueSeed+scene.variation)%pool.length];
}

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
 enabledMotions,
 paletteId,
 customAccentColor,
 bpm=0,
 fillPaceMode='auto',
 minFontSize=26,
 maxFontSize=88,
 forceLightText=false,
 placementMode='auto',
 duetSide
}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text,enabledMotions);
 const font=lyricFontFor(scene,cue.text);
 const runs=lyricRuns(cue,mode,emphasis);
 const baseTemplate=byId[scene.id]||TEMPLATES[0];
 const theme=resolveThemePalette(baseTemplate.id,paletteId);
 const unit=Math.min(w,h);
 const energy=reduced||!animated?0:clamp(intensity,0,1.25);
 const age=Math.max(0,time-cue.time);
 const vocalEnd=duetSide&&runs.length>0?Math.max(cue.time+0.18,runs[runs.length-1].end):cue.end;
 const duration=Math.max(.18,vocalEnd-cue.time);
 const progress=clamp(age/duration);
 const hasWordSync=cue.timing==='sourced';
 const activePlacement:Exclude<LyricPlacementMode,'auto'>=duetSide
  ?duetSide
  :resolveCuePlacement(cue,scene,placementMode);
 const cueParity=hash(cue.text+'|'+Math.round(cue.time*5))%2;

 const safeMinFont=clamp(Math.min(minFontSize,maxFontSize),16,120);
 const safeMaxFont=clamp(Math.max(minFontSize,maxFontSize),safeMinFont,140);
 const duetScale=duetSide?0.78:1;
 const rawBaseline=unit*(runs.length<=3?0.175:runs.length<=6?0.142:runs.length<=10?0.118:0.102)*duetScale;
 const baseline=clamp(rawBaseline,safeMinFont,safeMaxFont);
 const space=baseline*0.28;
 const widths=runs.map(word=>{
  applySceneFont(c,font,baseline,word.text);
  return c.measureText(word.text).width;
 });

 const maxBoxFraction=duetSide
  ?0.40
  :activePlacement==='bottom-right'||activePlacement==='bottom-left'||activePlacement==='top-left'
  ?0.64
  :0.72;
 const placements=buildWordRows(runs,widths,space,motion,w*maxBoxFraction);
 const totalRowsCount=placements[0]?.totalRows||1;
 const widestRow=placements.reduce((m,p)=>Math.max(m,p.rowWidth),1);
 const heightCap=totalRowsCount>2?Math.min(1,0.72/(totalRowsCount*0.24)):1;
 const fit=Math.min(heightCap,w*(maxBoxFraction+(duetSide?0.02:0.06))/Math.max(1,widestRow));
 const size=clamp(baseline*fit,safeMinFont,safeMaxFont);

 const origin=project(0,0,0),one=project(1,0,0);
 const pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));

 // NEW LYRIC COLOUR MECHANISM:
 // 1. Entire line starts as a single uniform `baseColor` based on the background.
 // 2. `sungColor` is only applied sequentially (letter-by-letter for slow songs, word-by-word for fast songs)
 //    ONLY when real word-sync data (`hasWordSync`) is present.
 const effectiveAccentOverride=duetSide==='right'&&!customAccentColor?'#ffd166':customAccentColor;
 const {baseColor,sungColor,effectiveBgHex}=computeBackgroundAdaptiveLyricColors(
  theme.background,
  theme.foreground,
  theme.accent,
  effectiveAccentOverride,
  forceLightText
 );
 const fillPace:'letter'|'word'|'line'=hasWordSync
  ?resolveLyricFillPace(runs,bpm,fillPaceMode)
  :'line';

 if(duetSide!=='right'){
  drawStagePlotterFrame(c,w,h,progress,sungColor,baseColor,energy,motion);
 }

 const stageHalfSpanX=(w*0.20)/pixelsPerWorld;
 const stageHalfSpanY=(h*0.18)/pixelsPerWorld;
 let stageOffsetX=0;
 let stageOffsetY=0;
 if(duetSide==='left'){
  stageOffsetX=-(w*0.235)/pixelsPerWorld;
 }else if(duetSide==='right'){
  stageOffsetX=(w*0.235)/pixelsPerWorld;
 }else{
  switch(activePlacement){
   case 'left':
    stageOffsetX=-stageHalfSpanX*0.85;
    break;
   case 'right':
    stageOffsetX=stageHalfSpanX*0.85;
    break;
   case 'bottom-right':
    stageOffsetX=stageHalfSpanX*0.78;
    stageOffsetY=-stageHalfSpanY*0.92;
    break;
   case 'bottom-left':
    stageOffsetX=-stageHalfSpanX*0.78;
    stageOffsetY=-stageHalfSpanY*0.88;
    break;
   case 'top-left':
    stageOffsetX=-stageHalfSpanX*0.75;
    stageOffsetY=stageHalfSpanY*0.82;
    break;
   case 'alternating':
    stageOffsetX=(cueParity===0?-1:1)*stageHalfSpanX*0.62;
    stageOffsetY=(cueParity===0?0.22:-0.32)*stageHalfSpanY;
    break;
   case 'diagonal':
    stageOffsetX=(cueParity===0?-0.35:0.35)*stageHalfSpanX;
    break;
   default:
    break;
  }
 }

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
  const {word,width,row,totalRows,rowX,rowWidth}=item;
  const wordDuration=hasWordSync?Math.max(0.05,word.end-word.start):duration;
  const wordAge=hasWordSync?time-word.start:age;
  const wordProgress=hasWordSync?clamp(wordAge/wordDuration,0,1):0;
  const isSpokenStart=hasWordSync?time>=word.start:false;
  const isSpokenEnd=hasWordSync?time>=word.end:false;
  const isActive=hasWordSync?(time>=word.start&&time<word.end):false;

  const hit=hasWordSync&&wordAge>=0?Math.exp(-wordAge*8.5):0;
  const spring=hasWordSync&&wordAge>=0?Math.exp(-wordAge*7.5)*Math.cos(wordAge*24):0;
  const preWait=hasWordSync&&wordAge<0?clamp(-wordAge/0.45,0,1):0;
  const enter=energy*Math.exp(-age*12);
  const stagger=energy*Math.exp(-Math.max(0,age-(hasWordSync?word.index*0.045:row*0.055))*14);
  const impulse=hit*energy*0.12;

  const rowSlideDecay=energy*Math.exp(-Math.max(0,age-row*0.065)*8.5);
  const rowDirection=
   activePlacement==='left'||activePlacement==='bottom-left'||activePlacement==='top-left'
    ?(row%2===0?-1:-0.55)
    :activePlacement==='right'||activePlacement==='bottom-right'
    ?(row%2===0?1:0.55)
    :((row+cueParity)%2===0?-1:1);
  const rowSlideX=rowDirection*rowSlideDecay*1.35;
  const rowSlideY=
   (activePlacement==='bottom-right'||activePlacement==='bottom-left'?-0.45:activePlacement==='top-left'?0.45:0)*
   rowSlideDecay;

  const maxRowShift=((widestRow-rowWidth)*0.5*fit)/pixelsPerWorld;
  const alignShiftX=
   activePlacement==='left'||activePlacement==='bottom-left'||activePlacement==='top-left'
    ?-maxRowShift
    :activePlacement==='right'||activePlacement==='bottom-right'
    ?maxRowShift
    :activePlacement==='diagonal'
    ?(row-(totalRows-1)*0.5)*0.48
    :activePlacement==='alternating'
    ?((row+cueParity)%2===0?-0.28:0.28)
    :0;

  const baseRowY=((totalRows-1)*0.5-row)*rowSpacingWorld+stageOffsetY+rowSlideY;
  let x=(rowX*fit)/pixelsPerWorld+stageOffsetX+alignShiftX+rowSlideX;
  let y=baseRowY;
  let z=0;
  let stretchX=1;
  let stretchY=1;
  let wordShear=0;

  switch(motion){
  case 'ship':
   z=(hit*0.95)*energy-enter*0.8-preWait*0.45*energy;
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
   z=(0.45+hit*0.7)*energy;
   stretchX=1+0.14*energy;
   stretchY=1+0.14*energy;
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
   z=(hit*0.72)*energy;
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
   z=(hit*0.68)*energy;
   stretchX=1+impulse*0.6;
   stretchY=1+impulse*0.6;
   break;
  case 'reel':
   y+=(0.5-progress)*0.45*energy-stagger*0.5+hit*0.15*energy;
   z=hit*0.48*energy;
   stretchY=1+hit*0.18*energy;
   break;
  case 'hinge':
   z=(hit*0.72)*energy-enter*0.55;
   wordShear=(row%2===0?1:-1)*0.14*energy*(1-hit*0.5);
   break;
  case 'fable':
   y+=Math.sin(word.index*1.1+progress*Math.PI)*0.14*energy+hit*0.12*energy;
   z=hit*0.46*energy;
   break;
  case 'carnival': {
   const slam=enter*0.32+hit*0.28*energy;
   stretchX=1+slam;
   stretchY=1+slam*1.12;
   z=hit*0.85*energy;
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
   const wordSize=size*(1+(isActive?0.05*energy:0));
   applySceneFont(c,font,wordSize,word.text);
   const measuredW=width*fit*(1+(isActive?0.04*energy:0));

   drawWordPlotterAccents(
    c,
    measuredW*0.5,
    wordSize*0.52,
    wordProgress,
    isActive,
    isSpokenEnd,
    hit,
    sungColor,
    baseColor,
    energy,
    motion,
    hasWordSync,
    word.text
   );

   paintWordWithSequentialColor(
    c,
    word.text,
    measuredW*1.08,
    hasWordSync,
    fillPace,
    wordProgress,
    isSpokenStart,
    isSpokenEnd,
    baseColor,
    sungColor,
    effectiveBgHex
   );

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
  baseColor,
  activeColor:sungColor,
  fillPace,
  placement:activePlacement
 };
}
