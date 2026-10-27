import {afterEach,describe,expect,it,vi} from 'vitest';
import {BUILTIN_PLAYER_SOURCES,parseSongs,resolveSong,searchSongs,resolverBase,type SongResult} from '../music/providers';
import {isAutomaticLyricMatch,resolveAutomaticLyrics} from '../lyrics/providers';
import {convertTtmlToEnhancedLrc,convertStructuredAppleJsonToLrc} from '../lyrics/appleLyrics';
import {describeLyricProvider,describeAudioSource,splitLyricIntoBalancedLines} from '../lyrics/ManualLyrics';
import {buildCinematicSchedule,TEMPLATES} from '../visualization/cinematic/catalog';
import {lyricMotionFor,buildWordRows} from '../visualization/cinematic/kineticTypography';
import {resolveActiveCameraView} from '../visualization/cinematic/CinematicStage';
import {romanizeText,hasDistinctRomanized} from '../romanization/romanize';
import {buildCues} from '../lyrics/lyricTimeline';
import {getAudioSensitivity,getSpectrumSensitivity,setSpectrumSensitivity,spectrumResponse} from '../audio/audioSignal';
import {motionChannel,objectDrive} from '../visualization/cinematic/procedural/audioMotion';
import {extractYouTubeVideoId,isLyricVideoTrack,type TrackInfo,type TrackCandidate} from '../metadata/trackInfo';
const track:TrackInfo={title:'Original rain',artist:'Test Artist',album:'Demo',duration:180,source:'provider',confidence:1};
const candidate:TrackCandidate={id:1,title:track.title,artist:track.artist,album:track.album,duration:180,hasSynced:true,hasWordSync:false,instrumental:false,url:'https://lrclib.net/api/get/1',confidence:1};
const song:SongResult={id:'abcdefghijk',title:track.title,artist:track.artist,album:'',duration:180,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk'};
afterEach(()=>{vi.unstubAllGlobals();setSpectrumSensitivity(.35)});
describe('music source boundaries',()=>{
 it('exposes only JioSaavn and YouTube in the built-in online player UI and detects YouTube video IDs & lyric videos',()=>{
  expect(Object.keys(BUILTIN_PLAYER_SOURCES)).toEqual(['jiosaavn','resolver']);
  expect(extractYouTubeVideoId(song)).toBe('abcdefghijk');
  expect(extractYouTubeVideoId({id:'yt_dQw4w9WgXcQ',provider:'resolver',sourceUrl:''})).toBe('dQw4w9WgXcQ');
  expect(isLyricVideoTrack({title:'Shape of You (Official Lyric Video)'})).toBe(true);
  expect(isLyricVideoTrack({title:'Kesariya - Lyrical | Brahmastra'})).toBe(true);
  expect(isLyricVideoTrack({title:'Blinding Lights (Lyrics)'})).toBe(true);
  expect(isLyricVideoTrack({title:'Blinding Lights (Official Music Video)'})).toBe(false);
 });
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
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({streamPath:'/audio/abcdefghijk',audioSource:'YouTube · JioSaavn 320kbps AAC',track:{...song,artist:'Verified Artist'}})}));
  const resolved=await resolveSong(song,'https://resolver.example');
  expect(resolved.streamUrl).toBe('https://resolver.example/audio/abcdefghijk');expect(resolved.artist).toBe('Verified Artist');
  expect(resolved.audioSource).toBe('YouTube · JioSaavn 320kbps AAC');
  expect(resolved.youtubeVideoId).toBe('abcdefghijk');
 });
});
describe('automatic lyric recording matching & Apple Music TTML word-sync',()=>{
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
 it('converts Apple Music TTML and syllable JSON into enhanced word-synced LRC',()=>{
  const ttml='<tt><body><div><p begin="00:02.00" end="00:05.00"><span begin="00:02.00" end="00:03.20">Feel</span> <span begin="00:03.20" end="00:05.00">sound</span></p></div></body></tt>';
  const parsedTtml=convertTtmlToEnhancedLrc(ttml);
  expect(parsedTtml.hasWordSync).toBe(true);
  expect(parsedTtml.lrc).toContain('[00:02.00]<00:02.00>Feel <00:03.20>sound');
  // Multi-syllable adjacent spans without whitespace glue into a single word (Stash TtmlParser.kt / Spicy Lyrics JoinSplitWords)
  const syllableTtml='<tt><body><div><p begin="00:01.00" end="00:02.40"><span begin="00:01.00" end="00:01.30">beau</span><span begin="00:01.30" end="00:01.60">ti</span><span begin="00:01.60" end="00:02.00">ful</span> <span ttm:role="x-bg"><span begin="00:02.00" end="00:02.40">(yeah)</span></span> <span ttm:role="x-roman">bi-yu-ti-ful</span></p></div></body></tt>';
  const parsedSyllable=convertTtmlToEnhancedLrc(syllableTtml);
  expect(parsedSyllable.lrc).toContain('[00:01.00]<00:01.00>beautiful <00:02.00>(yeah)<00:02.40>');
  expect(parsedSyllable.romanizedLrc).toContain('[00:01.00]bi-yu-ti-ful');
  const parsedJson=convertStructuredAppleJsonToLrc({
   lyrics:[{time:1500,syllabus:[{text:'Hello',time:1500,duration:400},{text:'world',time:1900,duration:600}]}]
  });
  expect(parsedJson.hasWordSync).toBe(true);
  expect(parsedJson.lrc).toContain('[00:01.50]<00:01.50>Hello <00:01.90>world');
 });
 it('identifies lyrics provider and audio source clearly for the lyric panel UI',()=>{
  expect(describeLyricProvider('Apple Music · Word-Synced TTML (lrc.red)',true,true,false)).toEqual({
   providerName:'Apple Music',
   syncMode:'Word-Synced TTML',
   detail:'Apple Music · Word-Synced TTML (lrc.red)'
  });
  expect(describeLyricProvider('MusixMatch · Synced LRC',false,true,false).providerName).toBe('MusixMatch');
  expect(describeLyricProvider('Local File · LRC (track.lrc)',false,true,false).providerName).toBe('Local File');
  expect(describeAudioSource({...track,fileName:'demo.mp3',source:'filename'},true)).toEqual({
   providerName:'Local File',
   detail:'Local File · demo.mp3',
   isLocal:true
  });
  expect(describeAudioSource({...track,provider:'ytmusic',audioSource:'YouTube Music · JioSaavn 320kbps AAC'},true).providerName).toBe('YouTube Music');
 });
 it('restricts scheduled themes, kinetic motions, and camera view to user-enabled subsets and Front view',()=>{
  const cues=buildCues([{time:0,text:'Rain falls down'},{time:15,text:'Fire burns bright'}],[]);
  const schedule=buildCinematicSchedule([],cues,'pop','test-key',['holographic-tide','celestial-orbit']);
  expect(schedule.length).toBeGreaterThan(0);
  expect(schedule.every(s=>s.id==='holographic-tide'||s.id==='celestial-orbit')).toBe(true);
  const scene={...TEMPLATES[0],start:0,end:10,variation:1,section:0,reason:'test'};
  for(let i=0;i<25;i++){
   const motion=lyricMotionFor({...scene,variation:i},'Line '+i,['ship','elastic']);
   expect(['ship','elastic']).toContain(motion);
   const cam=resolveActiveCameraView();
   expect(cam).toBe('Front');
  }
  expect(resolveActiveCameraView()).toBe('Front');
 });
 it('splits long lyrics into multiple balanced rows and transliterates Indic scripts',()=>{
  const longLine='Walking through the neon city lights under the pouring midnight rain until the morning sun';
  const domRows=splitLyricIntoBalancedLines(longLine,34);
  expect(domRows.length).toBeGreaterThan(1);
  expect(domRows.join(' ')).toBe(longLine);
  const runs=longLine.split(' ').map((text,i)=>({text,start:i,end:i+1,energy:.5,emphasis:false,importance:.5,index:i}));
  const widths=runs.map(r=>r.text.length*14);
  const wordRows=buildWordRows(runs,widths,10,'ship',480);
  expect(wordRows.length).toBeGreaterThan(1);
  const hindi='नमस्ते दुनिया';
  const rom=romanizeText(hindi);
  expect(hasDistinctRomanized(hindi,rom.text)).toBe(true);
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
