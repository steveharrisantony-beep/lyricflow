import {useEffect} from 'react';
import {Capacitor,registerPlugin} from '@capacitor/core';

const DisplayChrome=registerPlugin<{
 setCinemaMode(input:{enabled:boolean}):Promise<{statusInsetCssPixels:number;cinema:boolean}>;
}>('DisplayChrome');

/** Normal mode reserves Android's status bar; cinema hides the native status bar. */
export function useAndroidDisplayChrome(cinema:boolean){
 useEffect(()=>{
  if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')return;
  let active=true;
  void DisplayChrome.setCinemaMode({enabled:cinema})
   .then(result=>{
    if(!active)return;
    const inset=Math.max(0,Math.min(100,Number(result.statusInsetCssPixels)||0));
    document.documentElement.style.setProperty('--lyricflow-status-inset',`${inset}px`);
   }).catch(()=>{});
  return()=>{active=false;};
 },[cinema]);
 useEffect(()=>()=>{
  if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android')
   void DisplayChrome.setCinemaMode({enabled:false}).catch(()=>{});
  document.documentElement.style.removeProperty('--lyricflow-status-inset');
 },[]);
}
