import {expect,it} from 'vitest';
import {currentWordAnimationPose as pose} from '../visualization/cinematic/currentWordAnimations';

it.each(['lift','zoom'] as const)('%s overlaps neighbouring letter pulses and moves the crest through a word',animation=>{
 const first=pose(animation,.30,1,0,5),second=pose(animation,.30,1,1,5),last=pose(animation,.30,1,4,5);
 const amplitude=(p:ReturnType<typeof pose>)=>animation==='lift'?Math.abs(p.y):p.scale-1;
 expect(amplitude(first)).toBeGreaterThan(0);expect(amplitude(second)).toBeGreaterThan(0);
 expect(amplitude(first)).toBeGreaterThan(amplitude(second));expect(amplitude(last)).toBe(0);
 expect(amplitude(pose(animation,.65,1,0,5))).toBe(0);
 expect(amplitude(pose(animation,.65,1,4,5))).toBeGreaterThan(.1);
 for(const count of [2,5,30])for(let index=0;index<count-1;index++){
  const secondStart=(index+1)/(count-1)*.4,time=secondStart+.01;
  expect(amplitude(pose(animation,time,1,index,count))).toBeGreaterThan(0);
  expect(amplitude(pose(animation,time,1,index+1,count))).toBeGreaterThan(0);
 }
});
it('accumulates letter glow without fading earlier letters before the word ends',()=>{
 const first=pose('glow',.22,1,0,5).glow;
 expect(first).toBeCloseTo(.34);
 expect(pose('glow',.22,1,4,5).glow).toBe(0);
 for(const progress of [.4,.6,.8,.96,.999])expect(pose('glow',progress,1,0,5).glow).toBe(first);
 for(let index=0;index<5;index++)expect(pose('glow',.96,1,index,5).glow).toBeCloseTo(.34);
 expect(pose('glow',1,1,0,5).glow).toBe(0);
 expect(pose('glow',1.1,1,4,5).glow).toBe(0);
});
it('replays smoothly after seeking backwards and resets at every word boundary',()=>{
 for(const animation of ['lift','zoom','glow'] as const){
  const before=pose(animation,.38,1,2,7);
  pose(animation,.95,1,2,7);pose(animation,1,1,2,7);
  expect(pose(animation,.38,1,2,7)).toEqual(before);
  expect(pose(animation,0,1,0,7)).toEqual({y:0,scale:1,glow:0});
  expect(pose(animation,1,1,6,7)).toEqual({y:0,scale:1,glow:0});
 }
});
it('uses a single smooth unit for shaped words and respects zero/reduced motion',()=>{
 expect(pose('lift',.5,1,0,1).y).toBeCloseTo(-.2);
 expect(pose('zoom',.5,1,0,1).scale).toBeCloseTo(1.14);
 for(const animation of ['lift','zoom','glow'] as const)for(let index=0;index<5;index++){
  expect(pose(animation,.5,0,index,5)).toEqual({y:0,scale:1,glow:0});
 }
 expect(pose('off',.5,1,2,5)).toEqual({y:0,scale:1,glow:0});
});
it('keeps the wave continuous for short words, long words and emoji/combining grapheme counts',()=>{
 for(const animation of ['lift','zoom','glow'] as const)for(const count of [1,2,6,80])for(let index=0;index<count;index++){
  const a=pose(animation,.45,1,index,count),b=pose(animation,.4501,1,index,count);
  expect(Object.values(a).every(Number.isFinite)).toBe(true);
  expect(Math.abs(a.y-b.y)).toBeLessThan(.001);
  expect(Math.abs(a.scale-b.scale)).toBeLessThan(.001);
  expect(Math.abs(a.glow-b.glow)).toBeLessThan(.001);
 }
});
