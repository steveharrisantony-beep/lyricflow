// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../lyrics/appleLyrics',()=>({fetchAppleMusicWordSyncedLyrics:vi.fn(),fetchYouTubeSubtitlesForTrack:vi.fn(),fetchAppleMusicCandidates:vi.fn()}));
import {fetchAppleMusicWordSyncedLyrics,fetchAppleMusicCandidates} from '../lyrics/appleLyrics';
import {type StashResolvedLyrics} from '../lyrics/providers';
import TrackFinder from '../metadata/TrackFinder';
import {buildCues,getLyricState,setLyricTimeline} from '../lyrics/lyricTimeline';
import {setVirtualMediaTime} from '../audio/audioSignal';
import {afterCurrentLyricLine} from '../lyrics/lyricHandoff';
import {lyricFingerprint} from '../firebase/correctionModel';
import {temporarySongs} from '../data/temporarySongs';
import {prepareSongLyrics} from '../data/songPreparation';
const track={title:'Original rain',artist:'Test Artist',album:'',duration:200,source:'provider' as const,confidence:1};
const lrc='[00:01.00]First original lyric line\n[00:05.00]Next original lyric line';
beforeEach(()=>vi.mocked(fetchAppleMusicCandidates).mockResolvedValue([]));

it('automatically refreshes cached line lyrics and applies a word upgrade at the next line boundary',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 const first:StashResolvedLyrics={original:lrc,romanized:'',source:'LRCLIB',hasWordSync:false,candidates:[]};
 const lookup=vi.spyOn(provider,'resolveStashLyricsChain').mockResolvedValueOnce(first);
 await prepareSongLyrics(track,null,{engine:'lyricflow'});
 const upgrade=deferred<StashResolvedLyrics|null>();lookup.mockReturnValue(upgrade.promise);
 const root=createRoot(document.createElement('div')),received=vi.fn();
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  expect(received.mock.calls[0][0].original).toBe(lrc);
  setLyricTimeline(buildCues([{time:1,text:'First line'},{time:5,text:'Next line'}],[]));setVirtualMediaTime(2);
  await act(async()=>vi.advanceTimersByTimeAsync(180));expect(lookup).toHaveBeenCalledTimes(2);
  upgrade.resolve({...first,original:'[00:01]<00:01>Preferred <00:02>words',hasWordSync:true,source:'lrc.red'});
  await act(async()=>{});expect(received.mock.calls.at(-1)?.[0].source).toBe('LRCLIB');
  setVirtualMediaTime(5);await act(async()=>vi.advanceTimersByTimeAsync(80));
  expect(received.mock.calls.at(-1)?.[0]).toMatchObject({source:'lrc.red',hasWordSync:true});
 }finally{await act(async()=>root.unmount());}
});

it('prefers a word-synced manual candidate over a cached line-only direct response',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 vi.mocked(fetchAppleMusicWordSyncedLyrics).mockResolvedValue({lrc,source:'Paxsenix',hasWordSync:false});
 vi.spyOn(provider.lrclibProvider,'search').mockResolvedValue([]);
 const candidates=deferred<Awaited<ReturnType<typeof fetchAppleMusicCandidates>>>();
 vi.mocked(fetchAppleMusicCandidates).mockReturnValue(candidates.promise);
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 try{
  await act(async()=>root.render(<TrackFinder track={{...track,source:'manual'}} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Search')!.click());
  expect(received.mock.calls.at(-1)?.[0].hasWordSync).toBe(false);
  candidates.resolve([{id:-1,title:track.title,artist:track.artist,album:'',duration:200,confidence:.95,instrumental:false,hasSynced:true,hasWordSync:true,syncedLyrics:'[00:01]<00:01>Preferred <00:02>words',sourceLabel:'lrc.red',url:'https://lrc.red/s/TEST00000001.ttml',provider:'apple'}]);
  await act(async()=>{});
  expect(received.mock.calls.at(-1)?.[0]).toMatchObject({source:'lrc.red',hasWordSync:true});
 }finally{await act(async()=>root.unmount());}
});
it('restores mapped lyrics directly and ignores late automatic upgrades',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let emit:((value:StashResolvedLyrics)=>void)|undefined;
 const waiting=deferred<StashResolvedLyrics|null>();
 const lookup=vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,_signal,_engine,_offset,_selected,callback)=>{emit=callback;return waiting.promise;});
 const root=createRoot(document.createElement('div')),received=vi.fn();
 const mapped='[00:01]My chosen version',url='https://lrclib.net/api/get/22';
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}
   savedCustomLrc={mapped} preferredSourceFile={{name:'LRCLIB',url,revision:lyricFingerprint(mapped,url)}} preferredSelection={{engine:'lrclib',lrclibId:22,subtitleTrackId:null}}/>));
  expect(received.mock.calls.at(-1)?.[0]).toMatchObject({original:mapped,sourceUrl:url});
  const count=received.mock.calls.length;
  await act(async()=>emit!({original:lrc,romanized:'',source:'lrc.red',hasWordSync:true,candidates:[]}));
  waiting.resolve(null);await act(async()=>vi.advanceTimersByTimeAsync(3000));
  expect(received).toHaveBeenCalledTimes(count);expect(lookup).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());}
});
it('retries the mapped source before automatic fallback when a mapped LRCLIB file is unavailable',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 vi.spyOn(provider,'retrievePermittedLyrics').mockRejectedValue(new Error('Unavailable'));
 const original=vi.spyOn(provider.lrclibProvider,'search').mockResolvedValue([]);
 const automatic=vi.spyOn(provider,'resolveStashLyricsChain').mockResolvedValue({original:lrc,romanized:'',source:'Fallback',hasWordSync:false,candidates:[]});
 const root=createRoot(document.createElement('div')),received=vi.fn(),status=vi.fn();
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received} onStatusChange={status}
   preferredSelection={{engine:'lrclib',lrclibId:22,subtitleTrackId:null}}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  expect(original).toHaveBeenCalledOnce();expect(automatic).toHaveBeenCalledOnce();
  expect(received.mock.calls.at(-1)?.[0].original).toBe(lrc);
 }finally{await act(async()=>root.unmount());}
});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
afterEach(()=>{temporarySongs.clear();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();setVirtualMediaTime(null);setLyricTimeline([]);});
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
 const apple={...first,original:'[00:01.00]<00:01.00>Preferred <00:02.00>Apple <00:03.00>line',source:'LyricFlow Engine · lrc.red',hasWordSync:true};
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
  expect(received.mock.calls.at(-1)?.[0].source).toContain('lrc.red');
  finished.resolve(apple);await act(async()=>{});
  expect(received).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
