import type {LyricCue} from '../../lyrics/lyricTimeline';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {hasDistinctRomanized} from '../../romanization/romanize';
import {byId,resolveThemePalette,TEMPLATES,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont,getFontLoadRevision,isFontPackLoaded,preloadLyricFonts} from './fonts';
import {lightLyricColor,paintLyric,readableChromaticInk,readableInk,albumColorsForLine} from './contrast';
import type {AlbumArtLyricPalette} from './contrast';
import {currentWordPose,drawCurrentWordAccent,type CurrentWordStyle} from './currentWordStyles';
import {makeLyricProjection,STILL_CAMERA,type ProjectPoint} from './cameraRig';

/**
 * 20 lyric animation styles (https://voxelwall.app/verse#verse-styles)
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
 // Kinetic (5)
 'surge',
 'elastic',
 'echo',
 'halo',
 'ribbon',
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

export const ALL_PLACEMENT_MODES:readonly Exclude<LyricPlacementMode,'auto'>[]=[
 'alternating',
 'left',
 'right',
 'bottom-right',
 'bottom-left',
 'top-left',
 'diagonal',
 'center'
] as const;

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
 {id:'kinetic',name:'Kinetic',count:5},
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
 {id:'halo',name:'Halo',family:'kinetic',detail:'Breathing arcs · Floating type'},
 {id:'ribbon',name:'Ribbon',family:'kinetic',detail:'Silk wave · Spiralling rows · Soft unfurl'},
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
export function lyricFontFor(scene:DirectedScene,text:string,enabledFonts?:readonly FontPack[]):FontPack{
 const pool=enabledFonts&&enabledFonts.length>0?enabledFonts:packs;
 const loadedPool=pool.filter(pack=>isFontPackLoaded(pack));
 if(loadedPool.length<pool.length){
  void preloadLyricFonts(pool);
 }
 const activePool=loadedPool.length>0?loadedPool:pool;
 return activePool[hash(scene.id+'|'+text)%activePool.length];
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
 forceLightText=false,
 customBaseOverride?:string
):{baseColor:string;sungColor:string;effectiveBgHex:string}{
 if(forceLightText){
  const darkVideoBg='#07090e';
  const baseColor=customBaseOverride&&/^#[0-9a-f]{6}$/i.test(customBaseOverride)
   ?lightLyricColor(customBaseOverride,.88)
   :'#f8fafc';
  const targetAccent=customAccentOverride&&/^#[0-9a-f]{6}$/i.test(customAccentOverride)
   ?customAccentOverride
   :'#72efdd';
  let sungColor=lightLyricColor(targetAccent);
  if(sungColor.toLowerCase()===baseColor.toLowerCase()){
   sungColor='#72efdd';
  }
  return {baseColor,sungColor,effectiveBgHex:darkVideoBg};
 }
 const baseColor=customBaseOverride&&/^#[0-9a-f]{6}$/i.test(customBaseOverride)
  ?readableChromaticInk(backgroundHex,customBaseOverride)
  :readableInk(backgroundHex,foregroundHex);
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
 wordStylesEnabled?:boolean;
 currentWordStyle?:CurrentWordStyle;
 enabledWordStyles?:readonly CurrentWordStyle[];
 albumPalette?:AlbumArtLyricPalette;
 enabledMotions?:readonly LyricMotion[];
 enabledPlacements?:readonly Exclude<LyricPlacementMode,'auto'>[];
 enabledFonts?:readonly FontPack[];
 paletteId?:string;
 customAccentColor?:string;
 customBaseColor?:string;
 bpm?:number;
 fillPaceMode?:LyricFillPaceMode;
 minFontSize?:number;
 maxFontSize?:number;
 fontScale?:number;
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
 wordStyle?:CurrentWordStyle|'off';
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
 const wordGap=space*1.12;
 const totalChars=runs.reduce((sum,r)=>sum+r.text.length,0)+Math.max(0,count-1);
 const totalPx=widths.reduce((sum,w)=>sum+w,0)+Math.max(0,count-1)*wordGap;

 const maxWordsPerRow=
  motion==='ship'||motion==='orbit'||motion==='cascade'||motion==='reel'||motion==='hinge'?3:
  count>=7?3:4;
 const maxCharsPerRow=22;

 const rowsByWords=count<=3&&totalChars<=maxCharsPerRow&&totalPx<=maxRowWidthPx
  ?1
  :Math.ceil(count/maxWordsPerRow);
 const rowsByChars=totalChars>maxCharsPerRow?Math.ceil(totalChars/maxCharsPerRow):1;
 const rowsByPx=Number.isFinite(maxRowWidthPx)&&maxRowWidthPx>0&&totalPx>maxRowWidthPx
  ?Math.ceil(totalPx/maxRowWidthPx)
  :1;

 const targetRows=Math.min(count,Math.min(6,Math.max(rowsByWords,rowsByChars,rowsByPx)));
 const targetRowPx=totalPx/Math.max(1,targetRows);
 const rowLimitPx=Number.isFinite(maxRowWidthPx)&&maxRowWidthPx>0
  ?Math.max(targetRowPx,maxRowWidthPx)
  :Infinity;

 const nonEmpty:number[][]=[];
 let currentRow:number[]=[];
 let currentRowPx=0;
 for(let i=0;i<count;i++){
  const w=widths[i];
  const addedPx=currentRow.length===0?w:currentRowPx+wordGap+w;
  const remainingWords=count-i;
  const remainingRows=Math.max(1,targetRows-nonEmpty.length);
  const maxForThisRow=Math.max(maxWordsPerRow,Math.ceil(remainingWords/remainingRows));
  const exceedsWidth=currentRow.length>0&&addedPx>rowLimitPx;
  const exceedsCount=currentRow.length>=maxForThisRow;
  if((exceedsWidth||exceedsCount)&&nonEmpty.length<5){
   nonEmpty.push(currentRow);
   currentRow=[i];
   currentRowPx=w;
  }else{
   currentRow.push(i);
   currentRowPx=addedPx;
  }
 }
 if(currentRow.length>0)nonEmpty.push(currentRow);

 const placements:WordPlacement[]=[];
 for(let r=0;r<nonEmpty.length;r++){
  const indices=nonEmpty[r];
  const rowWidth=indices.reduce((sum,idx)=>sum+widths[idx],0)+Math.max(0,indices.length-1)*wordGap;
  let cursor=-rowWidth/2;
  for(let cIdx=0;cIdx<indices.length;cIdx++){
   const idx=indices[cIdx];
   const w=widths[idx];
   const centerX=cursor+w/2;
   cursor+=w+wordGap;
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
 // Paint the shaped word once. A colour sweep preserves Indic conjuncts, kerning,
 // and ligatures instead of splitting the glyph run into individual code points.
 if(typeof c.createLinearGradient!=='function'){
  paintLyric(c,wordText,0,0,maxWidth,wordProgress>=.5?sungColor:baseColor,backgroundHex);
  return;
 }
 const width=Math.min(maxWidth,c.measureText(wordText).width);
 const gradient=c.createLinearGradient(-width/2,0,width/2,0);
 const edge=clamp(wordProgress,.001,.999);
 gradient.addColorStop(0,sungColor);gradient.addColorStop(edge,sungColor);
 gradient.addColorStop(edge,baseColor);gradient.addColorStop(1,baseColor);
 paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex,gradient);
}

export function resolveCuePlacement(
 cue:LyricCue,
 scene:DirectedScene,
 mode:LyricPlacementMode='auto',
 enabledPlacements?:readonly Exclude<LyricPlacementMode,'auto'>[]
):Exclude<LyricPlacementMode,'auto'>{
 if(mode!=='auto')return mode;
 const cueSeed=hash(cue.text+'|'+Math.round(cue.time*10));
 const pool=enabledPlacements&&enabledPlacements.length>0?enabledPlacements:ALL_PLACEMENT_MODES;
 return pool[(cueSeed+scene.variation)%pool.length];
}

interface CachedCueLayout {
 key:string;
 cue:LyricCue;
 emphasis:WordEmphasis;
 runs:LyricRun[];
 placements:WordPlacement[];
 totalRowsCount:number;
 widestRow:number;
 fit:number;
 size:number;
 joinedText:string;
}

let cachedLayout:CachedCueLayout|null=null;

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
 wordStylesEnabled=false,
 currentWordStyle='lift',
 enabledWordStyles,
 albumPalette,
 enabledMotions,
 enabledPlacements,
 enabledFonts,
 paletteId,
 customAccentColor,
 customBaseColor,
 bpm=0,
 fillPaceMode='auto',
 minFontSize=26,
 maxFontSize=88,
 fontScale,
 forceLightText=false,
 placementMode='auto',
 duetSide
}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text,enabledMotions);
 const font=lyricFontFor(scene,cue.text,enabledFonts);
 const baseTemplate=byId[scene.id]||TEMPLATES[0];
 const theme=resolveThemePalette(baseTemplate.id,paletteId);
 const unit=Math.min(w,h);
 // Disable camera movement as well as glyph movement when line animation is off.
 if(!animated||reduced)project=makeLyricProjection(w,h,STILL_CAMERA);
 const energy=reduced||!animated?0:clamp(intensity,0,1.25);
 const styleEnergy=reduced||!wordStylesEnabled?0:clamp(intensity,0,1.25);
 const age=Math.max(0,time-cue.time);
 let hasWordSync=false;
 const activePlacement:Exclude<LyricPlacementMode,'auto'>=duetSide
  ?duetSide
  :resolveCuePlacement(cue,scene,placementMode,enabledPlacements);
 const cueParity=hash(cue.text+'|'+Math.round(cue.time*5))%2;

 // Proportional font scale factor: ensures lyrics maintain the exact same proportion
 // relative to the stage in both normal view and full screen view.
 const derivedScale=
  typeof fontScale==='number'&&Number.isFinite(fontScale)
   ?fontScale
   :((minFontSize/26)+(maxFontSize/88))*0.5;
 const scaleFactor=clamp(derivedScale,0.45,2.0);
 const proportionalMinFont=Math.max(10,unit*0.052*scaleFactor);
 const proportionalMaxFont=Math.max(proportionalMinFont,unit*0.21*scaleFactor);
 const fontRev=getFontLoadRevision();
 const layoutKey=`${cue.time}|${cue.end}|${cue.text}|${cue.romanized}|${cue.words.length}|${mode}|${font}|${fontRev}|${w}|${h}|${scaleFactor.toFixed(3)}|${motion}|${activePlacement}|${duetSide||''}`;

 let runs:LyricRun[];
 let placements:WordPlacement[];
 let totalRowsCount:number;
 let widestRow:number;
 let fit:number;
 let size:number;
 let joinedText:string;

 if(cachedLayout&&cachedLayout.key===layoutKey&&cachedLayout.cue===cue&&cachedLayout.emphasis===emphasis){
  ({runs,placements,totalRowsCount,widestRow,fit,size,joinedText}=cachedLayout);
 }else{
  runs=lyricRuns(cue,mode,emphasis);
  const duetScale=duetSide?0.78:1;
  const rawBaseline=unit*(runs.length<=3?0.155:runs.length<=6?0.128:runs.length<=10?0.108:0.092)*duetScale*scaleFactor;
  const baseline=clamp(rawBaseline,proportionalMinFont,proportionalMaxFont);
  const space=baseline*0.30;
  const widths=runs.map(word=>{
   applySceneFont(c,font,baseline,word.text);
   return c.measureText(word.text).width;
  });

  const maxBoxFraction=duetSide
   ?0.38
   :activePlacement==='bottom-right'||activePlacement==='bottom-left'||activePlacement==='top-left'
   ?0.62
   :0.74;
  placements=buildWordRows(runs,widths,space,motion,w*maxBoxFraction);
  totalRowsCount=placements[0]?.totalRows||1;
  widestRow=placements.reduce((m,p)=>Math.max(m,p.rowWidth),1);
  const availWidth=w*(duetSide?0.41:maxBoxFraction+0.04);
  const availHeight=h*0.66;
  const widthFit=availWidth/Math.max(1,widestRow);
  const heightFit=availHeight/Math.max(1,totalRowsCount*baseline*1.38);
  const maxAllowedFit=Math.min(1.15,widthFit,heightFit);
  const maxSafeFont=Math.max(9,baseline*maxAllowedFit);
  const effectiveMinFont=Math.min(proportionalMinFont,maxSafeFont);
  size=clamp(baseline*maxAllowedFit,effectiveMinFont,Math.min(proportionalMaxFont,maxSafeFont));
  fit=size/Math.max(1,baseline);
  joinedText=runs.map(word=>word.text).join(' ');
  cachedLayout={key:layoutKey,cue,emphasis,runs,placements,totalRowsCount,widestRow,fit,size,joinedText};
 }

 // Never animate inferred timings when romanization changes the token count.
 hasWordSync=cue.timing==='sourced'&&cue.words.length>0&&
  cue.words.every(word=>word.timing!=='estimated'&&Number.isFinite(word.start)&&Number.isFinite(word.end)&&word.end>word.start)&&
  cue.words.reduce((count,word)=>count+word.text.trim().split(/\s+/).filter(Boolean).length,0)===runs.length;
 const selectedWordStyle=enabledWordStyles ? enabledWordStyles[hash(`${cue.time}|${cue.text}`)%Math.max(1,enabledWordStyles.length)] : currentWordStyle;
 const activeWordStyle=wordStylesEnabled&&hasWordSync&&selectedWordStyle?selectedWordStyle:'off';
 const lineColors=albumPalette?albumColorsForLine(albumPalette,`${cue.time}|${cue.text}`):undefined;

 const vocalEnd=duetSide
  ?Math.max(cue.time+0.18,cue.naturalEnd??(runs.length>0?runs[runs.length-1].end:cue.end))
  :cue.end;
 const duration=Math.max(.18,vocalEnd-cue.time);
 const progress=clamp(age/duration);

 const origin=project(0,0,0),one=project(1,0,0);
 const pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));

 // NEW LYRIC COLOUR MECHANISM:
 // 1. Entire line starts as a single uniform `baseColor` based on the background.
 // 2. `sungColor` is only applied sequentially (letter-by-letter for slow songs, word-by-word for fast songs)
 //    ONLY when real word-sync data (`hasWordSync`) is present.
 // 3. For Dual Lyrics (`duetSide` === 'left' or 'right'), ALWAYS use two separate colours on the two sides.
 const leftAccent=lineColors?.sungColor||customAccentColor||theme.accent||'#38bdf8';
 const isWarmLeft=/^#(?:ff|fe|fb|f9|f5|f4|ef|ec|ea|e1|d9)/i.test(leftAccent);
 const duetRightAccent=lineColors?.sungColor||(isWarmLeft?'#38bdf8':'#ffd166');
 const duetLeftBase=lineColors?.baseColor||customBaseColor||(forceLightText?'#e0f2fe':undefined);
 const duetRightBase=lineColors?.baseColor||(forceLightText?'#fef3c7':'#fde68a');
 const effectiveAccentOverride=duetSide==='right'
  ?duetRightAccent
  :duetSide==='left'
  ?leftAccent
  :lineColors?.sungColor||customAccentColor;
 const effectiveBaseOverride=duetSide==='right'
  ?duetRightBase
  :duetSide==='left'
  ?duetLeftBase
  :lineColors?.baseColor||customBaseColor;
 const {baseColor,sungColor,effectiveBgHex}=computeBackgroundAdaptiveLyricColors(
  theme.background,
  theme.foreground,
  theme.accent,
  effectiveAccentOverride,
  forceLightText,
  effectiveBaseOverride
 );
 const fillPace:'letter'|'word'|'line'=hasWordSync
  ?wordStylesEnabled?resolveLyricFillPace(runs,bpm,fillPaceMode):'word'
  :'line';

 // If this side of a dual-singer duet has finished its line before the other singer finishes,
 // hide this finished side while the ongoing second side keeps its colour, position, animation, and font.
 if(duetSide&&cue.naturalEnd!==undefined&&time>=cue.naturalEnd&&cue.naturalEnd<cue.end-0.02){
  return {
   motion,
   words:runs.length,
   drawn:0,
   highlights:0,
   font,
   text:joinedText,
   rows:totalRowsCount,
   baseColor,
   activeColor:sungColor,
   fillPace,
   placement:activePlacement,
   wordStyle:activeWordStyle
  };
 }


 const stageHalfSpanX=(w*0.18)/pixelsPerWorld;
 const stageHalfSpanY=(h*0.16)/pixelsPerWorld;
 let stageOffsetX=0;
 let stageOffsetY=0;
 if(duetSide==='left'){
  stageOffsetX=-(w*0.23)/pixelsPerWorld;
 }else if(duetSide==='right'){
  stageOffsetX=(w*0.23)/pixelsPerWorld;
 }else{
  switch(activePlacement){
   case 'left':
    stageOffsetX=-stageHalfSpanX*0.80;
    break;
   case 'right':
    stageOffsetX=stageHalfSpanX*0.80;
    break;
   case 'bottom-right':
    stageOffsetX=stageHalfSpanX*0.72;
    stageOffsetY=-stageHalfSpanY*0.86;
    break;
   case 'bottom-left':
    stageOffsetX=-stageHalfSpanX*0.72;
    stageOffsetY=-stageHalfSpanY*0.84;
    break;
   case 'top-left':
    stageOffsetX=-stageHalfSpanX*0.70;
    stageOffsetY=stageHalfSpanY*0.78;
    break;
   case 'alternating':
    stageOffsetX=(cueParity===0?-1:1)*stageHalfSpanX*0.58;
    stageOffsetY=(cueParity===0?0.20:-0.28)*stageHalfSpanY;
    break;
   case 'diagonal':
    stageOffsetX=(cueParity===0?-0.32:0.32)*stageHalfSpanX;
    break;
   default:
    break;
  }
 }

 // Phrase-level perspective and continuous camera-plane motion across the 20 styles
 const yaw=energy*(
  motion==='ribbon'?0.18*Math.sin(age*.9):
  motion==='orbit'?0.30*Math.sin(progress*Math.PI*2):
  motion==='hinge'?0.38*(0.5-progress):
  motion==='ship'?0.18*Math.sin(progress*Math.PI*2):
  motion==='cascade'?-0.12*(1-progress*0.6):
  motion==='broadside'?0.14*Math.sin(progress*Math.PI-0.4):0
 );
 const pitch=energy*(
  motion==='ribbon'?0.13*Math.cos(age*.8):
  motion==='surge'?0.22*(1-progress):
  motion==='reel'?0.15*Math.sin(progress*Math.PI-0.5):
  motion==='cascade'?0.08:
  motion==='ship'?-0.05*Math.cos(progress*Math.PI):0
 );
 const roll=energy*(
  motion==='ribbon'?0.045*Math.sin(age*.7):
  motion==='scatter'?0.075*Math.sin(progress*Math.PI*2):
  motion==='carnival'?-0.045*Math.cos(progress*Math.PI):
  motion==='broadside'?0.045:
  motion==='mosaic'?-0.035*Math.sin(progress*Math.PI):0
 );
 const lineZ=energy*(
  motion==='ship'?0.65*(progress-0.35):
  motion==='orbit'?0.40*Math.sin(progress*Math.PI):
  motion==='portal'?0.38*Math.exp(-age*4):0
 );

 const cy=Math.cos(yaw),sy=Math.sin(yaw);
 const cp=Math.cos(pitch),sp=Math.sin(pitch);
 const cr=Math.cos(roll),sr=Math.sin(roll);
 const point=(x:number,y:number,z:number)=>{
  const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;
  return project(xx*cr-yy*sr,xx*sr+yy*cr,zz*cp+y*sp+lineZ);
 };

 const rowSpacingWorld=(size*1.38)/pixelsPerWorld;
 let drawn=0,highlights=0;
 applySceneFont(c,font,size,joinedText);

 interface PreparedWordDraw {
  item:WordPlacement;
  wordProgress:number;
  isSpokenStart:boolean;
  isSpokenEnd:boolean;
  isActive:boolean;
  measuredW:number;
  mA:number;
  mB:number;
  mC:number;
  mD:number;
  screenX:number;
  screenY:number;
  halfExtentX:number;
  halfExtentY:number;
 }

 const preparedWords:PreparedWordDraw[]=[];
 let minScreenX=Infinity;
 let maxScreenX=-Infinity;
 let minScreenY=Infinity;
 let maxScreenY=-Infinity;

 for(const item of placements){
  const {word,width,row,totalRows,rowX,rowWidth,colCount}=item;
  const wordDuration=hasWordSync?Math.max(0.05,word.end-word.start):duration;
  const wordAge=hasWordSync?time-word.start:age;
  const wordProgress=hasWordSync?clamp(wordAge/wordDuration,0,1):0;
  const isSpokenStart=hasWordSync?time>=word.start:false;
  const isSpokenEnd=hasWordSync?time>=word.end:false;
  const isActive=hasWordSync?(time>=word.start&&time<word.end):false;

  // Line choreography follows the phrase clock, independent of the current-word layer.
  const entryDelay=Math.min(.24,word.index*.035);
  const enter=energy*Math.exp(-age*5.2);
  const stagger=energy*Math.exp(-Math.max(0,age-entryDelay)*6.2);
  const phase=age*1.65+word.index*.64;
  const drift=Math.sin(phase)*energy;
  const lift=Math.sin(progress*Math.PI)*energy;

  const rowSlideDecay=energy*Math.exp(-Math.max(0,age-row*0.06)*7.5);
  const rowDirection=
   activePlacement==='left'||activePlacement==='bottom-left'||activePlacement==='top-left'
    ?(row%2===0?-1:-0.55)
    :activePlacement==='right'||activePlacement==='bottom-right'
    ?(row%2===0?1:0.55)
    :((row+cueParity)%2===0?-1:1);
  const rowSlideX=rowDirection*rowSlideDecay*0.85;
  const rowSlideY=
   (activePlacement==='bottom-right'||activePlacement==='bottom-left'?-0.32:activePlacement==='top-left'?0.32:0)*
   rowSlideDecay;

  const maxRowShift=((widestRow-rowWidth)*0.5*fit)/pixelsPerWorld;
  const alignShiftX=
   activePlacement==='left'||activePlacement==='bottom-left'||activePlacement==='top-left'
    ?-maxRowShift
    :activePlacement==='right'||activePlacement==='bottom-right'
    ?maxRowShift
    :activePlacement==='diagonal'
    ?(row-(totalRows-1)*0.5)*0.34
    :activePlacement==='alternating'
    ?((row+cueParity)%2===0?-0.22:0.22)
    :0;

  const baseRowY=((totalRows-1)*0.5-row)*rowSpacingWorld+stageOffsetY+rowSlideY;
  let x=(rowX*fit)/pixelsPerWorld+stageOffsetX+alignShiftX+rowSlideX;
  let y=baseRowY;
  let z=0;
  let stretchX=1;
  let stretchY=1;
  let wordShear=0;
  let wordRotation=0;

  switch(motion){
  case 'ship':
   x-=stagger*.38;y+=Math.sin(age*.9+row)*.055*energy;
   z=-stagger*1.15+lift*.32;wordRotation=-stagger*.08;
   break;
  case 'fisheye':
  case 'fisheye-visual': {
   const radial=Math.hypot(x*.35,y*.45);
   const bulge=Math.max(0,1-radial*.5);
   z=(bulge*(.48+.16*Math.sin(age*1.4)))*energy-enter*.55;
   stretchX=1+bulge*.09*energy;stretchY=1+bulge*.13*energy;
   y+=Math.sin(x+age)*.08*energy;
   if(motion==='fisheye-visual')wordRotation=.045*drift;
   break;
  }
  case 'visual':
   y+=drift*.13-stagger*.28;z=Math.cos(phase)*.14*energy;
   wordRotation=.035*drift;
   break;
  case 'orbit': {
   const theta=row*.65+age*.8;
   x+=Math.cos(theta)*.22*energy;y+=Math.sin(theta)*.15*energy;
   z=Math.sin(theta+word.index*.3)*.3*energy-stagger*.55;
   wordRotation=.035*Math.sin(theta)*energy;break;
  }
  case 'cascade':
   x+=(row-(totalRows-1)*.5)*.24*energy-stagger*.45;
   y-=stagger*.65;y+=Math.sin(age*1.2+row)*.06*energy;
   z=-stagger*.35;wordRotation=-stagger*.12;break;
  case 'prism':
   z=Math.sin(age*1.3+row)*.27*energy-enter*.7;
   wordShear=.09*Math.sin(phase*.7)*energy;x+=stagger*.24;
   break;
  case 'scatter': {
   const sign=word.index%2===0?1:-1;
   x+=sign*stagger*.42;y+=sign*(stagger*.32+.06*energy);
   wordRotation=sign*(stagger*.23+.035*energy*Math.sin(age));
   z=-stagger*.48;break;
  }
  case 'surge':
   y+=drift*.24-stagger*.55;z=Math.cos(phase)*.25*energy;
   stretchY=1+Math.sin(phase)*.06*energy;break;
  case 'elastic': {
   const spring=Math.exp(-Math.max(0,age-entryDelay)*4)*Math.sin(Math.max(0,age-entryDelay)*13)*energy;
   stretchX=1+spring*.18;stretchY=1-spring*.14;
   y+=spring*.25;z=-stagger*.3;break;
  }
  case 'echo':
   z=-stagger*.95+Math.sin(age*.75+row)*.24*energy;
   x-=stagger*.28;stretchX=1+enter*.08;stretchY=1+enter*.08;
   break;
  case 'halo':
   y+=Math.sin(age*1.1+row)*.13*energy;z=lift*.3-enter*.5;
   stretchX=1+Math.sin(age*1.4)*.025*energy;stretchY=stretchX;break;
  case 'ribbon':
   y+=Math.sin(x*.9-age*1.9)*.24*energy-stagger*.35;
   z=Math.cos(x*.9-age*1.9)*.3*energy;
   wordRotation=Math.cos(x*.9-age*1.9)*.075*energy;
   wordShear=Math.sin(phase)*.035*energy;break;
  case 'reel':
   y+=(.5-progress)*.42*energy-stagger*.5;
   stretchY=1-stagger*.16;wordRotation=stagger*.1;
   z=-stagger*.4;break;
  case 'hinge':
   wordShear=(row%2===0?1:-1)*(.05*energy+stagger*.24);
   stretchX=1-stagger*.24;z=-stagger*.75;
   y+=Math.sin(age*.8+row)*.05*energy;break;
  case 'fable':
   y+=Math.sin(phase*.7)*.16*energy-stagger*.3;
   wordRotation=.055*drift-stagger*.1;z=lift*.15;break;
  case 'carnival':
   stretchX=1+enter*.16;stretchY=1+enter*.18;
   wordRotation=(word.index%2===0?1:-1)*(stagger*.18+.025*energy);
   y+=Math.sin(phase*1.1)*.08*energy;z=enter*.4;break;
  case 'broadside':
   x-=stagger*.85;wordShear=-.055*energy+enter*.15;
   wordRotation=.025*Math.sin(age+row)*energy;
   z=-stagger*.25;break;
  case 'portal':
   z=-stagger*1.25;stretchX=1-stagger*.17;stretchY=1-stagger*.17;
   y+=Math.sin(age*.9)*.075*energy;wordRotation=stagger*.08;break;
  case 'mosaic':
   y+=Math.cos(x*.7+age*1.1)*.15*energy;
   x+=(row%2===0?-1:1)*stagger*.28;
   wordRotation=Math.sin(phase*.55)*.035*energy;z=-stagger*.35;break;
  }
  if(activeWordStyle!=='off'&&isActive){
   const pose=currentWordPose(activeWordStyle,wordProgress,styleEnergy);
   y+=pose.y*size/pixelsPerWorld;
   stretchX*=pose.scaleX;stretchY*=pose.scaleY;wordRotation+=pose.rotation;
  }

  // Cap per-word stretch so adjacent words in a multi-word row or multi-row stack never collide
  const maxStretchX=colCount>1?1.10:1.22;
  const maxStretchY=totalRows>1?1.14:1.24;
  stretchX=clamp(stretchX,0.82,maxStretchX);
  stretchY=clamp(stretchY,0.82,maxStretchY);

  const anchor=energy*(motion==='surge'?-0.12:motion==='hinge'?0.10:motion==='cascade'?-0.06:0);
  const a=point(x,y+anchor,z);
  const b=point(x+1,y+anchor,z);
  const d=point(x,y+anchor+1,z);
  const scaleX=(b.x-a.x)/pixelsPerWorld;
  const scaleXY=(b.y-a.y)/pixelsPerWorld;
  const scaleYX=-(d.x-a.x)/pixelsPerWorld;
  const scaleY=-(d.y-a.y)/pixelsPerWorld;

  if(a.visible&&Math.abs(scaleX*scaleY-scaleXY*scaleYX)>.08){
   const cos=Math.cos(wordRotation),sin=Math.sin(wordRotation);
   const aa=scaleX*stretchX,bb=scaleXY*stretchX,cc=scaleYX+wordShear*scaleX,dd=scaleY*stretchY;
   const mA=aa*cos+cc*sin,mB=bb*cos+dd*sin,mC=cc*cos-aa*sin,mD=dd*cos-bb*sin;
   const measuredW=width*fit;
   const localHalfW=measuredW*0.56+size*.14+8;
   const localHalfH=size*0.64+6;
   const halfExtentX=Math.abs(mA)*localHalfW+Math.abs(mC)*localHalfH;
   const halfExtentY=Math.abs(mB)*localHalfW+Math.abs(mD)*localHalfH;

   minScreenX=Math.min(minScreenX,a.x-halfExtentX);
   maxScreenX=Math.max(maxScreenX,a.x+halfExtentX);
   minScreenY=Math.min(minScreenY,a.y-halfExtentY);
   maxScreenY=Math.max(maxScreenY,a.y+halfExtentY);

   preparedWords.push({
    item,
    wordProgress,
    isSpokenStart,
    isSpokenEnd,
    isActive,
    measuredW,
    mA,
    mB,
    mC,
    mD,
    screenX:a.x,
    screenY:a.y,
    halfExtentX,
    halfExtentY
   });
  }
 }

 // Guarantee that the entire rendered phrase stays strictly inside its safe screen bounds (never cut off or overlapping duet sides)
 if(preparedWords.length>0){
  const padX=Math.max(12,w*0.035);
  const padY=Math.max(12,h*0.055);
  const boundLeft=duetSide==='right'?w*0.515:padX;
  const boundRight=duetSide==='left'?w*0.485:w-padX;
  const boundTop=padY;
  const boundBottom=h-padY;
  const maxAllowedW=Math.max(40,boundRight-boundLeft);
  const maxAllowedH=Math.max(40,boundBottom-boundTop);
  const bboxW=Math.max(1,maxScreenX-minScreenX);
  const bboxH=Math.max(1,maxScreenY-minScreenY);
  const clampScale=Math.min(1,maxAllowedW/bboxW,maxAllowedH/bboxH);
  const centerX=(minScreenX+maxScreenX)*0.5;
  const centerY=(minScreenY+maxScreenY)*0.5;
  const scaledMinX=centerX+(minScreenX-centerX)*clampScale;
  const scaledMaxX=centerX+(maxScreenX-centerX)*clampScale;
  const scaledMinY=centerY+(minScreenY-centerY)*clampScale;
  const scaledMaxY=centerY+(maxScreenY-centerY)*clampScale;

  let shiftX=0;
  if(scaledMinX<boundLeft)shiftX=boundLeft-scaledMinX;
  else if(scaledMaxX>boundRight)shiftX=boundRight-scaledMaxX;

  let shiftY=0;
  if(scaledMinY<boundTop)shiftY=boundTop-scaledMinY;
  else if(scaledMaxY>boundBottom)shiftY=boundBottom-scaledMaxY;

  for(const pw of preparedWords){
   const {item,wordProgress,isSpokenStart,isSpokenEnd,isActive,measuredW,mA,mB,mC,mD,screenX,screenY}=pw;
   const {word}=item;
   const finalX=centerX+(screenX-centerX)*clampScale+shiftX;
   const finalY=centerY+(screenY-centerY)*clampScale+shiftY;
   c.save();
   c.transform(
    mA*clampScale,
    mB*clampScale,
    mC*clampScale,
    mD*clampScale,
    finalX,
    finalY
   );
   c.textAlign='center';
   c.textBaseline='middle';
   applySceneFont(c,font,size,word.text);

   if(activeWordStyle!=='off'&&isActive){
    drawCurrentWordAccent(c,activeWordStyle,measuredW,size,wordProgress,sungColor,styleEnergy,word.text);
   }

   paintWordWithSequentialColor(
    c,
    word.text,
    measuredW*1.08,
    hasWordSync&&(animated||wordStylesEnabled),
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
  text:joinedText,
  rows:totalRowsCount,
  baseColor,
  activeColor:sungColor,
  fillPace,
  placement:activePlacement,
  wordStyle:activeWordStyle
 };
}
