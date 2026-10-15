/**
 * LyricFlow Procedural Cinema Engine
 *
 * Real WebGL geometry, perspective camera, atmospheric GLSL backgrounds,
 * independent beat-reactive objects, plus ping-pong temporal accumulation.
 * No images, downloaded scenery, audio upload, or beat-linked typography.
 * Scene resources are reused while a song plays and disposed on scene switch.
 */
import * as THREE from 'three';
import {TEMPLATES,byId,type SceneId} from '../catalog';
import type {Pulse} from '../paint';

export type RenderQuality='High'|'Balanced'|'Performance';
type Look='ocean'|'clouds'|'glass'|'city'|'flames'|'nebula'|'petals'|'tunnel'|'monuments'
 |'paper'|'crystals'|'rings'|'metal'|'underwater'|'prisms';
export const PROCEDURAL_LOOKS:Record<SceneId,Look>={
 'crimson-impact':'metal','concrete-manifesto':'monuments','rain-on-glass':'underwater',
 'neon-velocity':'tunnel','ink-rebellion':'prisms','ocean-reverie':'ocean',
 'color-riot':'rings','analog-breakdown':'city','cloud-cathedral':'clouds',
 'stellar-expansion':'nebula','fragmented-thoughts':'crystals','quiet-pages':'paper',
 'monochrome-memory':'clouds','monument-titles':'monuments','midnight-confession':'paper',
 'glass-architecture':'glass','ransom-poetry':'prisms','type-collision':'metal',
 'petal-memory':'petals','submerged-words':'underwater','inferno-letterforms':'flames',
 'holographic-frequency':'rings','pixel-pulse':'city','marker-diary':'paper',
 'bubble-pop':'glass','word-playground':'prisms','sunset-frequency':'ocean',
 'typographic-vortex':'tunnel','midnight-transit':'city','final-ascension':'monuments'
};
const PI=Math.PI,TAU=PI*2;
const smooth=(n:number)=>Math.max(0,Math.min(1,n));
const seedNumber=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0};
const random=(seed:number)=>{let v=seed>>>0;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296}};
const makeColor=(hex:string)=>new THREE.Color(hex);
type Animated={mesh:THREE.Object3D;base:THREE.Vector3;size:number;offset:number;kind:number;material?:THREE.MeshPhongMaterial};
const vertexShader=`
 varying vec2 vUv;
 void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
const atmosphericShader=`
 precision highp float;
 uniform float uTime,uBass,uTreble,uStyle,uLight;
 uniform vec3 uBase,uAccent;
 varying vec2 vUv;
 float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
 float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
             mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
 }
 float fbm(vec2 p){
  float v=0.,a=.5;
  for(int j=0;j<4;j++){v+=a*noise(p);p=p*2.03+vec2(17.4,3.8);a*=.5;}
  return v;
 }
 void main(){
  vec2 uv=vUv,center=uv-.5;
  float t=uTime*.085;
  float n=fbm(uv*vec2(3.4,2.5)+vec2(t*.36,-t*.12)+uStyle);
  float n2=fbm(uv*vec2(7.0,3.0)+vec2(-t*.18,t*.29)+uStyle*1.37);
  float glow=exp(-length((uv-vec2(.53,.43))*vec2(.84,1.3))*2.7);
  float horizon=smoothstep(.30,.92,uv.y);
  float cloudy=smoothstep(.35,.8,n*.8+n2*.32);
  float ribbons=sin(uv.x*10.0+sin(uv.y*7.0+t)*2.0+t)*.5+.5;
  float aurora=pow(ribbons,6.0)*(fbm(uv*3.0+uStyle)*.35+.4);
  float beams=pow(max(0.,sin(atan(center.y,center.x)*10.0+uStyle)),19.0)*.17;
  float amount=.12+.24*cloudy+.18*glow+.11*aurora+.11*beams+.05*uTreble;
  // Some families favor volumetric fog, others atmospheric light bands.
  float variant=mod(uStyle,5.0);
  if(variant<1.0)amount+=.15*cloudy;
  else if(variant<2.0)amount+=.12*aurora;
  else if(variant<3.0)amount+=.12*(1.-horizon);
  else if(variant<4.0)amount+=.10*n2;
  else amount+=.12*beams;
  vec3 color=mix(uBase,uAccent,clamp(amount+uBass*.035,0.,.63));
  color+=uAccent*(glow*.15+aurora*.12)*uLight;
  float vignette=1.0-smoothstep(.35,.92,length(center*vec2(1.2,1.05)));
  color*=mix(.64,1.12,vignette);
  color+=uAccent*pow(max(0.,noise(uv*90.0+uStyle)-.83),4.0)*.18;
  gl_FragColor=vec4(color,1.);
 }
