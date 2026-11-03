import {readableInk} from './contrast';

/** Word accents share the completed lyric colour and the source word's clock. */
export const CURRENT_WORD_STYLES=[
 {id:'classic-capsule',name:'Classic Capsule',detail:'A full-word colour capsule with a travelling outline'},
 {id:'ribbon',name:'Marker Ribbon',detail:'A full-height marker that follows the letter-by-letter colour fill'},
 {id:'orbit',name:'Orbit',detail:'Luminous trails and satellites orbit the entire word'},
 {id:'classic-focus',name:'Classic Focus',detail:'A full-word colour plate with precise focus corners'}
] as const;
export type CurrentWordStyle=typeof CURRENT_WORD_STYLES[number]['id'];
export const ALL_CURRENT_WORD_STYLE_IDS=CURRENT_WORD_STYLES.map(style=>style.id);
const LEGACY_STYLES:Record<string,CurrentWordStyle>={lift:'classic-focus',bloom:'classic-capsule',tilt:'ribbon',spotlight:'classic-capsule',sparkle:'orbit',brackets:'classic-focus',halo:'orbit',ripple:'orbit','classic-contours':'orbit','classic-ticket':'ribbon','classic-grid':'classic-focus','classic-ring':'orbit','classic-emblem':'orbit'};
export function normalizeWordStyle(value:unknown):CurrentWordStyle|null{
 if(typeof value!=='string')return null;
 return ALL_CURRENT_WORD_STYLE_IDS.includes(value as CurrentWordStyle)?value as CurrentWordStyle:LEGACY_STYLES[value]||null;
}
export function normalizeWordStylePool(value:unknown):CurrentWordStyle[]|null{
 return Array.isArray(value)?[...new Set(value.map(normalizeWordStyle).filter((id):id is CurrentWordStyle=>id!==null))]:null;
}

export interface WordInkBounds {left:number;right:number;top:number;bottom:number}

/** Actual glyph bounds are relative to the same middle/centre anchor used to paint.
 * The advance width also reserves side bearings. Fallbacks support older WebViews.
 */
export function measureWordInkBounds(c:CanvasRenderingContext2D,text:string,width:number,size:number):WordInkBounds{
 c.save();c.textAlign='center';c.textBaseline='middle';
 const m=c.measureText(text);c.restore();
 const vertical=Number.isFinite(m.actualBoundingBoxAscent)&&Number.isFinite(m.actualBoundingBoxDescent)&&m.actualBoundingBoxAscent+m.actualBoundingBoxDescent>0;
 return {
  left:Math.min(-width/2,Number.isFinite(m.actualBoundingBoxLeft)?-m.actualBoundingBoxLeft:-width/2),
  right:Math.max(width/2,Number.isFinite(m.actualBoundingBoxRight)?m.actualBoundingBoxRight:width/2),
  top:vertical?-m.actualBoundingBoxAscent:-size*.8,
  bottom:vertical?m.actualBoundingBoxDescent:size*.3
 };
}
export function wordAccentBounds(ink:WordInkBounds,size:number,style:CurrentWordStyle):WordInkBounds{
 const padY=Math.max(3,size*.12);
 // Pill endcaps need extra horizontal room for tall first/last-letter diacritics.
 const padX=Math.max(3,size*.11,style==='classic-capsule'?(ink.bottom-ink.top+padY*2)*.38:0);
 const box={left:ink.left-padX,right:ink.right+padX,top:ink.top-padY,bottom:ink.bottom+padY};
 if(style!=='orbit')return box;
 const cx=(box.left+box.right)/2,cy=(box.top+box.bottom)/2;
 const rx=(box.right-box.left)*.64,ry=(box.bottom-box.top)*.85,tilt=-.14;
 const ex=Math.hypot(rx*Math.cos(tilt),ry*Math.sin(tilt))+size*.06;
 const ey=Math.hypot(rx*Math.sin(tilt),ry*Math.cos(tilt))+size*.06;
 return {left:cx-ex,right:cx+ex,top:cy-ey,bottom:cy+ey};
}
export const wordHighlightInk=(color:string)=>readableInk(color);

