import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';

export const RELEASES_URL='https://github.com/steveharrisantony-beep/lyricsflow-android/releases';
const RELEASES_API='https://api.github.com/repos/steveharrisantony-beep/lyricsflow-android/releases/latest';
export interface InstalledApp {versionName:string;versionCode:number}
export interface AppUpdate {versionName:string;versionCode:number;url:string;sha256:string;notes:string}
interface NativeUpdater {
 getInfo():Promise<InstalledApp>;
 download(update:AppUpdate):Promise<{downloaded:boolean}>;
 install():Promise<{permissionRequired:boolean}>;
 addListener(event:'updateProgress',listener:(event:{percent:number})=>void):Promise<PluginListenerHandle>;
}
export const AppUpdater=registerPlugin<NativeUpdater>('AppUpdater');
export const isAndroidUpdater=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
export async function installedApp():Promise<InstalledApp>{
 if(isAndroidUpdater())return AppUpdater.getInfo();
 return {versionName:import.meta.env.VITE_APP_VERSION||'1.1.0-dev',versionCode:Number(import.meta.env.VITE_APP_VERSION_CODE)||2};
}
export function parseAppUpdate(value:unknown,currentCode:number):AppUpdate|null {
 if(!value||typeof value!=='object')throw Error('Invalid update response.');
 const release=value as Record<string,unknown>;
 if(release.draft===true||release.prerelease===true)return null;
 const tag=typeof release.tag_name==='string'?release.tag_name:'';
 const match=/^android-(\d+)$/.exec(tag);
 if(!match)throw Error('The latest release is not an Android update.');
 const versionCode=Number(match[1]);
 if(!Number.isSafeInteger(versionCode)||versionCode<=currentCode)return null;
 const assets=Array.isArray(release.assets)?release.assets as Array<Record<string,unknown>>:[];
 const apk=assets.find(asset=>asset.name==='LyricFlow-Android.apk');
 if(!apk)throw Error('The new release does not have an APK yet. Try again later.');
 const expected=RELEASES_URL+'/download/'+encodeURIComponent(tag)+'/LyricFlow-Android.apk';
 if(apk.browser_download_url!==expected)throw Error('The update download address could not be verified.');
 const digest=typeof apk.digest==='string'?apk.digest:'';
 if(!/^sha256:[a-f0-9]{64}$/i.test(digest))throw Error('This release does not have a verified download checksum yet.');
 return {versionName:typeof release.name==='string'&&release.name?release.name:tag,versionCode,url:expected,sha256:digest.slice(7).toLowerCase(),notes:typeof release.body==='string'?release.body.slice(0,1200):''};
}
export async function checkForAppUpdate(currentCode:number,signal?:AbortSignal):Promise<AppUpdate|null>{
 const response=await fetch(RELEASES_API,{signal,headers:{Accept:'application/vnd.github+json'}});
 if(response.status===404)return null;
 if(response.status===403||response.status===429)throw Error('GitHub is limiting update checks. Try again later.');
 if(!response.ok)throw Error('Could not check for updates. Check your internet connection and retry.');
 return parseAppUpdate(await response.json(),currentCode);
}
