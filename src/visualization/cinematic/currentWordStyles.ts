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
 {id:'ripple',name:'Ripple',detail:'Two expanding elliptical ripples'},
 {id:'classic-capsule',name:'Classic Capsule',detail:'The original rounded word frame'},
 {id:'classic-ticket',name:'Classic Ticket',detail:'The original filled editorial ticket'},
 {id:'classic-grid',name:'Classic Grid',detail:'The original mosaic word cell'},
 {id:'classic-ring',name:'Classic Ring',detail:'The original expanding word ring'},
 {id:'classic-contours',name:'Classic Contours',detail:'The original layered dimensional frames'},
 {id:'classic-emblem',name:'Classic Emblem',detail:'The original star and heart emblems'},
 {id:'classic-focus',name:'Classic Focus',detail:'The original luminous plate with corner ticks'},
 {id:'classic-progress',name:'Classic Progress',detail:'The original karaoke progress bar'}
] as const;
export const ALL_CURRENT_WORD_STYLE_IDS=CURRENT_WORD_STYLES.map(style=>style.id);
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

export function drawCurrentWordAccent(c:CanvasRenderingContext2D,style:CurrentWordStyle,width:number,size:number,progress:number,color:string,energy:number,wordText=""){
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
  case 'classic-capsule':
  case 'classic-ticket':
  case 'classic-grid':{
   const pad=size*.1;
   c.beginPath();
   if(style==='classic-capsule')c.roundRect(-hw-pad,-hh-pad,width+pad*2,hh*2+pad*2,hh*.85);
   else c.rect(-hw-pad,-hh-pad,width+pad*2,hh*2+pad*2);
   if(style==='classic-ticket'){c.globalAlpha=.17*e;c.fill();c.globalAlpha=.8*e;}
   c.stroke();break;
  }
  case 'classic-ring':{
   c.beginPath();c.ellipse(0,0,hw+size*(.08+.07*progress),hh*(1+.08*progress),0,0,Math.PI*2);c.stroke();break;
  }
  case 'classic-contours':{
   for(let layer=1;layer<=2;layer++){
    const offset=layer*size*.065*(1+e*.4);c.globalAlpha=.5*e/layer;
    c.strokeRect(-hw+offset,-hh-offset*.6,width,hh*2);
   }break;
  }
  case 'classic-emblem':{
   const x=hw+size*.06,y=-hh*.72,r=size*.07;
   c.beginPath();
   if(/heart|love|kiss/i.test(wordText)){
    c.moveTo(x,y+r);c.bezierCurveTo(x-r*2,y-r*.4,x-r,y-r*1.7,x,y-r*.6);c.bezierCurveTo(x+r,y-r*1.7,x+r*2,y-r*.4,x,y+r);c.fill();break;
   }
   for(let i=0;i<8;i++){
    const a=i*Math.PI/4,rad=i%2===0?r:r*.38;
    if(i===0)c.moveTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad);else c.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad);
   }c.closePath();c.fill();break;
  }
  case 'classic-focus':{
   const pad=size*.075,left=-hw-pad,top=-hh,widthBox=width+pad*2,height=hh*2,tick=size*.12;
   c.globalAlpha=.16*e;c.fillRect(left,top,widthBox,height);c.globalAlpha=.9*e;c.beginPath();
   for(const side of [-1,1])for(const vertical of [-1,1]){
    const x=side*(hw+pad),y=vertical*hh;
    c.moveTo(x-side*tick,y);c.lineTo(x,y);c.lineTo(x,y-vertical*tick);
   }c.stroke();break;
  }
  case 'classic-progress':{
   const y=hh*.85,bar=Math.max(2,size*.04);
   c.globalAlpha=.18*e;c.fillRect(-hw,y,width,bar);
   c.globalAlpha=.95*e;c.fillRect(-hw,y,width*progress,bar);break;
  }
  // The three glyph-motion styles need no extra decoration.
  default:break;
 }
 c.restore();
}
