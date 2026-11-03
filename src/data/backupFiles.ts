import {Capacitor,registerPlugin} from '@capacitor/core';
import {MAX_BACKUP_BYTES,parseBackup,type Backup,type BackupKind} from './backupData';

const DataTransfer=registerPlugin<{save(options:{filename:string;data:string}):Promise<{cancelled:boolean}>}>('DataTransfer');
export async function exportBackupFile(backup:Backup):Promise<boolean>{
 const json=JSON.stringify(backup,null,2)+'\n';
 const blob=new Blob([json],{type:'application/json'});
 if(blob.size>MAX_BACKUP_BYTES)throw new Error('This backup exceeds the 10 MB file limit.');
 const filename=`lyricflow-${backup.kind}-${backup.exportedAt.replace(/[:.]/g,'-')}.json`;
 if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android')return !(await DataTransfer.save({filename,data:json})).cancelled;
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 try{link.href=url;link.download=filename;document.body.append(link);link.click();}
 finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return true;
}
export async function readBackupFile(file:File,kind:BackupKind){
 if(file.size>MAX_BACKUP_BYTES)throw new Error('Choose a backup smaller than 10 MB.');
 return parseBackup(await file.text(),kind);
}
