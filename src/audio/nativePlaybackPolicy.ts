import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {useEffect,useState} from 'react';

const MediaPlaybackPolicy=registerPlugin<{
  configure(options:{externalPlayer:boolean}):Promise<{safeBackground:boolean}>;
  addListener(eventName:'appResume',listener:()=>void):Promise<PluginListenerHandle>;
}>('MediaPlaybackPolicy');

/** Muting the Android WebContents prevents it from acquiring external-player audio focus. */
export function useNativePlaybackPolicy(externalPlayer:boolean){
  const native=Capacitor.getPlatform()==='android';
  const [policy,setPolicy]=useState({externalPlayer,allowed:!native,message:''});
  const [resumeVersion,setResumeVersion]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    let listener:PluginListenerHandle|undefined;
    const configure=async(resuming=false)=>{
      if(native){
        try{
          const result=await MediaPlaybackPolicy.configure({externalPlayer});
          if(cancelled)return;
          setPolicy({externalPlayer,allowed:result.safeBackground,message:result.safeBackground?'':'Update Android System WebView to use a video background without interrupting your external player. Themes remain available.'});
        }catch{
          if(cancelled)return;
          setPolicy({externalPlayer,allowed:!externalPlayer,message:externalPlayer?'The Android audio policy is unavailable. Themes are active to keep your external player uninterrupted.':''});
        }
      }
      if(resuming&&!cancelled)setResumeVersion(version=>version+1);
    };
    const resume=()=>{if(document.visibilityState!=='hidden')void configure(true);};
    const pageShow=(event:PageTransitionEvent)=>{if(event.persisted)resume();};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('pageshow',pageShow);
    if(native){
      void configure();
      void MediaPlaybackPolicy.addListener('appResume',()=>{void configure(true);}).then(handle=>{
        if(cancelled)void handle.remove();else listener=handle;
      }).catch(()=>{});
    }
    return()=>{
      cancelled=true;
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('pageshow',pageShow);
      void listener?.remove();
    };
  },[externalPlayer,native]);
  return native?{allowed:policy.externalPlayer===externalPlayer&&policy.allowed,message:policy.externalPlayer===externalPlayer?policy.message:'',resumeVersion}:{allowed:true,message:'',resumeVersion};
}
