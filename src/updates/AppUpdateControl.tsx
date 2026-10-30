import {useEffect,useRef,useState} from 'react';
import {AppUpdater,checkForAppUpdate,installedApp,isAndroidUpdater,RELEASES_URL,type AppUpdate,type InstalledApp} from './appUpdates';

export default function AppUpdateControl(){
 const [info,setInfo]=useState<InstalledApp|null>(null);
 const [update,setUpdate]=useState<AppUpdate|null>(null);
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [progress,setProgress]=useState(0);
 const [status,setStatus]=useState('');
 const controller=useRef<AbortController|null>(null);
 const mounted=useRef(true);
 const android=isAndroidUpdater();
 useEffect(()=>{
  mounted.current=true;
  void installedApp().then(value=>{if(mounted.current)setInfo(value);}).catch(()=>{if(mounted.current)setStatus('Could not read the installed app version.');});
  return()=>{mounted.current=false;controller.current?.abort();};
 },[]);
 const check=async()=>{
  if(!info)return;
  controller.current?.abort();
  controller.current=new AbortController();
  setBusy(true);setStatus('Checking for updates…');setUpdate(null);setReady(false);
  try {
   const next=await checkForAppUpdate(info.versionCode,controller.current.signal);
   if(mounted.current){setUpdate(next);setStatus(next?'An update is available.':'No newer Android release is available.');}
  }catch(error){if(mounted.current&&!controller.current?.signal.aborted)setStatus(error instanceof Error?error.message:'Update check failed.');}
  finally{if(mounted.current)setBusy(false);}
 };
 const download=async()=>{
  if(!update)return;
  setBusy(true);setProgress(0);setStatus('Downloading update…');
  let listener:Awaited<ReturnType<typeof AppUpdater.addListener>>|undefined;
  try {
   listener=await AppUpdater.addListener('updateProgress',event=>{if(mounted.current)setProgress(event.percent);});
   await AppUpdater.download(update);
   if(mounted.current){setReady(true);setStatus('Download verified. Tap Install update.');}
  }catch(error){if(mounted.current)setStatus(error instanceof Error?error.message:'Could not download the update.');}
  finally{await listener?.remove().catch(()=>{});if(mounted.current)setBusy(false);}
 };
 const install=async()=>{
  setBusy(true);
  try{
   const result=await AppUpdater.install();
   if(mounted.current)setStatus(result.permissionRequired?'Allow installs from LyricFlow in Android settings, return here, then tap Install update again.':'Confirm the update in the Android installer.');
  }catch(error){if(mounted.current)setStatus(error instanceof Error?error.message:'Could not open the installer.');}
  finally{if(mounted.current)setBusy(false);}
 };
 return <details className="app-update-control">
  <summary>App updates{info?' · '+info.versionName:''}</summary>
  <div className="app-update-panel">
   <p>{android?'Download and install the latest Android version.':'Android updates are installed from the LyricFlow Android app.'}</p>
   {info&&<small>Installed build: {info.versionCode}</small>}
   <div className="app-update-actions">
    <button type="button" disabled={busy||!info} onClick={()=>void check()}>Check for updates</button>
    {update&&android&&!ready&&<button type="button" disabled={busy} onClick={()=>void download()}>Download update</button>}
    {ready&&<button type="button" disabled={busy} onClick={()=>void install()}>Install update</button>}
    <a href={RELEASES_URL} target="_blank" rel="noreferrer">View releases</a>
   </div>
   {update&&<p>New version: {update.versionName}</p>}
   {update?.notes&&<p className="app-update-notes">{update.notes}</p>}
   {busy&&progress>0&&<progress value={progress} max={100} aria-label="Update download progress"/>}
   <p role="status" aria-live="polite">{status}</p>
  </div>
 </details>;
}
