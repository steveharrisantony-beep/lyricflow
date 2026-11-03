// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../lyrics/providers',async original=>({...await original<typeof import('../lyrics/providers')>(),resolveStashLyricsChain:vi.fn(),retrievePermittedLyrics:vi.fn(),lrclibProvider:{search:vi.fn()}}));
vi.mock('../music/backgroundVideos',()=>({findYouTubeBackgrounds:vi.fn()}));
import {resolveStashLyricsChain,lrclibProvider,type StashResolvedLyrics} from '../lyrics/providers';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import {prepareSongLyrics,prepareSongVideo} from '../data/songPreparation';
import {temporarySongs} from '../data/temporarySongs';
import {correctionContext,lyricFingerprint} from '../firebase/correctionModel';
import {writeDevice,scopedKey} from '../firebase/deviceStore';
const track={title:'Song',artist:'Artist',album:'',duration:200,source:'provider' as const,provider:'jiosaavn' as const,confidence:1};
const result:StashResolvedLyrics={original:'[00:01]Prepared words',romanized:'',source:'LRCLIB',hasWordSync:false,candidates:[]};
beforeEach(()=>{localStorage.clear();temporarySongs.clear();vi.resetAllMocks();});
it('shares queue and foreground work, then restores prepared lyrics across music providers without another request',async()=>{
 let finish!:(value:StashResolvedLyrics)=>void;
 vi.mocked(resolveStashLyricsChain).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const queued=prepareSongLyrics(track,null,{engine:'lyricflow'});
 const foreground=prepareSongLyrics(track,null,{engine:'lyricflow'});
 await vi.waitFor(()=>expect(resolveStashLyricsChain).toHaveBeenCalledOnce());finish(result);
 expect(await queued).toEqual(result);expect(await foreground).toEqual(result);
 expect(await prepareSongLyrics({...track,provider:'local'},null,{engine:'lyricflow'})).toEqual(result);
 expect(resolveStashLyricsChain).toHaveBeenCalledOnce();expect(localStorage.length).toBe(0);
});
it('tries the saved link, saved service, then automatic sources and never overwrites the saved mapping',async()=>{
 const id=correctionContext(track,'lyrics')!.recordingKey,identity=correctionContext(track,'lyrics')!.identity;
 const source={name:'LRCLIB',url:'https://lrclib.net/api/get/12',revision:lyricFingerprint('Old words')};
 writeDevice(scopedKey('songMappings',null),{[id]:{identity,lyrics:{sourceFile:source,selection:{engine:'lrclib',lrclibId:12,subtitleTrackId:null},delaySeconds:1}}});
 const order:string[]=[];
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{order.push('link');return new Response('',{status:404});});
 vi.mocked(lrclibProvider.search).mockImplementation(async()=>{order.push('source');return [];});
 vi.mocked(resolveStashLyricsChain).mockImplementation(async()=>{order.push('automatic');return result;});
 try{
  const found=await prepareSongLyrics(track,null,{engine:'lrclib',source,selection:{engine:'lrclib',lrclibId:12,subtitleTrackId:null}});
  expect(order).toEqual(['link','source','automatic']);expect(found?.mappingRevision).toBe(source.revision);
  expect(JSON.parse(localStorage.getItem(scopedKey('songMappings',null))!)[id].lyrics.sourceFile).toEqual(source);
 }finally{fetcher.mockRestore();}
});
it('skips hidden components and uses an explicit mapped video without automatic searching',async()=>{
 const context=correctionContext(track,'lyrics')!;
 writeDevice(scopedKey('songMappings',null),{[context.recordingKey]:{identity:context.identity,hideLyrics:true,video:{youtubeVideoId:'abcdefghijk',delaySeconds:null}}});
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'})).toBeNull();
 expect((await prepareSongVideo(track,null,'lyrics',''))?.automaticVideoId).toBe('abcdefghijk');
 expect(resolveStashLyricsChain).not.toHaveBeenCalled();expect(findYouTubeBackgrounds).not.toHaveBeenCalled();
});
it('aborts pending work when its final consumer leaves and ignores results for evicted songs',async()=>{
 let signal:AbortSignal|undefined,finish!:(value:StashResolvedLyrics)=>void;
 vi.mocked(resolveStashLyricsChain).mockImplementation((_track,next)=>{signal=next;return new Promise(resolve=>{finish=resolve;});});
 const controller=new AbortController(),request=prepareSongLyrics(track,null,{engine:'lyricflow'},controller.signal);
 await vi.waitFor(()=>expect(signal).toBeDefined());
 controller.abort();await expect(request).rejects.toMatchObject({name:'AbortError'});expect(signal?.aborted).toBe(true);
 temporarySongs.clear();finish(result);await Promise.resolve();
 expect(temporarySongs.size).toBe(0);
});

