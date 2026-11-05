import {expect,it} from 'vitest';
import {
 AUTO_VIDEO_START_TIMEOUT_MS,
 AUTO_VIDEO_STALL_TIMEOUT_MS,
 MAX_AUTO_VIDEO_RELOADS,
 shouldMonitorAutoVideo,
 type AutoVideoRecoveryConditions,
} from '../music/videoPlaybackRecovery';

const running:AutoVideoRecoveryConditions={
 hasAutoMatch:true,videoId:'dQw4w9WgXcQ',separateAudio:true,
 backgroundMode:'video',audioPaused:false,hiddenVideo:false,
 adPlaying:false,searchPending:false,playerAllowed:true,
 awaitingVideoStart:false,videoEnded:false,pageVisible:true,
};

it('monitors a matched automatic background that should be playing',()=>{
 expect(shouldMonitorAutoVideo(running)).toBe(true);
 expect(AUTO_VIDEO_START_TIMEOUT_MS).toBeGreaterThan(1000);
 expect(AUTO_VIDEO_STALL_TIMEOUT_MS).toBeGreaterThan(AUTO_VIDEO_START_TIMEOUT_MS);
 expect(MAX_AUTO_VIDEO_RELOADS).toBe(2);
});

it('does not retry when video is intentionally hidden, paused or waiting for its start',()=>{
 for(const changes of [
  {backgroundMode:'theme' as const},
  {audioPaused:true},
  {hiddenVideo:true},
  {adPlaying:true},
  {searchPending:true},
  {awaitingVideoStart:true},
  {videoEnded:true},
  {pageVisible:false},
  {playerAllowed:false},
  {hasAutoMatch:false},
  {videoId:null},
  {separateAudio:false},
 ]){
  expect(shouldMonitorAutoVideo({...running,...changes})).toBe(false);
 }
});
