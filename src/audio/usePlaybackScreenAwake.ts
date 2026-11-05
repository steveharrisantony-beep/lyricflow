import {useEffect} from 'react';
import {Capacitor, registerPlugin} from '@capacitor/core';

type PlaybackAwakeBridge = {setPlaying(input:{playing:boolean}): Promise<{active:boolean}>};
const PlaybackAwake = registerPlugin<PlaybackAwakeBridge>('PlaybackAwake');

/**
 * Keeps the Android display awake for actual playback, then releases the flag
 * when paused/stopped. FLAG_KEEP_SCREEN_ON only applies while the Activity is visible.
 */
export function usePlaybackScreenAwake(playing:boolean):void {
  useEffect(()=>{
    if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')return;
    void PlaybackAwake.setPlaying({playing}).catch(()=>{});
  },[playing]);
  useEffect(()=>()=>{
    if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android')
      void PlaybackAwake.setPlaying({playing:false}).catch(()=>{});
  },[]);
}
