import {describe,it,expect} from 'vitest';
import {PROCEDURAL_LOOKS} from '../visualization/cinematic/procedural/ThreeEngine';
import {TEMPLATES,AUDIO_ONLY_SCENES,byId} from '../visualization/cinematic/catalog';

describe('procedural 3D scene registry',()=>{
 it('maps all thirty existing scenes, without missing or extraneous IDs',()=>{
  expect(Object.keys(PROCEDURAL_LOOKS).sort()).toEqual(TEMPLATES.filter(x=>x.family!=='2d').map(x=>x.id).sort());
  expect(Object.keys(PROCEDURAL_LOOKS)).toHaveLength(30);
 });
 it('uses a broad family of different 3D environmental architectures',()=>{
  expect(new Set(Object.values(PROCEDURAL_LOOKS)).size).toBeGreaterThanOrEqual(14);
  expect(PROCEDURAL_LOOKS['submerged-words']).toBe('underwater');
  expect(PROCEDURAL_LOOKS['glass-architecture']).toBe('glass');
  expect(PROCEDURAL_LOOKS['neon-velocity']).toBe('tunnel');
  expect(PROCEDURAL_LOOKS['cloud-cathedral']).toBe('clouds');
  expect(PROCEDURAL_LOOKS['crimson-impact']).toBe('metal');
 });
 it('offers forty audio-only slots and scene-specific color themes',()=>{
  expect(AUDIO_ONLY_SCENES).toHaveLength(40);
  for(const id of AUDIO_ONLY_SCENES){
   expect(PROCEDURAL_LOOKS[id]||byId[id].family==='2d').toBeTruthy();
   expect(byId[id].accent).toMatch(/^#[0-9a-f]{6}$/i);
  }
 });
});
