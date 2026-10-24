/**
 * LyricFlow Procedural Cinema Engine
 *
 * Real WebGL geometry, perspective camera, atmospheric GLSL backgrounds with
 * horizon grids and beat shockwaves, luminous wireframe edge batches (baseline /
 * pdoom-video style), independent beat-reactive objects, plus ping-pong temporal
 * accumulation.
 */
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {CameraFrame} from '../cameraRig';
import {motionChannel,objectDrive} from './audioMotion';
import {TEMPLATES,byId,type SceneId} from '../catalog';
import type {Pulse} from '../paint';

export type RenderQuality='High'|'Balanced'|'Performance';
export type ProceduralCamera='Automatic'|'Front'|'Orbit'|'Side'|'Top';
type Look='ocean'|'clouds'|'glass'|'city'|'flames'|'nebula'|'petals'|'tunnel'|'monuments'
 |'paper'|'crystals'|'rings'|'metal'|'underwater'|'prisms';

export const PROCEDURAL_LOOKS:Partial<Record<SceneId,Look>>={
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

const PI=Math.PI;
const smooth=(n:number)=>Math.max(0,Math.min(1,n));
const seedNumber=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0};
const random=(seed:number)=>{let v=seed>>>0;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296}};
const makeColor=(hex:string)=>new THREE.Color(hex);

type Animated={
 mesh:THREE.Object3D;
 base:THREE.Vector3;
 baseScale:THREE.Vector3;
 size:number;
 offset:number;
 kind:number;
 drive?:number;
 velocity?:number;
 material?:THREE.MeshPhysicalMaterial;
};

interface WorldBundle {
 world:THREE.Group;
 reactive:THREE.Group;
 animated:Animated[];
 owned:THREE.Object3D[];
 ownedGeometry:THREE.BufferGeometry[];
 ownedMaterials:THREE.Material[];
 particle:THREE.Points|null;
 wave:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshPhysicalMaterial>|null;
 waveBase:Float32Array|null;
 look:Look;
}

const vertexShader=`
 varying vec2 vUv;
 void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

const atmosphericShader=`
 precision highp float;
 uniform float uTime,uBass,uTreble,uBeat,uStyle,uLight;
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
  float t=uTime*.095;
  float n=fbm(uv*vec2(3.6,2.6)+vec2(t*.38,-t*.14)+uStyle);
  float n2=fbm(uv*vec2(7.2,3.2)+vec2(-t*.20,t*.31)+uStyle*1.37);
  float glow=exp(-length((uv-vec2(.52,.46))*vec2(.88,1.25))*2.4);
  float horizon=smoothstep(.28,.92,uv.y);
  float cloudy=smoothstep(.34,.8,n*.8+n2*.34);
  float ribbons=sin(uv.x*11.0+sin(uv.y*7.5+t)*2.2+t)*.5+.5;
  float aurora=pow(ribbons,5.5)*(fbm(uv*3.2+uStyle)*.38+.42);
  float beams=pow(max(0.,sin(atan(center.y,center.x)*12.0+uStyle+t*.2)),16.0)*.22;

  // Perspective architectural horizon grid in lower stage half (pdoom-video / baseline look)
  float perspectiveY=max(.02,0.52-uv.y);
  float gx=abs(fract((center.x/perspectiveY)*1.35+t*.15)-.5);
  float gy=abs(fract(1.2/perspectiveY-t*1.1)-.5);
  float gridLine=step(.47,max(1.-gx*16.,1.-gy*14.))*smoothstep(.50,.12,uv.y)*(.14+.22*uBass);

  // Beat-reactive concentric shockwave pulse ring
  float radialDist=length(center*vec2(1.45,1.0));
  float shockRadius=fract(t*1.8+.15)*.78;
  float shockRing=exp(-abs(radialDist-shockRadius)*32.0)*(1.0-shockRadius)*(0.18+0.42*uBeat);

  float amount=.13+.25*cloudy+.20*glow+.13*aurora+.12*beams+.06*uTreble+gridLine+shockRing;
  float variant=mod(uStyle,5.0);
  if(variant<1.0)amount+=.15*cloudy;
  else if(variant<2.0)amount+=.14*aurora;
  else if(variant<3.0)amount+=.13*(1.-horizon);
  else if(variant<4.0)amount+=.11*n2;
  else amount+=.14*beams;

  vec3 color=mix(uBase,uAccent,clamp(amount+uBass*.05,0.,.68));
  color+=uAccent*(glow*.18+aurora*.14+shockRing*.35)*uLight;
  float vignette=1.0-smoothstep(.34,.94,length(center*vec2(1.18,1.04)));
  float lightBase=step(.45,dot(uBase,vec3(.2126,.7152,.0722)));
  color=mix(color*mix(.62,1.15,vignette),mix(uBase,uAccent,amount*.14),lightBase);
  // Crisp star/grain scintillation
  color+=uAccent*pow(max(0.,noise(uv*96.0+uStyle)-.82),3.8)*.22;
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
 tex.needsUpdate=true;
 return tex;
}

