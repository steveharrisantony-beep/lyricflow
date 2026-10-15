import type {Transition} from './catalog';
export const TRANSITION_SECONDS=.44;
export function transitionProgress(now:number,started:number,duration=TRANSITION_SECONDS){return Math.max(0,Math.min(1,(now-started)/Math.max(.001,duration)))}
/** Incoming and outgoing scenes keep running. All transforms use one real-time progress. */
export function drawSceneTransition(c:CanvasRenderingContext2D,previous:HTMLCanvasElement,w:number,h:number,progress:number,kind:Transition){
 if(progress>=1)return;
 const p=Math.max(0,progress),ease=1-(1-p)**3;
 c.save();
 if(kind==='wipe'){
  c.translate(-ease*w,0);c.drawImage(previous,0,0,w,h);
 }else if(kind==='zoom'||kind==='flash'){
  c.globalAlpha=(1-p)**1.4;
  const scale=1+ease*(kind==='zoom'?.65:.18);
  c.translate(w*.5,h*.5);c.rotate(ease*.025);c.scale(scale,scale);c.drawImage(previous,-w*.5,-h*.5,w,h);
 }else if(kind==='glitch'||kind==='ink'){
  const bands=kind==='ink'?7:12;
  for(let i=0;i<bands;i++){
   const local=Math.max(0,Math.min(1,(p-i%3*.035)/.88)),shift=(1-(1-local)**3)*w*(i%2?1:-1);
   c.globalAlpha=1-local;c.drawImage(previous,0,previous.height*i/bands,previous.width,previous.height/bands,shift,h*i/bands,w,h/bands+1);
  }
 }else if(kind==='ripple'){
  c.beginPath();c.rect(0,0,w,h);c.arc(w*.5,h*.5,Math.hypot(w,h)*ease*.5,0,Math.PI*2,true);c.clip('evenodd');
  c.globalAlpha=1-p*.4;c.drawImage(previous,0,0,w,h);
 }else{
  c.globalAlpha=1-ease;c.translate(0,-h*.07*ease);c.drawImage(previous,0,0,w,h);
 }
 c.restore();
}

export function sceneEntryPose(progress:number,kind:Transition){
 const p=Math.max(0,Math.min(1,progress)),tail=(1-p)**3;
 return {x:kind==='wipe'?tail:kind==='glitch'?tail*.035:0,
  y:kind==='dissolve'?tail*.06:0,
  scale:kind==='zoom'?1+tail*.28:kind==='flash'?1+tail*.12:kind==='ripple'?1+tail*.06:1,
  roll:kind==='zoom'?-tail*.035:0};
}
