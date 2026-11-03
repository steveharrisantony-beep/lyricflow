// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const cloud=vi.hoisted(()=>({set:vi.fn(),get:vi.fn(),remove:vi.fn(),commit:vi.fn(),listeners:new Map<string,(value:any)=>void>()}));
vi.mock('../firebase/firebaseClient',async original=>({...await original<typeof import('../firebase/firebaseClient')>(),db:{}}));
vi.mock('firebase/firestore',()=>({
 doc:(_db:unknown,...parts:string[])=>parts.join('/'),collection:(_db:unknown,...parts:string[])=>parts.join('/'),
 onSnapshot:(path:string,...args:any[])=>{cloud.listeners.set(path,args[args.length-2] instanceof Function?args[args.length-2]:args[0]);return()=>cloud.listeners.delete(path);},
 setDoc:(...args:unknown[])=>cloud.set(...args),deleteDoc:vi.fn(),deleteField:()=> 'DELETE_FIELD',serverTimestamp:()=> 'SERVER_TIME',
 getDocsFromServer:(...args:unknown[])=>cloud.get(...args),writeBatch:()=>({delete:cloud.remove,commit:cloud.commit}),
}));
import {resetSongMappingData} from '../data/backupData';
import {saveSongMapping} from '../data/saveSongMapping';
import {temporarySongs} from '../data/temporarySongs';
import {retrySongMappingReset,songMappingResetPending} from '../firebase/songMappingReset';
import {useSongMapping,retrySongMappings} from '../firebase/songMappings';
import {usePrivateLyrics,retryCustomLyrics} from '../firebase/usePrivateLyrics';
import {useCorrection} from '../firebase/useCorrection';
import {retryAccountCorrections} from '../firebase/correctionStore';
import {scopedKey,writeDevice,readDevice} from '../firebase/deviceStore';
import {correctionContext,correctionKey,makeCorrection,lyricFingerprint} from '../firebase/correctionModel';
const track={title:'Song',artist:'Artist',album:'Studio',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!;
let root:Root,mapping:ReturnType<typeof useSongMapping>,lyrics:ReturnType<typeof usePrivateLyrics>,correction:ReturnType<typeof useCorrection>;
function Fixture(){mapping=useSongMapping(track,'A');lyrics=usePrivateLyrics(track,'A');correction=useCorrection(track,'lyrics','A');return null;}
beforeEach(()=>{
 localStorage.clear();temporarySongs.clear();cloud.listeners.clear();vi.clearAllMocks();
 cloud.set.mockResolvedValue(undefined);cloud.commit.mockResolvedValue(undefined);cloud.get.mockResolvedValue({docs:[]});
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 root=createRoot(document.createElement('div'));
});
afterEach(async()=>{await act(async()=>root.unmount());vi.restoreAllMocks();});
it('blocks stale snapshots and uploads while reset is pending, then syncs edits made after the reset',async()=>{
 const oldCorrection=makeCorrection(context,{selection:{engine:'apple',lrclibId:null,subtitleTrackId:null}});
 writeDevice(scopedKey('songMappings','A'),{[context.recordingKey]:{identity:context.identity,hideLyrics:true,hideVideo:true}});
 writeDevice(scopedKey('customLyrics','A'),{[context.recordingKey]:{identity:context.identity,text:'Old custom lyrics',dirty:false}});
 writeDevice(scopedKey('corrections','A'),{[correctionKey(context)]:{value:oldCorrection,dirty:false}});
 await act(async()=>root.render(<Fixture/>));
 expect(mapping.hideVideo).toBe(true);expect(lyrics.hasOverride).toBe(true);expect(correction.source).toBe('personal');
 const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 await act(async()=>resetSongMappingData('A'));
 expect(mapping.hideVideo).toBe(false);expect(lyrics.hasOverride).toBe(false);expect(correction.source).toBe('automatic');
 expect(cloud.listeners.size).toBe(0);
 expect(mapping.hideVideo).toBe(false);expect(lyrics.hasOverride).toBe(false);expect(correction.source).toBe('automatic');
 await act(async()=>{
  mapping.savePart('hideLyrics',true);lyrics.save('New custom lyrics');
  mapping.savePart('lyrics',{sourceFile:{name:'Custom',url:'',revision:lyricFingerprint('New custom lyrics')},selection:null,delaySeconds:0});
  correction.save({selection:{engine:'lrclib',lrclibId:2,subtitleTrackId:null}});
  saveSongMapping(track,'A');
  void retrySongMappings('A');void retryCustomLyrics('A');void retryAccountCorrections('A');
 });
 expect(cloud.set).not.toHaveBeenCalled();
 online.mockReturnValue(true);
 cloud.get.mockImplementation(async(path:string)=>({docs:[{ref:`${path}/remote-only`}]}));
 await act(async()=>{expect(await retrySongMappingReset('A')).toBe(true);});
 expect(cloud.remove).toHaveBeenCalledTimes(3);expect(cloud.commit).toHaveBeenCalledOnce();
 expect(songMappingResetPending('A')).toBe(false);
 expect(readDevice<Record<string,{text:string}>>(scopedKey('customLyrics','A'),{})[context.recordingKey].text).toBe('New custom lyrics');
 await act(async()=>{retrySongMappings('A');retryCustomLyrics('A');retryAccountCorrections('A');});
 expect(cloud.set).toHaveBeenCalledTimes(3);
});
it('keeps failed cloud resets queued across retries and batches large accounts',async()=>{
 resetSongMappingData('A');cloud.get.mockRejectedValueOnce(Error('offline'));
 await expect(retrySongMappingReset('A')).rejects.toThrow('offline');
 expect(songMappingResetPending('A')).toBe(true);expect(cloud.commit).not.toHaveBeenCalled();
 cloud.get.mockImplementation(async(path:string)=>({docs:path.endsWith('/songMappings')?Array.from({length:901},(_,i)=>({ref:`${path}/${i}`})):[]}));
 await expect(retrySongMappingReset('A')).resolves.toBe(true);
 expect(cloud.remove).toHaveBeenCalledTimes(901);expect(cloud.commit).toHaveBeenCalledTimes(3);
 expect(songMappingResetPending('A')).toBe(false);
});
it('ignores acknowledgements from saves started before a reset',async()=>{
 const acknowledgements:Array<()=>void>=[];
 cloud.set.mockImplementation(()=>new Promise<void>(resolve=>acknowledgements.push(resolve)));
 await act(async()=>root.render(<Fixture/>));
 await act(async()=>{
  mapping.savePart('hideVideo',true);
  mapping.savePart('hideLyrics',true);
  lyrics.save('Same text');
  correction.save({selection:{engine:'apple',lrclibId:null,subtitleTrackId:null}});
  mapping.savePart('lyrics',{sourceFile:{name:'Custom',url:'',revision:lyricFingerprint('Same text')},selection:null,delaySeconds:0});
  saveSongMapping(track,'A');
 });
 const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 await act(async()=>resetSongMappingData('A'));
 // A new edit can have the same value as an old pending save.
 await act(async()=>{lyrics.save('Same text');correction.save({selection:{engine:'apple',lrclibId:null,subtitleTrackId:null}});
 mapping.savePart('lyrics',{sourceFile:{name:'Custom',url:'',revision:lyricFingerprint('Same text')},selection:null,delaySeconds:0});saveSongMapping(track,'A');});
 online.mockReturnValue(true);
 await act(async()=>{await retrySongMappingReset('A');for(const resolve of acknowledgements)resolve();});
 expect(readDevice<Record<string,{dirty:boolean}>>(scopedKey('customLyrics','A'),{})[context.recordingKey].dirty).toBe(true);
 expect(readDevice<Record<string,{dirty:boolean}>>(scopedKey('corrections','A'),{})[correctionKey(context)].dirty).toBe(true);
 expect(readDevice<Record<string,{dirty:string[]}>>(scopedKey('songMappings','A'),{})[context.recordingKey].dirty).toContain('lyrics');
 // Mapping fields now travel in one atomic write rather than separate field writes.
 expect(cloud.set).toHaveBeenCalledTimes(3);
});
