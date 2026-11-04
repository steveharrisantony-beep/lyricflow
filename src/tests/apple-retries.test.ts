// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';
import {resolveStashLyricsChain} from '../lyrics/providers';

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
  if(url.hostname==='itunes.apple.com')return Response.json({results:[]});
  if(url.hostname==='lyrics-api.boidu.dev')return new Response('',{status:404});
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

it('publishes early LRC lyrics while Apple retries, then upgrades to Apple',async()=>{
 const {attempts}=fixture(3);const progress=vi.fn();
 const pending=resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
 await vi.advanceTimersByTimeAsync(0);
 expect(progress.mock.calls[0][0].original).toBe(lrc);
 expect(progress.mock.calls[0][0].source).toContain('LRC Library');
 expect(attempts).toEqual([0]);
 await vi.advanceTimersByTimeAsync(1000);
 expect(progress.mock.calls.at(-1)?.[0].source).toContain('LRC Library');
 await vi.advanceTimersByTimeAsync(2000);
 expect(progress.mock.calls.at(-1)?.[0].source).toContain('lrc.red');
 expect((await pending)?.original).toBe(appleLrc);
});

it('uses temporary LRC even with Apple selected, but honours an explicit LRC selection',async()=>{
 const {attempts}=fixture(3);const progress=vi.fn();
 const pending=resolveStashLyricsChain(track,undefined,'apple',0,undefined,progress);
 await vi.advanceTimersByTimeAsync(0);
 expect(progress.mock.calls[0][0].source).toContain('LRC Library');
 await vi.advanceTimersByTimeAsync(3000);
 expect((await pending)?.source).toContain('lrc.red');expect(attempts).toHaveLength(3);
 const nextProgress=vi.fn();
 const next=resolveStashLyricsChain(track,undefined,'lrclib',0,undefined,nextProgress);
 await vi.advanceTimersByTimeAsync(3000);
 expect((await next)?.source).toContain('LRC Library');
 expect(nextProgress.mock.calls.every(([result])=>result.source.includes('LRC Library'))).toBe(true);
});

it('keeps LRC lyrics after all Apple attempts fail',async()=>{
 const {attempts}=fixture();const progress=vi.fn();
 const pending=resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
 await vi.advanceTimersByTimeAsync(3000);
 expect((await pending)?.original).toBe(lrc);
 expect(attempts).toHaveLength(3);
 expect(progress.mock.calls.every(([result])=>result.original===lrc)).toBe(true);
});

it.each([
 {artist:'Test Artist, Guest Artist',provider:'jiosaavn' as const},
 {artist:'Test Artist (feat. Guest Artist)',provider:'resolver' as const,
  youtubeVideoId:'abcdefghijk',videoTitle:'Original rain (Official Video)',channelHint:'Video Channel'},
])('retries a missed $provider lookup with the title and primary artist',async credit=>{
 const progress=vi.fn();
 const http=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));
  if(url.pathname==='/music/lyrics'&&url.searchParams.get('source')==='apple'&&url.searchParams.get('artist')===track.artist){
   expect(url.searchParams.get('title')).toBe(track.title);
   expect(url.searchParams.get('duration')).toBe(String(track.duration));
   expect(url.searchParams.has('isYouTube')).toBe(false);
   return Response.json(appleResult);
  }
  if(url.hostname==='itunes.apple.com')return Response.json({results:[]});
  if(url.pathname==='/music/apple-candidates')return Response.json({candidates:[]});
  if(url.pathname==='/api/search')return Response.json([]);
  return new Response('',{status:404});
 });
 vi.stubGlobal('fetch',http);
 const pending=resolveStashLyricsChain({...track,...credit},undefined,'lyricflow',0,undefined,progress);
 await vi.advanceTimersByTimeAsync(2999);
 expect(progress).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await pending).toMatchObject({original:appleLrc,hasWordSync:true});
 const artists=http.mock.calls.map(([url])=>new URL(String(url)))
  .filter(url=>url.pathname==='/music/lyrics'&&url.searchParams.get('source')==='apple')
  .map(url=>url.searchParams.get('artist'));
 expect(artists).toEqual([...Array(3).fill('channelHint' in credit?credit.channelHint:credit.artist),track.artist]);
 expect(progress.mock.calls.at(-1)?.[0].original).toBe(appleLrc);
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

it('automatically checks the manual candidate discovery path even after LRCLIB supplies lines',async()=>{
 const ttml='<tt><body><p begin="1s" end="3s"><span begin="1s" end="2s">Preferred </span><span begin="2s" end="3s">words</span></p></body></tt>';
 const {http}=fixture(Infinity,undefined,[{id:-1001,title:track.title,artist:track.artist,duration:200,ttml,sourceLabel:'lrc.red · Word-Synced TTML',url:'https://lrc.red/s/TEST00000001.ttml'}]);
 const progress=vi.fn(),pending=resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
 await vi.advanceTimersByTimeAsync(0);expect(progress.mock.calls[0][0].original).toBe(lrc);
 await vi.advanceTimersByTimeAsync(3000);
 expect(await pending).toMatchObject({hasWordSync:true,sourceUrl:'https://lrc.red/s/TEST00000001.ttml'});
 expect(progress.mock.calls.at(-1)?.[0].hasWordSync).toBe(true);
 expect(http.mock.calls.filter(([url])=>new URL(String(url)).pathname==='/music/apple-candidates')).toHaveLength(1);
});
