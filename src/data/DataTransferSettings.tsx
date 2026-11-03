import {useEffect,useRef,useState} from 'react';
import {createBackup,restoreBackup,type BackupKind,type SettingsBackupData} from './backupData';
import {exportBackupFile,readBackupFile} from './backupFiles';
import {retrySongMappings} from '../firebase/songMappings';
import {retryAccountCorrections} from '../firebase/correctionStore';
import {retryCustomLyrics} from '../firebase/usePrivateLyrics';

export default function DataTransferSettings({uid,onSettingsImported}:{uid:string|null;onSettingsImported:(data:SettingsBackupData)=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
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
 return <>
  <p className="muted">JSON backups for this device. Imported settings replace preferences; mappings merge and update matching songs.</p>
  {([{kind:'settings',label:'Settings'},{kind:'song-mappings',label:'Song mapping data'}] as const).map(({kind,label})=><div className="account-row" key={kind}>
   <div><strong>{label}</strong></div>
   <div className="correction-actions">
    <button type="button" disabled={busy} onClick={()=>void exportData(kind)} aria-label={`Export ${label.toLowerCase()}`}>Export</button>
    <button type="button" disabled={busy} onClick={()=>files.current[kind]?.click()} aria-label={`Import ${label.toLowerCase()}`}>Import</button>
    <input hidden ref={element=>{files.current[kind]=element;}} type="file" accept=".json,application/json" disabled={busy} aria-label={`${label} backup file`}
     onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void importData(file,kind);}}/>
   </div>
  </div>)}
  {status&&<p role="status">{status}</p>}
 </>;
}
