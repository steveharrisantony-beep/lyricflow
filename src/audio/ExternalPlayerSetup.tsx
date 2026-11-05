import {useCallback,useEffect,useRef,useState} from 'react';
import {getExternalSetupStatus,openExternalAppInfoSettings,openExternalNotificationSettings,watchExternalNotificationAccess,type ExternalAudioCaptureMode} from './externalPlayer';

type Props={
 notificationAccessGranted:boolean;
 onNotificationAccessChange?:(granted:boolean)=>void;
 audioMode:ExternalAudioCaptureMode;
 onAudioModeChange?:(mode:ExternalAudioCaptureMode)=>void;
 audioStarting?:boolean;
 audioActive?:boolean;
 audioStatus?:string;
 onStartAudio?:()=>void;
 onStopAudio?:()=>void;
};

/** Each system permission follows an explained user action; opening Settings is not a grant. */
export default function ExternalPlayerSetup({notificationAccessGranted,onNotificationAccessChange,audioMode,onAudioModeChange,audioStarting=false,audioActive=false,audioStatus='',onStartAudio,onStopAudio}:Props){
 const [status,setStatus]=useState<{checked:boolean;androidSdk:number|null}>({checked:false,androidSdk:null});
 const [reviewed,setReviewed]=useState(false),[appInfoOpened,setAppInfoOpened]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const live=useRef(false),refreshId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++refreshId.current;
  const next=await getExternalSetupStatus();
  if(!live.current||id!==refreshId.current)return;
  setStatus({checked:true,androidSdk:next.androidSdk});
  onNotificationAccessChange?.(next.granted);
 },[onNotificationAccessChange]);
 useEffect(()=>{
  live.current=true;let disposed=false;let stopWatching:(()=>void)|undefined;
  void refresh();
  const visible=()=>{if(document.visibilityState!=='hidden')void refresh();};
  window.addEventListener('focus',visible);window.addEventListener('pageshow',visible);document.addEventListener('visibilitychange',visible);
  void watchExternalNotificationAccess(visible).then(stop=>{if(!disposed)stopWatching=stop;else stop();});
  return()=>{disposed=true;live.current=false;++refreshId.current;stopWatching?.();window.removeEventListener('focus',visible);window.removeEventListener('pageshow',visible);document.removeEventListener('visibilitychange',visible);};
 },[refresh]);
 const needsReview=(status.androidSdk===null||status.androidSdk>=33)&&!reviewed;
 const step=!status.checked?'checking':notificationAccessGranted?'audio':needsReview?'restricted':'notification';
 const openInfo=async()=>{
  setBusy(true);setError('');
  const opened=await openExternalAppInfoSettings();
  if(!live.current)return;
  setBusy(false);
  if(opened)setAppInfoOpened(true);
  else setError('Could not open App info. Open Android Settings → Apps → LyricFlow, then return here.');
 };
 const openNotifications=async()=>{
  setBusy(true);setError('');
  const opened=await openExternalNotificationSettings();
  if(!live.current)return;
  setBusy(false);
  if(!opened)setError('Could not open notification access. Open Android Settings → Special app access → Notification access → LyricFlow.');
 };
 return <section className="external-setup" aria-label="External player setup">
  <ol className="external-setup-progress" aria-label="Setup order">
   <li aria-current={step==='restricted'?'step':undefined}>1. Restricted settings</li>
   <li aria-current={step==='notification'?'step':undefined}>2. Notification listening</li>
   <li aria-current={step==='audio'?'step':undefined}>3. Audio permission</li>
  </ol>
  {step==='checking'&&<p role="status">Checking Android permissions…</p>}
  {step==='restricted'&&<div className="external-setup-step">
   <h3>1. Allow restricted settings</h3>
   <p>Android may restrict notification access for an APK installed outside Google Play. Continue only if you trust this app.</p>
   <p>Open LyricFlow’s App info and enable <strong>Allow restricted settings</strong> if shown. On Xiaomi it is under Advanced settings; on other devices check the ⋮ menu.</p>
   <div className="external-setup-actions">
    <button type="button" className="source-primary" disabled={busy} onClick={()=>void openInfo()}>Open App info</button>
    {appInfoOpened&&<button type="button" className="upload-button" disabled={busy} onClick={()=>{setReviewed(true);setError('');void refresh();}}>I enabled it / it wasn’t required</button>}
   </div>
   {error&&<button type="button" className="text-button" onClick={()=>{setReviewed(true);setError('');void refresh();}}>I checked App info manually</button>}
  </div>}
  {step==='notification'&&<div className="external-setup-step">
   <h3>2. Enable notification listening</h3>
   <p>Android notification access can read notifications. LyricFlow uses media playback details—song title, artist, album and position—to match lyrics and backgrounds.</p>
   <p>Enable access for LyricFlow, then return. Audio permission comes next.</p>
   <div className="external-setup-actions">
    <button type="button" className="source-primary" disabled={busy} onClick={()=>void openNotifications()}>Enable notification listening</button>
    <button type="button" className="upload-button" disabled={busy} onClick={()=>void refresh()}>Check access</button>
   </div>
   <button type="button" className="text-button" disabled={busy} onClick={()=>{setReviewed(false);setAppInfoOpened(false);void openInfo();}}>Restricted settings blocked? Open App info</button>
  </div>}
  {step==='audio'&&<div className="external-setup-step">
   <h3>3. Choose an audio source</h3>
   <p>Notification listening is enabled. Choose how the visualizer reacts, then start audio capture.</p>
   <div className="source-pref-pills" role="group" aria-label="External player audio source">
    <button type="button" aria-pressed={audioMode==='internal'} disabled={audioStarting} className={audioMode==='internal'?'active':''} onClick={()=>onAudioModeChange?.('internal')}>Internal Audio</button>
    <button type="button" aria-pressed={audioMode==='mic'} disabled={audioStarting} className={audioMode==='mic'?'active':''} onClick={()=>onAudioModeChange?.('mic')}>Microphone</button>
   </div>
   <p>{audioMode==='internal'?'Internal Audio analyses device playback. Android may label its audio permission “Microphone”. Some devices block this mode; Microphone remains an alternative.':'Microphone analyses music around your device. Audio is processed on the device and is not saved as a recording.'}</p>
   <button type="button" className="source-primary" disabled={audioStarting} onClick={audioActive?onStopAudio:onStartAudio}>
    {audioStarting?'Waiting for audio permission…':audioActive?'Stop audio capture':audioMode==='internal'?'Start internal audio':'Start microphone'}
   </button>
   <p className="muted">After you start audio capture, your choice resumes when you reopen LyricFlow. Stop audio capture to turn off automatic listening.</p>
  </div>}
  {error&&<p role="alert">{error}</p>}
  {audioStatus&&step==='audio'&&<p className="external-audio-status" role="status">{audioStatus}</p>}
 </section>;
}