it('does not abort an in-flight automatic lyric lookup when track.duration or leadingNonMusicOffsetSec updates mid-load',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let capturedSignal:AbortSignal|undefined;
 const finished=deferred<StashResolvedLyrics|null>();
 const spy=vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,signal)=>{capturedSignal=signal;return finished.promise;});
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 const resolved:StashResolvedLyrics={original:lrc,romanized:'',source:'LyricFlow Engine · LRC Library',hasWordSync:false,candidates:[],availableEngines:['lyricflow','lrclib'],title:'Original rain',artist:'Test Artist'};
 try{
  await act(async()=>root.render(<TrackFinder track={{...track,duration:0}} leadingNonMusicOffsetSec={0} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(capturedSignal?.aborted).toBe(false);
  // Simulate <audio onLoadedMetadata> updating duration and SponsorBlock resolving offset while lyrics are still fetching
  await act(async()=>root.render(<TrackFinder track={{...track,duration:204.6}} leadingNonMusicOffsetSec={12.4} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(200));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(capturedSignal?.aborted).toBe(false);
  finished.resolve(resolved);
  await act(async()=>{});
  expect(received).toHaveBeenCalledTimes(1);
  expect(received.mock.calls[0]?.[0].title).toBe('Original rain');
 }finally{await act(async()=>root.unmount());}
});


it('keeps the captured boundary when a newer Apple result arrives after the next LRC line starts',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let emit:((value:StashResolvedLyrics)=>void)|undefined;
 const finished=deferred<StashResolvedLyrics|null>();
 vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,_signal,_engine,_offset,_selected,callback)=>{emit=callback;return finished.promise;});
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 const first:StashResolvedLyrics={original:lrc,romanized:'',source:'LRC Library',hasWordSync:false,candidates:[],availableEngines:['lyricflow','lrclib']};
 const apple={...first,original:'[00:01.00]<00:01.00>Apple <00:02.00>first\n[00:05.00]<00:05.00>Apple <00:06.00>next',source:'lrc.red',hasWordSync:true};
 const latest={...apple,source:'lrc.red · video aligned'};
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  await act(async()=>emit!(first));
  const cues=buildCues([{time:1,text:'First LRC line'},{time:5,text:'Next LRC line'},{time:10,text:'Third LRC line'}],[]);
  setLyricTimeline(cues);setVirtualMediaTime(2);
  await act(async()=>emit!(apple));expect(received).toHaveBeenCalledTimes(1);
  setVirtualMediaTime(5.01);
  // The playback clock can cross the boundary before the 40ms polling callback.
  await act(async()=>emit!(latest));
  await act(async()=>vi.advanceTimersByTimeAsync(40));
  expect(received).toHaveBeenCalledTimes(2);
  expect(received.mock.calls[1][0].source).toBe(latest.source);
  finished.resolve(latest);await act(async()=>{});
  expect(received).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});