`;
const postVertex=`
 varying vec2 vUv;
 void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
const temporalFragment=`
 precision highp float;
 varying vec2 vUv;
 uniform sampler2D uCurrent,uHistory;
 uniform float uRetention;
 void main(){
  vec4 current=texture2D(uCurrent,vUv);
  vec4 prior=texture2D(uHistory,vUv);
  // Reprojected frame trails are for environmental movement, never text.
  gl_FragColor=mix(current,prior,uRetention);
 }
`;
const copyFragment=`
 precision highp float;
 varying vec2 vUv; uniform sampler2D uTexture;
 void main(){gl_FragColor=texture2D(uTexture,vUv);}
`;
function glowTexture():THREE.DataTexture{
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const d=Math.hypot((x-size/2)/(size/2),(y-size/2)/(size/2));
  const k=(y*size+x)*4;
  data[k]=data[k+1]=data[k+2]=255;
  data[k+3]=Math.round(Math.pow(Math.max(0,1-d),2.6)*255);
 }
 const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 tex.needsUpdate=true;return tex;
}
export class ProceduralCinema {
 readonly canvas:HTMLCanvasElement;
 readonly available:boolean;
 private renderer:THREE.WebGLRenderer|null=null;
 private camera=new THREE.PerspectiveCamera(48,16/9,.1,90);
 private scene=new THREE.Scene();
 private world=new THREE.Group();
 private atmosphere:THREE.ShaderMaterial|null=null;
 private animated:Animated[]=[];
 private owned:THREE.Object3D[]=[];
 private ownedGeometry:THREE.BufferGeometry[]=[];
 private ownedMaterials:THREE.Material[]=[];
 private shared:Record<string,THREE.BufferGeometry>={};
 private glowMap:THREE.DataTexture|null=null;
 private particle:THREE.Points|null=null;
 private particleBase:Float32Array|null=null;
 private wave:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshPhongMaterial>|null=null;
 private waveBase:Float32Array|null=null;
 private currentId:SceneId|null=null;
 private look:Look='nebula';
 private lastVisualTime=0;
 private renderCount=0;
 private width=1;private height=1;
 private colorAccent=new THREE.Color('#a4d8ff');
 private stage=new THREE.Scene();
 private copyScene=new THREE.Scene();
 private screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 private temporalMaterial:THREE.ShaderMaterial|null=null;
 private copyMaterial:THREE.ShaderMaterial|null=null;
 private source:THREE.WebGLRenderTarget|null=null;
 private history:[THREE.WebGLRenderTarget,THREE.WebGLRenderTarget]|null=null;
 private writeIndex=0;
 private hasHistory=false;
 private disposed=false;
 private quality:RenderQuality='Balanced';
 constructor(){
  this.canvas=document.createElement('canvas');
  let renderer:THREE.WebGLRenderer;
  try{
   renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,alpha:false,
    powerPreference:'high-performance',preserveDrawingBuffer:true});
  }catch{this.available=false;return}
  this.available=true;
  this.renderer=renderer;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.25;
  renderer.setPixelRatio(1);
  this.camera.position.set(0,0,17);
  this.camera.lookAt(0,0,0);
  this.scene.add(this.world);
  this.scene.add(new THREE.AmbientLight('#ddeaff',1.25));
  const key=new THREE.DirectionalLight('#ffffff',3.1);
  key.position.set(-7,8,12);this.scene.add(key);
  const rim=new THREE.PointLight('#93d5ff',70,38,2);rim.position.set(5,-3,6);this.scene.add(rim);
  this.shared={
   sphere:new THREE.SphereGeometry(1,18,14),
   softSphere:new THREE.SphereGeometry(1,12,9),
   ico:new THREE.IcosahedronGeometry(1,1),
   cube:new THREE.BoxGeometry(1,1,1),
   torus:new THREE.TorusGeometry(1,.08,7,48),
   thickTorus:new THREE.TorusGeometry(1,.23,10,54),
   cone:new THREE.ConeGeometry(1,2,6),
   cylinder:new THREE.CylinderGeometry(.7,.7,1.7,12),
   tetra:new THREE.TetrahedronGeometry(1,0),
   octa:new THREE.OctahedronGeometry(1,0),
   plane:new THREE.PlaneGeometry(1,1),
  };
  this.glowMap=glowTexture();
  const bg=new THREE.ShaderMaterial({
   vertexShader,fragmentShader:atmosphericShader,
   uniforms:{uTime:{value:0},uBass:{value:0},uTreble:{value:0},uStyle:{value:0},
    uLight:{value:.5},uBase:{value:new THREE.Color('#0a1228')},uAccent:{value:this.colorAccent.clone()}},
   depthWrite:false,side:THREE.DoubleSide
  });
  this.atmosphere=bg;
  const background=new THREE.Mesh(new THREE.PlaneGeometry(96,62),bg);
  background.position.z=-25;this.scene.add(background);
  this.ownedGeometry.push(background.geometry);
  this.temporalMaterial=new THREE.ShaderMaterial({
   vertexShader:postVertex,fragmentShader:temporalFragment,
   uniforms:{uCurrent:{value:null},uHistory:{value:null},uRetention:{value:0}},
   depthTest:false,depthWrite:false
  });
  this.copyMaterial=new THREE.ShaderMaterial({
   vertexShader:postVertex,fragmentShader:copyFragment,
   uniforms:{uTexture:{value:null}},depthTest:false,depthWrite:false
  });
  this.stage.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.temporalMaterial));
  this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.copyMaterial));
 }
 resize(width:number,height:number,quality:RenderQuality){
  if(!this.renderer||this.disposed)return;
  const w=Math.max(2,Math.round(width)),h=Math.max(2,Math.round(height));
  if(w===this.width&&h===this.height&&quality===this.quality)return;
  this.width=w;this.height=h;this.quality=quality;
  this.renderer.setSize(w,h,false);
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  this.source?.dispose();this.history?.forEach(x=>x.dispose());
  const params={depthBuffer:true,stencilBuffer:false,
   magFilter:THREE.LinearFilter,minFilter:THREE.LinearFilter};
  this.source=new THREE.WebGLRenderTarget(w,h,params);
  this.history=[new THREE.WebGLRenderTarget(w,h,{...params,depthBuffer:false}),
   new THREE.WebGLRenderTarget(w,h,{...params,depthBuffer:false})];
  this.hasHistory=false;this.writeIndex=0;
 }
 private material(hex:string,transparent=false){
  const m=new THREE.MeshPhongMaterial({color:hex,shininess:110,
   emissive:this.colorAccent,emissiveIntensity:.11,
   specular:'#f2fbff',transparent,opacity:transparent?.46:1,side:THREE.DoubleSide,
   depthWrite:!transparent});
  this.ownedMaterials.push(m);return m;
 }
 private add(geometry:THREE.BufferGeometry,material:THREE.Material,position:THREE.Vector3,size:number,offset:number,kind:number){
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.copy(position);mesh.scale.setScalar(size);
  mesh.rotation.set(offset*.17,offset*.28,offset*.11);
  this.world.add(mesh);this.owned.push(mesh);
  this.animated.push({mesh,base:position.clone(),size,offset,kind,
   material:material instanceof THREE.MeshPhongMaterial?material:undefined});
  return mesh;
 }
 private addRings(rand:()=>number,count:number,material:THREE.Material,depth=-6){
  for(let i=0;i<count;i++){
   const z=depth+i*1.18;
   const scale=3.3+Math.abs(z)*.18;
   const mesh=this.add(this.shared.torus,material,new THREE.Vector3(0,0,z),scale,i*.6,3);
   mesh.rotation.x=.12;mesh.rotation.y=i*.055;
  }
 }
 private clearWorld(){
  for(const object of this.owned){this.world.remove(object)}
  for(const g of this.ownedGeometry)g.dispose();
  for(const m of this.ownedMaterials)m.dispose();
  this.ownedGeometry=[];
  this.ownedMaterials=[];
  this.owned=[];
  this.animated=[];
  this.particle=null;this.particleBase=null;
  this.wave=null;this.waveBase=null;
  this.hasHistory=false;this.renderCount=0;
 }
 private setupScene(id:SceneId,quality:RenderQuality){
  if(this.currentId===id&&quality===this.quality)return;
  this.clearWorld();this.currentId=id;this.look=PROCEDURAL_LOOKS[id];
  const palette=byId[id];
  this.colorAccent=makeColor(palette.accent);
  const bg=makeColor(palette.background);
  this.scene.background=bg.clone();
  this.scene.fog=new THREE.FogExp2(bg,.025);
  const shader=this.atmosphere;
  if(shader){
   shader.uniforms.uBase.value.copy(bg);
   shader.uniforms.uAccent.value.copy(this.colorAccent);
   shader.uniforms.uStyle.value=TEMPLATES.findIndex(x=>x.id===id)*.73+.5;
   shader.uniforms.uLight.value=['quiet-pages','ransom-poetry','color-riot','marker-diary','word-playground'].includes(id)?1.2:.65;
  }
  const rand=random(seedNumber(id));
  const hero=this.material(palette.accent);
  const ice=this.material(palette.foreground,true);
  const dark=this.material(palette.background);
  const gold=this.material(palette.foreground);
  const glass=this.material(palette.accent,true);
  const density=quality==='High'?1:quality==='Balanced'?.72:.43;
  const count=Math.floor((18+rand()*15)*density);
  const pick=(shapes:string[])=>this.shared[shapes[Math.floor(rand()*shapes.length)]];
  const addCloud=(x:number,y:number,z:number,r:number,k:number)=>{
   for(let j=0;j<5;j++){
    const pos=new THREE.Vector3(x+(j-2)*r*.53,y+Math.sin(j*2.6)*r*.36,z-j*.12);
    this.add(this.shared.softSphere,j%3===0?gold:glass,pos,r*(.47+rand()*.54),k+j,0);
   }
  };
  if(this.look==='tunnel'||this.look==='rings'){
   this.addRings(rand,quality==='Performance'?8:13,this.look==='tunnel'?hero:glass);
   for(let i=0;i<count;i++){
    const angle=rand()*TAU,r=3+rand()*6;
    this.add(pick(['octa','ico','cube']),i%4?ice:hero,
     new THREE.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,-7+rand()*14),
     .12+rand()*.47,rand()*TAU,1);
   }
  }else if(this.look==='ocean'||this.look==='underwater'){
   const geom=new THREE.PlaneGeometry(23,16,50,34);
   geom.rotateX(-PI*.48);
   const coords=geom.attributes.position.array as Float32Array;
   this.waveBase=new Float32Array(coords);
   const waveMaterial=this.material(palette.accent,true);
   waveMaterial.opacity=.60;waveMaterial.side=THREE.DoubleSide;
   const mesh=new THREE.Mesh(geom,waveMaterial);
   mesh.position.set(0,-4,-3);
   this.world.add(mesh);this.owned.push(mesh);this.ownedGeometry.push(geom);
   this.wave=mesh;
   for(let i=0;i<count;i++){
    const pos=new THREE.Vector3((rand()-.5)*18,(rand()-.5)*10,-8+rand()*13);
    this.add(this.shared.sphere,i%3===0?gold:glass,pos,
     .09+rand()*.43,rand()*TAU,0);
   }
   if(this.look==='ocean'){
    const sun=this.add(this.shared.sphere,gold,new THREE.Vector3(3,2,-10),2.0,0,4);
    sun.scale.set(2.2,2.2,.23);
   }
  }else if(this.look==='clouds'||this.look==='petals'){
   for(let i=0;i<Math.round(count*.65);i++)
    addCloud((rand()-.5)*20,(rand()-.5)*11,-9+rand()*11,1+rand()*1.7,i);
   if(this.look==='petals'){
    for(let i=0;i<count;i++)
     this.add(this.shared.tetra,i%3===0?gold:glass,
       new THREE.Vector3((rand()-.5)*16,(rand()-.5)*10,-5+rand()*9),
       .16+rand()*.33,rand()*TAU,1);
   }
  }else if(this.look==='glass'||this.look==='crystals'||this.look==='prisms'){
   for(let i=0;i<count;i++){
    const geometry=this.look==='glass'?pick(['cube','ico']):
      this.look==='crystals'?pick(['octa','cone','tetra']):pick(['tetra','cube','cone']);
    const pos=new THREE.Vector3((rand()-.5)*17,(rand()-.5)*11,-9+rand()*13);
    const obj=this.add(geometry,i%3===0?hero:i%2===0?glass:ice,
     pos,.44+rand()*1.8,rand()*TAU,1);
    obj.rotation.y=rand()*TAU;obj.rotation.x=rand()*TAU;
   }
  }else if(this.look==='monuments'||this.look==='city'||this.look==='metal'){
   for(let i=0;i<count;i++){
    const height=.5+rand()*5.3;
    const x=(rand()-.5)*20,z=-10+rand()*15;
    const y=(rand()-.5)*4;
    const ob=this.add(i%6===0?this.shared.cylinder:this.shared.cube,
      i%3===0?gold:i%2===0?dark:hero,new THREE.Vector3(x,y,z),
      .7+rand()*.65,rand()*TAU,2);
    ob.scale.set(.30+rand()*.8,height,.4+rand()*1.3);
   }
   for(let i=0;i<5;i++)
    this.add(this.shared.torus,glass,new THREE.Vector3((i-2)*3,0,-9+i),
    1.2+rand()*1.6,i*2.3,3);
  }else if(this.look==='flames'){
   for(let i=0;i<count*1.3;i++){
    const pos=new THREE.Vector3((rand()-.5)*18,-4+rand()*11,-9+rand()*12);
    this.add(pick(['cone','tetra','octa']),i%3===0?gold:hero,pos,
     .19+rand()*.85,rand()*TAU,2);
   }
  }else if(this.look==='paper'){
   for(let i=0;i<count;i++){
    const position=new THREE.Vector3((rand()-.5)*19,(rand()-.5)*12,-8+rand()*10);
    const ob=this.add(this.shared.plane,i%3===0?hero:i%2===0?glass:gold,
     position,.5+rand()*2,rand()*TAU,0);
    ob.scale.set(.7+rand()*1.5,.55+rand()*.85,1);
    ob.rotation.z=(rand()-.5)*1.1;
   }
  }else{ // nebula: floating star temples + orbital geometry
   this.addRings(rand,9,glass,-9);
   for(let i=0;i<count;i++){
    this.add(pick(['ico','octa','torus']),i%2?ice:hero,
      new THREE.Vector3((rand()-.5)*18,(rand()-.5)*11,-8+rand()*14),
      .15+rand()*.9,rand()*TAU,1);
   }
  }
  // Stable depth-space stars/embers: one draw call, no per-frame allocations.
  const amount=quality==='High'?440:quality==='Balanced'?260:130;
  const points=new Float32Array(amount*3);
  for(let i=0;i<amount;i++){
   points[i*3]=(rand()-.5)*37;points[i*3+1]=(rand()-.5)*23;points[i*3+2]=-18+rand()*24;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  this.ownedGeometry.push(geometry);
  const mat=new THREE.PointsMaterial({color:palette.foreground,size:quality==='High'?.10:.07,
   sizeAttenuation:true,transparent:true,opacity:.60,blending:THREE.AdditiveBlending,depthWrite:false});
  this.ownedMaterials.push(mat);
  this.particle=new THREE.Points(geometry,mat);this.world.add(this.particle);this.owned.push(this.particle);
  this.particleBase=points;
  // Additive sprite lights add dimension, bloom-like falloff, without external textures.
  if(this.glowMap){
   const m=new THREE.SpriteMaterial({map:this.glowMap,color:palette.accent,
    transparent:true,opacity:.30,depthWrite:false,blending:THREE.AdditiveBlending});
   this.ownedMaterials.push(m);
   for(let i=0;i<6;i++){
    const sprite=new THREE.Sprite(m);
    const pos=new THREE.Vector3((rand()-.5)*15,(rand()-.5)*10,-5+rand()*9);
    sprite.position.copy(pos);
    const size=2.2+rand()*4.1;sprite.scale.set(size,size,1);
    this.world.add(sprite);this.owned.push(sprite);
    this.animated.push({mesh:sprite,base:pos,size,offset:rand()*TAU,kind:4});
   }
  }
  this.hasHistory=false;
 }
 render(id:SceneId,p:Pulse,time:number,intensity:number,motionBlur:number,
  reduced:boolean,quality:RenderQuality){
  if(!this.renderer||this.disposed||!this.source||!this.history)return false;
  const delta=Math.max(0,Math.min(.06,time-this.lastVisualTime));
  const sceneChanged=this.currentId!==id;
  if(sceneChanged)this.setupScene(id,quality);
  this.lastVisualTime=time;
  const motion=reduced?.16:1;
  const energy=smooth(intensity);
  const bass=smooth(p.bass),treble=smooth(p.treble),beat=smooth(p.beat);
  const audioKick=energy*(bass*.32+beat*.22);
  if(this.atmosphere){
   this.atmosphere.uniforms.uTime.value=time;
   this.atmosphere.uniforms.uBass.value=bass*energy;
   this.atmosphere.uniforms.uTreble.value=treble*energy;
  }
  this.world.rotation.y=Math.sin(time*.095)*.11*motion;
  this.world.rotation.x=Math.sin(time*.07)*.055*motion;
  this.camera.position.x=Math.sin(time*.14)*.45*motion;
  this.camera.position.y=Math.cos(time*.10)*.30*motion;
  this.camera.position.z=17-bass*.45*motion;
  this.camera.lookAt(0,0,0);
  for(const a of this.animated){
   const spin=time*(.1+.025*(a.kind%4))*motion+a.offset;
   a.mesh.position.y=a.base.y+Math.sin(spin)*.13*(1+a.kind)*motion;
   a.mesh.position.x=a.base.x+Math.cos(spin*.7)*.11*motion;
   if(a.kind===4){
    const scale=a.size*(1+audioKick*.7+treble*energy*.25);
    a.mesh.scale.set(scale,scale,1);
   }else if(a.kind===2){
    a.mesh.scale.y=Math.max(.05,a.size*(1+.12*bass*energy));
   }else{
    const scale=a.size*(1+audioKick*(a.kind===3?.6:1.2)+treble*energy*.12);
    if(a.kind!==2)a.mesh.scale.setScalar(scale);
   }
   a.mesh.rotation.y+=delta*(.12+treble*.5)*motion;
   a.mesh.rotation.z+=delta*(.06+p.mids*.17)*motion;
  }
  if(this.wave&&this.waveBase){
   const pos=this.wave.geometry.attributes.position;
   const vals=pos.array as Float32Array;
   for(let i=0;i<vals.length;i+=3){
    const x=this.waveBase[i],y=this.waveBase[i+1];
    vals[i+2]=Math.sin(x*.56+time*.64)*.18+
       Math.cos(y*.65+time*.39)*.15+Math.sin((x+y)*.8+time*.7)*(.11+bass*.35*energy);
   }
   pos.needsUpdate=true;
   this.wave.geometry.computeVertexNormals();
  }
  if(this.particle){
   this.particle.rotation.z=time*.011*motion;
   const m=this.particle.material as THREE.PointsMaterial;
   m.opacity=.43+.18*treble*energy+.12*beat*energy;
  }
  const blurMix=reduced?0:Math.max(0,Math.min(.82,motionBlur/100*.81));
  // FPS-independent trails, so adjusting refresh rate doesn't change tail length wildly.
  const retained=blurMix?Math.pow(blurMix,Math.min(3,delta*60)||1):0;
  const renderer=this.renderer;
  renderer.setRenderTarget(this.source);renderer.clear();renderer.render(this.scene,this.camera);
  if(this.temporalMaterial&&this.copyMaterial){
   const previous=this.history[1-this.writeIndex];
   const next=this.history[this.writeIndex];
   this.temporalMaterial.uniforms.uCurrent.value=this.source.texture;
   this.temporalMaterial.uniforms.uHistory.value=previous.texture;
   this.temporalMaterial.uniforms.uRetention.value=this.hasHistory?retained:0;
   renderer.setRenderTarget(next);renderer.render(this.stage,this.screenCamera);
   this.copyMaterial.uniforms.uTexture.value=next.texture;
   renderer.setRenderTarget(null);renderer.render(this.copyScene,this.screenCamera);
   this.writeIndex=1-this.writeIndex;this.hasHistory=true;
  }else{renderer.setRenderTarget(null);renderer.render(this.scene,this.camera)}
  this.renderCount++;
  return true;
 }
 dispose(){
  if(this.disposed)return;
  this.disposed=true;
  this.clearWorld();
  Object.values(this.shared).forEach(g=>g.dispose());
  this.glowMap?.dispose();
  this.source?.dispose();this.history?.forEach(x=>x.dispose());
  this.atmosphere?.dispose();this.temporalMaterial?.dispose();this.copyMaterial?.dispose();
  this.stage.traverse(x=>{if(x instanceof THREE.Mesh)x.geometry.dispose()});
  this.copyScene.traverse(x=>{if(x instanceof THREE.Mesh)x.geometry.dispose()});
  this.renderer?.dispose();this.renderer?.forceContextLoss();
 }
}
