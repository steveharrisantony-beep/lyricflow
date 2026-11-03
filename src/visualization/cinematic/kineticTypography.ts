import {resolveLyricBox,type LyricLayoutSettings} from '../../lyrics/lyricLayout';
import {DUET_COLORS,type LyricCue} from '../../lyrics/lyricTimeline';
import {lyricFontBounds} from '../../lyrics/fontSizing';
import {wordEmphasis,type WordEmphasis} from '../../lyrics/wordEmphasis';
import {hasDistinctRomanized} from '../../romanization/romanize';
import {byId,resolveThemePalette,TEMPLATES,type DirectedScene,type FontPack} from './catalog';
import {applySceneFont,getFontLoadRevision,isFontPackLoaded,preloadLyricFonts} from './fonts';
import {lightLyricColor,vibrantLyricColor,paintLyric,readableChromaticInk,readableInk,albumColorsForLine} from './contrast';
import type {AlbumArtLyricPalette,TextGlow} from './contrast';
import {drawCurrentWordAccent,measureWordInkBounds,wordAccentBounds,wordHighlightInk,type WordInkBounds,type CurrentWordStyle} from './currentWordStyles';
import {currentWordAnimationPose,type CurrentWordAnimation} from './currentWordAnimations';
import {buildLetterUnits,choreographyDuration,choreographyPhase,letterMotionPose,lineMotionPose,phraseTracking,type LetterUnit} from './letterMotion';
import {lyricCameraTransform,makeLyricProjection,STILL_CAMERA,type CameraFrame,type ProjectPoint} from './cameraRig';

