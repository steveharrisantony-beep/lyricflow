// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../lyrics/appleLyrics',()=>({fetchAppleMusicWordSyncedLyrics:vi.fn(),fetchYouTubeSubtitlesForTrack:vi.fn(),fetchAppleMusicCandidates:vi.fn()}));
import {fetchAppleMusicWordSyncedLyrics,fetchYouTubeSubtitlesForTrack} from '../lyrics/appleLyrics';
import {resolveStashLyricsChain,type StashResolvedLyrics} from '../lyrics/providers';
import TrackFinder from '../metadata/TrackFinder';
import {buildCues,getLyricState,setLyricTimeline} from '../lyrics/lyricTimeline';
import {setVirtualMediaTime} from '../audio/audioSignal';
import {afterCurrentLyricLine} from '../lyrics/lyricHandoff';
const track={title:'Original rain',artist:'Test Artist',album:'',duration:200,source:'provider' as const,confidence:1};
const lrc='[00:01.00]First original lyric line\n[00:05.00]Next original lyric line';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();setVirtualMediaTime(null);setLyricTimeline([]);});
it('publishes LRCLIB before a slower Apple request, then prefers Apple without refetching either library',async()=>{
 const apple=deferred<Awaited<ReturnType<typeof fetchAppleMusicWordSyncedLyrics>>>();
 vi.mocked(fetchAppleMusicWordSyncedLyrics).mockReturnValue(apple.promise);
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:1,trackName:track.title,artistName:track.artist,duration:200,instrumental:false,syncedLyrics:lrc})));
 vi.stubGlobal('fetch',fetcher);
 const progress=vi.fn();
 const result=resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
 await vi.waitFor(()=>expect(progress).toHaveBeenCalled());
 expect(progress.mock.calls[0][0].source).toContain('LRC Library');
 expect(fetchAppleMusicWordSyncedLyrics).toHaveBeenCalledTimes(1);
 expect(fetcher).toHaveBeenCalledTimes(1);
 apple.resolve({lrc:'[00:01.00]<00:01.00>Preferred <00:02.00>Apple',hasWordSync:true,source:'Apple Library',sourceUrl:'https://music.apple.com/fixture'});
 expect((await result)?.source).toContain('Apple');
 expect(progress.mock.calls.at(-1)?.[0].hasWordSync).toBe(true);
});
it('does not downgrade an Apple result when LRCLIB finishes later',async()=>{
 vi.mocked(fetchAppleMusicWordSyncedLyrics).mockResolvedValue({lrc,hasWordSync:true,source:'Apple Library'});
 const pending=deferred<Response>();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));
 const progress=vi.fn();const request=resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
 await vi.waitFor(()=>expect(progress).toHaveBeenCalled());
 pending.resolve(new Response(JSON.stringify({id:1,trackName:track.title,artistName:track.artist,duration:200,syncedLyrics:lrc})));
 expect((await request)?.source).toContain('Apple');
 expect(progress.mock.calls.every(([result])=>result.source.includes('Apple'))).toBe(true);
});
it('keeps separate-source song metadata authoritative even when a YouTube background ID is attached',async()=>{
 vi.mocked(fetchYouTubeSubtitlesForTrack).mockClear();
 vi.mocked(fetchAppleMusicWordSyncedLyrics).mockResolvedValue(null);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:1,trackName:track.title,artistName:track.artist,duration:200,syncedLyrics:lrc}))));
 const result=await resolveStashLyricsChain({...track,provider:'jiosaavn',youtubeVideoId:'abcdefghijk',videoTitle:'Another Video Title'});
 expect(result?.original).toBe(lrc);
 expect(fetchYouTubeSubtitlesForTrack).not.toHaveBeenCalled();
 expect(vi.mocked(fetchAppleMusicWordSyncedLyrics).mock.calls.at(-1)?.[0].artist).toBe('Test Artist');
});
it('waits for the current line, including overlapping singers, and cancels on a song change',async()=>{
 vi.useFakeTimers();
 const cues=buildCues([{time:1,text:'First line'},{time:5,text:'Second line'}],[]);
 cues[0].end=4;cues.splice(1,0,{...cues[0],time:2,end:4.5,text:'Second singer'});
 setLyricTimeline(cues);setVirtualMediaTime(2.5);
 const apply=vi.fn(),controller=new AbortController();
 afterCurrentLyricLine(apply,controller.signal);
 setVirtualMediaTime(4.1);await vi.advanceTimersByTimeAsync(80);expect(apply).not.toHaveBeenCalled();
 setVirtualMediaTime(4.5);await vi.advanceTimersByTimeAsync(40);expect(apply).toHaveBeenCalledTimes(1);
 setVirtualMediaTime(2);afterCurrentLyricLine(apply,controller.signal);controller.abort();
 setVirtualMediaTime(10);await vi.advanceTimersByTimeAsync(80);expect(apply).toHaveBeenCalledTimes(1);
});
it('wires progressive results to TrackFinder without changing a lyric in the middle of a line',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let emit:((value:StashResolvedLyrics)=>void)|undefined;
 const finished=deferred<StashResolvedLyrics|null>();
 vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,_signal,_engine,_offset,_selected,callback)=>{emit=callback;return finished.promise;});
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 const first:StashResolvedLyrics={original:lrc,romanized:'',source:'LyricFlow Engine · LRC Library',hasWordSync:false,candidates:[],availableEngines:['lyricflow','lrclib']};
 const apple={...first,original:'[00:01.00]Preferred Apple line',source:'LyricFlow Engine · Apple Library',hasWordSync:true};
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  await act(async()=>emit!(first));
  expect(received).toHaveBeenCalledTimes(1);
  const cues=buildCues([{time:1,text:'Original line'},{time:5,text:'Next line'}],[]);setLyricTimeline(cues);setVirtualMediaTime(2);
  expect(getLyricState(2).cue).not.toBeNull();
  await act(async()=>emit!(apple));
  expect(received).toHaveBeenCalledTimes(1);
  setVirtualMediaTime(cues[0].end);
  await act(async()=>vi.advanceTimersByTimeAsync(40));
  expect(received.mock.calls.at(-1)?.[0].source).toContain('Apple');
  finished.resolve(apple);await act(async()=>{});
  expect(received).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
