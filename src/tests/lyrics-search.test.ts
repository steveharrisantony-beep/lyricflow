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
  if(url.hostname==='itunes.apple.com')return Response.json({results:[{
   trackName:track.title,artistName:track.artist,collectionName:'Canonical Album Marker',trackTimeMillis:200000,
  }]});
  if(url.hostname==='lrclib.net')return Response.json([]);
  return new Response('',{status:404});
 }));
 await fetchAppleMusicWordSyncedLyrics(track,undefined,'all',rawOverride);
 await lrclibProvider.search(track,undefined,rawOverride);
 const fallback=requests.find(url=>url.hostname==='lyrics-api.boidu.dev');
 expect(fallback?.searchParams.get('s')).toBe(track.title);
 expect(fallback?.searchParams.get('a')).toBe(track.artist);
 expect(requests.some(url=>url.pathname==='/music/lyrics')).toBe(true);
 expect(requests.some(url=>url.hostname==='lrclib.net')).toBe(true);
 for(const url of requests){
  for(const key of ['album','album_name','al'])expect(url.searchParams.has(key),url.href).toBe(false);
  expect([...url.searchParams.values()].join(' '),url.href).not.toContain('Album Marker');
 }
 expect(track.album).toBe('Original Album Marker');
});
