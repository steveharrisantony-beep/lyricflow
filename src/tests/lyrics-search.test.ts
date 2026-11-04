// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {fetchAppleMusicWordSyncedLyrics} from '../lyrics/appleLyrics';
import {lrclibProvider} from '../lyrics/providers';

afterEach(()=>vi.unstubAllGlobals());

it.each([false,true])('omits album names from automatic and manual lyric requests (raw override: %s)',async rawOverride=>{
 const track={title:'Original rain',artist:'Test Artist',album:'Original Album Marker',duration:200,source:'provider' as const,confidence:1,provider:'jiosaavn' as const};
 const requests:URL[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  const url=new URL(input);requests.push(url);
  if(url.hostname==='lrclib.net')return Response.json([]);
  return new Response('',{status:404});
 }));
 await fetchAppleMusicWordSyncedLyrics(track,undefined,'all',rawOverride);
 await lrclibProvider.search(track,undefined,rawOverride);
 const lookup=requests.find(url=>url.pathname==='/music/lyrics');
 expect(lookup?.searchParams.get('title')).toBe(track.title);
 expect(lookup?.searchParams.get('artist')).toBe(track.artist);
 expect(requests.filter(url=>url.pathname!=='/music/lyrics').every(url=>url.hostname==='lrclib.net')).toBe(true);
 expect(requests.some(url=>url.hostname==='lrclib.net')).toBe(true);
 for(const url of requests){
  for(const key of ['album','album_name','al'])expect(url.searchParams.has(key),url.href).toBe(false);
  expect([...url.searchParams.values()].join(' '),url.href).not.toContain('Album Marker');
 }
 expect(track.album).toBe('Original Album Marker');
});
