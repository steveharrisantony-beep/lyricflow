import type {ThemePalette} from '../catalog';
import type {Pulse} from '../paint';
import {frequencyDrive} from './AdvancedThemes';

export const SPECTRUM_SCENES=['spectrum-prism','radial-spectrum','spectrum-waterfall','spectrum-ribbons'] as const;
export type SpectrumSceneId=typeof SPECTRUM_SCENES[number];
export const isSpectrumScene=(id:string):id is SpectrumSceneId=>(SPECTRUM_SCENES as readonly string[]).includes(id);
const BINS=64,ROWS=96,HISTORY_HZ=24,TAU=Math.PI*2;
const clamp=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
export type SpectrumAudio=Pulse & {bands?:Float32Array};

/** Bounded analyzer display state. Audio capture and FFT remain owned by the existing audio graph. */
export class SpectrumState{
 readonly levels=new Float32Array(BINS);
 readonly peaks=new Float32Array(BINS);
 readonly history=new Float32Array(BINS*ROWS);
 private holds=new Float32Array(BINS);
 private lastClock:number|null=null;
 private accumulator=0;
 cursor=0;
 revision=0;
 reset(){this.levels.fill(0);this.peaks.fill(0);this.history.fill(0);this.holds.fill(0);this.lastClock=null;this.accumulator=0;this.cursor=0;this.revision++;}
 copyFrom(other:SpectrumState){
  this.levels.set(other.levels);this.peaks.set(other.peaks);this.history.set(other.history);this.holds.set(other.holds);
  this.lastClock=other.lastClock;this.accumulator=other.accumulator;this.cursor=other.cursor;this.revision++;
 }
 update(p:SpectrumAudio,clock:number,reduced=false){
  const finiteClock=Number.isFinite(clock)?clock:0;
  if(this.lastClock!==null&&finiteClock<this.lastClock)this.reset();
  const dt=this.lastClock===null?1/60:Math.max(0,Math.min(.25,finiteClock-this.lastClock));
  this.lastClock=finiteClock;
  for(let i=0;i<BINS;i++){
   const target=frequencyDrive(p,p.bands,i/(BINS-1));
   const rate=target>this.levels[i]?24:7;
   this.levels[i]+=(target-this.levels[i])*(1-Math.exp(-dt*rate));
   if(this.levels[i]>=this.peaks[i]){this.peaks[i]=this.levels[i];this.holds[i]=.35;}
   else{
    const fallingTime=Math.max(0,dt-this.holds[i]);
    this.holds[i]=Math.max(0,this.holds[i]-dt);
    this.peaks[i]=Math.max(this.levels[i],this.peaks[i]-fallingTime*.36);
   }
  }
  if(reduced){
   // Retain the history position while allowing the newest stationary stripe to reflect sound.
   this.history.set(this.levels,((this.cursor+ROWS-1)%ROWS)*BINS);this.revision++;return;
  }
  this.accumulator+=dt;
  const ticks=Math.min(6,Math.floor((this.accumulator+1e-9)*HISTORY_HZ));
  if(ticks)this.accumulator-=ticks/HISTORY_HZ;
  for(let tick=0;tick<ticks;tick++){
   this.history.set(this.levels,this.cursor*BINS);this.cursor=(this.cursor+1)%ROWS;this.revision++;
  }
 }
}

type HistoryCanvas=HTMLCanvasElement|OffscreenCanvas;
const makeCanvas=():HistoryCanvas=>typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(BINS,ROWS):document.createElement('canvas');
const rgb=(hex:string)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];

export class SpectrumThemes{
 readonly state=new SpectrumState();
 private historyCanvas:HistoryCanvas|null=null;
 private historyContext:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null=null;
 private image:ImageData|null=null;
 private paintedRevision=-1;
 private paletteKey='';
 private lookup=new Uint8ClampedArray(256*4);
 constructor(private canvasFactory:()=>HistoryCanvas=makeCanvas){}
 reset(){this.state.reset();this.paintedRevision=-1;}
 copyFrom(other:SpectrumThemes){this.state.copyFrom(other.state);this.paintedRevision=-1;}

