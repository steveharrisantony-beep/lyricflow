// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const cloud=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),remove:vi.fn(),data:{} as Record<string,Record<string,any>>}));
vi.mock('../firebase/firebaseClient',async original=>({...await original<typeof import('../firebase/firebaseClient')>(),db:{}}));
vi.mock('firebase/firestore',()=>({
 doc:(_db:unknown,...parts:string[])=>parts.join('/'),collection:(_db:unknown,...parts:string[])=>parts.join('/'),
 setDoc:(...args:unknown[])=>cloud.set(...args),deleteDoc:(...args:unknown[])=>cloud.remove(...args),
 deleteField:()=>undefined,serverTimestamp:()=> 'SERVER_TIME',getDocsFromServer:(...args:unknown[])=>cloud.get(...args),
 writeBatch:()=>({delete:vi.fn(),commit:vi.fn().mockResolvedValue(undefined)}),
}));
import {syncAccountSongData,flushAccountSongData} from '../firebase/songDatabaseSync';
import {correctionContext,lyricFingerprint} from '../firebase/correctionModel';
import {readDevice,scopedKey,writeDevice} from '../firebase/deviceStore';
import {temporarySongs} from '../data/temporarySongs';
import {useSongMapping} from '../firebase/songMappings';
import {createBackup,restoreBackup,resetSongMappingData} from '../data/backupData';
const track={title:'Song',artist:'Artist',album:'',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!,id=context.recordingKey;
const mapped=(video:string)=>({identity:context.identity,video:{youtubeVideoId:video,delaySeconds:null}});
const snapshot=(path:string)=>({docs:Object.entries(cloud.data[path]||{}).map(([id,data])=>({id,data:()=>data,ref:`${path}/${id}`}))});
beforeEach(()=>{
 localStorage.clear();temporarySongs.clear();vi.clearAllMocks();cloud.data={};
 cloud.get.mockImplementation(async(path:string)=>snapshot(path));
 cloud.set.mockImplementation(async(path:string,data:any)=>{
  const split=path.lastIndexOf('/'),collection=path.slice(0,split),id=path.slice(split+1);
  (cloud.data[collection]||={})[id]=data;
 });
 cloud.remove.mockResolvedValue(undefined);
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
});
it('pulls all private data once at startup, prefers cloud conflicts, and performs no song-change reads',async()=>{
 writeDevice(scopedKey('songMappings','A'),{[id]:mapped('aaaaaaaaaaa')});
 cloud.data['profiles/A/songMappings']={[id]:mapped('bbbbbbbbbbb')};
 expect(await syncAccountSongData('A')).toBe(true);
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
 expect(cloud.get).toHaveBeenCalledTimes(3);
 const root=createRoot(document.createElement('div'));
 let result:ReturnType<typeof useSongMapping>;
 function Fixture({other=false}:{other?:boolean}){result=useSongMapping(other?{...track,title:'Other'}:track,'A');return null;}
 try{
  await act(async()=>root.render(<Fixture/>));expect(result!.video?.youtubeVideoId).toBe('bbbbbbbbbbb');
  await act(async()=>root.render(<Fixture other/>));expect(result!.video).toBeNull();
  expect(cloud.get).toHaveBeenCalledTimes(3);expect(cloud.set).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());}
});
it('uploads imported conflicts before pulling Firebase, and keeps failed imports pending offline',async()=>{
 writeDevice(scopedKey('songMappings',null),{[id]:mapped('bbbbbbbbbbb')});
 const backup=createBackup('song-mappings',null);
 cloud.data['profiles/A/songMappings']={[id]:mapped('aaaaaaaaaaa')};
 restoreBackup(backup,'A');
 cloud.set.mockRejectedValueOnce(Error('offline'));
 await expect(flushAccountSongData('A')).rejects.toThrow('offline');
 expect(cloud.get).not.toHaveBeenCalled();
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].dirty).toContain('video');
 await syncAccountSongData('A');
 expect(cloud.data['profiles/A/songMappings'][id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
 expect(cloud.set.mock.invocationCallOrder.at(-1)!).toBeLessThan(cloud.get.mock.invocationCallOrder[0]);
});
it('prefers Firebase over conflicting ordinary offline edits but uploads a new song with no cloud counterpart',async()=>{
 const other=correctionContext({...track,title:'Other song'},'lyrics')!;
 writeDevice(scopedKey('songMappings','A'),{
  [id]:{...mapped('aaaaaaaaaaa'),dirty:['video']},
  [other.recordingKey]:{identity:other.identity,hideVideo:true,dirty:['hideVideo']},
 });
 cloud.data['profiles/A/songMappings']={[id]:mapped('bbbbbbbbbbb')};
 await syncAccountSongData('A');
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
 expect(cloud.set.mock.calls.filter(([path])=>path.endsWith(id))).toHaveLength(0);
 expect(cloud.data['profiles/A/songMappings'][other.recordingKey].hideVideo).toBe(true);
});
it('does not overwrite an import made while a startup download is already in flight',async()=>{
 let release!:(value:unknown)=>void;
 cloud.get.mockImplementation((path:string)=>path.endsWith('/songMappings')?new Promise(resolve=>{release=resolve;}):Promise.resolve({docs:[]}));
 const sync=syncAccountSongData('A');
 await vi.waitFor(()=>expect(cloud.get).toHaveBeenCalledTimes(3));
 writeDevice(scopedKey('songMappings',null),{[id]:mapped('bbbbbbbbbbb')});
 restoreBackup(createBackup('song-mappings',null),'A');
 release({docs:[{id,data:()=>mapped('aaaaaaaaaaa')}]});await sync;
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
});
it('rejects stale startup data after a reset and invalidates matching temporary entries after a cloud update',async()=>{
 writeDevice(scopedKey('songMappings','A'),{[id]:mapped('aaaaaaaaaaa')});
 let release!:(value:unknown)=>void;
 cloud.get.mockImplementation((path:string)=>path.endsWith('/songMappings')?new Promise(resolve=>{release=resolve;}):Promise.resolve({docs:[]}));
 const sync=syncAccountSongData('A');await vi.waitFor(()=>expect(cloud.get).toHaveBeenCalledTimes(3));
 resetSongMappingData('A');release({docs:[{id,data:()=>mapped('aaaaaaaaaaa')}]});expect(await sync).toBe(false);
 expect(readDevice(scopedKey('songMappings','A'),{})).toEqual({});
 expect(temporarySongs.size).toBe(0);
});
it('preserves prepared data across music providers but invalidates it for a new saved lyrics revision',async()=>{
 const {localSongData}=await import('../data/localSongData');
 const text='[00:01]Original words',source={name:'LRCLIB',url:'https://lrclib.net/api/get/12',revision:lyricFingerprint(text,'https://lrclib.net/api/get/12')};
 writeDevice(scopedKey('songMappings','A'),{[id]:{...mapped('aaaaaaaaaaa'),lyrics:{sourceFile:source,selection:null,delaySeconds:0}}});
 const first=localSongData(track,'A').session!;
 first.lyrics={key:'test',value:{original:text,romanized:'',source:'LRCLIB',hasWordSync:false,candidates:[]}};
 expect(localSongData({...track,provider:'jiosaavn',sourceTrackId:'different'},'A').session?.lyrics).toBeDefined();
 cloud.data['profiles/A/songMappings']={[id]:mapped('bbbbbbbbbbb')};
 await syncAccountSongData('A');
 expect(localSongData(track,'A').session?.lyrics).toBeUndefined();
});

