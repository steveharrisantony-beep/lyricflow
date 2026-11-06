// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import VideoSearchLogs from '../music/VideoSearchLogs';
import {getVideoSearchLogs,logVideoFiltering,videoSearchLogKey} from '../music/videoSearchHistory';

let track={title:'Retry fixture',artist:'Test Artist',provider:'jiosaavn' as const};
const candidate={id:'yt_abcdefghijk',youtubeVideoId:'abcdefghijk',title:'Retry fixture Official Video',
 artist:'Music label',album:'',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk'};
let firstId=0;
let nextTrack=0;
const entries=()=>getVideoSearchLogs().filter(entry=>entry.id>firstId&&entry.recordingKey===videoSearchLogKey(track));
beforeEach(()=>{
 track={...track,title:`Retry fixture ${++nextTrack}`};
 vi.useFakeTimers();vi.setSystemTime(0);
 firstId=getVideoSearchLogs()[0]?.id||0;
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it.each([1,2,3,4])('stops on the first nonempty response at attempt %s and logs every exact query',async(successAttempt)=>{
 const requestedAt:number[]=[];
 const fetcher=vi.fn(async(_url:string)=>{
  requestedAt.push(Date.now());
  return Response.json({data:requestedAt.length===successAttempt?[candidate]:[]});
 });
 vi.stubGlobal('fetch',fetcher);
 const pending=findYouTubeBackgrounds(track,'https://resolver.example',undefined,'lyrics');
 await vi.advanceTimersByTimeAsync(3000);
 const result=await pending;
 expect(result.candidates[0].youtubeVideoId).toBe(candidate.youtubeVideoId);
 expect(requestedAt).toEqual([0,0,1000,3000].slice(0,successAttempt));
 const logs=entries().filter(entry=>entry.mode==='Autoplay').reverse();
 expect(logs).toHaveLength(successAttempt);
 logs.forEach((entry,index)=>{
  expect(entry).toMatchObject({query:`${track.title} Test Artist Lyric Video`,attempt:index+1,
   maxAttempts:4,retryDelayMs:[0,0,1000,2000][index],resultCount:index+1===successAttempt?1:0});
  const query=new URL(fetcher.mock.calls[index][0]).searchParams;
  expect(query.get('q')).toBe(entry.query);
  expect(query.get('refresh')).toBe(index?'1':null);
  expect(query.get('backgroundPreference')).toBe('lyrics');
 });
 expect(entries().some(entry=>entry.mode==='Search failure')).toBe(false);
 await vi.advanceTimersByTimeAsync(20000);
 expect(fetcher).toHaveBeenCalledTimes(successAttempt);
});

it('waits 1s and 2s after the immediate retry and leaves a visible failure when all four are empty',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[]}));vi.stubGlobal('fetch',fetcher);
 const pending=findYouTubeBackgrounds(track,'https://resolver.example');
 await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(999);expect(fetcher).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(3);
 await vi.advanceTimersByTimeAsync(1999);expect(fetcher).toHaveBeenCalledTimes(3);
 await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(4);
 expect(await pending).toEqual({candidates:[],candidateCount:0});
 logVideoFiltering(videoSearchLogKey(track),0,0);
 expect(entries().filter(entry=>entry.mode==='Autoplay')).toHaveLength(4);
 expect(entries().filter(entry=>entry.mode==='Search failure')).toEqual([
  expect.objectContaining({resultCount:0,status:'Search failed: all 4 attempts returned 0 results. No background video selected.'}),
 ]);
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<VideoSearchLogs recordingKey={videoSearchLogKey(track)}/>));
  expect(host.textContent).toContain('Search failed: all 4 attempts');
  for(let i=1;i<=4;i++)expect(host.textContent).toContain(`Search attempt ${i} of 4`);
  expect(host.textContent).toContain('Immediate retry');
  expect(host.textContent).toContain('Retry after 1s');
  expect(host.textContent).toContain('Retry after 2s');
  // The current query is shown once in the summary, not on every retry.
  expect(host.querySelectorAll('.video-log-summary code')).toHaveLength(1);
  expect(host.querySelectorAll('article code')).toHaveLength(0);
 }finally{await act(async()=>root.unmount());}
 await vi.advanceTimersByTimeAsync(20000);expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each([0,1000])('cancels a pending retry delay when the song changes at %sms',async(elapsed)=>{
 const fetcher=vi.fn(async()=>Response.json({data:[]}));vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();
 const pending=findYouTubeBackgrounds(track,'https://resolver.example',controller.signal);
 const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(elapsed);
 const calls=fetcher.mock.calls.length;
 controller.abort();await rejected;
 await vi.advanceTimersByTimeAsync(10000);
 expect(fetcher).toHaveBeenCalledTimes(calls);
 expect(entries().some(entry=>entry.mode==='Search failure')).toBe(false);
 expect(vi.getTimerCount()).toBe(0);
});

it('discards a late response after cancellation and starts no further attempt',async()=>{
 let finish!:(response:Response)=>void;
 const fetcher=vi.fn(async()=>new Promise<Response>(resolve=>{finish=resolve;}));
 vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();
 const pending=findYouTubeBackgrounds(track,'https://resolver.example',controller.signal);
 const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 controller.abort();finish(Response.json({data:[candidate]}));await rejected;
 await vi.advanceTimersByTimeAsync(10000);
 expect(fetcher).toHaveBeenCalledOnce();
 expect(entries()[0].status).toBe('Cancelled');
 expect(entries().some(entry=>entry.mode==='Search failure')).toBe(false);
});

it('does not retry nonempty results that fail filtering, or empty manual searches',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[{...candidate,title:'Retry fixture Cover'}]}));
 vi.stubGlobal('fetch',fetcher);
 expect((await findYouTubeBackgrounds(track,'https://resolver.example')).candidateCount).toBe(1);
 expect(fetcher).toHaveBeenCalledOnce();
 fetcher.mockImplementation(async()=>Response.json({data:[]}));
 expect(await findYouTubeBackgrounds(track,'https://resolver.example',undefined,'music','Search online'))
  .toEqual({candidates:[],candidateCount:0});
 await vi.advanceTimersByTimeAsync(10000);
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(entries().some(entry=>entry.mode==='Search failure')).toBe(false);
});