 private waterfall(c:CanvasRenderingContext2D,w:number,h:number,palette:ThemePalette,gain:number,reduced:boolean){
  if(!this.historyCanvas){
   this.historyCanvas=this.canvasFactory();this.historyCanvas.width=BINS;this.historyCanvas.height=ROWS;
   this.historyContext=this.historyCanvas.getContext('2d') as CanvasRenderingContext2D|null;
   this.image=this.historyContext?.createImageData(BINS,ROWS)??null;
  }
  if(!this.historyCanvas||!this.historyContext||!this.image)return;
  const key=[palette.background,palette.accent,palette.foreground,gain,reduced].join(':');
  if(key!==this.paletteKey){
   this.paletteKey=key;this.paintedRevision=-1;
   const bg=rgb(palette.background),accent=rgb(palette.accent),fg=rgb(palette.foreground);
   for(let v=0;v<256;v++){
    const level=clamp(v/255*gain)*(reduced?.5:1);
    for(let channel=0;channel<3;channel++){
     this.lookup[v*4+channel]=level<.68?bg[channel]+(accent[channel]-bg[channel])*(level/.68):accent[channel]+(fg[channel]-accent[channel])*((level-.68)/.32);
    }
    this.lookup[v*4+3]=255;
   }
  }
  if(this.paintedRevision!==this.state.revision){
   const data=this.image.data;
   for(let row=0;row<ROWS;row++)for(let bin=0;bin<BINS;bin++){
    const value=this.state.history[((this.state.cursor+row)%ROWS)*BINS+bin];
    const color=Math.round(clamp(value)*255)*4,offset=(row*BINS+bin)*4;
    data[offset]=this.lookup[color];data[offset+1]=this.lookup[color+1];data[offset+2]=this.lookup[color+2];data[offset+3]=255;
   }
   this.historyContext.putImageData(this.image,0,0);this.paintedRevision=this.state.revision;
  }
  c.imageSmoothingEnabled=true;
  c.drawImage(this.historyCanvas,w*.05,h*.08,w*.9,h*.84);
  const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,palette.background+'cc');shade.addColorStop(.72,palette.background+'00');shade.addColorStop(1,palette.background+'44');
  c.fillStyle=shade;c.fillRect(0,0,w,h);
  c.strokeStyle=palette.foreground+'44';c.lineWidth=1;
  c.beginPath();c.moveTo(w*.05,h*.92);c.lineTo(w*.95,h*.92);c.stroke();
 }

 render(c:CanvasRenderingContext2D,w:number,h:number,time:number,p:SpectrumAudio,id:SpectrumSceneId,
  palette:ThemePalette,intensity:number,reduced=false,detail=1,clock=time){
  this.state.update(p,clock,reduced);
  const u=Math.min(w,h),gain=Math.max(0,intensity),motion=reduced?.12:1;
  const {background,foreground,accent}=palette;
  const levels=this.state.levels,peaks=this.state.peaks;
  c.save();c.globalAlpha=1;c.fillStyle=background;c.fillRect(0,0,w,h);
  if(id==='spectrum-waterfall'){this.waterfall(c,w,h,palette,gain,reduced);c.restore();return;}
  const glow=c.createRadialGradient(w*.5,h*.55,0,w*.5,h*.55,u*.7);
  glow.addColorStop(0,accent+'24');glow.addColorStop(1,background);c.fillStyle=glow;c.fillRect(0,0,w,h);
  const stride=detail<.6?2:1;
  const drive=(i:number)=>clamp(levels[i]*gain)*motion;
  if(id==='spectrum-prism'){
   const left=w*.07,width=w*.86,base=h*.74,height=h*.55;
   const columns=BINS/stride,step=width/columns,bw=step*.68;
   const gradient=c.createLinearGradient(0,base,0,base-height);
   gradient.addColorStop(0,accent+'55');gradient.addColorStop(.65,accent);gradient.addColorStop(1,foreground);
   c.fillStyle=gradient;
   for(let i=0;i<BINS;i+=stride){
    const x=left+i/stride*step,level=drive(i),barHeight=Math.max(1,level*height);
    // Segmented lamps and a reflected floor share the same measured band.
    for(let y=0;y<barHeight;y+=u*.014)c.fillRect(x,base-y,bw,Math.min(u*.010,barHeight-y));
    c.save();c.globalAlpha=.13;c.fillRect(x,base+u*.02,bw,barHeight*.23);c.restore();
    c.fillStyle=foreground+'dd';c.fillRect(x,base-clamp(peaks[i]*gain)*height*motion-u*.006,bw,Math.max(1,u*.003));c.fillStyle=gradient;
   }
   c.strokeStyle=accent+'66';c.lineWidth=1;c.beginPath();c.moveTo(left,base+u*.012);c.lineTo(left+width,base+u*.012);c.stroke();
  }else if(id==='radial-spectrum'){
   c.translate(w*.5,h*.5);c.lineCap='round';
   const r=u*(.22+clamp(p.bass)*gain*.025*motion),count=BINS/stride;
   for(let j=0;j<count;j++){
    const i=j*stride,angle=j/count*TAU-Math.PI/2;
    const height=u*(.012+drive(i)*.24);
    const gradient=c.createLinearGradient(Math.cos(angle)*r,Math.sin(angle)*r,Math.cos(angle)*(r+height),Math.sin(angle)*(r+height));
    gradient.addColorStop(0,accent+'66');gradient.addColorStop(1,j%4===0?foreground:accent);
    c.strokeStyle=gradient;c.lineWidth=u*(detail<.6?.009:.005);
    c.beginPath();c.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);c.lineTo(Math.cos(angle)*(r+height),Math.sin(angle)*(r+height));c.stroke();
    const cap=r+u*(.012+clamp(peaks[i]*gain)*motion*.24);
    c.fillStyle=foreground+'aa';c.beginPath();c.arc(Math.cos(angle)*cap,Math.sin(angle)*cap,u*.002,0,TAU);c.fill();
   }
   c.strokeStyle=accent+'66';c.lineWidth=1;c.beginPath();c.arc(0,0,r*.91,0,TAU);c.stroke();
  }else{
   const left=w*.05,width=w*.9,base=h*.5,span=h*.38;
   // Three mirrored filled frequency envelopes, retaining the actual low-to-high order.
   for(let layer=2;layer>=0;layer--){
    const scale=1-layer*.25;
    c.beginPath();
    for(let side=1;side>=-1;side-=2){
     for(let step=0;step<BINS;step+=stride){
      const i=side===1?step:BINS-1-step;
      const x=left+i/(BINS-1)*width,y=base+side*drive(i)*span*scale;
      if(side===1&&step===0)c.moveTo(x,y);else c.lineTo(x,y);
     }
    }
    c.closePath();
    const fill=c.createLinearGradient(0,base-span,0,base+span);
    fill.addColorStop(0,foreground+'88');fill.addColorStop(.5,accent+'18');fill.addColorStop(1,accent+'aa');
    c.fillStyle=fill;c.fill();c.strokeStyle=layer%2?foreground+'66':accent+'cc';c.lineWidth=1.2;c.stroke();
   }
   c.strokeStyle=foreground+'55';c.beginPath();c.moveTo(left,base);c.lineTo(left+width,base);c.stroke();
  }
  c.restore();
 }
}
