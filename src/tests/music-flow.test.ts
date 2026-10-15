import {afterEach,describe,expect,it,vi} from 'vitest';
import {parseSongs,resolveSong,searchSongs,resolverBase,type SongResult} from '../music/providers';
import {isAutomaticLyricMatch,resolveAutomaticLyrics} from '../lyrics/providers';
import {getAudioSensitivity,getSpectrumSensitivity,setSpectrumSensitivity,spectrumResponse} from '../audio/audioSignal';
import {motionChannel,objectDrive} from '../visualization/cinematic/procedural/audioMotion';
import type {TrackInfo,TrackCandidate} from '../metadata/trackInfo';
const track:TrackInfo={title:'Original rain',artist:'Test Artist',album:'Demo',duration:180,source:'provider',confidence:1};
const candidate:TrackCandidate={id:1,title:track.title,artist:track.artist,album:track.album,duration:180,hasSynced:true,hasWordSync:false,instrumental:false,url:'https://lrclib.net/api/get/1',confidence:1};
const song:SongResult={id:'abcdefghijk',title:track.title,artist:track.artist,album:'',duration:180,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk'};
afterEach(()=>{vi.unstubAllGlobals();setSpectrumSensitivity(.35)});
describe('music source boundaries',()=>{
 it('rejects malformed candidates and gated Audius tracks',()=>{
  const songs=parseSongs({data:[null,{id:'x',title:'Paid',is_stream_gated:true},{id:'a',title:'Rain',duration:9,user:{name:'Artist'}}]},'audius');
  expect(songs).toHaveLength(1);expect(songs[0].artist).toBe('Artist');
 });
 it('rejects non-HTTPS and credential-bearing resolver URLs',()=>{
  for(const url of ['javascript:alert(1)','http://public.example','https://u:p@example.org'])expect(()=>resolverBase(url)).toThrow();
  expect(resolverBase('https://resolver.example/')).toBe('https://resolver.example');
 });
 it('encodes a song query and forwards cancellation',async()=>{
  const signal=new AbortController().signal;
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})});vi.stubGlobal('fetch',mock);
  await searchSongs('Rain & moon','resolver','https://resolver.example',signal);
  expect(mock.mock.calls[0][0]).toContain('q=Rain+%26+moon');expect(mock.mock.calls[0][1].signal.aborted).toBe(false);
 });
 it('requires a resolver connection before contacting a server',async()=>{
  await expect(searchSongs('Rain','resolver','')).rejects.toThrow('Connect');
 });
 it('never accepts an arbitrary stream redirect from the resolver',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({streamPath:'https://untrusted.example/audio'})}));
  await expect(resolveSong(song,'https://resolver.example')).rejects.toThrow('Invalid');
 });
 it('resolves into a shared-player URL and uses richer recording metadata',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({streamPath:'/audio/abcdefghijk',track:{...song,artist:'Verified Artist'}})}));
  const resolved=await resolveSong(song,'https://resolver.example');
  expect(resolved.streamUrl).toBe('https://resolver.example/audio/abcdefghijk');expect(resolved.artist).toBe('Verified Artist');
 });
});
describe('automatic lyric recording matching',()=>{
 it('requires the correct title, artist, timing and duration',()=>{
  expect(isAutomaticLyricMatch(track,candidate)).toBe(true);
  for(const change of [{artist:'Cover artist'},{title:'Original rain live'},{duration:200},{instrumental:true},{hasSynced:false}])expect(isAutomaticLyricMatch(track,{...candidate,...change})).toBe(false);
  expect(isAutomaticLyricMatch({...track,artist:''},candidate)).toBe(false);
 });
 it('uses exact get first and returns timestamps unchanged',async()=>{
  const raw={id:1,trackName:track.title,artistName:track.artist,albumName:'Demo',duration:180,syncedLyrics:'[00:01.00]Original test line',instrumental:false};
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>raw});vi.stubGlobal('fetch',mock);
  const result=await resolveAutomaticLyrics(track);
  expect(result?.original).toBe(raw.syncedLyrics);expect(mock).toHaveBeenCalledTimes(1);
 });
 it('distinguishes a temporary provider failure from a missing lyric',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:429}));
  await expect(resolveAutomaticLyrics(track)).rejects.toThrow('429');
 });
 it('falls back to search on 404 and rejects competing exact versions',async()=>{
  const raw={id:1,trackName:track.title,artistName:track.artist,albumName:'Demo',duration:180,syncedLyrics:'[00:01.00]Original test',instrumental:false};
  const mock=vi.fn().mockResolvedValueOnce({ok:false,status:404}).mockResolvedValueOnce({ok:true,json:async()=>[raw,{...raw,id:2}]});vi.stubGlobal('fetch',mock);
  expect(await resolveAutomaticLyrics(track)).toBeNull();expect(mock).toHaveBeenCalledTimes(2);
 });
});
describe('independent spectrum gain and instrument roles',()=>{
 it('lowers spectral energy without touching beat/overall sensitivity',()=>{
  const initial=getAudioSensitivity();setSpectrumSensitivity(.1);
  expect(spectrumResponse(.8)).toBeLessThan(spectrumResponse(.8,.8));
  expect(spectrumResponse(.8,0)).toBe(0);expect(getAudioSensitivity()).toBe(initial);
  setSpectrumSensitivity(Number.NaN);expect(getSpectrumSensitivity()).toBe(.35);
 });
 it('keeps quiet-room noise below the spectrum floor',()=>{expect(spectrumResponse(.04)).toBe(0)});
 it('assigns small detail to treble and heavy structures to bass',()=>{
  expect(motionChannel(1,.3)).toBe('treble');expect(motionChannel(2,2)).toBe('bass');expect(motionChannel(3,3)).toBe('mids');
  expect(objectDrive('treble',1,0,0,1)).toBe(0);expect(objectDrive('bass',0,0,1,1)).toBe(0);
  expect(objectDrive('bass',1,0,0,1)).toBe(1);expect(objectDrive('treble',0,0,1,0)).toBe(1);
 });
});