/** Keep the original twelve in their original order; new designs append to this catalog. */
export const ORIGINAL_LYRIC_MOTIONS=['ship','fisheye','orbit','cascade','scatter','elastic','hinge','carnival','portal','broadside','alternating','wave'] as const;
export const LYRIC_MOTIONS=[...ORIGINAL_LYRIC_MOTIONS,
 'venetian','fan','curtain-sweep','letter-rain','concertina','silk-stretch','domino',
 'pendulum','helix','zipper','iris','rosette','switchback'
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

export const VOXELVERSE_STYLES:readonly VoxelVerseStyleMeta[]=[
 {id:'ship',name:'Ship',family:'signature',detail:'Letters glide from depth, drift gently, then travel onward'},
 {id:'fisheye',name:'Fisheye',family:'signature',detail:'A centre-out lens reveal, travelling focus and closing contraction'},
 {id:'orbit',name:'Orbit',family:'spatial',detail:'Letters gather along arcs, float, then spiral away'},
 {id:'cascade',name:'Cascade',family:'spatial',detail:'A masked waterfall entrance, flowing hold and falling exit'},
 {id:'scatter',name:'Scatter',family:'spatial',detail:'Angled letters assemble from the centre and disperse outward'},
 {id:'elastic',name:'Elastic',family:'kinetic',detail:'A damped spring entrance and coordinated squash exit'},
 {id:'wave',name:'Wave',family:'kinetic',detail:'A travelling crest reveals and carries the letters away'},
 {id:'alternating',name:'Alternating Sides',family:'kinetic',detail:'Lines arrive from alternating sides and exit in their direction of travel'},
 {id:'hinge',name:'Hinge',family:'editorial',detail:'Letters unfold, hold a subtle fold and close again'},
 {id:'carnival',name:'Carnival',family:'editorial',detail:'Alternating letter steps settle into a gentle rhythmic hold'},
 {id:'broadside',name:'Broadside',family:'editorial',detail:'An angled sweep, breathing tracking and onward exit'},
 {id:'portal',name:'Portal',family:'editorial',detail:'Letters open from the centre and expand away at the end'},
 {id:'venetian',name:'Venetian',family:'editorial',detail:'A visible shutter fold travels vertically through the letters'},
 {id:'fan',name:'Fan',family:'spatial',detail:'A tilted fan holds a breathing arch across the whole phrase'},
 {id:'curtain-sweep',name:'Curtain Sweep',family:'editorial',detail:'A sloping entrance becomes a continuous whole-line banner pan'},
 {id:'letter-rain',name:'Letter Rain',family:'spatial',detail:'Independent wind-tossed letters flutter throughout the line'},
 {id:'concertina',name:'Concertina',family:'editorial',detail:'The whole phrase expands and contracts its letter spacing'},
 {id:'silk-stretch',name:'Silk Stretch',family:'editorial',detail:'Tall letters stretch along a fixed baseline in a travelling pulse'},
 {id:'domino',name:'Domino',family:'kinetic',detail:'One-way tipping knocks travel along the lower letter pivots'},
 {id:'pendulum',name:'Pendulum',family:'kinetic',detail:'Groups swing back and forth from upper pivots'},
 {id:'helix',name:'Helix',family:'signature',detail:'A visible depth spiral carries larger and smaller letters through the line'},
 {id:'zipper',name:'Zipper',family:'editorial',detail:'Alternating upper and lower teeth breathe apart and zip closed'},
 {id:'iris',name:'Iris',family:'signature',detail:'Oval apertures reveal a slow full-composition lens zoom'},
 {id:'rosette',name:'Rosette',family:'spatial',detail:'Radial petals bloom and relax along fixed rays throughout the hold'},
 {id:'switchback',name:'Switchback',family:'kinetic',detail:'Groups of three weave sideways with opposing slants'}
];
export const VOXELVERSE_FAMILIES:readonly {id:VoxelVerseFamily;name:string;count:number}[]=(
 [{id:'signature',name:'Signature'},{id:'spatial',name:'Spatial'},
  {id:'kinetic',name:'Kinetic'},{id:'editorial',name:'Editorial'}] as const
).map(family=>({...family,count:VOXELVERSE_STYLES.filter(style=>style.family===family.id).length}));
const LEGACY_MOTIONS:Record<string,LyricMotion>={visual:'orbit','fisheye-visual':'fisheye',prism:'hinge',surge:'wave',echo:'portal',halo:'orbit',ribbon:'wave',reel:'cascade',fable:'scatter',mosaic:'carnival'};
export function normalizeLyricMotion(value:unknown):LyricMotion|null{
 if(typeof value!=='string')return null;
 return LYRIC_MOTIONS.includes(value as LyricMotion)?value as LyricMotion:LEGACY_MOTIONS[value]||null;
}
export function normalizeMotionPool(value:unknown,expandOriginal=false):LyricMotion[]|null{
 if(expandOriginal&&Array.isArray(value)&&value.length===ORIGINAL_LYRIC_MOTIONS.length&&ORIGINAL_LYRIC_MOTIONS.every(id=>value.includes(id)))return [...LYRIC_MOTIONS];
 const oldFullPool=[...ORIGINAL_LYRIC_MOTIONS.filter(id=>id!=='wave'&&id!=='alternating'),...Object.keys(LEGACY_MOTIONS)];
 if(Array.isArray(value)&&oldFullPool.every(id=>value.includes(id)))return [...LYRIC_MOTIONS];
 return Array.isArray(value)?[...new Set(value.map(normalizeLyricMotion).filter((id):id is LyricMotion=>id!==null))]:null;
}

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
 * 3. Video uses pale unread ink and saturated sung ink with checked contrast against the dark overlay.
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
   ?lightLyricColor(customBaseOverride)
   :'#f8fafc';
  const targetAccent=customAccentOverride&&/^#[0-9a-f]{6}$/i.test(customAccentOverride)
   ?customAccentOverride
   :'#72efdd';
  let sungColor=vibrantLyricColor(targetAccent);
  if(sungColor.toLowerCase()===baseColor.toLowerCase()){
   sungColor=vibrantLyricColor('#22d3aa');
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
 camera?:CameraFrame;
 animated?:boolean;
 wordStylesEnabled?:boolean;
 currentWordStyle?:CurrentWordStyle;
 enabledWordStyles?:readonly CurrentWordStyle[];
 wordAnimationsEnabled?:boolean;
 enabledWordAnimations?:readonly CurrentWordAnimation[];
 cueIndex?:number;
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
 layout?:Partial<LyricLayoutSettings>;
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
 glyphs?:number;
 letterMode?:'letters'|'shaped'|'mixed';
 wordAnimation?:CurrentWordAnimation|'off';
 motionPhase?:'intro'|'hold'|'outro'|'still';
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
 maxRowWidthPx=Infinity,
 wrapToWidth=false
):WordPlacement[]{
 const count=runs.length;
 if(count===0)return [];
 const wordGap=space*1.12;
 const totalChars=runs.reduce((sum,r)=>sum+r.text.length,0)+Math.max(0,count-1);
 const totalPx=widths.reduce((sum,w)=>sum+w,0)+Math.max(0,count-1)*wordGap;

 const maxWordsPerRow=wrapToWidth?Infinity:
  motion==='ship'||motion==='orbit'||motion==='cascade'||motion==='hinge'?3:
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
 const rowLimitPx=wrapToWidth?maxRowWidthPx:Number.isFinite(maxRowWidthPx)&&maxRowWidthPx>0
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
  if((exceedsWidth||exceedsCount)&&(wrapToWidth||nonEmpty.length<5)){
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
 backgroundHex:string,
 glow?:TextGlow,
 sungSurface?:string
){
 if(!hasWordSync||fillPace==='line'){
  paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex,undefined,glow);
  return;
 }
 if(fillPace==='word'){
  const col=isSpokenStart?sungColor:baseColor;
  paintLyric(c,wordText,0,0,maxWidth,col,isSpokenStart?sungSurface||backgroundHex:backgroundHex,undefined,glow);
  return;
 }
 // Slow song: letter-by-letter color transition as each letter is said
 if(!isSpokenStart||wordProgress<=0){
  paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex,undefined,glow);
  return;
 }
 if(isSpokenEnd||wordProgress>=1){
  paintLyric(c,wordText,0,0,maxWidth,sungColor,sungSurface||backgroundHex,undefined,glow);
  return;
 }
 // Paint the shaped word once. A colour sweep preserves Indic conjuncts, kerning,
 // and ligatures instead of splitting the glyph run into individual code points.
 if(typeof c.createLinearGradient!=='function'){
  paintLyric(c,wordText,0,0,maxWidth,wordProgress>=.5?sungColor:baseColor,wordProgress>=.5?sungSurface||backgroundHex:backgroundHex,undefined,glow);
  return;
 }
 const width=Math.min(maxWidth,c.measureText(wordText).width);
 const gradient=c.createLinearGradient(-width/2,0,width/2,0);
 const edge=clamp(wordProgress,.001,.999);
 gradient.addColorStop(0,sungColor);gradient.addColorStop(edge,sungColor);
 gradient.addColorStop(edge,baseColor);gradient.addColorStop(1,baseColor);
 paintLyric(c,wordText,0,0,maxWidth,baseColor,backgroundHex,gradient,glow);
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
 units:LetterUnit[][];
 inkBounds:WordInkBounds[];
 unitInkBounds:WordInkBounds[][];
 unitOffsets:number[];
 unitCount:number;
}

