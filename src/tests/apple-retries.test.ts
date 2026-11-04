// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';

const track={title:'Original rain',artist:'Test Artist',album:'',duration:200,source:'provider' as const,confidence:1,provider:'jiosaavn' as const};
const lrc='[00:01.00]LRC first line\n[00:05.00]LRC next line';
const appleLrc='[00:01.00]<00:01.00>Apple <00:02.00>first\n[00:05.00]<00:05.00>Apple <00:06.00>next';
const appleResult={lrc:appleLrc,source:'lrc.red · Word-Synced',sourceUrl:'https://lrc.red/s/TEST00000001.ttml',hasWordSync:true,title:track.title,artist:track.artist};
function fixture(successAttempt=Infinity,first?:Promise<Response>,candidates:unknown[]=[]){
 const started=Date.now(),attempts:number[]=[];
 const http=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));
  if(url.pathname==='/music/lyrics'&&url.searchParams.get('source')==='apple'){
   attempts.push(Date.now()-started);
   if(attempts.length===1&&first)return first;
   return attempts.length===successAttempt?Response.json(appleResult):new Response('',{status:404});
  }
  if(url.pathname==='/music/apple-candidates')return Response.json({candidates});
  if(url.hostname==='lrclib.net')return Response.json({id:1,trackName:track.title,artistName:track.artist,duration:200,instrumental:false,syncedLyrics:lrc});
  throw new Error('Unexpected request '+url.pathname);
 });
 vi.stubGlobal('fetch',http);
 return {attempts,http};
}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

it('retries a complete empty Apple lookup after 1s, then 2s, and stops after the third attempt',async()=>{
 const {attempts}=fixture();
 const pending=fetchAppleMusicWordSyncedLyrics(track,undefined,'apple');
 await vi.advanceTimersByTimeAsync(0);expect(attempts).toEqual([0]);
 await vi.advanceTimersByTimeAsync(999);expect(attempts).toEqual([0]);
 await vi.advanceTimersByTimeAsync(1);expect(attempts).toEqual([0,1000]);
 await vi.advanceTimersByTimeAsync(1999);expect(attempts).toEqual([0,1000]);
 await vi.advanceTimersByTimeAsync(1);expect(attempts).toEqual([0,1000,3000]);
 expect(await pending).toBeNull();
 await vi.advanceTimersByTimeAsync(10000);expect(attempts).toHaveLength(3);
});

it.each([1,2,3])('stops immediately when Apple succeeds on attempt %s',async success=>{
 const {attempts}=fixture(success);
 const pending=fetchAppleMusicWordSyncedLyrics(track,undefined,'apple');
 await vi.advanceTimersByTimeAsync(3000);
 expect((await pending)?.lrc).toBe(appleLrc);
 expect(attempts).toEqual([0,1000,3000].slice(0,success));
 await vi.advanceTimersByTimeAsync(10000);expect(attempts).toHaveLength(success);
});

it('starts the retry interval after the failed lookup finishes, rather than its start time',async()=>{
 let complete!:(value:Response)=>void;
 const first=new Promise<Response>(resolve=>{complete=resolve;});
 const {attempts}=fixture(2,first);
 const pending=fetchAppleMusicWordSyncedLyrics(track,undefined,'apple');
 await vi.advanceTimersByTimeAsync(4500);expect(attempts).toEqual([0]);
 complete(new Response('',{status:404}));await vi.advanceTimersByTimeAsync(0);
 await vi.advanceTimersByTimeAsync(999);expect(attempts).toEqual([0]);
 await vi.advanceTimersByTimeAsync(1);expect(attempts).toEqual([0,5500]);
 expect((await pending)?.lrc).toBe(appleLrc);
});

it.each([500,1500])('cancels retries when the song changes during the %sms wait',async time=>{
 const {attempts}=fixture();const controller=new AbortController();
 const pending=fetchAppleMusicWordSyncedLyrics(track,controller.signal,'apple');
 const check=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(time);const count=attempts.length;
 controller.abort(new DOMException('Song changed','AbortError'));
 await check;await vi.advanceTimersByTimeAsync(10000);expect(attempts).toHaveLength(count);
});

it('retries cached line lyrics with a fresh request and upgrades them to word timestamps',async()=>{
 const cached={lrc,hasWordSync:false,source:'Paxsenix · Synced'};
 const {attempts,http}=fixture(2,Promise.resolve(Response.json(cached)));
 const progress=vi.fn();
 const pending=fetchAppleMusicWordSyncedLyrics(track,undefined,'apple',false,progress);
 await vi.advanceTimersByTimeAsync(0);
 expect(progress.mock.calls[0][0]).toMatchObject(cached);
 await vi.advanceTimersByTimeAsync(1000);
 expect((await pending)?.lrc).toBe(appleLrc);expect(attempts).toEqual([0,1000]);
 const requests=http.mock.calls.map(([url])=>new URL(String(url))).filter(url=>url.pathname==='/music/lyrics');
 expect(requests[1].searchParams.get('refresh')).toBe('1');
 expect(progress.mock.calls.at(-1)?.[0].hasWordSync).toBe(true);
});

it('retains usable line lyrics when all fresh word-sync attempts fail',async()=>{
 fixture(Infinity,Promise.resolve(Response.json({lrc,hasWordSync:false,source:'Paxsenix'})));
 const pending=fetchAppleMusicWordSyncedLyrics(track,undefined,'apple');
 await vi.advanceTimersByTimeAsync(3000);
 expect(await pending).toMatchObject({lrc,hasWordSync:false});
});
