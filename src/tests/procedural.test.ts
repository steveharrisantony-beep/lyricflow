import {describe,it,expect,vi} from 'vitest';
import {MOTION_SCENES} from '../visualization/cinematic/procedural/MotionGraphics';
import {TEMPLATES,AUDIO_ONLY_SCENES,VOXELWALL_CATEGORIES,byId} from '../visualization/cinematic/catalog';
import {VOXELVERSE_STYLES,VOXELVERSE_FAMILIES,LYRIC_MOTIONS} from '../visualization/cinematic/kineticTypography';

const DELETED_SCENES=[
 'gilded-whirlpool','chroma-moire-voids','signal-chamber',
 'crimson-impact','vinyl-groove','concrete-manifesto','rain-on-glass','neon-velocity',
 'ink-rebellion','ocean-reverie','analog-breakdown','cloud-cathedral','stellar-expansion',
 'fragmented-thoughts','quiet-pages','monochrome-memory','monument-titles','midnight-confession',
 'glass-architecture','ransom-poetry','type-collision','petal-memory','submerged-words',
 'inferno-letterforms','holographic-frequency','pixel-pulse','marker-diary','bubble-pop',
 'word-playground','sunset-frequency','typographic-vortex','midnight-transit','final-ascension',
 'liquid-filigree','crimson-current','silk-waves','molten-contours','layered-contours',
 'pearl-resonance','orbital-score','silver-current','white-velocity'
];

describe('VoxelWall 2D scene & VoxelVerse lyric style registries',()=>{
 it('removes all 28 legacy 3D themes, Crimson Impact, Vinyl Groove, and 9 duplicate color-swap clones',()=>{
  const activeIds=new Set<string>(TEMPLATES.map(t=>t.id));
  for(const removed of DELETED_SCENES){
   expect(activeIds.has(removed)).toBe(false);
  }
 });
 it('covers all 8 VoxelWall categories with 28 distinct designs',()=>{
  const categories=VOXELWALL_CATEGORIES.map(c=>c.id);
  expect(categories).toEqual(['flow','contours','sculptures','space','nature','architecture','spectrum','journeys']);
  for(const cat of categories){
   expect(TEMPLATES.filter(t=>t.family===cat).length).toBeGreaterThanOrEqual(3);
  }
  expect(MOTION_SCENES).toHaveLength(23);
 });
 it('provides all 25 lyric animation styles across 4 families',()=>{
  expect(LYRIC_MOTIONS).toHaveLength(25);
  expect(VOXELVERSE_STYLES).toHaveLength(25);
  expect(VOXELVERSE_FAMILIES.map(f=>f.id)).toEqual(['signature','spatial','kinetic','editorial']);
  for(const id of AUDIO_ONLY_SCENES){
   expect(byId[id].accent).toMatch(/^#[0-9a-f]{6}$/i);
  }
 });
 it('zooms Color Riot, roots Pixel Garden below screen, wraps Origami Flight off-screen, and tiles Resonance Plate full-screen',async()=>{
  const {drawMotionGraphics}=await import('../visualization/cinematic/procedural/MotionGraphics');
  const {GraphicCompositions}=await import('../visualization/cinematic/procedural/GraphicCompositions');
  const {NO_AUDIO}=await import('../visualization/cinematic/paint');
  const w=1000,h=600;
  const makeCtx=()=>{
   const scales:[number,number][]=[];
   const moves:[number,number][]=[];
   const translates:[number,number][]=[];
   const strokeRects:[number,number,number,number][]=[];
   const arcs:[number,number][]=[];
   const images:[number,number,number,number][]=[];
   const grad={addColorStop:()=>{}};
   const ctx={
    save:()=>{},restore:()=>{},clearRect:()=>{},fillRect:()=>{},
    strokeRect:(x:number,y:number,rw:number,rh:number)=>{strokeRects.push([x,y,rw,rh]);},
    beginPath:()=>{},closePath:()=>{},fill:()=>{},stroke:()=>{},
    moveTo:(x:number,y:number)=>{moves.push([x,y]);},
    lineTo:()=>{},bezierCurveTo:()=>{},quadraticCurveTo:()=>{},
    arc:(x:number,y:number)=>{arcs.push([x,y]);},
    ellipse:()=>{},
    translate:(x:number,y:number)=>{translates.push([x,y]);},
    rotate:()=>{},
    scale:(sx:number,sy:number)=>{scales.push([sx,sy]);},
    setTransform:()=>{},getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
    drawImage:(_image:CanvasImageSource,x:number,y:number,rw:number,rh:number)=>{images.push([x,y,rw,rh]);},
    createLinearGradient:()=>grad,
    createRadialGradient:()=>grad,
    fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'butt',globalAlpha:1,shadowColor:'',shadowBlur:0,shadowOffsetY:0,
   } as unknown as CanvasRenderingContext2D;
   return {ctx,scales,moves,translates,strokeRects,arcs,images};
  };

  const riot=makeCtx();
  new GraphicCompositions().render(riot.ctx,w,h,1,NO_AUDIO,'geometry',0,1,true,false);
  expect(riot.scales.some(([sx,sy])=>sx>1.4&&sy>1.4)).toBe(true);

  const garden=makeCtx();
  drawMotionGraphics(garden.ctx,w,h,1,NO_AUDIO,'pixel-garden',1,false);
  const stemStarts=garden.moves.filter((_,idx)=>idx%3===0);
  expect(stemStarts.length).toBe(26);
  expect(stemStarts.every(([,y])=>y>h)).toBe(true);

  const flight=makeCtx();
  for(let t=0;t<25;t+=.5)drawMotionGraphics(flight.ctx,w,h,t,NO_AUDIO,'origami-flight',1,false);
  const planeX=flight.translates.map(([x])=>x);
  expect(Math.min(...planeX)).toBeLessThan(0);
  expect(Math.max(...planeX)).toBeGreaterThan(w);

  const plate=makeCtx(),tile=makeCtx();
  vi.stubGlobal('OffscreenCanvas',class{
   constructor(public width:number,public height:number){}
   getContext(){return tile.ctx;}
  });
  try{
   drawMotionGraphics(plate.ctx,w,h,1,NO_AUDIO,'resonance-plate',1,false);
   expect(tile.arcs).toHaveLength(1600);
   expect(plate.images.length).toBeGreaterThan(1);
   expect(plate.images.every(([, ,rw,rh])=>rw===h*.86&&rh===h*.86)).toBe(true);
   expect(Math.min(...plate.images.map(([x])=>x))).toBeLessThan(-w*.5);
   expect(Math.max(...plate.images.map(([x,,rw])=>x+rw))).toBeGreaterThan(w*.5);
  }finally{vi.unstubAllGlobals();}
 });
});

