// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({android:false,save:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>native.android,getPlatform:()=> 'android'},registerPlugin:()=>({save:native.save})}));
import {exportBackupFile,readBackupFile} from '../data/backupFiles';
import {createBackup,MAX_BACKUP_BYTES} from '../data/backupData';
beforeEach(()=>{localStorage.clear();native.android=false;native.save.mockReset().mockResolvedValue({cancelled:false});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('downloads a named JSON file in the browser and releases the temporary URL',async()=>{
 vi.useFakeTimers();
 const create=vi.fn((_blob:Blob)=> 'blob:backup'),revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
 let filename='';vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){filename=this.download;});
 expect(await exportBackupFile(createBackup('settings',null))).toBe(true);
 expect(filename).toMatch(/^lyricflow-settings-.*\.json$/);expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
 expect(native.save).not.toHaveBeenCalled();expect(document.querySelector('a[download]')).toBeNull();
 await vi.advanceTimersByTimeAsync(1000);expect(revoke).toHaveBeenCalledWith('blob:backup');
});
it('uses Android document saving and reports cancellation without a browser download',async()=>{
 native.android=true;
 expect(await exportBackupFile(createBackup('song-mappings',null))).toBe(true);
 const file=native.save.mock.calls[0][0];expect(file.filename).toMatch(/^lyricflow-song-mappings-.*\.json$/);
 expect(JSON.parse(file.data).kind).toBe('song-mappings');
 native.save.mockResolvedValue({cancelled:true});expect(await exportBackupFile(createBackup('settings',null))).toBe(false);
});
it('validates size and expected file category before importing',async()=>{
 const text=vi.fn(async()=>JSON.stringify(createBackup('settings',null)));
 await expect(readBackupFile({size:MAX_BACKUP_BYTES+1,text} as unknown as File,'settings')).rejects.toThrow('10 MB');
 expect(text).not.toHaveBeenCalled();
 await expect(readBackupFile({size:100,text} as unknown as File,'song-mappings')).rejects.toThrow('song mapping');
 expect((await readBackupFile({size:100,text} as unknown as File,'settings')).kind).toBe('settings');
});
