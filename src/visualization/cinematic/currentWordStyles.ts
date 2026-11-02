import {contrastRatio} from './contrast';
/** Five static accents. They switch with the sourced word; none has its own motion. */
export const CURRENT_WORD_STYLES=[
 {id:'classic-capsule',name:'Classic Capsule',detail:'A crisp rounded frame and dark glass backing'},
 {id:'underline',name:'Double Underline',detail:'A strong rule with a fine parallel accent'},
 {id:'ribbon',name:'Marker Ribbon',detail:'A broad angled highlight beneath the text'},
 {id:'halo',name:'Oval Halo',detail:'An editorial oval encircles the word'},
 {id:'classic-focus',name:'Classic Focus',detail:'Four precise corners and a quiet backing plate'}
] as const;
export type CurrentWordStyle=typeof CURRENT_WORD_STYLES[number]['id'];
export const ALL_CURRENT_WORD_STYLE_IDS=CURRENT_WORD_STYLES.map(style=>style.id);
const LEGACY_STYLES:Record<string,CurrentWordStyle>={lift:'classic-focus',bloom:'classic-capsule',tilt:'ribbon',spotlight:'classic-capsule',sparkle:'halo',brackets:'classic-focus',ripple:'halo','classic-contours':'halo','classic-ticket':'ribbon','classic-grid':'classic-focus','classic-ring':'halo','classic-emblem':'halo','classic-progress':'underline'};
export function normalizeWordStyle(value:unknown):CurrentWordStyle|null{
 if(typeof value!=='string')return null;
 return ALL_CURRENT_WORD_STYLE_IDS.includes(value as CurrentWordStyle)?value as CurrentWordStyle:LEGACY_STYLES[value]||null;
}
export function normalizeWordStylePool(value:unknown):CurrentWordStyle[]|null{
 return Array.isArray(value)?[...new Set(value.map(normalizeWordStyle).filter((id):id is CurrentWordStyle=>id!==null))]:null;
}
/** Progress is deliberately unused: an accent has identical geometry for the whole word. */
export function drawCurrentWordAccent(c:CanvasRenderingContext2D,style:CurrentWordStyle,width:number,size:number,_progress:number,color:string,_energy=1){
 const hw=width*.5,hh=size*.50,pad=size*.085;
 const backing=contrastRatio(color,'#ffffff')>contrastRatio(color,'#07090e')?'#ffffff':'#07090e';
 c.save();c.strokeStyle=color;c.fillStyle=color;c.lineCap='round';c.lineJoin='round';
 c.lineWidth=Math.max(2,size*.035);
 const alpha=c.globalAlpha;
 switch(style){
  case 'classic-capsule':{
   c.beginPath();c.roundRect(-hw-pad,-hh-pad,width+pad*2,hh*2+pad*2,size*.22);
   c.fillStyle=backing;c.globalAlpha=alpha*.78;c.fill();c.globalAlpha=alpha;c.stroke();break;
  }
  case 'underline':{
   c.lineWidth=Math.max(3,size*.055);c.beginPath();c.moveTo(-hw,hh);c.lineTo(hw,hh);c.stroke();
   c.lineWidth=Math.max(1,size*.018);c.beginPath();c.moveTo(-hw,hh+size*.10);c.lineTo(hw,hh+size*.10);c.stroke();break;
  }
  case 'ribbon':{
   c.globalAlpha=alpha*.32;c.beginPath();c.moveTo(-hw-pad,hh*.1);c.lineTo(hw+pad,0);c.lineTo(hw+pad*.5,hh*.9);c.lineTo(-hw-pad*1.4,hh);c.closePath();c.fill();
   c.globalAlpha=alpha;c.lineWidth=Math.max(2,size*.035);c.beginPath();c.moveTo(-hw-pad,hh);c.lineTo(hw,hh*.9);c.stroke();break;
  }
  case 'halo':{
   c.beginPath();c.ellipse(0,0,hw+pad*1.5,hh+pad,-.035,0,Math.PI*2);c.stroke();break;
  }
  case 'classic-focus':{
   const tick=size*.18;c.fillStyle=backing;c.globalAlpha=alpha*.55;c.fillRect(-hw-pad,-hh,width+pad*2,hh*2);c.globalAlpha=alpha;c.beginPath();
   for(const side of [-1,1])for(const vertical of [-1,1]){
    const x=side*(hw+pad),y=vertical*hh;c.moveTo(x-side*tick,y);c.lineTo(x,y);c.lineTo(x,y-vertical*tick);
   }c.stroke();break;
  }
 }
 c.restore();
}
