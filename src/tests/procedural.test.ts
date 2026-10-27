import {describe,it,expect} from 'vitest';
import {MOTION_SCENES} from '../visualization/cinematic/procedural/MotionGraphics';
import {TEMPLATES,AUDIO_ONLY_SCENES,VOXELWALL_CATEGORIES,byId} from '../visualization/cinematic/catalog';
import {VOXELVERSE_STYLES,VOXELVERSE_FAMILIES,LYRIC_MOTIONS} from '../visualization/cinematic/kineticTypography';

const DELETED_SCENES=[
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
 it('covers all 7 VoxelWall categories (Flow, Contours, Sculptures, Space, Nature, Architecture, Journeys) with 23 distinct designs',()=>{
  const categories=VOXELWALL_CATEGORIES.map(c=>c.id);
  expect(categories).toEqual(['flow','contours','sculptures','space','nature','architecture','journeys']);
  for(const cat of categories){
   expect(TEMPLATES.filter(t=>t.family===cat).length).toBeGreaterThanOrEqual(3);
  }
  expect(MOTION_SCENES).toHaveLength(21);
 });
 it('provides all 19 VoxelVerse lyric animation styles across 4 families',()=>{
  expect(LYRIC_MOTIONS).toHaveLength(19);
  expect(VOXELVERSE_STYLES).toHaveLength(19);
  expect(VOXELVERSE_FAMILIES.map(f=>f.id)).toEqual(['signature','spatial','kinetic','editorial']);
  for(const id of AUDIO_ONLY_SCENES){
   expect(byId[id].accent).toMatch(/^#[0-9a-f]{6}$/i);
  }
 });
});
