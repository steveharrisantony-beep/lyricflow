// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const cloud=vi.hoisted(()=>({set:vi.fn(),listeners:new Map<string,(value:any)=>void>()}));
vi.mock('../firebase/firebaseClient',()=>({db:{}}));
vi.mock('firebase/firestore',()=>({
 doc:(_db:unknown,...parts:string[])=>parts.join('/'),
 onSnapshot:(path:string,callback:(value:unknown)=>void)=>{cloud.listeners.set(path,callback);return()=>cloud.listeners.delete(path);},
 setDoc:(...args:unknown[])=>cloud.set(...args),deleteField:()=> 'DELETE_FIELD',serverTimestamp:()=> 'SERVER_TIME',
}));
import {useSongMapping,importGuestSongMappings,retrySongMappings} from '../firebase/songMappings';
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
it('queues true and false as personal values and keeps offline edits ahead of stale cloud snapshots',async()=>{
 await act(async()=>root.render(<Fixture uid="accountA"/>));
 await act(async()=>{result.savePart('hideLyrics',true);result.savePart('hideVideo',true);});
 await act(async()=>{result.savePart('hideLyrics',false);result.savePart('hideVideo',false);});
 expect(result.hideLyrics).toBe(false);expect(result.hideVideo).toBe(false);
 // A partial reconnect writes the first field, then retries the remaining flag.
 cloud.set.mockResolvedValueOnce(undefined);
 await act(async()=>retrySongMappings('accountA'));
 expect(cloud.set.mock.calls).toContainEqual([expect.any(String),expect.objectContaining({hideLyrics:false}),{merge:true}]);
 expect(cloud.set.mock.calls).toContainEqual([expect.any(String),expect.objectContaining({hideVideo:false}),{merge:true}]);
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
