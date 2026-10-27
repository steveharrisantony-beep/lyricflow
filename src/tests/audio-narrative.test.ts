import {describe,it,expect} from 'vitest';
import {BeatDetector} from '../audio/beatDetector';
import {objectMotion,selectMotif} from '../visualization/cinematic/narrative';
import {spatialLayoutFor,spatialFontFor} from '../visualization/cinematic/spatialTypography';
import {TEMPLATES,type DirectedScene} from '../visualization/cinematic/catalog';
import {fontLabel} from '../visualization/cinematic/fonts';
import type {Pulse} from '../visualization/cinematic/paint';
const silence=new Uint8Array(1024);
const attack=new Uint8Array(1024);
for(let i=6;i<450;i++)attack[i]=i<100?230:i<220?170:110;
function exercise(tempo=120,sensitivity=.5){
 const detector=new BeatDetector();
 const pulses:number[]=[];let latest=detector.update(silence,0,22050,0,sensitivity);
 for(let frame=1;frame<1100;frame++){
  const t=frame/100;
  const beatAge=t%(60/tempo);
  const sharp=beatAge<.02;
  latest=detector.update(sharp?attack:silence,t,22050,sharp?.20:0,sensitivity);
  if(latest.onset>.99)pulses.push(t);
 }
 return {latest,pulses};
}
describe('spectral-flux detector',()=>{
 it('detects a stable 120 BPM synthetic pulse train',()=>{
  const {latest,pulses}=exercise();
  expect(pulses.length).toBeGreaterThanOrEqual(15);
  expect(latest.bpm).toBeGreaterThanOrEqual(110);
  expect(latest.bpm).toBeLessThanOrEqual(130);
  expect(latest.tempoConfidence).toBeGreaterThan(.45);
 });
 it('does not invent beats from silence',()=>{
  const d=new BeatDetector();let result=d.update(silence,0,22050,0);
  for(let i=1;i<500;i++)result=d.update(silence,i/100,22050,0);
  expect(result.beatCount).toBe(0);
  expect(result.bpm).toBe(0);
 });
 it('does not turn sensitivity into additional beats',()=>{
  const low=exercise(120,.14),high=exercise(120,.8);
  expect(Math.abs(low.latest.beatCount-high.latest.beatCount)).toBeLessThanOrEqual(1);
 });
 it('resets detected tempo on a seek or discontinuity',()=>{
  const d=new BeatDetector();
  for(let i=0;i<400;i++){
   const t=i/100;
   d.update(t%(.5)<.02?attack:silence,t,22050,.1);
  }
  expect(d.update(silence,1.2,22050,0).bpm).toBe(0);
 });
});
const quiet:Pulse={bass:0,mids:0,treble:0,loudness:0,beat:0,onset:0,downbeat:0};
describe('narrative audio mapping',()=>{
 it('makes objects scale with bass and shimmer with treble',()=>{
  const base=objectMotion(quiet,.75);
  const bass=objectMotion({...quiet,bass:.8},.75);
  const treble=objectMotion({...quiet,treble:.8},.75);
  expect(bass.scale).toBeGreaterThan(base.scale+.15);
  expect(treble.glow).toBeGreaterThan(base.glow+.2);
 });
 it('honors reduced motion',()=>{
  const vigorous=objectMotion({...quiet,bass:1},1);
  const reduced=objectMotion({...quiet,bass:1},1,true);
  expect(reduced.scale-1).toBeLessThan((vigorous.scale-1)*.2);
 });
 it('uses explicit lyric imagery before scene mood fallbacks',()=>{
  expect(selectMotif('Rain falling down','warm','holographic-tide')).toBe('rain');
  expect(selectMotif('I love you','fire','cobalt-contours')).toBe('heart');
  expect(selectMotif('Every star is shining','memory','crystal-resonance')).toBe('stars');
 });
});
describe('spatial typography',()=>{
 const template=TEMPLATES[0];
 const scene:DirectedScene={id:template.id,start:0,end:16,
  font:template.font,layout:template.layout,camera:template.camera,
  transition:template.transition,variation:1,section:0,reason:'test'};
 it('stays deterministic when seeking through the song',()=>{
  expect(spatialLayoutFor(scene,'The stars are waiting')).toBe(spatialLayoutFor(scene,'The stars are waiting'));
 });
 it('provides meaningful lyric composition variety',()=>{
  const names=new Set(Array.from({length:90},(_,i)=>spatialLayoutFor({...scene,variation:i%5},'Line '+i+' with different words')));
  expect(names.size).toBeGreaterThanOrEqual(7);
 });
 it('chooses registered premium fonts',()=>{
  expect(fontLabel(spatialFontFor(scene,'Another memory')).length).toBeGreaterThan(3);
 });
});
