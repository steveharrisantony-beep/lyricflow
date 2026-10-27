import {describe,it,expect} from 'vitest';
import {visualSystemFor} from '../visualization/cinematic/CinematicStage';
import {TEMPLATES} from '../visualization/cinematic/catalog';
import {getAudioFrequencyBands,getAudioSensitivity,setAudioSensitivity} from '../audio/audioSignal';
import {GraphicCompositions} from '../visualization/cinematic/procedural/GraphicCompositions';

describe('visual architecture',()=>{
 it('exposes three distinct 2D render systems with zero 3D WebGL themes',()=>{
  expect(visualSystemFor('signal-chamber')).toBe('spectrum');
  expect(visualSystemFor('color-riot')).toBe('geometry');
  expect(visualSystemFor('holographic-tide')).toBe('motion2d');
 });
 it('routes all other 21 VoxelWall scene IDs through the 2D motion engine',()=>{
  const remaining=TEMPLATES.filter(t=>!['signal-chamber','color-riot'].includes(t.id));
  expect(remaining).toHaveLength(21);
  expect(remaining.every(t=>visualSystemFor(t.id)==='motion2d')).toBe(true);
 });
 it('provides a non-allocating stable 64-band analyzer interface',()=>{
  const bands=getAudioFrequencyBands();
  expect(bands).toBeInstanceOf(Float32Array);
  expect(bands.length).toBe(64);
  expect(getAudioFrequencyBands()).toBe(bands);
  expect([...bands].every(Number.isFinite)).toBe(true);
 });
 it('keeps 50 percent audio sensitivity as default',()=>{
  const initial=getAudioSensitivity();
  expect(initial).toBe(.5);
  setAudioSensitivity(.75);
  expect(getAudioSensitivity()).toBe(.75);
  setAudioSensitivity(initial);
 });
 it('constructs the image-free original Canvas graphic engines',()=>{
  const engine=new GraphicCompositions();
  expect(engine).toBeInstanceOf(GraphicCompositions);
  expect(()=>engine.reset()).not.toThrow();
 });
});