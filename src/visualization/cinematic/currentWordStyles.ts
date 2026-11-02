/** Independent, single-word accents. No duplicate lyric text or estimated timing. */
export const CURRENT_WORD_STYLES = [
 {id:'lift',name:'Silk Lift',detail:'A soft rise and settle'},
 {id:'bloom',name:'Bloom',detail:'A rounded expansion with a gentle rebound'},
 {id:'underline',name:'Ink Underline',detail:'A flowing underline follows the syllables'},
 {id:'halo',name:'Orbit Halo',detail:'Two fine arcs turn around the word'},
 {id:'ribbon',name:'Satin Ribbon',detail:'A curved ribbon flows beneath the word'},
 {id:'spotlight',name:'Glass Spotlight',detail:'A translucent capsule breathes behind the word'},
 {id:'sparkle',name:'Constellation',detail:'Small stars trace the word edges'},
 {id:'brackets',name:'Focus Brackets',detail:'Fine corners ease inward'},
 {id:'tilt',name:'Pendulum',detail:'A slight tilt swings back to rest'},
 {id:'ripple',name:'Ripple',detail:'Two expanding elliptical ripples'}
] as const;
export type CurrentWordStyle = typeof CURRENT_WORD_STYLES[number]['id'];
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const wordStyleEnvelope=(progress:number)=>Math.sin(Math.PI*clamp(progress));

/** Applied before bounds fitting, so the accent and glyphs stay within the stage. */
export function currentWordPose(style:CurrentWordStyle,progress:number,energy:number){
 const e=wordStyleEnvelope(progress)*energy;
 switch(style){
  case 'lift':return {y:-.18*e,scaleX:1+.045*e,scaleY:1+.045*e,rotation:0};
  case 'bloom':{
   const bloom=e*(.65+.35*Math.sin(progress*Math.PI*2));
   return {y:0,scaleX:1+.085*bloom,scaleY:1+.11*bloom,rotation:0};
  }
  case 'tilt':return {y:-.06*e,scaleX:1+.025*e,scaleY:1+.025*e,rotation:.055*e*Math.cos(progress*Math.PI)};
  default:return {y:0,scaleX:1,scaleY:1,rotation:0};
 }
}

export function drawCurrentWordAccent(c:CanvasRenderingContext2D,style:CurrentWordStyle,width:number,size:number,progress:number,color:string,energy:number){
 const e=wordStyleEnvelope(progress)*energy;
 if(e<=.001)return;
 const hw=width*.5,hh=size*.53;
 c.save();
 c.strokeStyle=color;c.fillStyle=color;c.lineWidth=Math.max(1.25,size*.026);
 c.globalAlpha=.8*e;
 switch(style){
  case 'underline':{
   c.lineCap='round';c.beginPath();
   c.moveTo(-hw,hh);c.bezierCurveTo(-hw*.3,hh+size*.06*Math.sin(progress*Math.PI*2),hw*.4,hh,hw,hh);
   c.stroke();
   c.globalAlpha=.95*e;
   c.beginPath();c.arc(-hw+width*progress,hh,size*.035,0,Math.PI*2);c.fill();break;
  }
  case 'halo':{
   for(let i=0;i<2;i++){
    const angle=progress*Math.PI*2+i*Math.PI;
    c.beginPath();c.ellipse(0,0,hw+size*.08,hh,0,angle,angle+Math.PI*.7);c.stroke();
   }break;
  }
  case 'ribbon':{
   c.lineWidth=Math.max(2,size*.055);c.lineCap='round';
   c.beginPath();c.moveTo(-hw,hh*.85);
   c.bezierCurveTo(-hw*.45,hh+size*.12*Math.sin(progress*Math.PI*2),hw*.45,hh-size*.12*Math.cos(progress*Math.PI*2),hw,hh*.85);
   c.stroke();break;
  }
  case 'spotlight':{
   c.globalAlpha=.17*e;c.beginPath();
   c.roundRect(-hw-size*.06,-hh,width+size*.12,hh*2,Math.min(hh,size*.2));c.fill();
   c.globalAlpha=.48*e;c.lineWidth=Math.max(1,size*.016);c.stroke();break;
  }
  case 'sparkle':{
   for(let i=0;i<3;i++){
    const a=progress*Math.PI*2+i*Math.PI*2/3;
    const x=Math.cos(a)*(hw+size*.04),y=Math.sin(a)*hh,r=size*(.035+.02*Math.sin(progress*Math.PI+i));
    c.beginPath();c.moveTo(x-r,y);c.lineTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.closePath();c.fill();
   }break;
  }
  case 'brackets':{
   const edge=hw+size*.08*(1-e),top=hh*.84,tick=size*.1;
   c.beginPath();
   for(const side of [-1,1])for(const vertical of [-1,1]){
    c.moveTo(side*(edge-tick),vertical*top);c.lineTo(side*edge,vertical*top);c.lineTo(side*edge,vertical*(top-tick));
   }c.stroke();break;
  }
  case 'ripple':{
   for(let i=0;i<2;i++){
    const p=(progress+i*.5)%1;
    c.globalAlpha=.45*e*(1-p);c.beginPath();
    c.ellipse(0,0,hw+size*.02+p*size*.08,hh*(.85+p*.22),0,0,Math.PI*2);c.stroke();
   }break;
  }
  // The three glyph-motion styles need no extra decoration.
  default:break;
 }
 c.restore();
}
