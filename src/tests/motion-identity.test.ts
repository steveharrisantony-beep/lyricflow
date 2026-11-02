import {expect,it} from 'vitest';
import {letterMotionPose,lineMotionPose,phraseTracking} from '../visualization/cinematic/letterMotion';
import type {LyricMotion} from '../visualization/cinematic/kineticTypography';
const times=Array.from({length:40},(_,i)=>.7+i*.12);
const span=(values:number[])=>Math.max(...values)-Math.min(...values);
const pose=(id:LyricMotion,time:number,index=3)=>letterMotionPose(id,time,index,17,1,false,8);

it('keeps banner travel, whole-line lens breathing and pure tracking as three separate hold behaviours',()=>{
 expect(span(times.map(t=>lineMotionPose('curtain-sweep',t,8,0,1000,1).x))).toBeGreaterThan(20);
 expect(times.every(t=>lineMotionPose('ship',t,8,0,1000,1).x===0)).toBe(true);
 const lens=times.map(t=>lineMotionPose('iris',t,8,0,1000,1).scale!);
 expect(span(lens)).toBeGreaterThan(.04);expect(Math.max(...lens)).toBeLessThanOrEqual(1);
 expect(lineMotionPose('portal',2,8,0,1000,1).scale).toBeUndefined();
 expect(span(times.map(t=>phraseTracking('concertina',t,1)))).toBeGreaterThan(.055);
 expect(times.every(t=>pose('concertina',t).scaleX===1&&pose('concertina',t).scaleY===1&&pose('concertina',t).y===0)).toBe(true);
});
it('separates vertical shutters, baseline stretching and depth spirals from gentle floating',()=>{
 expect(span(times.map(t=>pose('venetian',t).scaleY))).toBeGreaterThan(.20);
 expect(times.every(t=>pose('venetian',t).scaleX===1&&pose('hinge',t).scaleY===1)).toBe(true);
 expect(span(times.map(t=>pose('silk-stretch',t).scaleY))).toBeGreaterThan(.24);
 expect(times.every(t=>pose('elastic',t).scaleY===1)).toBe(true);
 expect(span(times.map(t=>pose('helix',t).scaleX))).toBeGreaterThan(.24);
 expect(times.every(t=>pose('wave',t).scaleX===1)).toBe(true);
});
it('distinguishes one-way lower-pivot domino kicks from bidirectional upper-pivot pendulums',()=>{
 const domino=times.map(t=>pose('domino',t,0)),pendulum=times.map(t=>pose('pendulum',t,0));
 expect(domino.every(p=>p.rotation>=0&&p.y>=0)).toBe(true);
 expect(Math.max(...domino.map(p=>p.rotation))).toBeGreaterThan(.18);
 expect(Math.min(...pendulum.map(p=>p.rotation))).toBeLessThan(-.12);
 expect(Math.max(...pendulum.map(p=>p.rotation))).toBeGreaterThan(.12);
 expect(pendulum.every(p=>p.y<=0)).toBe(true);
});
it('distinguishes vertical zipper teeth from groups weaving horizontally',()=>{
 for(const time of times){
  expect(pose('zipper',time,0).y).toBeLessThan(-.02);
  expect(pose('zipper',time,1).y).toBeGreaterThan(.02);
  expect(pose('switchback',time,0).y).toBeCloseTo(0,12);
  expect(pose('switchback',time,0).x).toBe(pose('switchback',time,2).x);
  expect(pose('switchback',time,0).x).toBe(-pose('switchback',time,3).x);
 }
});
it('holds a visible fan arch, wind flutter and radial bloom with different spatial patterns',()=>{
 const left=pose('fan',2,0),middle=pose('fan',2,8),right=pose('fan',2,16);
 expect(left.rotation).toBeGreaterThan(.1);expect(right.rotation).toBeLessThan(-.1);expect(middle.y).toBeLessThan(-.08);
 expect(span(times.map(t=>pose('letter-rain',t).rotation))).toBeGreaterThan(.17);
 const petals=times.map(t=>pose('rosette',t));
 expect(span(petals.map(p=>p.y))).toBeGreaterThan(.08);
 const reference=petals[0];
 for(const p of petals)expect(reference.x*p.y-reference.y*p.x).toBeCloseTo(0,10);
});
it('disables composition motion and tracking for reduced/zero-energy rendering',()=>{
 for(const motion of ['curtain-sweep','iris','concertina'] as const){
  expect(lineMotionPose(motion,2,8,0,1000,0)).toEqual({x:0});
  expect(phraseTracking(motion,2,0)).toBe(0);
 }
});
