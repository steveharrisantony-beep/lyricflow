import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import {
  connectExternalAudio,
  connectMicrophoneAudio,
  feedExternalVisualizerData,
} from './audioSignal';

export type ExternalAudioCaptureMode = 'mic' | 'internal';
export type ExternalMediaCommand = 'play' | 'pause' | 'previous' | 'next' | 'seek' | 'shuffle' | 'repeat' | 'volume';
export type ExternalMediaControls = Record<ExternalMediaCommand, boolean>;

export interface ExternalMediaState {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  playing: boolean;
  packageName: string;
  appName: string;
  updatedAt: number;
  isAd?: boolean;
  artwork?: string;
  sessionId?: string;
  controls?: ExternalMediaControls;
  shuffleEnabled?: boolean;
  repeatEnabled?: boolean;
  volume?: number;
}

export interface ExternalMediaPluginInterface {
  control(options: { sessionId: string; command: ExternalMediaCommand; value?: number }): Promise<{ sent: boolean }>;
  checkNotificationAccess(): Promise<{ granted: boolean; androidSdk?: number }>;
  openAppInfoSettings(): Promise<{ opened: boolean }>;
  openNotificationSettings(): Promise<{ opened: boolean }>;
  getCurrentMedia(): Promise<{ granted: boolean; media: ExternalMediaState | null }>;
  startListening(): Promise<{ listening: boolean; granted: boolean; media: ExternalMediaState | null }>;
  stopListening(): Promise<{ listening: boolean }>;
  startAudioCapture(options: { mode: ExternalAudioCaptureMode }): Promise<{ started: boolean; mode: ExternalAudioCaptureMode }>;
  stopAudioCapture(): Promise<{ stopped: boolean }>;
  getYouTubeAuthStatus(): Promise<{ signedIn: boolean; cookie?: string }>;
  openYouTubeSignIn(): Promise<{ signedIn: boolean; cookie?: string }>;
  signOutYouTube(): Promise<{ signedIn: boolean }>;
  addListener(eventName: 'notificationAccessChange', listenerFunc: (status: {granted:boolean;androidSdk?:number}) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'mediaChange',
    listenerFunc: (state: ExternalMediaState) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'audioCapture',
    listenerFunc: (data: { mode: string; fft: number[]; waveform: number[] }) => void
  ): Promise<PluginListenerHandle>;
}

export const ExternalMedia = registerPlugin<ExternalMediaPluginInterface>('ExternalMedia');

export async function controlExternalMedia(media: ExternalMediaState, command: ExternalMediaCommand, value?: number): Promise<void> {
  if (!isAndroidApp() || !media.sessionId || !media.controls?.[command]) {
    throw new Error('This control is unavailable in the external player.');
  }
  const result = await ExternalMedia.control({ sessionId: media.sessionId, command, value });
  if (!result.sent) throw new Error('The external player could not accept this control.');
}

let androidOverrideForTest: boolean | null = null;

export function setAndroidAppOverrideForTest(value: boolean | null) {
  androidOverrideForTest = value;
}

/**
 * Returns true only when running inside the native Android Capacitor app.
 * On web browsers, External Player mode displays as "Not available in web".
 */
