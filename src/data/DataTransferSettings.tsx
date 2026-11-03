import {useEffect,useRef,useState} from 'react';
import {createBackup,restoreBackup,resetSettings,resetSongMappingData,type BackupKind,type SettingsBackupData} from './backupData';
import {exportBackupFile,readBackupFile} from './backupFiles';
import {retrySongMappings} from '../firebase/songMappings';
import {retryAccountCorrections} from '../firebase/correctionStore';
import {retryCustomLyrics} from '../firebase/usePrivateLyrics';
import {retrySongMappingReset,songMappingResetPending} from '../firebase/songMappingReset';

export default function DataTransferSettings({uid,onSettingsImported}:{uid:string|null;onSettingsImported:(data:SettingsBackupData)=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const [confirmReset,setConfirmReset]=useState<BackupKind|null>(null);
 const disabled=busy||confirmReset!==null;
 const alive=useRef(true);
 const files=useRef<Record<BackupKind,HTMLInputElement|null>>({settings:null,'song-mappings':null});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const exportData=async(kind:BackupKind)=>{
  setBusy(true);setStatus('');
  try{
   const saved=await exportBackupFile(createBackup(kind,uid));
   if(alive.current)setStatus(saved?'Backup exported.':'Export cancelled.');
  }catch(error){if(alive.current)setStatus(error instanceof Error?error.message:'Could not export this backup.');}
  finally{if(alive.current)setBusy(false);}
 };
 const importData=async(file:File|undefined,kind:BackupKind)=>{
  if(!file)return;
  setBusy(true);setStatus('');
  try{
   const backup=await readBackupFile(file,kind);
   if(!alive.current)return;
   restoreBackup(backup,uid);
   if(backup.kind==='settings')onSettingsImported(backup.data);
   else if(uid){retrySongMappings(uid);retryAccountCorrections(uid);retryCustomLyrics(uid);}
   setStatus(backup.kind==='settings'?'Settings imported.':'Song mappings imported.');
  }catch(error){if(alive.current)setStatus(error instanceof Error?error.message:'Could not import this backup.');}
  finally{if(alive.current)setBusy(false);}
 };
 const resetData=(kind:BackupKind)=>{
  setConfirmReset(null);setStatus('');
  try{
   if(kind==='settings'){
    onSettingsImported(resetSettings(uid));
    setStatus('Settings reset to defaults.');
   }else{
    resetSongMappingData(uid);
    setStatus(uid?'Song mapping data reset on this device. Account reset will sync when online.':'Song mapping data reset.');
    if(uid)void retrySongMappingReset(uid).then(ready=>{
     if(ready){retrySongMappings(uid);retryAccountCorrections(uid);retryCustomLyrics(uid);}
     if(ready&&alive.current)setStatus('Song mapping data reset on this device and your account.');
    }).catch(()=>{/* Keep the local reset and retry account deletion when online. */});
   }
  }catch(error){setStatus(error instanceof Error?error.message:'Could not reset this data.');}
 };
 return <>
  <p className="muted">JSON backups for this device. Imported settings replace preferences; mappings merge and update matching songs.</p>
  {([{kind:'settings',label:'Settings'},{kind:'song-mappings',label:'Song mapping data'}] as const).map(({kind,label})=><div className="account-row" key={kind}>
   <div><strong>{label}</strong></div>
   <div className="correction-actions">
    <button type="button" disabled={disabled} onClick={()=>void exportData(kind)} aria-label={`Export ${label.toLowerCase()}`}>Export</button>
    <button type="button" disabled={disabled} onClick={()=>files.current[kind]?.click()} aria-label={`Import ${label.toLowerCase()}`}>Import</button>
    <input hidden ref={element=>{files.current[kind]=element;}} type="file" accept=".json,application/json" disabled={disabled} aria-label={`${label} backup file`}
     onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void importData(file,kind);}}/>
   </div>
  </div>)}
  <section className="data-reset" aria-label="Reset data">
   <h4>Reset data</h4>
   <p className="muted">Export a backup first if you want to keep your current data.</p>
   <div className="account-row">
    <div><strong>Settings</strong><small>Restore all preferences to defaults. Keep song mapping data.</small></div>
    <button type="button" disabled={disabled} onClick={()=>setConfirmReset('settings')}>Reset settings</button>
   </div>
   <div className="account-row">
    <div><strong>Song mapping</strong><small>Clear saved lyrics, video choices, timing fixes, hide choices, and custom lyrics. Keep settings.</small></div>
    <button type="button" disabled={disabled} onClick={()=>setConfirmReset('song-mappings')}>Reset song mapping</button>
   </div>
   {confirmReset&&<div className="reset-confirmation" role="group" aria-labelledby="reset-confirm-title">
    <p id="reset-confirm-title"><strong>{confirmReset==='settings'?'Reset settings to defaults?':'Reset all song mapping data?'}</strong></p>
    <p>{confirmReset==='settings'?'Your preferences will return to the app defaults. Song mapping data will be kept.':'This removes your saved lyric and video choices, timing fixes, hide choices, and custom lyrics for every song.'}</p>
    {uid&&<p>{confirmReset==='settings'?'Synced preferences will also update in your account.':'The reset also applies to your account when online. Community mappings are kept.'}</p>}
    <p>This cannot be undone without an exported backup.</p>
    <div className="correction-actions">
     <button type="button" autoFocus onClick={()=>setConfirmReset(null)}>Cancel</button>
     <button type="button" className="danger" onClick={()=>resetData(confirmReset)}>Confirm reset {confirmReset==='settings'?'settings':'song mapping'}</button>
    </div>
   </div>}
  </section>
  {status&&<p role="status">{status}</p>}
  {!status&&uid&&songMappingResetPending(uid)&&<p role="status">Song mapping reset is waiting to sync with your account.</p>}
 </>;
}