it('retains Apple preference and defers its upgrade while paused on temporary LRC lyrics',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let emit:((value:StashResolvedLyrics)=>void)|undefined;
 const finished=deferred<StashResolvedLyrics|null>();
 vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,_signal,_engine,_offset,_selected,callback)=>{emit=callback;return finished.promise;});
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn(),engineChange=vi.fn();
 const first:StashResolvedLyrics={original:lrc,romanized:'',source:'LRC Library',hasWordSync:false,candidates:[],availableEngines:['lyricflow','lrclib']};
 const apple={...first,original:'[00:01.00]<00:01.00>Apple <00:02.00>first\n[00:05.00]<00:05.00>Apple <00:06.00>next',source:'lrc.red',hasWordSync:true,availableEngines:['lyricflow','lrclib','apple'] as const};
 try{
  await act(async()=>root.render(<TrackFinder track={track} lyricEngineOption="apple" onLyricEngineOptionChange={engineChange} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  await act(async()=>emit!(first));expect(received).toHaveBeenCalledTimes(1);expect(engineChange).not.toHaveBeenCalled();
  const cues=buildCues([{time:1,text:'First LRC line'},{time:5,text:'Next LRC line'}],[]);
  setLyricTimeline(cues,1);setVirtualMediaTime(2);
  const upgraded={...apple,availableEngines:[...apple.availableEngines]};
  await act(async()=>emit!(upgraded));
  await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(received).toHaveBeenCalledTimes(1);
  setVirtualMediaTime(4);await act(async()=>vi.advanceTimersByTimeAsync(40));
  expect(received).toHaveBeenCalledTimes(2);expect(received.mock.calls[1][0].source).toBe('lrc.red');
  finished.resolve(upgraded);await act(async()=>{});
 }finally{await act(async()=>root.unmount());}
});

it('shows an early manual LRCLIB search result and upgrades to Apple only after the line ends',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 const appleModule=await import('../lyrics/appleLyrics');
 const apple=deferred<Awaited<ReturnType<typeof fetchAppleMusicWordSyncedLyrics>>>();
 vi.mocked(fetchAppleMusicWordSyncedLyrics).mockReturnValue(apple.promise);
 vi.mocked(appleModule.fetchAppleMusicCandidates).mockResolvedValue([]);
 vi.spyOn(provider.lrclibProvider,'search').mockResolvedValue([{id:1,title:track.title,artist:track.artist,album:'',duration:200,hasSynced:true,hasWordSync:false,instrumental:false,syncedLyrics:lrc,confidence:1,url:'https://lrclib.net/api/get/1'}]);
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 try{
  await act(async()=>root.render(<TrackFinder track={{...track,source:'manual'}} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  const search=[...host.querySelectorAll('button')].find(button=>button.textContent==='Search');expect(search).toBeTruthy();
  await act(async()=>search!.click());
  expect(received).toHaveBeenCalledTimes(1);expect(received.mock.calls[0][0].source).toContain('LRCLIB');
  const cues=buildCues([{time:1,text:'First LRC line'},{time:5,text:'Next LRC line'}],[]);setLyricTimeline(cues);setVirtualMediaTime(2);
  apple.resolve({lrc:'[00:01.00]<00:01.00>Apple <00:02.00>first\n[00:05.00]<00:05.00>Apple <00:06.00>next',hasWordSync:true,source:'lrc.red'});
  await act(async()=>{});expect(received).toHaveBeenCalledTimes(1);
  setVirtualMediaTime(5);await act(async()=>vi.advanceTimersByTimeAsync(40));
  expect(received).toHaveBeenCalledTimes(2);expect(received.mock.calls[1][0].source).toBe('lrc.red');
 }finally{await act(async()=>root.unmount());}
});

it('cancels a queued Apple upgrade when a new song loads',async()=>{
 vi.useFakeTimers();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const provider=await import('../lyrics/providers');
 let emit:((value:StashResolvedLyrics)=>void)|undefined;
 const finished=deferred<StashResolvedLyrics|null>();
 vi.spyOn(provider,'resolveStashLyricsChain').mockImplementation((_track,_signal,_engine,_offset,_selected,callback)=>{emit=callback;return finished.promise;});
 const host=document.createElement('div'),root=createRoot(host),received=vi.fn();
 const first:StashResolvedLyrics={original:lrc,romanized:'',source:'LRC Library',hasWordSync:false,candidates:[],availableEngines:['lyricflow','lrclib']};
 try{
  await act(async()=>root.render(<TrackFinder track={track} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  await act(async()=>emit!(first));
  setLyricTimeline(buildCues([{time:1,text:'First line'},{time:5,text:'Next line'}],[]));setVirtualMediaTime(2);
  await act(async()=>emit!({...first,source:'lrc.red',original:'[00:01.00]Old Apple line',hasWordSync:true}));
  await act(async()=>root.render(<TrackFinder track={null} onMetadataChange={()=>{}} onLyricsFound={received}/>));
  setVirtualMediaTime(5);await act(async()=>vi.advanceTimersByTimeAsync(80));
  expect(received).toHaveBeenCalledTimes(1);
  finished.resolve(first);await act(async()=>{});expect(received).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());}
});
