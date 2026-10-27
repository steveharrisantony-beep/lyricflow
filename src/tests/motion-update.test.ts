import {afterEach,describe,expect,it,vi} from 'vitest';
import {BandEnvelope} from '../audio/bandEnvelope';
import {TEMPLATES} from '../visualization/cinematic/catalog';
import {MOTION_SCENES} from '../visualization/cinematic/procedural/MotionGraphics';
import {visualSystemFor} from '../visualization/cinematic/CinematicStage';
import {sceneColors} from '../visualization/cinematic/paint';
import {contrastRatio,readableInk} from '../visualization/cinematic/contrast';
import {providerRequest} from '../network/request';
import {cleanLyricMetadata,retrievePermittedLyrics} from '../lyrics/providers';
import {searchSongs,resolveSong,type SongResult} from '../music/providers';
import {motionChannel,objectDrive} from '../visualization/cinematic/procedural/audioMotion';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
describe('live motion graphics',()=>{
 it('preserves headroom for a new hit after sustained music and returns to silence',()=>{
  const e=new BandEnvelope();let steady=0;
  for(let i=0;i<200;i++)steady=e.update(.6,.025,1);
  const hit=e.update(.85,.025,1);
  expect(hit-steady).toBeGreaterThan(.25);
  for(let i=0;i<100;i++)e.update(0,.025,1);
  expect(e.update(0,.025,1)).toBeLessThan(.001);
 });
 it('does not leak bass into treble or beat-only elements',()=>{
  expect(motionChannel(5,5)).toBe('beat');
  expect(objectDrive('beat',1,1,1,0)).toBe(0);
  expect(objectDrive('treble',1,1,0,1)).toBe(0);
  const e=new BandEnvelope();expect(e.update(.8,.025,0)).toBe(0);
 });
 it('routes twenty-one distinct VoxelWall themes to the 2D motion engine',()=>{
  expect(new Set(MOTION_SCENES).size).toBe(21);
  for(const id of MOTION_SCENES)expect(visualSystemFor(id)).toBe('motion2d');
 });
 it('keeps lyric ink and accents readable against every scene surface and every colour palette',()=>{
  for(const template of TEMPLATES){
   for(const pal of template.palettes){
    const p=sceneColors(template.id,pal.id);
    expect(contrastRatio(p.background,p.foreground),`${p.id}:${pal.id}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.background,p.accent),`${p.id}:${pal.id}`).toBeGreaterThanOrEqual(4.5);
   }
  }
  expect(readableInk('#ffffff')).toBe('#151820');
  expect(readableInk('#000000')).toBe('#fffaf2');
 });
});
describe('resilient discovery',()=>{
 it('retries a temporary failure once and sends no preflight-triggering headers',async()=>{
  vi.useFakeTimers();
  const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch',fetch);const promise=providerRequest('https://lrclib.net/api/get/1');
  await vi.runAllTimersAsync();expect((await promise).ok).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[0][1].headers).toBeUndefined();
 });
 it('cancels an in-flight request without retries',async()=>{
  const controller=new AbortController();let received:AbortSignal|undefined;
  const fetch=vi.fn((_url,options)=>new Promise((_resolve,reject)=>{received=options.signal;received?.addEventListener('abort',()=>reject(received?.reason))}));
  vi.stubGlobal('fetch',fetch);
  const promise=providerRequest('https://lrclib.net/api/search',controller.signal);
  controller.abort();await expect(promise).rejects.toThrow();expect(received?.aborted).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('keeps version markers while cleaning upload wrappers',()=>{
  expect(cleanLyricMetadata('Rain (Official Audio)')).toBe('Rain');
  expect(cleanLyricMetadata('Artist - Topic')).toBe('Artist');
  expect(cleanLyricMetadata('Rain (Live Remix)')).toBe('Rain (Live Remix)');
 });
 it('uses the timestamped payload from search without a second fetch',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const lyric=await retrievePermittedLyrics({id:1,title:'Rain',artist:'Test',album:'',duration:180,confidence:1,hasSynced:true,hasWordSync:false,instrumental:false,url:'https://lrclib.net/api/get/1',syncedLyrics:'[00:01]Test'});
  expect(lyric.synced).toBe('[00:01]Test');expect(fetch).not.toHaveBeenCalled();
 });
 it('routes each catalog explicitly and preserves recording metadata through HLS resolve',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})});vi.stubGlobal('fetch',fetch);
  for(const source of ['ytmusic','soundcloud','jiosaavn'] as const){await searchSongs('test song',source,'https://music.example');expect(fetch.mock.lastCall?.[0]).toContain('provider='+source)}
  fetch.mockResolvedValue({ok:true,json:async()=>({streamPath:'/audio/soundcloud_abc',format:'hls',track:{id:'soundcloud_abc',title:'Rain',artist:''}})});
  const song:SongResult={id:'soundcloud_abc',title:'Rain',artist:'Test Artist',album:'',duration:30,provider:'soundcloud',sourceUrl:'https://soundcloud.com/test/rain'};
  const result=await resolveSong(song,'https://music.example');expect(result.format).toBe('hls');expect(result.artist).toBe('Test Artist');expect(result.provider).toBe('soundcloud');
 });
});
