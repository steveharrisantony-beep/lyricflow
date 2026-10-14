import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {getLyricState, type LyricMood} from './lyrics/lyricTimeline';
import {getLocalMediaTime,readLocalAudio} from './audio/audioSignal';

const tones:Record<LyricMood,number>={cosmic:0x7d91ff,water:0x5ad6e8,warm:0xffc27c,fire:0xff755e,solitude:0x8aa6c1,celebration:0xf5a1ed,abstract:0xa4e3ea};
type Props={quality:'High'|'Balanced'|'Performance';intensity:number;speed:number;reducedMotion:boolean;demo:boolean};
export default function ThreeLyrics(props:Props){
 const element=useRef<HTMLDivElement>(null),config=useRef(props);
 useEffect(()=>{config.current=props},[props]);
 useEffect(()=>{
  const root=element.current;if(!root)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:props.quality!=='Performance',powerPreference:'default'});}
  catch{root.dataset.webgl='unavailable';return;}
  root.appendChild(renderer.domElement);
  renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';renderer.domElement.style.display='block';
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(44,1,.1,150);
  const group=new THREE.Group();scene.add(group);
  const glow=new THREE.PointLight(0x83cadd,5,22);glow.position.set(0,2,5);scene.add(glow);
  const sharedGeo=new THREE.IcosahedronGeometry(.12,0);
  const objects:THREE.Mesh[]=[];
  for(let i=0;i<95;i++){
   const material=new THREE.MeshBasicMaterial({color:i%3===0?0xb3cfff:0x77c7d5,transparent:true,opacity:.1+(i%7)*.045});
   const mesh=new THREE.Mesh(sharedGeo,material);
   const a=i*2.3999632,rad=2.5+(i%17)*.22;
   mesh.position.set(Math.cos(a)*rad,Math.sin(a)*rad*.6,-1-(i%23)*.22);
   mesh.scale.setScalar(.25+(i%5)*.2);group.add(mesh);objects.push(mesh);
  }
  const torus=new THREE.Mesh(new THREE.TorusGeometry(2.35,.012,8,128),new THREE.MeshBasicMaterial({color:0x83dce8,transparent:true,opacity:.18}));
  group.add(torus);
  let raf=0,last=0,clock=0,currentText='',highlight=-2,currentMood:LyricMood='abstract';
  let textures:THREE.CanvasTexture[]=[];let planes:THREE.Mesh[]=[];
  function clearText(){
   for(const p of planes){group.remove(p);(p.material as THREE.Material).dispose();p.geometry.dispose()}
   planes=[];for(const t of textures)t.dispose();textures=[];
  }
  function addText(text:string,y:number,size:number,color:number,opacity:number,depth:number){
   const c=document.createElement('canvas');c.width=1536;c.height=230;
   const context=c.getContext('2d');if(!context)return;
   context.clearRect(0,0,c.width,c.height);
   context.fillStyle='#fff';context.textAlign='center';context.textBaseline='middle';
   context.font='700 105px system-ui, sans-serif';
   const maxWidth=1430;context.fillText(text,c.width/2,c.height/2,maxWidth);
   const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
   const material=new THREE.MeshBasicMaterial({map:texture,color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
   const geometry=new THREE.PlaneGeometry(size,size*230/1536);
   const plane=new THREE.Mesh(geometry,material);plane.position.set(0,y,depth);
   group.add(plane);planes.push(plane);textures.push(texture);
  }
  const resize=()=>{
   const w=Math.max(1,root.clientWidth),h=Math.max(1,root.clientHeight);
   camera.aspect=w/h;camera.updateProjectionMatrix();
   const dpr=Math.min(window.devicePixelRatio||1,config.current.quality==='High'?2:config.current.quality==='Balanced'?1.5:1);
   renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
  };
  const observer=new ResizeObserver(resize);observer.observe(root);resize();
  const animate=(now:number)=>{
   raf=requestAnimationFrame(animate);
   const dt=Math.min(.05,(now-last||16)/1000);last=now;
   if(document.hidden)return;
   const c=config.current;
   const mediaTime=getLocalMediaTime();
   clock=mediaTime??clock+dt*(c.reducedMotion?.15:1);
   const state=getLyricState(clock);
   const cue=state.cue;
   const words=cue?.words||[];
   let active=-1;for(let i=0;i<words.length;i++)if(words[i].start<=state.position)active=i;
   const text=cue?.text||'';
   const mode=state.mode;
   const display=mode==='romanized'?(cue?.romanized||cue?.text||''):text;
   const subtitle=mode==='both'?(cue?.romanized||''):'';
   if(display!==currentText||active!==highlight||cue?.mood!==currentMood){
    currentText=display;highlight=active;currentMood=cue?.mood||'abstract';clearText();
    if(display){
     const currentWord=active>=0?words[active]?.text:'';
     const title=words.length>1&&currentWord?currentWord.toUpperCase():display;
     addText(title,.08,5.5,tones[currentMood],.98,.65);
     addText(title,.08,5.5,tones[currentMood],.16,.34);
     if(words.length>1)addText(display,-.65,5.0,0xe2efff,.73,.2);
     if(subtitle)addText(subtitle,-1.08,4.4,0xa9cedc,.83,.1);
    }
   }
   const metrics=readLocalAudio(now);
   const bass=metrics?.bass||0,mid=metrics?.mids||0,beat=metrics?.beat||0;
   // Three choreographed camera paths, chosen by the active lyric section.
   const section=cue?Math.floor(cue.time/12)%3:0;
   const t=c.reducedMotion?0:clock;
   const targets:[[number,number,number],[number,number,number],[number,number,number]]=[
    [Math.sin(t*.12)*.7,.15,10],
    [2.8+Math.sin(t*.10)*.8,1.4,10.3],
    [-2.9,Math.cos(t*.14)*1.1,10]
   ];
   const target=targets[section],lerp=Math.min(.055,dt*1.7);
   camera.position.x+=(target[0]-camera.position.x)*lerp;
   camera.position.y+=(target[1]-camera.position.y)*lerp;
   camera.position.z+=(target[2]-camera.position.z)*lerp;
   camera.lookAt(0,0,0);
   const pulse=1+Math.min(.22,(bass*.17+beat*.17)*c.intensity);
   group.scale.setScalar(pulse);
   group.rotation.y=Math.sin(t*.12)*.11;
   group.rotation.z=Math.sin(t*.09)*.045;
   for(let i=0;i<objects.length;i++){
    const o=objects[i];
    if(i>= (c.quality==='Performance'?35:c.quality==='Balanced'?65:95)){o.visible=false;continue}
    o.visible=true;o.rotation.y=t*.25+i;o.rotation.x=t*.11+i;
    o.position.z=-1-(i%23)*.22+Math.sin(t*(.3+mid)+i)*.3;
    (o.material as THREE.MeshBasicMaterial).color.setHex(tones[currentMood]);
   }
   torus.rotation.x=t*.12;torus.rotation.y=t*.24;
   (torus.material as THREE.MeshBasicMaterial).color.setHex(tones[currentMood]);
   glow.color.setHex(tones[currentMood]);glow.intensity=2+bass*3+beat*2;
   renderer.render(scene,camera);
  };
  raf=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();clearText();for(const o of objects)(o.material as THREE.Material).dispose();sharedGeo.dispose();torus.geometry.dispose();(torus.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove()};
 },[]);
 return <div className="three-lyrics" ref={element} aria-label="Three-dimensional timed lyric visualization"/>;
}
