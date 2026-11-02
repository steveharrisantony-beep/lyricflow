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

export const choreographyTiming=(duration:number)=>({intro:Math.min(.58,duration*.28),outro:Math.min(.30,duration*.14)});
export function choreographyPhase(age:number,duration:number,animated=true):'intro'|'hold'|'outro'|'still'{
 if(!animated)return 'still';
 const timing=choreographyTiming(duration);
 return age<timing.intro?'intro':age>duration-timing.outro?'outro':'hold';
}
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const stillPose={x:0,y:0,rotation:0,scaleX:1,scaleY:1,shear:0,alpha:1,reveal:1,tracking:0,revealX:1,clipSide:1,iris:1};

/** Media-clock choreography: deterministic stagger, continuous hold and a paired exit.
 * Inspired by the approaches documented in docs/lyric-animation-references.md.
 * Bounded stagger windows also work on short cues and long multilingual lines.
 */
export function letterMotionPose(motion:LyricMotion,age:number,index:number,count:number,energy:number,connected=false,duration=8,lineIndex=0){
 if(energy<=.001)return stillPose;
 const gain=Math.min(1.25,energy)*(connected?.55:1),{intro,outro}=choreographyTiming(duration);
 const n=(index-(count-1)/2)/Math.max(1,(count-1)/2),forward=index/Math.max(1,count-1),direction=lineIndex%2===0?-1:1;
 let rank=motion==='fisheye'||motion==='portal'||motion==='scatter'?Math.abs(n):motion==='alternating'&&direction>0?1-forward:forward;
 if(motion==='fan'||motion==='iris'||motion==='rosette')rank=Math.abs(n);
 if(motion==='curtain-sweep'||motion==='concertina')rank=1-forward;
 if(motion==='letter-rain')rank=((Math.imul(index+1,2654435761)^Math.imul(count,2246822519))>>>0)/4294967295;
 const enter=clamp((age-intro*.32*rank)/(intro*.68));
 const leave=clamp((age-(duration-outro)-outro*.24*(1-rank))/(outro*.76));
 const incoming=(1-enter)**4,outgoing=leave**3;
 const phase=age*1.9-index*.36,sign=index%2?1:-1;
 let x=0,y=0,rotation=0,scaleX=1,scaleY=1,shear=0,reveal=1,tracking=0,revealX=1,clipSide=1,iris=1;
 switch(motion){
  case 'ship':
   x=-.65*incoming+.5*outgoing;y=.32*incoming-.18*outgoing+.024*Math.sin(phase*.65);
   rotation=-.10*incoming+.08*outgoing;scaleX=scaleY=1-.16*incoming+.12*outgoing;break;
  case 'fisheye':{
   const lens=Math.exp(-(((n-.65*Math.sin(age*.7))*2.1)**2));
   scaleX=1+.065*lens-.45*incoming-.35*outgoing;scaleY=1+.10*lens-.5*incoming-.5*outgoing;
   y=.035*Math.sin(phase*.6);break;
  }
  case 'orbit':
   x=.09*Math.cos(phase*.65)+n*.6*incoming-n*.5*outgoing;
   y=.07*Math.sin(phase*.65)+sign*.45*incoming-sign*.5*outgoing;
   rotation=.025*Math.sin(phase*.65)+sign*.18*(incoming+outgoing);break;
  case 'cascade':
   y=-.85*incoming+.72*outgoing+.028*Math.sin(phase);rotation=-.045*incoming+.06*outgoing;
   reveal=clamp(enter*1.6)*(1-outgoing);break;
  case 'scatter':
   x=n*.72*(incoming+outgoing);y=sign*.55*incoming-sign*.48*outgoing+.025*Math.sin(phase*.8);
   rotation=sign*(.24*incoming+.2*outgoing)+.016*Math.sin(phase);break;
  case 'elastic':{
   const spring=Math.sin(enter*Math.PI*3)*(1-enter)**2;
   y=.55*incoming+.12*spring-.2*outgoing+.022*Math.sin(phase);
   scaleX=1+.15*spring+.18*outgoing;scaleY=1-.12*spring-.5*outgoing;break;
  }
  case 'hinge':
   scaleX=Math.max(.06,Math.cos((incoming+outgoing)*Math.PI*.48));
   shear=sign*(.28*incoming-.24*outgoing)+.012*Math.sin(phase*.8);
   y=.12*incoming-.12*outgoing;break;
  case 'carnival':
   y=sign*.65*incoming-sign*.55*outgoing-.045*(.5+.5*Math.sin(phase*1.25));
   rotation=sign*.12*(incoming+outgoing);scaleX=scaleY=1+.025*Math.sin(phase*1.25);break;
  case 'broadside':
   x=-.85*incoming+.85*outgoing+n*.025*Math.sin(age*.9);y=.18*incoming-.18*outgoing;
   shear=-.20*incoming-.15*outgoing;break;
  case 'portal':
   scaleX=scaleY=1-.65*incoming+.48*outgoing+.018*Math.sin(age*1.4+index*.08);
   rotation=-n*.20*incoming+n*.18*outgoing;y=.025*Math.sin(phase*.7);break;
  case 'alternating':
   // Whole-line side travel lives in lineMotionPose; this is its letter follow-through.
   x=direction*.12*incoming-direction*.12*outgoing;y=.025*Math.sin(phase*.6);break;
  case 'wave':
   y=.14*Math.sin(phase*1.2)+.65*incoming+.6*outgoing;
   rotation=.035*Math.cos(phase*1.2);reveal=clamp(enter*1.8)*(1-outgoing);break;
  case 'venetian':{
   const fold=incoming+outgoing,pulse=Math.max(0,Math.sin(age*1.8-index*.48))**3;
   // A travelling shutter fold stays visible during the readable hold.
   scaleY=Math.max(.08,Math.cos(fold*Math.PI*.48))*(1-.25*pulse);
   y=.46*(1-scaleY)*sign;shear=.08*sign*(incoming-outgoing);break;
  }
  case 'fan':{
   const opening=.11+.045*Math.sin(age*1.1),arch=(1-n*n)*(.14+.055*Math.cos(age*1.1));
   rotation=n*(.65*incoming-.40*outgoing)-n*opening;
   y=(.35+.55*Math.abs(n))*incoming-.70*outgoing-arch;
   x=n*.22*(incoming+outgoing);break;
  }
  case 'curtain-sweep':
   // The readable hold travels as a single banner in lineMotionPose.
   y=(.32+.50*forward)*incoming-(.32+.50*(1-forward))*outgoing;
   rotation=.18*(incoming+outgoing);shear=-.12*incoming+.12*outgoing;break;
  case 'letter-rain':{
   const gust=Math.sin(index*12.9898+count*.31),sway=Math.cos(index*7.37);
   x=gust*(.22*incoming+.18*outgoing)+.065*Math.sin(age*.95+index*.73);
   y=-.95*incoming+.90*outgoing+.10*Math.sin(age*1.2+index*.83);
   rotation=gust*(.32*incoming-.25*outgoing)+.10*Math.sin(age*1.55+sway*3);break;
  }
  case 'concertina':
   // Tracking changes glyph positions, with no breathing zoom or vertical bob.
   tracking=-.92*incoming-.85*outgoing+phraseTracking(motion,age,1);
   scaleX=1-.18*incoming-.35*outgoing;shear=.13*sign*(incoming-outgoing);break;
  case 'silk-stretch':{
   const silk=.13*Math.sin(phase*.9);
   scaleX=1-.42*incoming-.40*outgoing-silk*.38;scaleY=1+.85*incoming+.90*outgoing+silk;
   y=-.65*incoming+.65*outgoing+.46*(1-scaleY);break;
  }
  case 'domino':{
   const knock=Math.max(0,Math.sin(age*2.0-index*.65))**3;
   rotation=-1.12*incoming+.90*outgoing+.20*knock;
   // One-way tipping from the lower edge, rather than a back-and-forth swing.
   x=.46*Math.sin(rotation);y=.46*(1-Math.cos(rotation));break;
  }
  case 'pendulum':{
   const swing=.13*Math.sin(age*1.35-Math.floor(index/4)*.5);
   rotation=sign*.42*incoming-sign*.32*outgoing+swing;
   x=-.50*Math.sin(rotation);y=.50*(Math.cos(rotation)-1);break;
  }
  case 'helix':{
   const spiral=age*2.1-index*.62,depth=Math.cos(spiral);
   y=.075*Math.sin(spiral)+.35*sign*(incoming-outgoing);
   x=.065*Math.sin(spiral*2)+n*.24*(incoming+outgoing);
   scaleX=scaleY=1+.13*depth-.2*incoming-.18*outgoing;break;
  }
  case 'zipper':
   clipSide=sign;revealX=clamp(enter*1.5)*(1-outgoing);
   x=sign*(.36*incoming-.36*outgoing);
   y=sign*(.065+.035*Math.sin(age*1.7)+.08*(incoming+outgoing));break;
  case 'iris':
   // A shared lens breathes the whole composition; each aperture owns its reveal.
   iris=clamp(enter*1.55)*(1-outgoing);break;
  case 'rosette':{
   const angle=forward*Math.PI*2,bloom=.5+.5*Math.sin(age*1.05);
   const petal=incoming*.72+outgoing*.78;
   x=Math.cos(angle)*(petal+.065*bloom);
   y=Math.sin(angle)*(petal+.105*bloom);
   rotation=Math.sin(angle)*(.48*incoming-.40*outgoing+.12*bloom);
   scaleX=scaleY=1-.22*incoming-.2*outgoing;break;
  }
  case 'switchback':{
   const lane=Math.floor(index/3)%2?1:-1,pulse=Math.sin(age*1.4);
   x=lane*(.75*incoming-.65*outgoing)+lane*.055*pulse;
   y=lane*.10*(incoming+outgoing);
   scaleX=1-.065*Math.abs(pulse);shear=lane*(.14*incoming+.10*outgoing+.065*pulse);break;
  }
 }
 return {x:x*gain,y:y*gain,rotation:rotation*gain,scaleX:1+(scaleX-1)*Math.min(1,gain),scaleY:1+(scaleY-1)*Math.min(1,gain),shear:shear*gain,
  alpha:clamp(enter*2.5)*(1-outgoing),reveal,tracking:tracking*Math.min(1,gain),revealX,clipSide,iris};
}

/** Spacing breathes across both word anchors and glyph positions. */
export function phraseTracking(motion:LyricMotion,age:number,energy:number){
 return motion==='concertina'&&energy>.001?(.02+.065*(.5+.5*Math.sin(age*1.1)))*Math.min(1,energy):0;
}
export interface LineMotionPose{x:number;scale?:number}
/** Whole-composition motion is reserved for designs with a clear line-level identity. */
export function lineMotionPose(motion:LyricMotion,age:number,duration:number,lineIndex:number,w:number,energy:number):LineMotionPose{
 if(energy<=.001)return {x:0};
 const gain=Math.min(1,energy);
 if(motion==='curtain-sweep')return {x:w*.035*Math.sin(age*.65)*gain};
 if(motion==='iris')return {x:0,scale:1-.07*(.5+.5*Math.sin(age*.95))*gain};
 if(motion!=='alternating')return {x:0};
 const {intro,outro}=choreographyTiming(duration),direction=lineIndex%2===0?-1:1;
 return {x:direction*w*.32*((1-clamp(age/intro))**4-clamp((age-duration+outro)/outro)**3)*Math.min(1,energy)};
}
