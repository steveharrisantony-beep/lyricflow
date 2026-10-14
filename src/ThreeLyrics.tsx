import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {getLyricState} from './lyrics/lyricTimeline';
import type {Mood,FontStyle,ScenePlan} from './lyrics/sceneDirector';
import {getLocalMediaTime,readLocalAudio} from './audio/audioSignal';

type Quality='High'|'Balanced'|'Performance';
type CameraMode='Automatic'|'Front'|'Orbit'|'Side'|'Top';
type Props={quality:Quality;intensity:number;speed:number;reducedMotion:boolean;demo:boolean;paused:boolean;autoScenes:boolean;cameraMode:CameraMode};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(x:number)=>{const a=clamp(x);return a*a*(3-2*a)};
const seed=(i:number)=>{const n=Math.sin(i*127.1+5)*43758.5453;return n-Math.floor(n)};
function face(style:FontStyle){
 if(style==='editorial')return 'Georgia, Times New Roman, serif';
 if(style==='mono')return 'ui-monospace, Menlo, monospace';
 if(style==='expressive')return 'Impact, Arial Black, system-ui, sans-serif';
 return 'Manrope, Arial, system-ui, sans-serif';
}
function textPlane(text:string,style:FontStyle,width:number,opacity:number,color:number){
 const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=340;
 const c=canvas.getContext('2d');if(!c)return null;
 c.clearRect(0,0,1536,340);
 c.textAlign='center';c.textBaseline='middle';
 c.fillStyle='#fff';
 c.font=`${style==='editorial'?'italic 600':'800'} 186px ${face(style)}`;
 c.fillText(text,768,171,1450);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=4;
 const geometry=new THREE.PlaneGeometry(width,width*340/1536);
 const material=new THREE.MeshBasicMaterial({map:texture,color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);
 return {mesh,texture};
}
export default function ThreeLyrics(props:Props){
 const el=useRef<HTMLDivElement>(null),cfg=useRef(props);
 useEffect(()=>{cfg.current=props},[props]);
 useEffect(()=>{
  const root=el.current;if(!root)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default',premultipliedAlpha:false});}
  catch{root.dataset.webgl='unavailable';return}
  renderer.setClearColor(0x030713,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.style.cssText='display:block;width:100%;height:100%';
  root.appendChild(renderer.domElement);
  const world=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(47,1,.1,100);
  camera.position.set(0,0,12);
  const visual=new THREE.Group();world.add(visual);
  const words=new THREE.Group();world.add(words);
  const reusableColor=new THREE.Color(0x87cddb),targetColor=new THREE.Color(),scratch=new THREE.Vector3();
  const starsCount=450,starsArray=new Float32Array(starsCount*3);
  for(let i=0;i<starsCount;i++){
   starsArray[i*3]=(seed(i*4)-.5)*23;
   starsArray[i*3+1]=(seed(i*4+1)-.5)*16;
   starsArray[i*3+2]=-2-seed(i*4+2)*16;
  }
  const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.BufferAttribute(starsArray,3));
  const starsMat=new THREE.PointsMaterial({size:.045,transparent:true,opacity:.48,color:0x9cddf6,sizeAttenuation:true,depthWrite:false});
  const stars=new THREE.Points(starsGeo,starsMat);visual.add(stars);
  // Scene-specific effects use persistent geometries, not new per-frame objects.
  const effectCount=280,effectPositions=new Float32Array(effectCount*3);
  const effectGeo=new THREE.BufferGeometry();effectGeo.setAttribute('position',new THREE.BufferAttribute(effectPositions,3));
  const effectMat=new THREE.PointsMaterial({size:.07,color:0xa2def0,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending});
  const effects=new THREE.Points(effectGeo,effectMat);visual.add(effects);
  const rainCount=165,rainCoordinates=new Float32Array(rainCount*6);
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainCoordinates,3));
  const rainMat=new THREE.LineBasicMaterial({color:0x79dff8,transparent:true,opacity:.38,depthWrite:false});
  const rain=new THREE.LineSegments(rainGeo,rainMat);visual.add(rain);
  const strands:THREE.Line[]=[];
  for(let j=0;j<9;j++){
   const vertices=new Float32Array(90*3);
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
   const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x83d7eb,transparent:true,opacity:.1+j*.035,depthWrite:false,blending:THREE.AdditiveBlending}));
   visual.add(line);strands.push(line);
  }
  const ringGeo=new THREE.TorusGeometry(2.2,.012,5,128);
  const rings:THREE.Mesh[]=[];
  for(let i=0;i<4;i++){
   const mesh=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x8edee8,transparent:true,opacity:.25-i*.035,depthWrite:false,blending:THREE.AdditiveBlending}));
   mesh.rotation.x=i*.55;mesh.rotation.y=i*.42;
   visual.add(mesh);rings.push(mesh);
  }
  let layers:{mesh:THREE.Mesh;texture:THREE.CanvasTexture}[]=[];
  let currentWord='',currentLine='',currentSecondary='',currentStyle:FontStyle='grotesk',lastMood:Mood='abstract';
  const removeWords=()=>{
   for(const item of layers){words.remove(item.mesh);item.mesh.geometry.dispose();(item.mesh.material as THREE.Material).dispose();item.texture.dispose()}
   layers=[];
  };
  function add(text:string,style:FontStyle,width:number,y:number,z:number,opacity:number,color:number){
   if(!text.trim())return;
   const p=textPlane(text,style,width,opacity,color);if(!p)return;
   p.mesh.position.set(0,y,z);words.add(p.mesh);layers.push(p);
  }
  const resize=()=>{
   const w=Math.max(1,root.clientWidth),h=Math.max(1,root.clientHeight);
   camera.aspect=w/h;camera.updateProjectionMatrix();
   const quality=cfg.current.quality;
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality==='High'?1.8:quality==='Balanced'?1.35:1));
   renderer.setSize(w,h,false);
  };
  const observer=new ResizeObserver(resize);observer.observe(root);resize();
  let raf=0,last=0,clock=0,blend=1;
  const animate=(now:number)=>{
   raf=requestAnimationFrame(animate);
   const dt=Math.min(.045,(now-last||16)/1000);last=now;
   const c=cfg.current;if(c.paused||document.hidden)return;
   const musicTime=getLocalMediaTime();
   clock=musicTime??clock+dt;
   const state=getLyricState(clock),cue=state.cue;
   const plan:ScenePlan|null=c.autoScenes?state.plan:null;
   const mood:Mood=plan?.mood||'abstract';
   const palette=plan?.palette||0x87cddd;
   const style=plan?.font||'grotesk';
   let activeIndex=-1;
   if(cue){for(let i=0;i<cue.words.length;i++)if(cue.words[i].start<=state.position)activeIndex=i;}
   const live=readLocalAudio(now);
   const demo=c.demo?.31+.17*Math.sin(clock*2.3)+.08*Math.sin(clock*4.6):0;
   const bass=live?.bass??demo,mid=live?.mids??demo,treble=live?.treble??demo*.6,beat=live?.beat??0;
   // Not every track has exact words. Honor supplied per-word timestamps where available.
   const activeWord=activeIndex>=0?cue?.words[activeIndex]:null;
   const wordOriginal=activeWord?.text||cue?.text||'';
   const roman=cue?.romanized||'';
   const line=state.mode==='romanized'?(roman||cue?.text||''):(cue?.text||'');
   const title=state.mode==='romanized'&&roman?(roman.split(/\s+/)[Math.max(0,activeIndex)]||roman):wordOriginal;
   const secondary=state.mode==='both'?roman:'';
   const chosenWord=title.length>38?title.slice(0,38)+'…':title;
   if(chosenWord!==currentWord||line!==currentLine||secondary!==currentSecondary||style!==currentStyle||lastMood!==mood){
    currentWord=chosenWord;currentLine=line;currentSecondary=secondary;currentStyle=style;lastMood=mood;removeWords();blend=0;
    if(chosenWord){
     add(chosenWord.toLocaleUpperCase(),style,7.7,.15,1.2,.94,0xffffff);
     // offset depth planes create dimensional motion, not a duplicate line of text
     add(chosenWord.toLocaleUpperCase(),style,7.7,.15,.75,.12,palette);
     if(cue&&cue.words.length>1&&line.toLocaleLowerCase()!==chosenWord.toLocaleLowerCase()){
      add(line,'grotesk',6.3,-1.07,.38,.61,0xdceaf6);
     }
     if(secondary&&secondary!==line)add(secondary,'grotesk',5.9,-1.7,.3,.46,0xcde1ed);
    }
   }
   blend=clamp(blend+dt*2.1);
   reusableColor.lerp(targetColor.setHex(palette),Math.min(1,dt*2.6));
   starsMat.color.copy(reusableColor);
   effectMat.color.copy(reusableColor);
   rainMat.color.copy(reusableColor);
   const busy=(c.quality==='High'?280:c.quality==='Balanced'?175:90);
   const reduced=c.reducedMotion?.16:1;
   const t=clock*c.speed*reduced;
   const energetic=clamp(.12+bass*.85+beat*.35);
   effects.visible=mood!=='solitude';
   rain.visible=mood==='water';
   for(let i=0;i<effectCount;i++){
    const idx=i*3;
    if(i>=busy){effectPositions[idx+2]=-80;continue}
    const a=seed(i*7)*Math.PI*2,orbit=2.1+seed(i*7+1)*5.9,phase=seed(i*7+2)*8;
    let x=0,y=0,z=-2-seed(i*7+3)*6;
    if(mood==='water'){x=Math.sin(a)*orbit*.9;y=((seed(i*13)*14-t*(.5+bass*3))%14+14)%14-7;}
    else if(mood==='fire'){x=Math.sin(a+t*.14)*orbit*.7;y=((seed(i*11)*12+t*(.6+energetic*3))%12+12)%12-6;}
    else if(mood==='celebration'){const rad=1.2+((t*.65+phase)%8);x=Math.cos(a)*rad;y=Math.sin(a)*rad*.6;}
    else if(mood==='cosmic'){x=Math.cos(a+t*.06)*orbit;y=Math.sin(a+t*.06)*orbit*.6;}
    else if(mood==='nature'){x=Math.cos(a+t*.12)*orbit*.8;y=Math.sin(a+t*.3)*2+Math.sin(phase)*3;}
    else if(mood==='warm'){x=Math.cos(a+t*.17)*orbit*.6;y=Math.sin(a+t*.17)*orbit*.48;}
    else if(mood==='memory'){x=Math.cos(a)*orbit*.7+Math.sin(t*.12+phase)*.35;y=Math.sin(a)*orbit*.48;}
    else if(mood==='solitude'){x=Math.cos(a)*orbit*1.2;y=Math.sin(a)*orbit*.8;z=-6;}
    else{x=Math.cos(a+t*.13)*orbit;y=Math.sin(a-t*.19)*orbit*.65;}
    effectPositions[idx]=x;effectPositions[idx+1]=y;effectPositions[idx+2]=z;
   }
   effectGeo.attributes.position.needsUpdate=true;
   effectMat.size=mood==='celebration'?.13:mood==='fire'?.11:.055+energetic*.046;
   effectMat.opacity=mood==='solitude'?.12:.25+treble*.56;
   starsMat.opacity=mood==='cosmic'?.78:mood==='solitude'?.12:.34;
   for(let i=0;i<rainCount;i++){
    const idx=i*6,x=(seed(i*12)-.5)*20;
    const y=((seed(i*19)*13-t*(2.2+bass*6))%13+13)%13-6.5;
    rainCoordinates[idx]=x;rainCoordinates[idx+1]=y;rainCoordinates[idx+2]=-4;
    rainCoordinates[idx+3]=x+.08;rainCoordinates[idx+4]=y-(.3+mid*.55);rainCoordinates[idx+5]=-4;
   }
   rainGeo.attributes.position.needsUpdate=true;
   for(let j=0;j<strands.length;j++){
    const lineObject=strands[j],isFlow=mood==='water'||mood==='warm'||mood==='nature'||mood==='abstract';
    lineObject.visible=isFlow;
    if(isFlow){
     const attr=lineObject.geometry.attributes.position as THREE.BufferAttribute;
     for(let i=0;i<90;i++){
      const x=(i/89-.5)*19;
      const y=Math.sin(x*.64+t*(.3+mid)+j*.6)*(0.35+bass*1.15)+(j-4)*.21;
      attr.setXYZ(i,x,y,-5-j*.1);
     }
     attr.needsUpdate=true;
     (lineObject.material as THREE.LineBasicMaterial).color.copy(reusableColor);
    }
   }
   for(let i=0;i<rings.length;i++){
    const r=rings[i];r.visible=mood==='cosmic'||mood==='celebration'||mood==='memory'||mood==='abstract';
    r.rotation.y=t*(.08+i*.05);r.rotation.x=t*(.035+i*.04)+i*.35;
    r.scale.setScalar(1+i*.38+beat*.22);
    (r.material as THREE.MeshBasicMaterial).color.copy(reusableColor);
    (r.material as THREE.MeshBasicMaterial).opacity=.08+beat*.10;
   }
   // Camera language is selected once per lyric section, interpolated at frame time.
   const path=c.cameraMode==='Automatic'?(plan?.camera||'orbit'):
    c.cameraMode==='Front'?'dolly':c.cameraMode==='Orbit'?'orbit':c.cameraMode==='Side'?'side':'top';
   let tx=0,ty=0,tz=12;
   if(path==='orbit'){tx=Math.sin(t*.16)*3.0;ty=Math.cos(t*.12)*.85;tz=11.2;}
   if(path==='side'){tx=3.6+Math.sin(t*.1)*1.2;ty=.6;tz=11.2;}
   if(path==='top'){tx=.5;ty=4.5+Math.sin(t*.14)*.8;tz=12.1;}
   if(path==='dolly'){tx=.1;ty=.1;tz=11.0+Math.cos(t*.18)*1.3;}
   if(path==='pullback'){tx=-1.4;ty=1.1;tz=15+Math.sin(t*.09);}
   camera.position.lerp(scratch.set(tx,ty,tz),Math.min(1,dt*1.1));
   camera.lookAt(0,-.25,0);
   if(layers.length){
    const p=cue&&activeWord?clamp((state.position-activeWord.start)/Math.max(.1,activeWord.end-activeWord.start)):1;
    const travel=(1-smooth(Math.min(1,p*3)))*.9;
    const main=layers[0].mesh;
    main.position.x=mood==='fire'?travel*.45:mood==='water'?Math.sin(t*.35)*.16:0;
    main.position.z=1.2+travel+.12*beat;
    main.rotation.y=mood==='solitude'?-.16:mood==='celebration'?Math.sin(t*.23)*.12:0;
    main.rotation.z=mood==='fire'?(1-smooth(p))*.1:0;
    main.scale.setScalar((.90+smooth(p*4)*.1)*(1+beat*.085*c.intensity));
    for(let i=0;i<layers.length;i++){
     const material=layers[i].mesh.material as THREE.MeshBasicMaterial;
     material.opacity=(i===0?.98:i===1?.12:i===2?.65:.48)*smooth(blend);
    }
   }
   const limit=c.quality==='Performance'?55:60;
   renderer.setPixelRatio(Math.min(renderer.getPixelRatio(),limit===55?1:2));
   renderer.render(world,camera);
  };
  raf=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();removeWords();
   starsGeo.dispose();starsMat.dispose();effectGeo.dispose();effectMat.dispose();rainGeo.dispose();rainMat.dispose();
   for(const line of strands){line.geometry.dispose();(line.material as THREE.Material).dispose()}
   ringGeo.dispose();for(const ring of rings)(ring.material as THREE.Material).dispose();
   renderer.dispose();renderer.domElement.remove();
  };
 },[]);
 return <div ref={el} className="three-lyrics" aria-label="Cinematic 3D timed lyric scenes"/>;
}
