import {Capacitor,registerPlugin} from '@capacitor/core';
import {useEffect,useState} from 'react';

const MediaPlaybackPolicy=registerPlugin<{
  configure(options:{externalPlayer:boolean}):Promise<{safeBackground:boolean}>;
}>('MediaPlaybackPolicy');

/** Muting the Android WebContents prevents it from acquiring external-player audio focus. */
export function useNativePlaybackPolicy(externalPlayer:boolean){
  const native=Capacitor.getPlatform()==='android';
  const [policy,setPolicy]=useState({externalPlayer,allowed:!native,message:''});
  useEffect(()=>{
    if(!native)return;
    let cancelled=false;
    void MediaPlaybackPolicy.configure({externalPlayer}).then(result=>{
      if(!cancelled)setPolicy({externalPlayer,allowed:result.safeBackground,message:result.safeBackground?'':'Update Android System WebView to use a video background without interrupting your external player. Themes remain available.'});
    }).catch(()=>{
      if(!cancelled)setPolicy({externalPlayer,allowed:!externalPlayer,message:externalPlayer?'The Android audio policy is unavailable. Themes are active to keep your external player uninterrupted.':''});
    });
    return()=>{cancelled=true;};
  },[externalPlayer,native]);
  return native?{allowed:policy.externalPlayer===externalPlayer&&policy.allowed,message:policy.externalPlayer===externalPlayer?policy.message:''}:{allowed:true,message:''};
}
