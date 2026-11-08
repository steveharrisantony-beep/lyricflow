// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {resetSongMappingData} from '../data/backupData';
import {saveSongMapping} from '../data/saveSongMapping';
import {temporarySongs} from '../data/temporarySongs';
import {retrySongMappingReset,songMappingResetPending} from '../firebase/songMappingReset';
import {useSongMapping} from '../firebase/songMappings';
import {usePrivateLyrics} from '../firebase/usePrivateLyrics';
import {useCorrection} from '../firebase/useCorrection';
import {scopedKey,writeDevice,readDevice} from '../firebase/deviceStore';
import {correctionContext,correctionKey,makeCorrection,lyricFingerprint} from '../firebase/correctionModel';
const track={title:'Song',artist:'Artist',album:'Studio',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!;
let root:Root,mapping:ReturnType<typeof useSongMapping>,lyrics:ReturnType<typeof usePrivateLyrics>,correction:ReturnType<typeof useCorrection>;
function Fixture(){mapping=useSongMapping(track,'A');lyrics=usePrivateLyrics(track,'A');correction=useCorrection(track,'lyrics','A');return null;}
beforeEach(()=>{
 localStorage.clear();temporarySongs.clear();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 root=createRoot(document.createElement('div'));
});
afterEach(async()=>{await act(async()=>root.unmount());});
it('clears saved song mappings, custom lyrics, and corrections on reset, then saves new edits made after reset',async()=>{
 const oldCorrection=makeCorrection(context,{selection:{engine:'apple',lrclibId:null,subtitleTrackId:null}});
 writeDevice(scopedKey('songMappings','A'),{[context.recordingKey]:{identity:context.identity,hideLyrics:true,hideVideo:true}});
 writeDevice(scopedKey('customLyrics','A'),{[context.recordingKey]:{identity:context.identity,text:'Old custom lyrics',dirty:false}});
 writeDevice(scopedKey('corrections','A'),{[correctionKey(context)]:{value:oldCorrection,dirty:false}});
 await act(async()=>root.render(<Fixture/>));
 expect(mapping.hideVideo).toBe(true);expect(lyrics.hasOverride).toBe(true);expect(correction.source).toBe('personal');
 await act(async()=>resetSongMappingData('A'));
 expect(mapping.hideVideo).toBe(false);expect(lyrics.hasOverride).toBe(false);expect(correction.source).toBe('automatic');
 await act(async()=>{
  mapping.savePart('hideLyrics',true);lyrics.save('New custom lyrics');
  mapping.savePart('lyrics',{sourceFile:{name:'Custom',url:'',revision:lyricFingerprint('New custom lyrics')},selection:null,delaySeconds:0});
  correction.save({selection:{engine:'lrclib',lrclibId:2,subtitleTrackId:null}});
  saveSongMapping(track,'A');
 });
 await act(async()=>{expect(await retrySongMappingReset('A')).toBe(true);});
 expect(songMappingResetPending('A')).toBe(false);
 expect(readDevice<Record<string,{text:string}>>(scopedKey('customLyrics','A'),{})[context.recordingKey].text).toBe('New custom lyrics');
});
