// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {TemporarySongs,temporarySongs} from '../data/temporarySongs';
import {correctionContext} from '../firebase/correctionModel';
import {localSongData} from '../data/localSongData';
import {scopedKey,writeDevice} from '../firebase/deviceStore';
const track=(n:number)=>({title:`Song ${n}`,artist:'Artist',album:'',duration:180+n,source:'provider' as const,provider:'jiosaavn' as const,confidence:1});
beforeEach(()=>{localStorage.clear();temporarySongs.clear();});
it('bounds the queue window at ten and reserves the previous two songs when advancing',()=>{
 const cache=new TemporarySongs();
 cache.setWindow(track(0),Array.from({length:20},(_,i)=>track(i+1)),null);
 expect(cache.size).toBe(10);
 cache.setWindow(track(1),Array.from({length:20},(_,i)=>track(i+2)),null);
 cache.setWindow(track(2),Array.from({length:20},(_,i)=>track(i+3)),null);
 expect(cache.size).toBe(10);expect(cache.get(track(0),null)).toBeDefined();expect(cache.get(track(1),null)).toBeDefined();
 expect(cache.get(track(2),null)).toBeDefined();expect(cache.get(track(9),null)).toBeDefined();expect(cache.get(track(10),null)).toBeUndefined();
 cache.setWindow(track(3),Array.from({length:20},(_,i)=>track(i+4)),null);
 expect(cache.get(track(0),null)).toBeUndefined();expect(cache.get(track(1),null)).toBeDefined();expect(cache.get(track(2),null)).toBeDefined();
});
it('confirms artist and whole-second duration after title, independently of music source',()=>{
 const cache=new TemporarySongs(),song=track(1),entry=cache.get(song,null,true);
 expect(cache.get({...song,provider:'local',sourceTrackId:'different',album:'Another album'},null)).toBe(entry);
 expect(cache.get({...song,duration:song.duration+1},null)).toBeUndefined();
 expect(cache.get({...song,artist:'Other artist'},null)).toBeUndefined();
 expect(cache.get(song,'other-account')).toBeUndefined();
});
it('stores nothing persistently and invalidates prepared data and drafts when a saved mapping changes',()=>{
 const song=track(1),entry=localSongData(song,null).session!;
 temporarySongs.edit(song,null,value=>{value.draftText='Preview only';value.draftMapping={identity:entry.identity,hideVideo:true};});
 expect(localStorage.length).toBe(0);
 const id=correctionContext(song,'lyrics')!.recordingKey;
 writeDevice(scopedKey('songMappings',null),{[id]:{identity:entry.identity,video:{youtubeVideoId:'abcdefghijk',delaySeconds:1}}});
 const updated=localSongData(song,null);
 expect(updated.session?.draftText).toBeUndefined();expect(updated.mapping?.video?.delaySeconds).toBe(1);
 temporarySongs.clear();expect(temporarySongs.size).toBe(0);
 expect(localSongData(song,null).mapping?.video?.youtubeVideoId).toBe('abcdefghijk');
});

