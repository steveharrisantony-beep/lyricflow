import { useEffect, useRef } from 'react';
export type Scene = 'Particles'|'Light trails'|'Geometry'|'Kinetic type';
type Props={scene:Scene;intensity:number;speed:number;quality:'High'|'Balanced'|'Performance';demo:boolean;paused:boolean;reducedMotion:boolean};
export default function Visualizer(props:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null);const config=useRef(props);
 useEffect(()=>{config.current=props},[props]);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  let raf=0,elapsed=0,last=0,frame=0,fpsAt=0,fps=60,w=1,h=1,points:{x:number;y:number;r:number;phase:number}[]=[];
  let previousScene:Scene=config.current.scene,transition=1;
  const resize=()=>{
   const dpr=Math.min(devicePixelRatio||1,config.current.quality==='High'?2:1.3);
   w=Math.max(1,canvas.clientWidth);h=Math.max(1,canvas.clientHeight);canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
   points=Array.from({length:200},(_,i)=>({x:(i*0.61803398875%1)*w,y:(i*0.754877666%1)*h,r:0.6+i%4*.38,phase:i*2.39996}));
  };
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const paint=(now:number)=>{
   raf=requestAnimationFrame(paint);
   const c=config.current;const dt=Math.min(.05,(now-last||16.7)/1000);last=now;
   if(c.paused)return;
   elapsed+=dt*c.speed*(c.reducedMotion?.12:1);
   frame++;if(now-fpsAt>1000){fps=Math.round(frame*1000/(now-fpsAt));frame=0;fpsAt=now;canvas.dataset.fps=String(fps)}
   if(c.scene!==previousScene){previousScene=c.scene;transition=0}
   transition=Math.min(1,transition+dt*1.25);
   ctx.fillStyle='#090e19';ctx.fillRect(0,0,w,h);
   const glow=ctx.createRadialGradient(w*.56,h*.52,0,w*.56,h*.52,Math.max(w,h)*.65);
   glow.addColorStop(0,'rgba(34,100,121,.32)');glow.addColorStop(1,'rgba(4,8,15,0)');
   ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
   const energy=c.demo? .58+.25*Math.sin(elapsed*2.8)+.12*Math.sin(elapsed*6.2):.32;
   const strength=c.intensity*(.65+energy*.65);
   ctx.globalAlpha=transition;
   if(c.scene==='Particles'){
    const count=c.quality==='High'?200:c.quality==='Balanced'?125:65;
    for(let i=0;i<count;i++){const p=points[i],x=(p.x+elapsed*9*((i%5)+1)/5)%w,y=(p.y-elapsed*10*(i%4+1)/4+h*8)%h;
      const radius=p.r*(.7+strength)*(1+.15*Math.sin(elapsed*3+p.phase));
      ctx.beginPath();ctx.arc(x,y,Math.max(.1,radius),0,Math.PI*2);
      ctx.fillStyle=i%4===0?'rgba(170,238,245,.8)':'rgba(107,185,223,.65)';ctx.fill();
      if(i%13===0){ctx.strokeStyle='rgba(104,213,227,.15)';ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.stroke()}
    }
   }else if(c.scene==='Light trails'){
    ctx.globalCompositeOperation='screen';
    for(let j=0;j<9;j++){ctx.beginPath();
     for(let k=0;k<=100;k++){const x=k*w/100,y=h*.51+(j-4)*h*.036+Math.sin(x/w*9+elapsed*(1.2+j*.065)+j*.47)*h*.08*strength+Math.cos(x/w*13-elapsed*.7+j)*h*.045;
      if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
     ctx.lineWidth=(1+j*.18)*Math.max(.25,strength);ctx.strokeStyle='rgba(93,206,242,'+(.10+j*.025)+')';ctx.shadowBlur=12;ctx.shadowColor='#4ab6e0';ctx.stroke();
    }ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
   }else if(c.scene==='Geometry'){
    ctx.save();ctx.translate(w*.53,h*.50);ctx.rotate(elapsed*.12);
    const r=Math.min(w,h)*(.14+strength*.015);
    for(let j=0;j<7;j++){const size=r*(.4+j*.21);ctx.beginPath();
     for(let k=0;k<=6;k++){const angle=k*Math.PI/3+elapsed*.04*j,xx=Math.cos(angle)*size,yy=Math.sin(angle)*size;
      if(k===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)}
     ctx.lineWidth=1+j*.1;ctx.strokeStyle='rgba(117,206,233,'+(.12+j*.065)+')';ctx.stroke();
    }ctx.restore();
   }else{
    ctx.textAlign='center';ctx.textBaseline='middle';
    const size=Math.min(85,w*.14,h*.17);
    ['FEEL','THE','MUSIC'].forEach((word,i)=>{
     ctx.font=(i===1?'300 ':'600 ')+size+'px system-ui';
     ctx.fillStyle=i===1?'rgba(231,248,252,.95)':'rgba(125,216,236,.75)';
     ctx.fillText(word,w*.53,h*.47+(i-1)*size*.94+Math.sin(elapsed*1.2+i)*6*strength);
    });
   }
   ctx.globalAlpha=1;
  };
  raf=requestAnimationFrame(paint);
  return()=>{cancelAnimationFrame(raf);observer.disconnect()};
 },[]);
 return <canvas ref={canvasRef} className="visual-canvas" aria-label={props.scene+' animated visualizer'} />;
}