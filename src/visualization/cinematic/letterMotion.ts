import type {LyricMotion} from './kineticTypography';

// Keep shaping and right-to-left ordering intact. Romanized Latin text can animate normally.
const connectedScripts=/[\u0590-\u08ff\u0900-\u109f\u1780-\u18af\u1a00-\u1cff\u200c\u200d\ua800-\uaaff\ufb1d-\ufdff\ufe70-\ufeff\u{11000}-\u{11fff}\u{1e900}-\u{1e95f}]/u;
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export const canAnimateLetters=(text:string)=>!connectedScripts.test(text);
export interface LetterUnit{text:string;center:number;width:number;index:number;count:number;connected:boolean}

/** Measure once per cue/font/size. Never split connected scripts or combining graphemes. */
export function buildLetterUnits(c:CanvasRenderingContext2D,text:string):LetterUnit[]{
 const connected=!canAnimateLetters(text);
 const parts=connected?[text]:Array.from(segmenter.segment(text),part=>part.segment);
 const fullWidth=c.measureText(text).width;
 let prefix='',previous=0;
 return parts.map((part,index)=>{
  prefix+=part;
  const next=c.measureText(prefix).width;
  const unit={text:part,center:(previous+next-fullWidth)/2,width:c.measureText(part).width,index,count:parts.length,connected};
  previous=next;return unit;
 });
}

/** Continuous, bounded motion in font-size units; the hold never becomes static. */
export function letterMotionPose(motion:LyricMotion,age:number,index:number,count:number,energy:number,connected=false){
 if(energy===0)return {x:0,y:0,rotation:0,scaleX:1,scaleY:1,shear:0};
 const gain=energy*(connected?.55:1),phase=age*2.25-index*.54;
 const delay=Math.min(.2,index*.012),entry=Math.exp(-Math.max(0,age-delay)*5.5);
 const n=(index-(count-1)/2)/Math.max(1,count/2);
 let x=0,y=.025*Math.sin(phase),rotation=.012*Math.sin(phase*.8),scaleX=1,scaleY=1,shear=0;
 switch(motion){
  case 'wave':y=.22*Math.sin(phase*1.15);rotation=.065*Math.cos(phase*1.15);break;
  case 'alternating':y=.045*Math.sin(phase);x=.015*Math.cos(phase*.7);break;
  case 'ship':y+=entry*.28;x-=entry*.14;scaleX=scaleY=1-entry*.12+.035*Math.sin(phase*.6);rotation-=entry*.1;break;
  case 'fisheye':{
   const bulge=(1-n*n)*(.045+.025*Math.sin(age*1.4));scaleX=1+bulge;scaleY=1+bulge*1.5;
   y+=Math.sin(n*Math.PI+age)*.07;break;
  }
  case 'orbit':x=.065*Math.cos(phase*.65);y=.12*Math.sin(phase*.65);rotation=.04*Math.sin(phase*.65);break;
  case 'cascade':y-=entry*.55;x-=entry*.12;rotation-=entry*.12;y+=.045*Math.sin(phase);break;
  case 'scatter':{
   const sign=index%2?1:-1;x=sign*entry*.25;y+=sign*entry*.3;rotation=sign*(entry*.25+.045*Math.sin(age*1.3+index));break;
  }
  case 'elastic':{
   const t=Math.max(0,age-delay),spring=Math.exp(-t*4)*Math.sin(t*14);
   scaleX=1+spring*.16+.035*Math.sin(phase);scaleY=1-spring*.13-.025*Math.sin(phase);y+=spring*.22;break;
  }
  case 'hinge':shear=(index%2?1:-1)*(.2*entry+.045*Math.sin(phase));scaleX=1-entry*.18;rotation+=entry*.08;break;
  case 'carnival':{
   const pulse=Math.sin(age*3.4-index*.22)**2;y=-.10*pulse;scaleX=scaleY=1+.055*pulse;rotation=.04*Math.sin(phase);break;
  }
  case 'broadside':x=-entry*.48;shear=-.055+.04*Math.sin(phase*.8);y+=.035*Math.sin(phase*.65);break;
  case 'portal':scaleX=scaleY=1-entry*.23+.035*Math.sin(phase*.7);rotation=entry*.12+.025*Math.sin(phase*.6);break;
 }
 return {x:x*gain,y:y*gain,rotation:rotation*gain,scaleX:1+(scaleX-1)*gain,scaleY:1+(scaleY-1)*gain,shear:shear*gain};
}
