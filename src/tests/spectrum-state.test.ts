import {expect,it} from 'vitest';
import {SpectrumState} from '../visualization/cinematic/procedural/SpectrumThemes';
import {NO_AUDIO} from '../visualization/cinematic/paint';

it('keeps frequency bins independent and bounds invalid input',()=>{
 const state=new SpectrumState(),bands=new Float32Array(64);bands[2]=1;bands[3]=NaN;bands[4]=-1;
 for(let i=0;i<60;i++)state.update({...NO_AUDIO,bands},i/60);
 expect(state.levels[2]).toBeGreaterThan(.99);
 expect(state.levels[63]).toBe(0);expect(state.levels[3]).toBe(0);expect(state.levels[4]).toBe(0);
});
it('normalizes attack/release and history sampling across display frame rates',()=>{
 const bands=new Float32Array(64).fill(.75);
 const run=(fps:number)=>{const s=new SpectrumState();for(let i=0;i<=fps;i++)s.update({...NO_AUDIO,bands},i/fps);return s;};
 const slow=run(30),fast=run(120);
 expect(slow.levels[0]).toBeCloseTo(fast.levels[0],5);
 expect(slow.cursor).toBe(24);expect(fast.cursor).toBe(24);
});
it('holds peaks briefly before falling back toward silence',()=>{
 const s=new SpectrumState(),bands=new Float32Array(64).fill(1);
 for(let i=0;i<=30;i++)s.update({...NO_AUDIO,bands},i/60);
 const peak=s.peaks[0];bands.fill(0);
 for(let i=31;i<=42;i++)s.update({...NO_AUDIO,bands},i/60);
 expect(s.peaks[0]).toBeCloseTo(peak,4);
 for(let i=43;i<240;i++)s.update({...NO_AUDIO,bands},i/60);
 expect(s.levels[0]).toBeLessThan(.001);expect(s.peaks[0]).toBeLessThan(.1);
});
it('uses a bounded history, freezes scrolling with reduced motion and resets when the clock reverses',()=>{
 const s=new SpectrumState(),bands=new Float32Array(64).fill(.5),history=s.history;
 for(let i=0;i<600;i++)s.update({...NO_AUDIO,bands},i/60);
 expect(s.history).toBe(history);expect(history.length).toBe(64*96);
 const cursor=s.cursor;
 for(let i=600;i<660;i++)s.update({...NO_AUDIO,bands},i/60,true);
 expect(s.cursor).toBe(cursor);
 s.update(NO_AUDIO,0);expect(s.cursor).toBe(0);expect(s.history.every(v=>v===0)).toBe(true);
});
it('copies waterfall state independently for outgoing transitions',()=>{
 const first=new SpectrumState(),second=new SpectrumState(),bands=new Float32Array(64).fill(.8);
 for(let i=0;i<60;i++)first.update({...NO_AUDIO,bands},i/60);
 second.copyFrom(first);
 expect(second.history).toEqual(first.history);expect(second.history).not.toBe(first.history);
 first.reset();expect(second.history.some(v=>v>0)).toBe(true);
});