export class ProceduralCinema {
 readonly canvas:HTMLCanvasElement;
 readonly available:boolean;
 private renderer:THREE.WebGLRenderer|null=null;
 private camera=new THREE.PerspectiveCamera(48,16/9,.1,90);
 private scene=new THREE.Scene();
 private world=new THREE.Group();
 private cachedWorlds=new Map<string,WorldBundle>();
 private sceneTimes=new Map<SceneId,number>();
 private projectionVector=new THREE.Vector3();
 private reactive=new THREE.Group();
 private atmosphere:THREE.ShaderMaterial|null=null;
 private animated:Animated[]=[];
 private owned:THREE.Object3D[]=[];
 private ownedGeometry:THREE.BufferGeometry[]=[];
 private backgroundGeometry:THREE.PlaneGeometry|null=null;
 private ownedMaterials:THREE.Material[]=[];
 private shared:Record<string,THREE.BufferGeometry>={};
 private sharedEdges:Record<string,THREE.EdgesGeometry>={};
 private surfaceMap:THREE.DataTexture|null=null;
 private glowMap:THREE.DataTexture|null=null;
 private particle:THREE.Points|null=null;
 private wave:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshPhysicalMaterial>|null=null;
 private waveBase:Float32Array|null=null;
 private currentId:SceneId|null=null;
 private look:Look='nebula';
 private lastVisualTime=0;
 private renderCount=0;
 private width=1;
 private height=1;
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
 private builtQuality:RenderQuality|null=null;
 private keyLight:THREE.DirectionalLight|null=null;
 private rimLight:THREE.PointLight|null=null;
 private environment:THREE.WebGLRenderTarget|null=null;

 constructor(){
  this.canvas=document.createElement('canvas');
  let renderer:THREE.WebGLRenderer;
  try{
   renderer=new THREE.WebGLRenderer({
    canvas:this.canvas,
    antialias:false,
    alpha:false,
    powerPreference:'high-performance',
    preserveDrawingBuffer:true
   });
  }catch{
   this.available=false;
   return;
  }
  this.available=true;
  this.renderer=renderer;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  this.environment=pmrem.fromScene(room,.035);
  this.scene.environment=this.environment.texture;
  room.dispose();
  pmrem.dispose();
  renderer.setPixelRatio(1);
  this.camera.position.set(0,0,17);
  this.camera.lookAt(0,0,0);
  this.scene.add(this.world);
  this.world.add(this.reactive);
  this.scene.add(new THREE.HemisphereLight('#c6deff','#19101d',.58));
  const key=new THREE.DirectionalLight('#fff0db',3.4);
  this.keyLight=key;
  key.castShadow=true;
  key.shadow.mapSize.set(512,512);
  key.shadow.camera.left=-14;
  key.shadow.camera.right=14;
  key.shadow.camera.top=12;
  key.shadow.camera.bottom=-12;
  key.shadow.camera.near=.5;
  key.shadow.camera.far=60;
  key.shadow.bias=-.0006;
  key.shadow.normalBias=.035;
  key.shadow.radius=3;
  key.position.set(-7,8,12);
  this.scene.add(key);

  const rim=new THREE.PointLight('#93d5ff',78,42,2);
  rim.position.set(5,-3,6);
  this.rimLight=rim;
  this.scene.add(rim);

  this.shared={
   sphere:new THREE.SphereGeometry(1,32,24),
   softSphere:new THREE.SphereGeometry(1,12,9),
   ico:new THREE.IcosahedronGeometry(1,1),
   cube:new RoundedBoxGeometry(1,1,1,2,.045),
   torus:new THREE.TorusGeometry(1,.08,7,48),
   thickTorus:new THREE.TorusGeometry(1,.23,10,54),
   cone:new THREE.ConeGeometry(1,2,6),
   cylinder:new THREE.CylinderGeometry(.7,.7,1.7,12),
   tetra:new THREE.TetrahedronGeometry(1,0),
   octa:new THREE.OctahedronGeometry(1,0),
   plane:new THREE.PlaneGeometry(1,1),
  };
  const edgeBox=new THREE.BoxGeometry(1,1,1);
  this.sharedEdges={
   cube:new THREE.EdgesGeometry(edgeBox),
   ico:new THREE.EdgesGeometry(this.shared.ico),
   octa:new THREE.EdgesGeometry(this.shared.octa),
   tetra:new THREE.EdgesGeometry(this.shared.tetra),
   cone:new THREE.EdgesGeometry(this.shared.cone),
   cylinder:new THREE.EdgesGeometry(this.shared.cylinder),
  };
  edgeBox.dispose();

  this.glowMap=glowTexture();
  const side=128,grain=new Uint8Array(side*side*4),noise=random(431);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
   const v=Math.round(180+45*y/side+12*Math.sin(x*.24+y*.05)+noise()*18),i=(y*side+x)*4;
   grain[i]=v;grain[i+1]=Math.min(255,v+5);grain[i+2]=Math.min(255,v+12);grain[i+3]=255;
  }
  this.surfaceMap=new THREE.DataTexture(grain,side,side,THREE.RGBAFormat);
  this.surfaceMap.wrapS=this.surfaceMap.wrapT=THREE.RepeatWrapping;
  this.surfaceMap.colorSpace=THREE.SRGBColorSpace;
  this.surfaceMap.needsUpdate=true;