let cachedLayout:CachedCueLayout|null=null;

/** A single phrase with cached letter choreography and intact shaped-script fallback. */
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
 camera=STILL_CAMERA,
 animated=true,
 wordStylesEnabled=false,
 currentWordStyle='classic-capsule',
 enabledWordStyles,
 wordAnimationsEnabled=false,
 enabledWordAnimations,
 cueIndex=0,
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
 layout,
 forceLightText=false,
 placementMode='auto',
 duetSide
}:KineticArgs):KineticResult{
 const motion=lyricMotionFor(scene,cue.text,enabledMotions);
 const font=lyricFontFor(scene,cue.text,enabledFonts);
 const baseTemplate=byId[scene.id]||TEMPLATES[0];
 const theme=resolveThemePalette(baseTemplate.id,paletteId);
 const unit=Math.min(w,h);
 const lineAnimationsActive=animated&&enabledMotions?.length!==0;
 // Phrase perspective belongs to choreography; global camera shake is applied after fitting.
 if(!lineAnimationsActive||reduced)project=makeLyricProjection(w,h,STILL_CAMERA);
 const energy=reduced||!lineAnimationsActive?0:clamp(intensity,0,1.25);
 const wordAnimationEnergy=reduced||!wordAnimationsEnabled?0:clamp(intensity,0,1.25);
 const age=Math.max(0,time-cue.time);
 let hasWordSync=false;
 const activePlacement:Exclude<LyricPlacementMode,'auto'>=duetSide
  ?duetSide
  :resolveCuePlacement(cue,scene,placementMode,enabledPlacements);
 const box=resolveLyricBox(w,h,activePlacement,layout,cueIndex,duetSide);

 // Keep a responsive preferred size inside two independent CSS-pixel bounds.
 const scaleFactor=clamp(typeof fontScale==='number'&&Number.isFinite(fontScale)?fontScale:1,.45,2);
 const {min:minimumFont,max:maximumFont}=lyricFontBounds(minFontSize,maxFontSize);
 const fontRev=getFontLoadRevision();
 const layoutKey=`${cue.time}|${cue.end}|${cue.text}|${cue.romanized}|${cue.words.length}|${mode}|${font}|${fontRev}|${w}|${h}|${scaleFactor.toFixed(3)}|${minimumFont}|${maximumFont}|${motion}|${activePlacement}|${box.width}|${box.height}|${duetSide||''}|${wordAnimationsEnabled}|${wordStylesEnabled}`;

 let runs:LyricRun[];
 let placements:WordPlacement[];
 let totalRowsCount:number;
 let widestRow:number;
 let fit:number;
 let size:number;
 let joinedText:string;
 let units:LetterUnit[][];
 let inkBounds:WordInkBounds[];
 let unitInkBounds:WordInkBounds[][];
 let unitOffsets:number[];
 let unitCount:number;

 if(cachedLayout&&cachedLayout.key===layoutKey&&cachedLayout.cue===cue&&cachedLayout.emphasis===emphasis){
  ({runs,placements,totalRowsCount,widestRow,fit,size,joinedText,units,inkBounds,unitInkBounds,unitOffsets,unitCount}=cachedLayout);
 }else{
  runs=lyricRuns(cue,mode,emphasis);
  const duetScale=duetSide?0.78:1;
  const rawBaseline=unit*(runs.length<=3?0.155:runs.length<=6?0.128:runs.length<=10?0.108:0.092)*duetScale*scaleFactor;
  const baseline=clamp(rawBaseline,minimumFont,maximumFont);
  const space=baseline*((wordAnimationsEnabled||wordStylesEnabled)?0.44:0.30);
  const widths=runs.map(word=>{
   applySceneFont(c,font,baseline,word.text);
   return c.measureText(word.text).width;
  });

  // Reflow at the fitted size rather than shrinking a tall, permanently fixed stack.
  // Search only on cue/layout changes; the resulting rows and letter metrics are cached.
  const availWidth=box.width*.94;
  const rowHeight=motion==='wave'?1.60:1.45;
  const preferredSize=Math.min(maximumFont,baseline*1.15);
  const rowsAt=(candidate:number)=>buildWordRows(runs,widths,space,motion,availWidth*baseline/Math.max(1,candidate),true);
  const fits=(candidate:number)=>{
   const rows=rowsAt(candidate);
   return (rows[0]?.totalRows||1)*candidate*rowHeight<=box.height&&
    rows.every(row=>row.rowWidth*candidate/baseline<=availWidth);
  };
  let lo=9,hi=preferredSize;
  if(fits(hi))lo=hi;
  else for(let attempt=0;attempt<10;attempt++){
   const mid=(lo+hi)/2;
   if(fits(mid))lo=mid;else hi=mid;
  }
  size=Math.max(9,Math.floor(lo));
  fit=1;
  // Measure at the final font size so row alignment remains exact after reflow.
  const fittedWidths=runs.map(word=>{applySceneFont(c,font,size,word.text);return c.measureText(word.text).width;});
  placements=buildWordRows(runs,fittedWidths,space*size/baseline,motion,availWidth,true);
  totalRowsCount=placements[0]?.totalRows||1;
  widestRow=placements.reduce((m,p)=>Math.max(m,p.rowWidth),1);
  joinedText=runs.map(word=>word.text).join(' ');
  units=runs.map(word=>{applySceneFont(c,font,size,word.text);return buildLetterUnits(c,word.text);});
  inkBounds=runs.map(word=>{applySceneFont(c,font,size,word.text);return measureWordInkBounds(c,word.text,c.measureText(word.text).width,size);});
  unitInkBounds=units.map((parts,index)=>{applySceneFont(c,font,size,runs[index].text);return parts.map(part=>measureWordInkBounds(c,part.text,part.width,size));});
  unitCount=0;unitOffsets=units.map(parts=>{const offset=unitCount;unitCount+=parts.length;return offset;});
  cachedLayout={key:layoutKey,cue,emphasis,runs,placements,totalRowsCount,widestRow,fit,size,joinedText,units,inkBounds,unitInkBounds,unitOffsets,unitCount};
 }

 // Never animate inferred timings when romanization changes the token count.
 hasWordSync=cue.timing==='sourced'&&cue.words.length>0&&
  cue.words.every(word=>word.timing!=='estimated'&&Number.isFinite(word.start)&&Number.isFinite(word.end)&&word.end>word.start)&&
  cue.words.reduce((count,word)=>count+word.text.trim().split(/\s+/).filter(Boolean).length,0)===runs.length;
 const selectedWordStyle=enabledWordStyles ? enabledWordStyles[hash(`${cue.time}|${cue.text}`)%Math.max(1,enabledWordStyles.length)] : currentWordStyle;
 const activeWordStyle=wordStylesEnabled&&hasWordSync&&selectedWordStyle?selectedWordStyle:'off';
 const animationPool=enabledWordAnimations??['lift'];
 const activeWordAnimation=wordAnimationsEnabled&&hasWordSync&&animationPool.length?animationPool[hash(`${cue.time}|${cue.text}`)%animationPool.length]:'off';
 const wordLettersActive=activeWordAnimation!=='off'&&wordAnimationEnergy>.001;
 const renderLetters=energy>.001||wordLettersActive;
 const lineColors=albumPalette?albumColorsForLine(albumPalette,`${cue.time}|${cue.text}`):undefined;

 const vocalEnd=duetSide
  ?Math.max(cue.time+0.18,cue.naturalEnd??(runs.length>0?runs[runs.length-1].end:cue.end))
  :cue.end;
 const duration=Math.max(.18,vocalEnd-cue.time);
 const progress=clamp(age/duration);
 const motionDuration=choreographyDuration(duration,(cue.vocalEnd??vocalEnd)-cue.time);

 const origin=project(0,0,0),one=project(1,0,0);
 const pixelsPerWorld=Math.max(10,Math.hypot(one.x-origin.x,one.y-origin.y));

 // Duet colours belong to lines, not sides. Keep the surviving line's colour
 // when it becomes primary, even with album or custom lyric colours enabled.
 const duetAccent=duetSide?DUET_COLORS[cue.duetColorIndex??(duetSide==='left'?0:1)]:undefined;
 const effectiveAccentOverride=duetAccent||lineColors?.sungColor||customAccentColor;
 const effectiveBaseOverride=duetAccent?lightLyricColor(duetAccent):lineColors?.baseColor||customBaseColor;
 const {baseColor,sungColor,effectiveBgHex}=computeBackgroundAdaptiveLyricColors(
  theme.background,
  theme.foreground,
  theme.accent,
  effectiveAccentOverride,
  forceLightText,
  effectiveBaseOverride
 );
 const fillPace:'letter'|'word'|'line'=hasWordSync
  ?activeWordStyle==='ribbon'?'letter':(activeWordStyle!=='off'||activeWordAnimation!=='off')?resolveLyricFillPace(runs,bpm,fillPaceMode):'word'
  :'line';

 // Phrase perspective supports the independent, persistent letter choreography
 const yaw=energy*(
  motion==='orbit'?0.08*Math.sin(age*.7):
  motion==='hinge'?0.025*Math.sin(age*.8):
  motion==='ship'?0.055*Math.sin(age*.6):
  motion==='cascade'?0:
  motion==='broadside'?0.035*Math.sin(age*.5):0
 );
 const pitch=energy*(
  motion==='wave'?0.06*Math.sin(age):
  motion==='cascade'?0.08:
  motion==='ship'?-0.05*Math.cos(progress*Math.PI):0
 );
 const roll=energy*(
  motion==='scatter'?0.018*Math.sin(age*.6):
  motion==='carnival'?-0.015*Math.cos(age*.7):
  motion==='broadside'?0.015:
  0
 );
 const lineZ=energy*(
  motion==='ship'?0.08*Math.sin(age*.5):
  motion==='orbit'?0.06*Math.sin(age*.6):
  0
 );

 const cy=Math.cos(yaw),sy=Math.sin(yaw);
 const cp=Math.cos(pitch),sp=Math.sin(pitch);
 const cr=Math.cos(roll),sr=Math.sin(roll);
 const point=(x:number,y:number,z:number)=>{
  const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;
  return project(xx*cr-yy*sr,xx*sr+yy*cr,zz*cp+y*sp+lineZ);
 };

 const rowSpacingWorld=(size*(motion==='wave'?1.60:1.45))/pixelsPerWorld;
 let drawn=0,highlights=0;
 applySceneFont(c,font,size,joinedText);

 interface PreparedGlyph {
  part:LetterUnit;
  pose:ReturnType<typeof letterMotionPose>;
  wordPose:ReturnType<typeof currentWordAnimationPose>;
  matrix:[number,number,number,number,number,number];
 }
 interface PreparedWordDraw {
  item:WordPlacement;
  wordProgress:number;
  isSpokenStart:boolean;
  isSpokenEnd:boolean;
  isActive:boolean;
  measuredW:number;
  glyphs:PreparedGlyph[];
  bounds:WordInkBounds;
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

  const rowSlideX=0,rowSlideY=0;

  const tracking=1+phraseTracking(motion,age,energy);
  const maxRowShift=((widestRow-rowWidth)*0.5*fit*tracking)/pixelsPerWorld;
  const alignShiftX=activePlacement==='diagonal'?(row-(totalRows-1)*.5)*.34:
   box.align==='left'?-maxRowShift:box.align==='right'?maxRowShift:0;
  const baseRowY=((totalRows-1)*0.5-row)*rowSpacingWorld+rowSlideY;
  let x=(rowX*fit)*tracking/pixelsPerWorld+alignShiftX+rowSlideX;
  let y=baseRowY;
  let z=0;
  let stretchX=1;
  let stretchY=1;
  let wordShear=0;
  let wordRotation=0;

  // Cap per-word stretch so adjacent words in a multi-word row or multi-row stack never collide
  const maxStretchX=colCount>1?1.14:1.22;
  const maxStretchY=totalRows>1?1.14:1.24;
  stretchX=clamp(stretchX,0.82,maxStretchX);
  stretchY=clamp(stretchY,0.82,maxStretchY);

  const anchor=energy*(motion==='hinge'?0.10:motion==='cascade'?-0.06:0);
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
   const parts=renderLetters?units[word.index]:[{text:word.text,center:0,width:measuredW,index:0,count:1,connected:true}];
   const bounds={...inkBounds[word.index]};
   const glyphs:PreparedGlyph[]=parts.map(part=>{
    const pose=letterMotionPose(motion,age,unitOffsets[word.index]+part.index,unitCount,energy,part.connected,motionDuration,cueIndex);
    const wordPose=currentWordAnimationPose(isActive?activeWordAnimation:'off',wordProgress,wordAnimationEnergy,part.index,part.count);
    const ga=pose.scaleX*Math.cos(pose.rotation),gb=pose.scaleX*Math.sin(pose.rotation),gc=pose.shear-Math.sin(pose.rotation),gd=pose.scaleY*Math.cos(pose.rotation);
    const matrix:[number,number,number,number,number,number]=[ga*wordPose.scale,gb*wordPose.scale,gc*wordPose.scale,gd*wordPose.scale,
     part.center*(1+pose.tracking)+pose.x*size+gc*wordPose.y*size,pose.y*size+gd*wordPose.y*size];
    // The accent encloses the actual moving glyphs, including diacritics, Lift and Zoom.
    if(activeWordStyle!=='off'){
     const ink=renderLetters?unitInkBounds[word.index][part.index]:inkBounds[word.index];
     for(const x of [ink.left,ink.right])for(const y of [ink.top,ink.bottom]){
      const px=matrix[0]*x+matrix[2]*y+matrix[4],py=matrix[1]*x+matrix[3]*y+matrix[5];
      bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);bounds.top=Math.min(bounds.top,py);bounds.bottom=Math.max(bounds.bottom,py);
     }
    }
    return {part,pose,wordPose,matrix};
   });
   const accent=activeWordStyle==='off'?bounds:wordAccentBounds(bounds,size,activeWordStyle);
   const localHalfW=Math.max(measuredW*0.56+size*(energy>.01?.38:wordLettersActive?.24:.14)+8,activeWordStyle==='off'?0:Math.max(Math.abs(accent.left),Math.abs(accent.right))+size*.10);
   const localHalfH=Math.max(size*(energy>.01?1.02:wordLettersActive?.90:.64)+6,activeWordStyle==='off'?0:Math.max(Math.abs(accent.top),Math.abs(accent.bottom))+size*.10);
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
    glyphs,
    bounds,
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
  const boundLeft=box.x;
  const boundRight=box.x+box.width;
  const boundTop=box.y;
  const boundBottom=box.y+box.height;
  // Reserve room for the banner pan before fitting, so it cannot clip on side placements.
  const panReserve=motion==='curtain-sweep'?Math.min((boundRight-boundLeft)*.08,w*.035)*Math.min(1,energy):0;
  const fitLeft=boundLeft+panReserve,fitRight=boundRight-panReserve;
  const maxAllowedW=Math.max(1,fitRight-fitLeft);
  const maxAllowedH=Math.max(1,boundBottom-boundTop);
  const bboxW=Math.max(1,maxScreenX-minScreenX);
  const bboxH=Math.max(1,maxScreenY-minScreenY);
  const clampScale=Math.min(1,maxAllowedW/bboxW,maxAllowedH/bboxH);
  const centerX=(minScreenX+maxScreenX)*0.5;
  const centerY=(minScreenY+maxScreenY)*0.5;
  const scaledMinX=centerX+(minScreenX-centerX)*clampScale;
  const scaledMaxX=centerX+(maxScreenX-centerX)*clampScale;
  const scaledMinY=centerY+(minScreenY-centerY)*clampScale;
  const scaledMaxY=centerY+(maxScreenY-centerY)*clampScale;

  const shiftX=box.align==='left'?fitLeft-scaledMinX:box.align==='right'?fitRight-scaledMaxX:(fitLeft+fitRight)/2-centerX;
  const shiftY=box.vertical==='top'?boundTop-scaledMinY:box.vertical==='bottom'?boundBottom-scaledMaxY:(boundTop+boundBottom)/2-centerY;

  const linePose=lineMotionPose(motion,age,motionDuration,cueIndex,w,energy);
  c.save();
  c.beginPath();c.rect(boundLeft,boundTop,boundRight-boundLeft,maxAllowedH);c.clip();
  if(!reduced&&intensity>0&&(camera.x!==0||camera.y!==0||camera.roll!==0||camera.zoom!==1)){
   const transform=lyricCameraTransform(w,h,camera,
    {x:fitLeft,y:boundTop,width:maxAllowedW,height:maxAllowedH},
    {x:scaledMinX+shiftX,y:scaledMinY+shiftY,width:bboxW*clampScale,height:bboxH*clampScale});
   c.transform(...transform);
  }
  const lineX=motion==='curtain-sweep'?clamp(linePose.x,-panReserve,panReserve):linePose.x;
  c.transform(1,0,0,1,lineX,0);
  if(linePose.scale!==undefined){const scale=linePose.scale;c.transform(scale,0,0,scale,(centerX+shiftX)*(1-scale),(centerY+shiftY)*(1-scale));}
  for(const pw of preparedWords){
   const {item,wordProgress,isSpokenStart,isSpokenEnd,isActive,measuredW,glyphs,bounds,mA,mB,mC,mD,screenX,screenY}=pw;
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

   // Every sung word in this cue shares its contrast-adjusted line accent.
   if(activeWordStyle!=='off'&&isActive){
    c.save();c.globalAlpha*=letterMotionPose(motion,age,unitOffsets[word.index],unitCount,energy,true,motionDuration,cueIndex).alpha;
    let revealX=-measuredW/2+measuredW*wordProgress;
    if(renderLetters&&glyphs.length>1){
     const index=Math.min(glyphs.length-1,Math.floor(wordProgress*glyphs.length)),glyph=glyphs[index];
     const fraction=clamp(wordProgress*glyphs.length-index),x=glyph.part.width*(fraction-.5);
     revealX=glyph.matrix[0]*x+glyph.matrix[4];
    }
    drawCurrentWordAccent(c,activeWordStyle,measuredW,size,wordProgress,sungColor,{bounds,revealX,time:Math.max(0,time-word.start),reduced:reduced||intensity<=.001});c.restore();
   }

   const filledWord=isActive&&(activeWordStyle==='classic-capsule'||activeWordStyle==='classic-focus');
   const markedWord=isActive&&activeWordStyle==='ribbon';
   const highlightInk=wordHighlightInk(sungColor);
   for(const {part,pose,wordPose,matrix} of glyphs){
    const glyphGlow=wordPose.glow>.001?{color:sungColor,blur:Math.min(28,size*wordPose.glow)}:undefined;
    c.save();
    c.globalAlpha*=pose.alpha;
    c.transform(...matrix);
    if(pose.reveal<1){c.beginPath();c.rect(-part.width*.65,-size*.68,Math.max(1,part.width*1.3),size*1.4*pose.reveal);c.clip();}
    if(pose.revealX<1){
     const left=-part.width*.65,width=Math.max(1,part.width*1.3),shown=width*pose.revealX;
     c.beginPath();c.rect(pose.clipSide>0?left:left+width-shown,-size*.68,shown,size*1.4);c.clip();
    }
    if(pose.iris<1){c.beginPath();c.ellipse(0,0,Math.max(.01,part.width*.7*pose.iris),Math.max(.01,size*.75*pose.iris),0,0,Math.PI*2);c.clip();}
    const letterProgress=part.connected?wordProgress:clamp(wordProgress*part.count-part.index);
    paintWordWithSequentialColor(c,part.text,Math.max(1,part.width*1.12),hasWordSync&&(lineAnimationsActive||activeWordStyle!=='off'||activeWordAnimation!=='off'),filledWord?'word':fillPace,letterProgress,isSpokenStart,isSpokenEnd,
     filledWord?highlightInk:baseColor,filledWord||markedWord?highlightInk:sungColor,filledWord?sungColor:effectiveBgHex,glyphGlow,markedWord?sungColor:undefined);
    c.restore();
   }

   c.restore();
   drawn++;
   if(word.importance>0)highlights++;
  }
  c.restore();
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
  wordStyle:activeWordStyle,
  glyphs:renderLetters?unitCount:runs.length,
  letterMode:units.every(parts=>parts[0]?.connected)?'shaped':units.some(parts=>parts[0]?.connected)?'mixed':'letters',
  wordAnimation:activeWordAnimation,
  motionPhase:choreographyPhase(age,motionDuration,energy>.001)
 };
}
