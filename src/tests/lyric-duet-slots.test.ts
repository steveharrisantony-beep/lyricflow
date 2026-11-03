import {afterEach,describe,expect,it} from 'vitest';
import type {TimedLine} from '../lyrics/lrc';
import {buildCues,getLyricState,setLyricTimeline,type LyricCue} from '../lyrics/lyricTimeline';

const line=(time:number,end:number,text:string):TimedLine=>({time,end,text});
const active=(time:number)=>{
 const state=getLyricState(time);
 return [state.cue,state.secondaryCue].filter((cue):cue is LyricCue=>cue!==null);
};
const sides=(time:number)=>active(time).map(cue=>[cue.text,cue.duetSide]);
afterEach(()=>setLyricTimeline([]));

describe('reusable duet slots',()=>{
 it('reuses each freed side through a chain and restores normal placement after both finish',()=>{
  const cues=buildCues([
   line(0,4,'First'),line(1,7,'Second'),line(4.4,9,'Third'),line(7.4,12,'Fourth'),line(13,15,'Solo')
  ],[]);
  setLyricTimeline(cues);
  expect(sides(.5)).toEqual([['First','left']]);
  expect(sides(2)).toEqual([['First','left'],['Second','right']]);
  expect(sides(cues[0].end)).toEqual([['Second','right']]);
  expect(sides(4.4)).toEqual([['Second','right'],['Third','left']]);
  expect(sides(cues[1].end)).toEqual([['Third','left']]);
  expect(sides(7.4)).toEqual([['Third','left'],['Fourth','right']]);
  expect(sides(cues[2].end)).toEqual([['Fourth','right']]);
  expect(active(cues[3].end)).toEqual([]);
  expect(sides(13)).toEqual([['Solo',undefined]]);
  expect(new Set(cues.slice(0,4).map(cue=>cue.duetGroupKey)).size).toBe(1);
  expect(cues[4].duetGroupKey).toBeUndefined();
  expect(cues.every(cue=>cue.end===cue.naturalEnd)).toBe(true);
 });

 it('can replace the newer line repeatedly while the first singer holds a long note',()=>{
  const cues=buildCues([line(0,60,'Sustained'),...Array.from({length:12},(_,i)=>line(1+i*3,3+i*3,`Reply ${i}`))],[]);
  setLyricTimeline(cues);
  expect(cues[0].duetSide).toBe('left');
  for(let i=1;i<cues.length;i++){
   expect(cues[i].duetSide).toBe('right');
   expect(cues[i].duetColorIndex).not.toBe(cues[0].duetColorIndex);
   for(const previous of cues.slice(Math.max(0,i-2),i))expect(cues[i].duetColorIndex).not.toBe(previous.duetColorIndex);
   expect(sides(cues[i].time+.5)).toEqual([['Sustained','left'],[cues[i].text,'right']]);
  }
 });

 it('fills a side at its exact release boundary without swapping the ongoing singer',()=>{
  const cues=buildCues([line(0,4,'First'),line(1,8,'Second'),line(4.3,10,'Third')],[]);
  setLyricTimeline(cues);
  expect(cues[0].end).toBe(4.3);
  expect(sides(4.3)).toEqual([['Second','right'],['Third','left']]);
 });

 it('queues extra simultaneous voices for the first free side without replaying expired lines',()=>{
  const cues=buildCues([
   line(0,6,'First'),line(1,4,'Second'),line(2,9,'Third'),line(3,10,'Fourth'),
   line(4,4.1,'Expired'),line(4.2,12,'Fifth')
  ],[]);
  setLyricTimeline(cues);
  expect(sides(3.5)).toEqual([['First','left'],['Second','right']]);
  expect(sides(cues[1].end)).toEqual([['First','left'],['Third','right']]);
  expect(sides(cues[0].end)).toEqual([['Third','right'],['Fourth','left']]);
  expect(sides(cues[2].end)).toEqual([['Fourth','left'],['Fifth','right']]);
  expect(cues[2].time).toBe(2);
  expect(cues[2].duetStart).toBe(cues[1].end);
  expect(cues[4].duetStart).toBeGreaterThanOrEqual(cues[4].end);
  expect(cues[4].duetColorIndex).toBeUndefined();
  for(let time=0;time<13;time+=.05){
   const visible=active(time);
   expect(new Set(visible.map(cue=>cue.duetSide)).size).toBe(visible.length);
   expect(visible.some(cue=>cue.text==='Expired')).toBe(false);
  }
 });

 it('reconstructs the same assignments after seeking, including simultaneous starts and lyric offsets',()=>{
  const cues=buildCues([
   line(0,4,'First'),line(0,7,'Second'),line(4.4,9,'Third'),
   line(12,14,'New first'),line(12,16,'New second'),line(20,22,'Solo')
  ],[]);
  setLyricTimeline(cues,.5);
  const initial=sides(4);
  for(const time of [12,20,0,30,1,8])active(time);
  expect(sides(4)).toEqual(initial);
  expect(initial).toEqual([['Second','right'],['Third','left']]);
  expect(sides(11.5)).toEqual([['New first','left'],['New second','right']]);
  expect(cues[3].duetGroupKey).not.toBe(cues[0].duetGroupKey);
  expect(sides(19.5)).toEqual([['Solo',undefined]]);
 });
});
