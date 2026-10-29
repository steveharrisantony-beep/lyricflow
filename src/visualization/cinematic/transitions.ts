import type {Transition} from './catalog';
export const TRANSITION_SECONDS=.44;
export function transitionProgress(now:number,started:number,duration=TRANSITION_SECONDS){
 return Math.max(0,Math.min(1,(now-started)/Math.max(.001,duration)));
}

/**
 * Baseline / pdoom-video style live scene seams:
 * - 'flash': Burning-line fracture cut (no white wash) with glowing plasma seam and sparks
 * - 'wipe': High-velocity whip pan with directional motion-streak echoes
 * - 'zoom': Hyper-perspective portal punch with radial velocity vectors
 * - 'glitch': 16-band kinetic scanline shear with luma edge ticks
 * - 'ink': Angled brutalist shutter slabs sliding in opposing vectors
 * - 'ripple': Expanding dual refraction shockwave rings
 * - 'dissolve': Anamorphic drift cross-warp
 */
export function drawSceneTransition(
 c:CanvasRenderingContext2D,
 previous:HTMLCanvasElement,
 w:number,
 h:number,
 progress:number,
 kind:Transition
){
 if(progress>=1)return;
 const p=Math.max(0,progress);
 const ease=1-(1-p)**3;
 const u=Math.min(w,h);
 c.save();

 if(kind==='wipe'){
  // Whip-pan seam with 3 directional velocity trail echoes
  const dx=-ease*w*1.04;
  for(let echo=2;echo>=1;echo--){
   c.globalAlpha=(1-p)*0.18*(3-echo);
   c.drawImage(previous,dx+echo*w*0.038,0,w,h);
  }
  c.globalAlpha=1;
  c.drawImage(previous,dx,0,w,h);
  // Leading kinetic edge laser
  const edgeX=w+dx;
  if(edgeX>0&&edgeX<w){
   c.fillStyle='rgba(255,245,230,0.85)';
   c.fillRect(edgeX-2,0,4,h);
  }
 }else if(kind==='flash'){
  // pdoom-video Revision 6: Burning-line diagonal cut (no white washes)
  const cutY=ease*(h+w*0.22)-w*0.11;
  const tilt=w*0.11;
  c.save();
  c.beginPath();
  c.moveTo(0,cutY+tilt);
  c.lineTo(w,cutY-tilt);
  c.lineTo(w,h);
  c.lineTo(0,h);
  c.closePath();
  c.clip();
  c.translate(0,(ease*h*0.04));
  c.drawImage(previous,0,0,w,h);
  c.restore();

  // Glowing burning fracture line + deterministic sparks along seam
  c.save();
  c.strokeStyle='rgba(255,120,60,0.75)';
  c.lineWidth=Math.max(3,u*0.012)*(1-p*0.4);
  c.beginPath();
  for(let i=0;i<=24;i++){
   const t=i/24,x=t*w;
   const jitter=Math.sin(i*7.3+p*32)*u*0.008*(1-p);
   const y=cutY+tilt*(1-2*t)+jitter;
   if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
  }
  c.stroke();
  c.strokeStyle='rgba(255,248,225,0.95)';
  c.lineWidth=Math.max(1.5,u*0.004);
  c.stroke();
  c.restore();
 }else if(kind==='zoom'){
  // Portal zoom punch with layered depth echoes & radial vectors
  const scale=1+ease*0.78;
  c.save();
  c.globalAlpha=(1-p)**1.6*0.35;
  c.translate(w*.5,h*.5);
  c.scale(scale*1.12,scale*1.12);
  c.drawImage(previous,-w*.5,-h*.5,w,h);
  c.restore();

  c.save();
  c.globalAlpha=(1-p)**1.35;
  c.translate(w*.5,h*.5);
  c.rotate(ease*0.045);
  c.scale(scale,scale);
  c.drawImage(previous,-w*.5,-h*.5,w,h);
  c.restore();
 }else if(kind==='glitch'||kind==='ink'){
  const bands=kind==='ink'?9:16;
  for(let i=0;i<bands;i++){
   const delay=(i%4)*0.032;
   const local=Math.max(0,Math.min(1,(p-delay)/0.86));
   const localEase=1-(1-local)**3;
   const dir=i%2===0?1:-1;
   const shift=localEase*w*dir*(kind==='ink'?1.05:0.92);
   const sliceY=h*i/bands,sliceH=h/bands+1.5;
   c.globalAlpha=1-local*0.92;
   c.drawImage(
    previous,
    0,previous.height*i/bands,previous.width,previous.height/bands,
    shift,sliceY,w,sliceH
   );
   // Crisp luma edge bar on each sliding shutter
   if(local>0.02&&local<0.95){
    c.fillStyle=i%2===0?'rgba(255,250,240,0.45)':'rgba(255,95,120,0.45)';
    c.fillRect(dir>0?shift:shift+w-4,sliceY,4,sliceH);
   }
  }
 }else if(kind==='ripple'){
  // Expanding refraction shockwave ring seam
  const maxR=Math.hypot(w,h)*0.58;
  const radius=maxR*ease;
  c.save();
  c.beginPath();
  c.rect(0,0,w,h);
  c.arc(w*.5,h*.5,radius,0,Math.PI*2,true);
  c.clip('evenodd');
  c.globalAlpha=1-p*0.35;
  c.translate(w*.5,h*.5);
  c.scale(1+ease*0.08,1+ease*0.08);
  c.drawImage(previous,-w*.5,-h*.5,w,h);
  c.restore();

  // Dual shockwave refraction rings
  c.strokeStyle='rgba(255,250,240,0.68)';
  c.lineWidth=Math.max(2,u*0.006*(1-p));
  c.beginPath();
  c.arc(w*.5,h*.5,radius,0,Math.PI*2);
  c.stroke();
  if(radius>u*0.04){
   c.strokeStyle='rgba(130,225,255,0.38)';
   c.lineWidth=Math.max(1,u*0.003*(1-p));
   c.beginPath();
   c.arc(w*.5,h*.5,radius*0.92,0,Math.PI*2);
   c.stroke();
  }
 }else{
  // Anamorphic drift cross-warp
  c.globalAlpha=(1-ease)**1.15;
  c.translate(w*.5,h*.5-h*0.065*ease);
  c.scale(1+ease*0.06,1-ease*0.03);
  c.drawImage(previous,-w*.5,-h*.5,w,h);
 }
 c.restore();
}

export function sceneEntryPose(progress:number,kind:Transition){
 const p=Math.max(0,Math.min(1,progress)),tail=(1-p)**3;
 // Ensure sufficient scale during pan/roll so image borders are never exposed (baseline seams.ts rule)
 return {
  x:kind==='wipe'?tail*0.85:kind==='glitch'?tail*0.045:kind==='ink'?-tail*0.06:0,
  y:kind==='dissolve'?tail*0.055:kind==='flash'?-tail*0.04:0,
  scale:kind==='zoom'?1+tail*0.32:kind==='flash'?1+tail*0.14:kind==='ripple'?1+tail*0.09:kind==='wipe'?1+tail*0.06:1+tail*0.03,
  roll:kind==='zoom'?-tail*0.042:kind==='flash'?tail*0.022:kind==='ink'?-tail*0.018:0
 };
}