interface AccentOptions {
 bounds?:WordInkBounds;
 /** Seconds since this sourced word began, never wall-clock time. */
 time?:number;
 reduced?:boolean;
 /** Word-local edge shared with the glyph colour sweep. */
 revealX?:number;
}
export function drawCurrentWordAccent(c:CanvasRenderingContext2D,style:CurrentWordStyle,width:number,size:number,progress:number,color:string,options:AccentOptions={}){
 const ink=options.bounds??{left:-width/2,right:width/2,top:-size*.8,bottom:size*.3};
 const box=wordAccentBounds(ink,size,style==='orbit'?'classic-focus':style);
 const {left,right,top,bottom}=box,w=right-left,h=bottom-top,cx=(left+right)/2,cy=(top+bottom)/2;
 const phase=options.reduced?0:(options.time??progress)*Math.PI*1.5;
 const textInk=wordHighlightInk(color),alpha=c.globalAlpha;
 c.save();c.lineCap='round';c.lineJoin='round';c.lineWidth=Math.max(1.5,size*.025);
 c.fillStyle=color;c.strokeStyle=color;
 switch(style){
  case 'classic-capsule':{
   const radius=Math.min(w,h)/2;
   c.beginPath();c.roundRect(left,top,w,h,radius);c.fill();
   c.strokeStyle=textInk;c.globalAlpha=alpha*.25;c.stroke();
   // Two short runners travel along the true rounded perimeter, independent of fill pace.
   const perimeter=2*(w+h-4*radius)+Math.PI*2*radius;
   c.globalAlpha=alpha*.95;c.lineWidth=Math.max(2,size*.04);
   c.setLineDash([perimeter*.16,perimeter*.34]);c.lineDashOffset=-phase/(Math.PI*2)*perimeter;c.stroke();
   c.setLineDash([]);break;
  }
  case 'classic-focus':{
   c.beginPath();c.roundRect(left,top,w,h,size*.07);c.fill();
   const tick=Math.min(size*.21,w*.22,h*.28),gap=Math.max(2,size*.035);
   c.globalAlpha=alpha*.9;c.strokeStyle=color;c.beginPath();
   for(const side of [-1,1])for(const vertical of [-1,1]){
    const x=(side<0?left:right)+side*gap,y=(vertical<0?top:bottom)+vertical*gap;
    c.moveTo(x-side*tick,y);c.lineTo(x,y);c.lineTo(x,y-vertical*tick);
   }c.stroke();break;
  }
  case 'ribbon':{
   const p=Math.max(0,Math.min(1,progress));if(p<=0)break;
   const edge=p>=1?right:Math.min(right,options.revealX??ink.left+(ink.right-ink.left)*p);
   c.beginPath();c.rect(left,top,Math.max(0,edge-left),h);c.clip();
   c.beginPath();c.roundRect(left,top,w,h,Math.min(size*.065,h*.12));c.fill();
   break;
  }
  case 'orbit':{
   const rx=w*.64,ry=h*.85,tilt=-.14;
   c.globalAlpha=alpha*.18;c.lineWidth=Math.max(1,size*.018);
   c.beginPath();c.ellipse(cx,cy,rx,ry,tilt,0,Math.PI*2);c.stroke();
   c.shadowColor=color;c.shadowBlur=Math.min(12,size*.15);
   for(const offset of [0,Math.PI]){
    for(let i=0;i<10;i++){
     c.globalAlpha=alpha*(1-i/10)*.85;c.lineWidth=Math.max(1,size*(.045-i*.003));
     const end=phase+offset-i*.075;
     c.beginPath();c.ellipse(cx,cy,rx,ry,tilt,end-.08,end);c.stroke();
    }
    const a=phase+offset,x=cx+rx*Math.cos(a)*Math.cos(tilt)-ry*Math.sin(a)*Math.sin(tilt),y=cy+rx*Math.cos(a)*Math.sin(tilt)+ry*Math.sin(a)*Math.cos(tilt);
    c.globalAlpha=alpha;c.beginPath();c.arc(x,y,Math.max(3,size*.06),0,Math.PI*2);c.fill();
   }break;
  }
 }
 c.restore();
}
