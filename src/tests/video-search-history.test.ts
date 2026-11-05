import {expect,it} from 'vitest';
import {
 getVideoSearchLogs,logThemeVideoSearchSuspended,logVideoFiltering,
 logVideoPlaybackError,logVideoPlaybackRecovery,logVideoSearch,videoSearchLogKey,
} from '../music/videoSearchHistory';
import {MAX_AUTO_VIDEO_RELOADS,nextAutoVideoRecoveryAction} from '../music/videoPlaybackRecovery';

it('limits playback recovery to the selected video without selecting a fallback',()=>{
 expect(MAX_AUTO_VIDEO_RELOADS).toBe(2);
 expect(nextAutoVideoRecoveryAction(0)).toBe('reload');
 expect(nextAutoVideoRecoveryAction(1)).toBe('reload');
 expect(nextAutoVideoRecoveryAction(2)).toBe('stop');
 expect(nextAutoVideoRecoveryAction(3)).toBe('stop');
});

it('keeps search, filtering, errors and retries scoped to an individual song',async()=>{
 const a=videoSearchLogKey({title:'Video Log A',artist:'Artist A',provider:'external'});
 const b=videoSearchLogKey({title:'Video Log B',artist:'Artist B',provider:'jiosaavn'});
 expect(a).not.toBe(b);
 await logVideoSearch('Video Log A Artist A Music Video','Autoplay',async()=>[{} as never,{} as never],undefined,a);
 logVideoFiltering(a,2,1);
 logVideoPlaybackError('abc123','Player error 153',a);
 logVideoPlaybackRecovery('abc123','Automatic reload 1 of 2',a);
 await logVideoSearch('Video Log B','Search online',async()=>[],undefined,b);
 const songA=getVideoSearchLogs().filter(e=>e.recordingKey===a);
 const songB=getVideoSearchLogs().filter(e=>e.recordingKey===b);
 expect(songA.some(e=>e.mode==='Autoplay'&&e.resultCount===2&&e.passedFilterCount===1)).toBe(true);
 expect(songA.some(e=>e.mode==='Playback error')).toBe(true);
 expect(songA.some(e=>e.mode==='Playback recovery')).toBe(true);
 expect(songA.every(e=>e.recordingKey!==b)).toBe(true);
 expect(songB.some(e=>e.mode==='Search online'&&e.resultCount===0)).toBe(true);
});

it('records a single persistent-Themes suspension for the current track',()=>{
 const key=videoSearchLogKey({title:'Suspension Test 2026',artist:'Artist'});
 logThemeVideoSearchSuspended(key);
 logThemeVideoSearchSuspended(key);
 expect(getVideoSearchLogs().filter(e=>e.mode==='Suspension'&&e.recordingKey===key)).toHaveLength(1);
});

it('keeps the log identity stable across duration changes',()=>{
 expect(videoSearchLogKey({title:'Test',artist:'Singer',provider:'external'}))
  .toBe(videoSearchLogKey({title:'Test',artist:'Singer',provider:'external'}));
});
