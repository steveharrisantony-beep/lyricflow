// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {useSongMapping,importGuestSongMappings} from '../firebase/songMappings';
import {correctionContext} from '../firebase/correctionModel';
import {saveSongMapping} from '../data/saveSongMapping';
import {temporarySongs} from '../data/temporarySongs';
import {scopedKey,writeDevice} from '../firebase/deviceStore';
const track={title:'Song',artist:'Artist',album:'Studio',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!;
let root:Root,result:ReturnType<typeof useSongMapping>;
function Fixture({uid}:{uid:string|null}){result=useSongMapping(track,uid);return null;}
beforeEach(()=>{
 localStorage.clear();temporarySongs.clear();
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
 expect(Object.keys(readCache(null))).toEqual(['r3_0000000000000000']);
 await act(async()=>saveSongMapping(track,null));
 const entries=readCache(null);
 expect(Object.keys(entries)).toEqual([context.recordingKey]);
 expect(result.video).toEqual({youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null});
 expect(result.lyrics).toEqual(lyrics);expect(result.hideLyrics).toBe(true);
});
function readCache(uid:string|null){return JSON.parse(localStorage.getItem(scopedKey('songMappings',uid))||'{}');}
it('commits explicit video choices so the newest choice replaces the previous one',async()=>{
 await act(async()=>root.render(<Fixture uid="serial"/>));
 await act(async()=>result.savePart('video',{youtubeVideoId:'aaaaaaaaaaa',delaySeconds:4}));
 await act(async()=>saveSongMapping(track,'serial'));
 await act(async()=>{result.savePart('video',{youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null});saveSongMapping(track,'serial');});
 expect(readCache('serial')[context.recordingKey]).toMatchObject({video:{youtubeVideoId:'bbbbbbbbbbb',delaySeconds:null}});
});
it('keeps visibility edits temporary and commits explicit false',async()=>{
 await act(async()=>root.render(<Fixture uid="accountA"/>));
 await act(async()=>{result.savePart('hideLyrics',true);result.savePart('hideVideo',true);});
 expect(result.hideLyrics).toBe(true);expect(readCache('accountA')).toEqual({});
 await act(async()=>{result.savePart('hideLyrics',false);result.savePart('hideVideo',false);saveSongMapping(track,'accountA');});
 expect(readCache('accountA')[context.recordingKey]).toMatchObject({hideLyrics:false,hideVideo:false});
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
