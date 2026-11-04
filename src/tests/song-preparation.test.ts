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
it('shares queue and foreground work, then restores prepared lyrics across equivalent metadata sources without another request',async()=>{
 let finish!:(value:StashResolvedLyrics)=>void;
 vi.mocked(resolveStashLyricsChain).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const queued=prepareSongLyrics(track,null,{engine:'lyricflow'});
 const foreground=prepareSongLyrics(track,null,{engine:'lyricflow'});
 const wordResult={...result,original:'[00:01]<00:01>Prepared <00:02>words',hasWordSync:true};
 await vi.waitFor(()=>expect(resolveStashLyricsChain).toHaveBeenCalledOnce());finish(wordResult);
 expect(await queued).toEqual(wordResult);expect(await foreground).toEqual(wordResult);
 expect(await prepareSongLyrics({...track,provider:'audius'},null,{engine:'lyricflow'})).toEqual(wordResult);
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
it('preserves snapshots from retired services and uses automatic lookup when only an old link remains',async()=>{
 const {recordingKey,identity}=correctionContext(track,'lyrics')!;
 const text='[00:01]Saved words';
 const url='https://lyrics.paxsenix.org/musixmatch/lyrics?title=Song';
 const source={name:'Paxsenix',url,revision:lyricFingerprint(text,url)};
 const customKey=scopedKey('customLyrics',null);
 writeDevice(customKey,{[recordingKey]:{identity,text}});
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:404}));
 vi.mocked(resolveStashLyricsChain).mockResolvedValue(result);
 try{
  expect(await prepareSongLyrics(track,null,{engine:'lyricflow',source})).toMatchObject({original:text});
  expect(resolveStashLyricsChain).not.toHaveBeenCalled();
  writeDevice(customKey,{});
  expect(await prepareSongLyrics(track,null,{engine:'lyricflow',source})).toMatchObject({original:result.original});
  expect(fetcher).not.toHaveBeenCalled();
  expect(resolveStashLyricsChain).toHaveBeenCalledOnce();
 }finally{fetcher.mockRestore();}
});
it('skips hidden components and uses an explicit mapped video without automatic searching',async()=>{
 const context=correctionContext(track,'lyrics')!;
 writeDevice(scopedKey('songMappings',null),{[context.recordingKey]:{identity:context.identity,hideLyrics:true,video:{youtubeVideoId:'abcdefghijk',delaySeconds:null}}});
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'})).toBeNull();
 expect(await prepareSongVideo(track,null,'')).toBeNull();
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

it('shows a cached line fallback instantly while sharing a fresh word-sync upgrade',async()=>{
 vi.mocked(resolveStashLyricsChain).mockResolvedValueOnce(result);
 await prepareSongLyrics(track,null,{engine:'lyricflow'});
 let finish!:(value:StashResolvedLyrics)=>void;
 vi.mocked(resolveStashLyricsChain).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const progress=vi.fn();
 const foreground=prepareSongLyrics(track,null,{engine:'lyricflow'},undefined,progress);
 const duplicate=prepareSongLyrics(track,null,{engine:'lyricflow'});
 expect(progress).toHaveBeenCalledWith(result);
 await vi.waitFor(()=>expect(resolveStashLyricsChain).toHaveBeenCalledTimes(2));
 const words={...result,original:'[00:01]<00:01>Prepared <00:02>words',hasWordSync:true};finish(words);
 expect(await foreground).toEqual(words);expect(await duplicate).toEqual(words);
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'})).toEqual(words);
 expect(resolveStashLyricsChain).toHaveBeenCalledTimes(2);
});

it('keeps the cached line fallback if a fresh upgrade lookup fails to find any lyrics',async()=>{
 vi.mocked(resolveStashLyricsChain).mockResolvedValueOnce(result).mockResolvedValueOnce(null);
 await prepareSongLyrics(track,null,{engine:'lyricflow'});
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'})).toEqual(result);
});

it('reuses an explicitly selected line-synced source without automatic upgrades',async()=>{
 vi.mocked(resolveStashLyricsChain).mockResolvedValue(result);
 await prepareSongLyrics(track,null,{engine:'lrclib'});
 expect(await prepareSongLyrics(track,null,{engine:'lrclib'})).toEqual(result);
 expect(resolveStashLyricsChain).toHaveBeenCalledOnce();
});



it('uses the planner’s duration decision instead of reranking by word quality',async()=>{
 const widerWord={...result,original:'[00:01]<00:01>Provisional <00:02>words',hasWordSync:true,searchComplete:false};
 const closestLine={...result,original:'[00:01]Closest recording line',searchComplete:true};
 vi.mocked(resolveStashLyricsChain).mockImplementation(async(_track,_signal,_engine,_offset,_selected,onProgress)=>{
  onProgress?.(widerWord);
  onProgress?.(closestLine);
  return closestLine;
 });
 const progress=vi.fn();
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'},undefined,progress)).toEqual(closestLine);
 expect(progress.mock.calls.map(([value])=>value.original)).toEqual([widerWord.original,closestLine.original]);
 expect(await prepareSongLyrics(track,null,{engine:'lyricflow'})).toEqual(closestLine);
 expect(resolveStashLyricsChain).toHaveBeenCalledOnce();
});
