import {describe,it,expect} from 'vitest';
import {effectiveLyricTime,clampLyricDelay,formatLyricDelay} from '../lyrics/lyricTiming';
import {setLyricTimeline,getLyricState,type LyricCue} from '../lyrics/lyricTimeline';

describe('offset vs independent lyrics delay',()=>{
 it('a positive delay displays lyrics later, while a positive offset advances them',()=>{
  expect(effectiveLyricTime(10,0,1)).toBe(9);
  expect(effectiveLyricTime(10,1,0)).toBe(11);
  expect(effectiveLyricTime(10,1,1)).toBe(10);
  expect(effectiveLyricTime(10,0,-2)).toBe(12);
 });
 it('allows negative delay and guards values outside configured range',()=>{
  expect(clampLyricDelay(-.25)).toBe(-.25);
  expect(clampLyricDelay(25.555)).toBe(25.56);
  expect(clampLyricDelay(500)).toBe(30);
  expect(clampLyricDelay(-500)).toBe(-30);
  expect(clampLyricDelay(Number.NaN)).toBe(0);
  expect(formatLyricDelay(-.25)).toBe('-0.25s');
  expect(formatLyricDelay(.25)).toBe('+0.25s');
 });
 it('affects the same audio lyric timeline used by the cinema renderer',()=>{
  const cue:LyricCue={time:5,end:8,text:'Sample',romanized:'',mood:'abstract',words:[],timing:'estimated'};
  setLyricTimeline([cue],effectiveLyricTime(0,0,1));
  // Passing offset-delay = -1 shifts cue visibility 1 second later.
  expect(getLyricState(5).cue).toBeNull();
  expect(getLyricState(6).cue?.text).toBe('Sample');
  setLyricTimeline([cue],effectiveLyricTime(0,0,-1));
  expect(getLyricState(4).cue?.text).toBe('Sample');
  setLyricTimeline([]);
 });
});