  const bg=new THREE.ShaderMaterial({
   vertexShader,
   fragmentShader:atmosphericShader,
   uniforms:{
    uTime:{value:0},
    uBass:{value:0},
    uTreble:{value:0},
    uBeat:{value:0},
    uStyle:{value:0},
    uLight:{value:.5},
    uBase:{value:new THREE.Color('#0a1228')},
    uAccent:{value:this.colorAccent.clone()}
   },
   depthWrite:false,
   side:THREE.DoubleSide
  });
  this.atmosphere=bg;
  this.backgroundGeometry=new THREE.PlaneGeometry(96,62);
  const background=new THREE.Mesh(this.backgroundGeometry,bg);
  background.position.z=-25;
  this.scene.add(background);

  this.temporalMaterial=new THREE.ShaderMaterial({
   vertexShader:postVertex,
   fragmentShader:temporalFragment,
   uniforms:{uCurrent:{value:null},uHistory:{value:null},uRetention:{value:0}},
   depthTest:false,
   depthWrite:false
  });
  this.copyMaterial=new THREE.ShaderMaterial({
   vertexShader:postVertex,
   fragmentShader:copyFragment,
   uniforms:{uTexture:{value:null}},
   depthTest:false,
   depthWrite:false
  });
  this.stage.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.temporalMaterial));
  this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.copyMaterial));
 }

 resetTrails(){this.hasHistory=false;}

 resize(width:number,height:number,quality:RenderQuality){
  if(!this.renderer||this.disposed)return;
  const w=Math.max(2,Math.round(width)),h=Math.max(2,Math.round(height));
  if(w===this.width&&h===this.height&&quality===this.quality)return;
  this.width=w;this.height=h;this.quality=quality;
  this.renderer.setSize(w,h,false);
  this.camera.aspect=w/h;
  this.camera.updateProjectionMatrix();
  this.source?.dispose();
  this.history?.forEach(x=>x.dispose());
  const params={depthBuffer:true,stencilBuffer:false,magFilter:THREE.LinearFilter,minFilter:THREE.LinearFilter};
  this.source=new THREE.WebGLRenderTarget(w,h,params);
  this.history=[
   new THREE.WebGLRenderTarget(w,h,{...params,depthBuffer:false}),
   new THREE.WebGLRenderTarget(w,h,{...params,depthBuffer:false})
  ];
  this.hasHistory=false;
  this.writeIndex=0;
 }

 private material(hex:string,transparent=false){
  const m=new THREE.MeshPhysicalMaterial({
   color:hex,
   metalness:transparent?.16:.52,
   roughness:transparent?.14:.26,
   map:transparent?null:this.surfaceMap,
   bumpMap:transparent?null:this.surfaceMap,
   bumpScale:.035,
   clearcoat:1,
   clearcoatRoughness:.2,
   envMapIntensity:transparent?1.15:.88,
   emissive:this.colorAccent,
   emissiveIntensity:.05,
   transparent,
   opacity:transparent?.52:1,
   side:THREE.FrontSide,
   depthWrite:!transparent
  });
  this.ownedMaterials.push(m);
  return m;
 }

 /** Build a luminous wireframe horizon grid / architectural cage (pdoom-video / baseline GPU line batch style). */
 private addStageWireGrid(colorHex:string,y=-5.9){
  const verts:number[]=[];
  const spanX=22,spanZ=20,steps=14;
  for(let i=-steps;i<=steps;i++){
   const x=(i/steps)*spanX;
   verts.push(x,y,-spanZ,x,y,6);
   const z=-spanZ+((i+steps)/(2*steps))*(spanZ+6);
   verts.push(-spanX,y,z,spanX,y,z);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.BufferAttribute(new Float32Array(verts),3));
  const mat=new THREE.LineBasicMaterial({
   color:colorHex,
   transparent:true,
   opacity:.22,
   blending:THREE.AdditiveBlending,
   depthWrite:false
  });
  this.ownedGeometry.push(geom);
  this.ownedMaterials.push(mat);
  const lines=new THREE.LineSegments(geom,mat);
  this.world.add(lines);
  this.owned.push(lines);
 }

 private clearWorld(){
  for(const object of this.owned){object.parent?.remove(object)}
  for(const g of this.ownedGeometry)g.dispose();
  for(const m of this.ownedMaterials)m.dispose();
  this.ownedGeometry=[];
  this.ownedMaterials=[];
  this.owned=[];
  this.animated=[];
  this.particle=null;
  this.wave=null;
  this.waveBase=null;
  this.hasHistory=false;
  this.renderCount=0;
 }

 private saveWorld():WorldBundle{
  return {
   world:this.world,
   reactive:this.reactive,
   animated:this.animated,
   owned:this.owned,
   ownedGeometry:this.ownedGeometry,
   ownedMaterials:this.ownedMaterials,
   particle:this.particle,
   wave:this.wave,
   waveBase:this.waveBase,
   look:this.look
  };
 }

 private restoreWorld(bundle:WorldBundle){
  Object.assign(this,bundle);
  this.scene.add(this.world);
  this.hasHistory=false;
 }

 private releaseWorld(bundle:WorldBundle){
  for(const object of bundle.owned)object.parent?.remove(object);
  bundle.ownedGeometry.forEach(g=>g.dispose());
  bundle.ownedMaterials.forEach(m=>m.dispose());
 }

 prepareScene(id:SceneId,quality:RenderQuality){
  if(!this.renderer||this.disposed||this.currentId===id||this.cachedWorlds.has(id+quality))return;
  const current=this.currentId,previousQuality=this.builtQuality;
  this.setupScene(id,quality);
  this.renderer.compile(this.scene,this.camera);
  if(current&&previousQuality)this.setupScene(current,previousQuality);
 }

 projectPoint(x:number,y:number,z:number,w:number,h:number){
  this.projectionVector.set(x,y,z).project(this.camera);
  return {
   x:(this.projectionVector.x*.5+.5)*w,
   y:(.5-this.projectionVector.y*.5)*h,
   visible:this.projectionVector.z<1&&this.projectionVector.z>-1
  };
 }

 private setupScene(id:SceneId,quality:RenderQuality){
  if(this.currentId===id&&quality===this.builtQuality)return;
  this.scene.remove(this.world);
  if(this.currentId&&this.builtQuality)this.cachedWorlds.set(this.currentId+this.builtQuality,this.saveWorld());
  const cached=this.cachedWorlds.get(id+quality);
  this.cachedWorlds.delete(id+quality);
  while(this.cachedWorlds.size>2){
   const key=this.cachedWorlds.keys().next().value!;
   this.releaseWorld(this.cachedWorlds.get(key)!);
   this.cachedWorlds.delete(key);
  }
  if(!cached){
   this.world=new THREE.Group();
   this.reactive=new THREE.Group();
   this.world.add(this.reactive);
   this.scene.add(this.world);
   this.owned=[];
   this.animated=[];
   this.ownedGeometry=[];
   this.ownedMaterials=[];
   this.particle=null;
   this.wave=null;
   this.waveBase=null;
  }else this.restoreWorld(cached);

  if(this.renderer)this.renderer.shadowMap.enabled=quality!=='Performance';
  if(this.keyLight){
   const size=quality==='High'?1024:512;
   if(this.keyLight.shadow.mapSize.x!==size){
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map=null;
    this.keyLight.shadow.mapSize.set(size,size);
   }
  }
  this.currentId=id;
  this.builtQuality=quality;
  this.look=PROCEDURAL_LOOKS[id]??'rings';
  const palette=byId[id];
  this.colorAccent=makeColor(palette.accent);
  if(this.rimLight)this.rimLight.color.copy(this.colorAccent);
  const bg=makeColor(palette.background);
  this.scene.background=bg.clone();
  this.scene.fog=new THREE.FogExp2(bg,.024);

  const shader=this.atmosphere;
  if(shader){
   shader.uniforms.uBase.value.copy(bg);
   shader.uniforms.uAccent.value.copy(this.colorAccent);
   shader.uniforms.uStyle.value=TEMPLATES.findIndex(x=>x.id===id)*.73+.5;
   shader.uniforms.uLight.value=['quiet-pages','ransom-poetry','color-riot','marker-diary','word-playground'].includes(id)?1.2:.72;
  }
  if(cached)return;

  const rand=random(seedNumber(id));
  const wireAccent=new THREE.LineBasicMaterial({
   color:palette.accent,
   transparent:true,
   opacity:.62,
   blending:THREE.AdditiveBlending,
   depthWrite:false
  });
  const wireFore=new THREE.LineBasicMaterial({
   color:palette.foreground,
   transparent:true,
   opacity:.45,
   blending:THREE.AdditiveBlending,
   depthWrite:false
  });
  this.ownedMaterials.push(wireAccent,wireFore);

  if(this.look==='ocean'||this.look==='underwater'){
   const geom=new THREE.PlaneGeometry(24,17,52,36);
   geom.rotateX(-PI*.48);
   const coords=geom.attributes.position.array as Float32Array;
   this.waveBase=new Float32Array(coords);
   const waveMaterial=this.material(palette.accent,true);
   waveMaterial.opacity=.62;
   waveMaterial.side=THREE.DoubleSide;
   const mesh=new THREE.Mesh(geom,waveMaterial);
   mesh.position.set(0,-4,-3);
   this.world.add(mesh);
   this.owned.push(mesh);
   this.ownedGeometry.push(geom);
   this.wave=mesh;
  }else if(id==='glass-architecture'){
   this.addStageWireGrid('#94cde9',-5.75);
  }else if(['tunnel','rings','glass','crystals','prisms','monuments','city','metal','flames'].includes(this.look)){
   this.addStageWireGrid(palette.accent,-6.0);
  }

  if(['glass','city','metal','monuments','crystals','prisms'].includes(this.look)){
   const floorMaterial=new THREE.MeshPhysicalMaterial({
    color:bg.clone().lerp(this.colorAccent,.12),
    metalness:.34,
    roughness:.38,
    envMapIntensity:.55
   });
   this.ownedMaterials.push(floorMaterial);
   const floor=new THREE.Mesh(this.shared.plane,floorMaterial);
   floor.rotation.x=-PI/2;
   floor.position.set(0,-6.1,-4);
   floor.scale.set(180,180,1);
   floor.receiveShadow=true;
   this.world.add(floor);
   this.owned.push(floor);
  }

  // Subtle depth-space starfield (no narrative bass forms, midrange rings, or treble detail objects)
  const amount=quality==='High'?280:quality==='Balanced'?180:90;
  const points=new Float32Array(amount*3);
  for(let i=0;i<amount;i++){
   points[i*3]=(rand()-.5)*37;
   points[i*3+1]=(rand()-.5)*23;
   points[i*3+2]=-18+rand()*24;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  this.ownedGeometry.push(geometry);
  const mat=new THREE.PointsMaterial({
   color:palette.foreground,
   size:quality==='High'?.085:.065,
   sizeAttenuation:true,
   transparent:true,
   opacity:.42,
   blending:THREE.AdditiveBlending,
   depthWrite:false
  });
  this.ownedMaterials.push(mat);
  this.particle=new THREE.Points(geometry,mat);
  this.world.add(this.particle);
  this.owned.push(this.particle);
  this.reactive.visible=false;
  this.hasHistory=false;
 }

 render(
  id:SceneId,
  p:Pulse,
  time:number,
  intensity:number,
  motionBlur:number,
  reduced:boolean,
  quality:RenderQuality,
  _narrativeObjects=false,
  cameraMode:ProceduralCamera='Automatic',
  cameraFrame?:CameraFrame
 ){
  if(!this.renderer||this.disposed||!this.source||!this.history)return false;
  if(time<this.lastVisualTime-.30||time-this.lastVisualTime>1.2)this.hasHistory=false;
  const delta=Math.max(0,Math.min(.1,time-(this.sceneTimes.get(id)??time-.016)));
  this.sceneTimes.set(id,time);
  if(this.currentId!==id||this.builtQuality!==quality)this.setupScene(id,quality);
  this.lastVisualTime=time;
  const motion=reduced?.16:1;
  this.reactive.visible=false;
  const energy=smooth(intensity);
  const bass=smooth(p.bass),treble=smooth(p.treble),beat=smooth(p.beat);

  if(this.atmosphere){
   this.atmosphere.uniforms.uTime.value=time;
   this.atmosphere.uniforms.uBass.value=bass*energy;
   this.atmosphere.uniforms.uTreble.value=treble*energy;
   this.atmosphere.uniforms.uBeat.value=beat*energy;
  }
  if(this.rimLight){
   this.rimLight.intensity=72+(bass*45+beat*55)*energy;
  }

  this.world.rotation.y=Math.sin(time*.10)*.12*motion;
  this.world.rotation.x=Math.sin(time*.075)*.06*motion;
  const path=cameraMode==='Automatic'?byId[id].camera:cameraMode;
  const angle=time*.18*motion;
  this.camera.position.x=path==='Orbit'||path==='orbit'?Math.sin(angle)*3.1:
   path==='Side'||path==='side'?3.8+Math.sin(time*.12)*.32*motion:
   Math.sin(time*.15)*.42*motion;
  this.camera.position.y=path==='Top'?4.8+Math.cos(time*.10)*.24*motion:
   path==='Orbit'||path==='orbit'?Math.cos(angle*.65)*.62*motion:
   path==='drift'?Math.cos(time*.14)*.58*motion:
   Math.cos(time*.11)*.26*motion;
  this.camera.position.z=path==='push'||path==='Front'?16.2-Math.sin(time*.14)*.42*motion-bass*.48*motion:
   path==='pullback'?18.2+Math.sin(time*.12)*.44*motion:
   path==='Top'?17.4-bass*.38*motion:17-bass*.52*motion;
  if(cameraFrame){
   this.camera.position.x+=cameraFrame.x*18+cameraFrame.yaw*22;
   this.camera.position.y+=cameraFrame.pitch*18-cameraFrame.y*18;
   this.camera.position.z/=cameraFrame.zoom;
  }
  this.camera.lookAt(cameraFrame?.yaw??0,cameraFrame?.pitch??0,0);
  if(cameraFrame)this.camera.rotateZ(cameraFrame.roll);
  this.camera.updateMatrixWorld();

  for(const a of this.animated){
   const channel=motionChannel(a.kind,a.size);
   const target=objectDrive(channel,bass,p.mids,treble,beat)*energy*motion;
   const dt=delta;
   const rate=channel==='beat'?38:channel==='treble'?30:22;
   const drive=a.drive??0,velocity=a.velocity??0;
   const decay=Math.exp(-rate*dt),distance=drive-target;
   const k=velocity+rate*distance;
   a.drive=target+(distance+k*dt)*decay;
   a.velocity=(velocity-rate*k*dt)*decay;
   const response=smooth(a.drive);
   const spin=time*(.068+.02*(a.kind%4))*motion+a.offset;
   const anchored=a.kind===2;
   a.mesh.position.y=a.base.y+Math.sin(spin)*.07*motion+(anchored?a.baseScale.y*response*.21:response*(channel==='treble'?.68:channel==='beat'?0:1.2));
   a.mesh.position.x=a.base.x+(anchored?0:Math.cos(a.offset)*response*(channel==='mids'?.85:.38)+Math.cos(spin*.7)*.075*motion);
   if(a.kind===4){
    const scale=a.size*(1+response*.85);
    a.mesh.scale.set(scale,scale,1);
   }else if(anchored){
    a.mesh.scale.copy(a.baseScale);
    a.mesh.scale.y*=1+response*.42;
   }else{
    a.mesh.scale.copy(a.baseScale).multiplyScalar(1+response*(channel==='beat'?.26:channel==='bass'?.45:channel==='mids'?.32:.18));
   }
   if(a.material){
    a.material.emissiveIntensity=.04+response*.18+beat*energy*.08;
   }
   if(!anchored){
    a.mesh.rotation.y+=delta*(.05+response*(channel==='treble'?2.9:.75))*motion;
    a.mesh.rotation.z+=delta*(.028+(channel==='mids'?response*1.35:0))*motion;
   }
  }

  if(this.wave&&this.waveBase){
   const pos=this.wave.geometry.attributes.position;
   const vals=pos.array as Float32Array;
   for(let i=0;i<vals.length;i+=3){
    const x=this.waveBase[i],z=this.waveBase[i+2];
    vals[i+1]=this.waveBase[i+1]+motion*(Math.sin(x*.58+time*.68)*.20+
       Math.cos(z*.66+time*.42)*.16+Math.sin((x+z)*.82+time*.74)*(.12+bass*.38*energy));
   }
   pos.needsUpdate=true;
   this.wave.geometry.computeVertexNormals();
  }

  if(this.particle){
   this.particle.rotation.z=time*.012*motion;
   const m=this.particle.material as THREE.PointsMaterial;
   m.opacity=.24+.66*treble*energy;
   m.size=.058+treble*energy*.19;
   this.particle.scale.setScalar(1+treble*energy*.16);
  }

  const blurMix=reduced?0:Math.max(0,Math.min(.82,motionBlur/100*.81));
  const retained=blurMix?Math.pow(blurMix,Math.min(3,delta*60)||1):0;
  const renderer=this.renderer;
  renderer.setRenderTarget(this.source);
  renderer.clear();
  renderer.render(this.scene,this.camera);
  if(this.temporalMaterial&&this.copyMaterial){
   const previous=this.history[1-this.writeIndex];
   const next=this.history[this.writeIndex];
   this.temporalMaterial.uniforms.uCurrent.value=this.source.texture;
   this.temporalMaterial.uniforms.uHistory.value=previous.texture;
   this.temporalMaterial.uniforms.uRetention.value=this.hasHistory?retained:0;
   renderer.setRenderTarget(next);
   renderer.render(this.stage,this.screenCamera);
   this.copyMaterial.uniforms.uTexture.value=next.texture;
   renderer.setRenderTarget(null);
   renderer.render(this.copyScene,this.screenCamera);
   this.writeIndex=1-this.writeIndex;
   this.hasHistory=true;
  }else{
   renderer.setRenderTarget(null);
   renderer.render(this.scene,this.camera);
  }
  this.renderCount++;
  return true;
 }

 dispose(){
  if(this.disposed)return;
  this.disposed=true;
  this.clearWorld();
  for(const bundle of this.cachedWorlds.values())this.releaseWorld(bundle);
  this.cachedWorlds.clear();
  this.sceneTimes.clear();
  Object.values(this.shared).forEach(g=>g.dispose());
  Object.values(this.sharedEdges).forEach(g=>g.dispose());
  this.environment?.dispose();
  this.keyLight?.shadow.map?.dispose();
  this.surfaceMap?.dispose();
  this.glowMap?.dispose();
  this.backgroundGeometry?.dispose();
  this.source?.dispose();
  this.history?.forEach(x=>x.dispose());
  this.atmosphere?.dispose();
  this.temporalMaterial?.dispose();
  this.copyMaterial?.dispose();
  this.stage.traverse(x=>{if(x instanceof THREE.Mesh)x.geometry.dispose()});
  this.copyScene.traverse(x=>{if(x instanceof THREE.Mesh)x.geometry.dispose()});
  this.renderer?.dispose();
  this.renderer?.forceContextLoss();
 }
}
