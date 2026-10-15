import type {Transition} from './catalog';
/** Composite a frozen outgoing background. Lyrics stay sharp and follow the current clock. */
export function drawSceneTransition(c:CanvasRenderingContext2D,previous:HTMLCanvasElement,w:number,h:number,progress:number,kind:Transition){
 if(progress>=1)return;
 const p=Math.max(0,progress),e=p*p*(3-2*p);
 c.save();
 if(kind==='wipe'||kind==='ink'||kind==='glitch'){
  c.beginPath();
  const slices=kind==='wipe'?1:12;
  for(let i=0;i<slices;i++){
   const shift=kind==='wipe'?e:Math.min(1,e+(i%3-1)*.08*Math.sin(p*Math.PI));
   c.rect(w*shift,h*i/slices,w*(1-shift),h/slices+1);
  }c.clip();
 }else if(kind==='ripple'){
  c.beginPath();c.rect(0,0,w,h);c.arc(w/2,h/2,Math.hypot(w,h)*e/2,0,Math.PI*2,true);c.clip('evenodd');
 }else{c.globalAlpha=1-e}
 if(kind==='zoom'){
  const scale=1+e*.16;c.translate(w/2,h/2);c.scale(scale,scale);c.translate(-w/2,-h/2);
 }
 c.drawImage(previous,0,0,w,h);c.restore();
}
