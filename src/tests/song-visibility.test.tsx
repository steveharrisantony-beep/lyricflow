// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const cloud=vi.hoisted(()=>({set:vi.fn(),listeners:new Map<string,(value:any)=>void>()}));
vi.mock('../firebase/firebaseClient',()=>({db:{}}));
vi.mock('firebase/firestore',()=>({
 doc:(_db:unknown,...parts:string[])=>parts.join('/'),
 onSnapshot:(path:string,callback:(value:unknown)=>void)=>{cloud.listeners.set(path,callback);return()=>cloud.listeners.delete(path);},
 setDoc:(...args:unknown[])=>cloud.set(...args),deleteDoc:vi.fn().mockResolvedValue(undefined),deleteField:()=> 'DELETE_FIELD',serverTimestamp:()=> 'SERVER_TIME',
}));
import {useSongMapping,importGuestSongMappings} from '../firebase/songMappings';
import {correctionContext} from '../firebase/correctionModel';
import {scopedKey,writeDevice} from '../firebase/deviceStore';
const track={title:'Song',artist:'Artist',album:'Studio',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!;
let root:Root,result:ReturnType<typeof useSongMapping>;
function Fixture({uid}:{uid:string|null}){result=useSongMapping(track,uid);return null;}
beforeEach(()=>{
 localStorage.clear();cloud.listeners.clear();cloud.set.mockReset().mockRejectedValue(new Error('Offline'));
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 root=createRoot(document.createElement('div'));
});
afterEach(async()=>{await act(async()=>root.unmount());});
it('prefers personal mappings over shared results and removes old aliases when a replacement is saved',async()=>{
 const lyrics={sourceFile:{name:'Chosen',url:'https://lrclib.net/api/get/12',revision:'l3_0123456789abcdef'},selection:{engine:'lrclib',lrclibId:12,subtitleTrackId:null},delaySeconds:0};
 writeDevice('lyricflow.v4.publishedSongMappings',{[context.recordingKey]:{identity:context.identity,video:{youtubeVideoId:'zzzzzzzzzzz',delaySeconds:8}}});
 writeDevice(scopedKey('songMappings',null),{r3_0000000000000000:{identity:context.identity,lyrics,video:{youtubeVideoId:'aaaaaaaaaaa',delaySeconds:2},hideLyrics:true}});
 await act(async()=>root.render(<Fixture uid={null}/>));
 await act(async()=>result.savePart('video',{youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null}));
 const entries=readCache(null);
 expect(Object.keys(entries)).toEqual([context.recordingKey]);
 expect(result.video).toEqual({youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null});
 expect(result.lyrics).toEqual(lyrics);expect(result.hideLyrics).toBe(true);
});
function readCache(uid:string|null){return JSON.parse(localStorage.getItem(scopedKey('songMappings',uid))||'{}');}
it('serializes writes so a pending older video cannot overwrite the newest choice',async()=>{
 const acknowledgements:Array<()=>void>=[];
 cloud.set.mockImplementation(()=>new Promise<void>(resolve=>acknowledgements.push(resolve)));
 await act(async()=>root.render(<Fixture uid="serial"/>));
 await act(async()=>result.savePart('video',{youtubeVideoId:'aaaaaaaaaaa',delaySeconds:4}));
 await act(async()=>result.savePart('video',{youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null}));
 expect(cloud.set).toHaveBeenCalledTimes(1);
 await act(async()=>acknowledgements[0]());
 expect(cloud.set.mock.calls.at(-1)?.[1].video).toEqual({youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null});
 expect(cloud.set.mock.calls.at(-1)?.[2].mergeFields).toContain('video');
 await act(async()=>acknowledgements[1]());
 expect(readCache('serial')[context.recordingKey]).toMatchObject({video:{youtubeVideoId:'bbbbbbbbbbb'},dirty:[]});
});
it('queues true and false as personal values and keeps offline edits ahead of stale cloud snapshots',async()=>{
 await act(async()=>root.render(<Fixture uid="accountA"/>));
 await act(async()=>{result.savePart('hideLyrics',true);result.savePart('hideVideo',true);});
 await act(async()=>{result.savePart('hideLyrics',false);result.savePart('hideVideo',false);});
 expect(result.hideLyrics).toBe(false);expect(result.hideVideo).toBe(false);
 expect(cloud.set.mock.calls).toContainEqual([expect.any(String),expect.objectContaining({hideLyrics:false}),expect.objectContaining({mergeFields:expect.arrayContaining(['hideLyrics'])})]);
 expect(cloud.set.mock.calls).toContainEqual([expect.any(String),expect.objectContaining({hideVideo:false}),expect.objectContaining({mergeFields:expect.arrayContaining(['hideVideo'])})]);
 await act(async()=>cloud.listeners.get(`profiles/accountA/songMappings/${context.recordingKey}`)!({exists:()=>true,data:()=>({identity:context.identity,hideLyrics:true,hideVideo:true}),metadata:{fromCache:true}}));
 expect(result.hideLyrics).toBe(false);expect(result.hideVideo).toBe(false);
 const cached=JSON.parse(localStorage.getItem(scopedKey('songMappings','accountA'))!)[context.recordingKey];
 expect(cached.dirty).toContain('hideVideo');
 await act(async()=>root.render(<Fixture uid="accountB"/>));
 expect(result.personal).toBeNull();expect(result.hideLyrics).toBe(false);expect(result.hideVideo).toBe(false);
});
it('imports guest visibility choices without deleting an existing account video selection',async()=>{
 writeDevice(scopedKey('songMappings',null),{[context.recordingKey]:{identity:context.identity,hideLyrics:true,hideVideo:false}});
 writeDevice(scopedKey('songMappings','accountA'),{[context.recordingKey]:{identity:context.identity,video:{youtubeVideoId:'abcdefghijk',delaySeconds:null}}});
 importGuestSongMappings('accountA');
 await act(async()=>root.render(<Fixture uid="accountA"/>));
 expect(result.hideLyrics).toBe(true);expect(result.hideVideo).toBe(false);
 expect(result.video?.youtubeVideoId).toBe('abcdefghijk');
});
