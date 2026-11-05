import {expect,it} from 'vitest';
import {advanceThemeSearchState,shouldSuspendAutoVideoSearch,type ThemeSearchState} from '../music/themeSearchGate';

const initial:ThemeSearchState={lastRecording:'',consecutiveThemeSongs:0,mode:'video'};

it('searches at most three consecutive different songs in Themes mode',()=>{
 let state=initial;
 for(let song=1;song<=3;song++){
  expect(shouldSuspendAutoVideoSearch(state,'song-'+song,'theme')).toBe(false);
  state=advanceThemeSearchState(state,'song-'+song,'theme');
  expect(state.consecutiveThemeSongs).toBe(song);
 }
 expect(shouldSuspendAutoVideoSearch(state,'song-4','theme')).toBe(true);
 state=advanceThemeSearchState(state,'song-4','theme');
 expect(shouldSuspendAutoVideoSearch(state,'song-4','theme')).toBe(true);
});

it('does not count rerenders, ads, empty tracks or the same recording again',()=>{
 const first=advanceThemeSearchState(initial,'song-1','theme');
 expect(advanceThemeSearchState(first,'song-1','theme')).toBe(first);
 expect(advanceThemeSearchState(first,'Advertisement','theme',false)).toBe(first);
 expect(advanceThemeSearchState(first,'','theme')).toBe(first);
 expect(shouldSuspendAutoVideoSearch(first,'Advertisement','theme',false)).toBe(false);
});

it('resumes immediately on Video mode and restarts the theme streak if switched back',()=>{
 let state:ThemeSearchState=initial;
 for(let i=1;i<=4;i++)state=advanceThemeSearchState(state,'song-'+i,'theme');
 expect(shouldSuspendAutoVideoSearch(state,'song-4','video')).toBe(false);
 state=advanceThemeSearchState(state,'song-4','video');
 expect(state.consecutiveThemeSongs).toBe(0);
 state=advanceThemeSearchState(state,'song-4','theme');
 expect(state.consecutiveThemeSongs).toBe(1);
});