export function isAndroidApp(): boolean {
  if (androidOverrideForTest !== null) return androidOverrideForTest;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function getExternalSetupStatus():Promise<{granted:boolean;androidSdk:number|null}>{
  if(!isAndroidApp())return {granted:false,androidSdk:null};
  try{
    const result=await ExternalMedia.checkNotificationAccess();
    return {granted:result.granted===true,androidSdk:typeof result.androidSdk==='number'&&Number.isFinite(result.androidSdk)?result.androidSdk:null};
  }catch{return {granted:false,androidSdk:null};}
}

export async function checkExternalNotificationAccess():Promise<boolean>{
  return (await getExternalSetupStatus()).granted;
}

export async function openExternalAppInfoSettings():Promise<boolean>{
  if(!isAndroidApp())return false;
  try{return (await ExternalMedia.openAppInfoSettings()).opened===true;}catch{return false;}
}

/** Native resume events cover WebViews that do not send a window focus event. */
export async function watchExternalNotificationAccess(refresh:()=>void):Promise<()=>void>{
  if(!isAndroidApp())return ()=>{};
  try{const handle=await ExternalMedia.addListener('notificationAccessChange',refresh);return ()=>{void handle.remove();};}
  catch{return ()=>{};}
}

export async function openExternalNotificationSettings(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const res = await ExternalMedia.openNotificationSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function getCurrentExternalMedia(): Promise<{
  granted: boolean;
  media: ExternalMediaState | null;
}> {
  if (!isAndroidApp()) return { granted: false, media: null };
  try {
    const res = await ExternalMedia.getCurrentMedia();
    return {
      granted: Boolean(res?.granted),
      media: res?.media && res.media.title ? res.media : null,
    };
  } catch {
    return { granted: false, media: null };
  }
}

export async function subscribeExternalMedia(
  onMediaChange: (media: ExternalMediaState | null, granted: boolean) => void
): Promise<() => void> {
  if (!isAndroidApp()) {
    onMediaChange(null, false);
    return () => {};
  }
  let handle: PluginListenerHandle | null = null;
  let stopWatching: (()=>void)|null=null;
  let cancelled = false;
  try {
    handle = await ExternalMedia.addListener('mediaChange', state => {
      if (cancelled) return;
      onMediaChange(state && typeof state.title === 'string' && state.title.trim() ? state : null, true);
    });
    stopWatching=await watchExternalNotificationAccess(()=>{
      void getCurrentExternalMedia().then(result=>{if(!cancelled)onMediaChange(result.media,result.granted);});
    });
    const initial = await ExternalMedia.startListening();
    if (!cancelled) {
      onMediaChange(
        initial?.media && initial.media.title ? initial.media : null,
        Boolean(initial?.granted)
      );
    }
  } catch {
    if (!cancelled) onMediaChange(null, false);
  }

  return () => {
    cancelled = true;
    void handle?.remove();
    stopWatching?.();
    void ExternalMedia.stopListening().catch(() => {});
  };
}

let activeAudioCtx: AudioContext | null = null;
let activeMediaStream: MediaStream | null = null;
let activeCaptureListener: PluginListenerHandle | null = null;

async function releaseExternalAudioCapture(): Promise<void> {
  if (activeCaptureListener) {
    try {
      await activeCaptureListener.remove();
    } catch {}
    activeCaptureListener = null;
  }
  if (isAndroidApp()) {
    try {
      await ExternalMedia.stopAudioCapture();
    } catch {}
  }
  if (activeMediaStream) {
    for (const track of activeMediaStream.getTracks()) {
      track.stop();
    }
    activeMediaStream = null;
  }
  if (activeAudioCtx) {
    try {
      await activeAudioCtx.close();
    } catch {}
    activeAudioCtx = null;
  }
  connectMicrophoneAudio(null);
  connectExternalAudio(null);
}

let captureGeneration=0;
let captureQueue:Promise<unknown>=Promise.resolve();
function enqueueCapture<T>(task:()=>Promise<T>):Promise<T>{
 const pending=captureQueue.then(task,task);captureQueue=pending.catch(()=>{});return pending;
}
export function stopExternalAudioCapture():Promise<void>{
 ++captureGeneration;
 return enqueueCapture(releaseExternalAudioCapture);
}

/** Explicit opt-in only; canceled permission prompts cannot leave a capture running. */
export function startExternalAudioCapture(mode:ExternalAudioCaptureMode):Promise<{ok:boolean;activeMode:ExternalAudioCaptureMode;message:string}>{
 const generation=++captureGeneration;
 const cancelled=()=>generation!==captureGeneration;
 const stopped=()=>({ok:false,activeMode:mode,message:'Audio capture cancelled.'});
 return enqueueCapture(async()=>{
  if(cancelled())return stopped();
  await releaseExternalAudioCapture();
  if(cancelled())return stopped();
  if(!isAndroidApp())return {ok:false,activeMode:mode,message:'External Player audio capture is only available in the Android app.'};
  if(!await checkExternalNotificationAccess())return {ok:false,activeMode:mode,message:'Enable notification listening before starting audio.'};
  if(cancelled())return stopped();
  try{
   if(mode==='internal'){
    activeCaptureListener=await ExternalMedia.addListener('audioCapture',payload=>{
     if(!cancelled()&&Array.isArray(payload.fft)&&Array.isArray(payload.waveform))feedExternalVisualizerData(payload.waveform,payload.fft,'INTERNAL AUDIO');
    });
    if(cancelled()){await releaseExternalAudioCapture();return stopped();}
    const result=await ExternalMedia.startAudioCapture({mode});
    if(!result.started)throw Error('Internal audio capture did not start.');
   }else{
    const result=await ExternalMedia.startAudioCapture({mode});
    if(!result.started)throw Error('Microphone permission was not granted.');
    if(cancelled()){await releaseExternalAudioCapture();return stopped();}
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone capture is unavailable in this Android WebView.');
    activeMediaStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    if(cancelled()){await releaseExternalAudioCapture();return stopped();}
    activeAudioCtx=new AudioContext();
    const source=activeAudioCtx.createMediaStreamSource(activeMediaStream),analyser=activeAudioCtx.createAnalyser();
    analyser.fftSize=2048;analyser.smoothingTimeConstant=.42;source.connect(analyser);
    await activeAudioCtx.resume();
    if(!cancelled())connectMicrophoneAudio(analyser);
   }
   const stillGranted=await checkExternalNotificationAccess();
   if(cancelled()||!stillGranted){
    await releaseExternalAudioCapture();return stopped();
   }
   return {ok:true,activeMode:mode,message:mode==='internal'?'Internal audio capture active · reacting to device media output':'Microphone audio capture active · reacting to ambient song audio'};
  }catch(error){
   await releaseExternalAudioCapture();
   return {ok:false,activeMode:mode,message:cancelled()?'Audio capture cancelled.':error instanceof Error?error.message:mode==='internal'?'Internal audio is unavailable. Try Microphone.':'Microphone access was denied. Try again or check Android app permissions.'};
  }
 });
}
