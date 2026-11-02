import {contrastRatio} from './contrast';
/** Eight deliberately distinct accents, composable with the letter choreography. */
export const CURRENT_WORD_STYLES=[
 {id:'bloom',name:'Bloom',detail:'A visible expansion and soft rebound'},
 {id:'underline',name:'Ink Underline',detail:'A bright moving underline'},
 {id:'spotlight',name:'Glass Spotlight',detail:'A luminous filled word capsule'},
 {id:'sparkle',name:'Constellation',detail:'Three bright stars trace the word'},
 {id:'tilt',name:'Pendulum',detail:'The active word swings into emphasis'},
 {id:'classic-capsule',name:'Classic Capsule',detail:'A bold rounded outline'},
 {id:'classic-contours',name:'Classic Contours',detail:'Two offset dimensional frames'},
 {id:'classic-focus',name:'Classic Focus',detail:'A strong backing plate and corner ticks'}
] as const;
export type CurrentWordStyle=typeof CURRENT_WORD_STYLES[number]['id'];
export const ALL_CURRENT_WORD_STYLE_IDS=CURRENT_WORD_STYLES.map(style=>style.id);
const LEGACY_STYLES:Record<string,CurrentWordStyle>={lift:'bloom',halo:'classic-capsule',ribbon:'underline',brackets:'classic-focus',ripple:'classic-contours','classic-ticket':'spotlight','classic-grid':'classic-capsule','classic-ring':'classic-capsule','classic-emblem':'sparkle','classic-progress':'underline'};
export function normalizeWordStyle(value:unknown):CurrentWordStyle|null{
 if(typeof value!=='string')return null;
 return ALL_CURRENT_WORD_STYLE_IDS.includes(value as CurrentWordStyle)?value as CurrentWordStyle:LEGACY_STYLES[value]||null;
}
export function normalizeWordStylePool(value:unknown):CurrentWordStyle[]|null{
 return Array.isArray(value)?[...new Set(value.map(normalizeWordStyle).filter((id):id is CurrentWordStyle=>id!==null))]:null;
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const wordStyleEnvelope=(progress:number)=>Math.sin(Math.PI*clamp(progress));
export function currentWordPose(style:CurrentWordStyle,progress:number,energy:number){
 const e=wordStyleEnvelope(progress)*energy;
 if(style==='bloom')return {y:-.04*e,scaleX:1+.13*e,scaleY:1+.16*e,rotation:0};
 if(style==='tilt')return {y:-.10*e,scaleX:1+.06*e,scaleY:1+.06*e,rotation:.11*e*Math.cos(progress*Math.PI)};
 return {y:0,scaleX:1,scaleY:1,rotation:0};
}
export function drawCurrentWordAccent(c:CanvasRenderingContext2D,style:CurrentWordStyle,width:number,size:number,progress:number,color:string,energy:number,_wordText=''){
 const e=wordStyleEnvelope(progress)*energy;if(e<=.001)return;
 const hw=width*.5,hh=size*.53,pad=size*.09;
 c.save();c.strokeStyle=color;c.fillStyle=color;
 const darkInk=contrastRatio(color,'#ffffff')>contrastRatio(color,'#07090e');
 const backing=darkInk?'#ffffff':'#07090e';
 c.shadowColor=darkInk?'rgba(255,255,255,.8)':'rgba(0,0,0,.85)';c.shadowBlur=Math.max(2,size*.05);
 c.lineWidth=Math.max(2,size*.045);c.globalAlpha=.95*e;
 switch(style){
  case 'underline':{
   const y=hh*.94;c.lineCap='round';c.lineWidth=Math.max(3,size*.065);c.beginPath();c.moveTo(-hw,y);c.lineTo(hw,y);c.stroke();
   c.beginPath();c.arc(-hw+width*progress,y,size*.065,0,Math.PI*2);c.fill();break;
  }
  case 'spotlight':
  case 'classic-capsule':{
   c.beginPath();c.roundRect(-hw-pad,-hh-pad,width+pad*2,hh*2+pad*2,hh*.38);
   if(style==='spotlight'){c.fillStyle=backing;c.globalAlpha=.48*e;c.fill();c.globalAlpha=.95*e;c.lineWidth=Math.max(1.5,size*.025);}
   c.stroke();break;
  }
  case 'sparkle':{
   for(let i=0;i<3;i++){
    const a=progress*Math.PI*2+i*Math.PI*2/3,x=Math.cos(a)*(hw+size*.07),y=Math.sin(a)*hh,r=size*.09;
    c.beginPath();c.moveTo(x-r,y);c.lineTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.closePath();c.fill();
   }break;
  }
  case 'classic-contours':{
   for(let layer=1;layer<=2;layer++){
    const offset=layer*size*.07*(1+e*.3);c.globalAlpha=.85*e/layer;c.strokeRect(-hw+offset,-hh-offset*.6,width,hh*2);
   }break;
  }
  case 'classic-focus':{
   const tick=size*.16;c.fillStyle=backing;c.globalAlpha=.45*e;c.fillRect(-hw-pad,-hh,width+pad*2,hh*2);c.globalAlpha=e;c.beginPath();
   for(const side of [-1,1])for(const vertical of [-1,1]){
    const x=side*(hw+pad),y=vertical*hh;c.moveTo(x-side*tick,y);c.lineTo(x,y);c.lineTo(x,y-vertical*tick);
   }c.stroke();break;
  }
  default:break;
 }
 c.restore();
}
