// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CinematicStage, { type CinematicProps } from '../visualization/cinematic/CinematicStage';
import { videoSyncTarget } from '../audio/videoTiming';
import { correctionContext, makeCorrection, validCorrection } from '../firebase/correctionModel';
import { validSongMapping } from '../firebase/songMappings';
const base: CinematicProps = {quality:'Performance',intensity:0,speed:1,reducedMotion:true,demo:false,paused:true,autoScenes:false,manualScene:'holographic-tide',spatialTypography:false,motionBlur:0,youtubeVideoId:'abcdefghijk',playbackTime:10,hasSeparateAudioStream:true,audioPaused:false};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('stores separate file and video references with signed delays for the same song across catalogs',()=>{
  const track={title:'Song',artist:'Author',album:'Album',duration:200,source:'provider' as const,confidence:1,provider:'jiosaavn' as const};
  const context=correctionContext(track,'video')!;
  expect(context.recordingKey).toBe(correctionContext({...track,provider:'local',album:'Other catalog label'},'video')?.recordingKey);
  const video=makeCorrection(context,{youtubeVideoId:'abcdefghijk',videoDelaySeconds:-2.25});
  expect(validCorrection(video,context)?.videoDelaySeconds).toBe(-2.25);
  expect(validCorrection({...video,videoDelaySeconds:301},context)).toBeNull();
  const mapping={identity:context.identity,lyrics:{sourceFile:{name:'Lyrics file',url:'https://lrclib.net/api/get/12',revision:'l3_0123456789abcdef'},selection:{engine:'lrclib',lrclibId:12,subtitleTrackId:null},delaySeconds:1.5},video:{youtubeVideoId:'abcdefghijk',delaySeconds:-2.25}};
  expect(validSongMapping(mapping,context.identity)).toMatchObject({lyrics:{sourceFile:{url:'https://lrclib.net/api/get/12'},delaySeconds:1.5},video:{youtubeVideoId:'abcdefghijk',delaySeconds:-2.25}});
});
it('delays or advances only the muted background; its clock and end never control the music',async()=>{
  const clock=vi.fn(),ended=vi.fn();
  await act(async()=>root.render(<CinematicStage {...base} onYoutubeTimeUpdate={clock} onYoutubeEnded={ended}/>));
  const frame=host.querySelector('iframe')!;expect(frame.src).toContain('mute=1');
  const send=vi.spyOn(frame.contentWindow!,'postMessage');
  const commands=()=>send.mock.calls.map(args=>JSON.parse(String(args[0])));
  await act(async()=>root.render(<CinematicStage {...base} videoDelaySeconds={2} onYoutubeTimeUpdate={clock} onYoutubeEnded={ended}/>));
  expect(commands()).toContainEqual({event:'command',func:'seekTo',args:[8,true]});
  expect(commands().some(c=>c.func==='unMute')).toBe(false);
  send.mockClear();
  await act(async()=>root.render(<CinematicStage {...base} videoDelaySeconds={-2} onYoutubeTimeUpdate={clock} onYoutubeEnded={ended}/>));
  expect(commands()).toContainEqual({event:'command',func:'seekTo',args:[12,true]});
  await act(async()=>{
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{currentTime:12,duration:100}})}));
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'onStateChange',info:0})}));
  });
  expect(clock).not.toHaveBeenCalled();expect(ended).not.toHaveBeenCalled();
});
it('holds the first frame while a positive delay is pending and resumes on the audio timeline',async()=>{
  expect(videoSyncTarget(1,3)).toEqual({time:0,waiting:true});
  expect(videoSyncTarget(10,-3)).toEqual({time:13,waiting:false});
  expect(videoSyncTarget(10,-3,false)).toEqual({time:10,waiting:false});
  await act(async()=>root.render(<CinematicStage {...base}/>));
  const send=vi.spyOn(host.querySelector('iframe')!.contentWindow!,'postMessage');
  await act(async()=>root.render(<CinematicStage {...base} playbackTime={1} videoDelaySeconds={3}/>));
  expect(send.mock.calls.some(args=>JSON.parse(String(args[0])).func==='pauseVideo')).toBe(true);
  send.mockClear();
  await act(async()=>root.render(<CinematicStage {...base} playbackTime={3} videoDelaySeconds={3}/>));
  expect(send.mock.calls.some(args=>JSON.parse(String(args[0])).func==='playVideo')).toBe(true);
});

it('keeps an unsaved signed video delay while a background mapping catches up',async()=>{
  const {default:CorrectionControls}=await import('../firebase/CorrectionControls');
  const track={title:'Song',artist:'Author',album:'Studio',duration:200,source:'manual' as const,confidence:1,provider:'local' as const};
  const correction=makeCorrection(correctionContext(track,'video')!,{youtubeVideoId:'abcdefghijk',videoDelaySeconds:2});
  const empty={key:'',context:null,correction:null,source:'automatic',save:vi.fn(),reset:vi.fn(),error:''};
  const video={...empty,correction,source:'personal'},choose=vi.fn();
  const render=(mappedDelay:number)=><CorrectionControls user={null} track={track} delay={empty} lyrics={empty} video={video} mappedVideo={{youtubeVideoId:'abcdefghijk',delaySeconds:mappedDelay}} canChangeVideo onVideoChange={choose}/>;
  await act(async()=>root.render(render(0)));
  const input=host.querySelector<HTMLInputElement>('input[aria-label="Video delay seconds"]')!;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'-2');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>root.render(render(2)));
  expect(input.value).toBe('-2');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(choose).toHaveBeenCalledWith('abcdefghijk',-2);
});

it('ranks recording suitability before views, excludes static audio and requires lyrical title labels',async()=>{
  const {rankYouTubeBackgroundCandidates}=await import('../music/providers');
  const track={title:'Starboy',artist:'The Weeknd',album:'Starboy',duration:230,source:'provider' as const,confidence:1,provider:'jiosaavn' as const};
  const candidates=[
    {id:'vid_audio_topic',title:'Starboy (Official Audio)',artist:'The Weeknd - Topic',album:'Audio Track',duration:230,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=audioTopic1',viewCount:3_000_000_000},
    {id:'vid_low_views',title:'The Weeknd - Starboy (Official Video)',artist:'The Weeknd',album:'YouTube',duration:232,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=vidLowViews1',viewCount:450_000},
    {id:'vid_most_views',title:'The Weeknd - Starboy ft. Daft Punk',artist:'The Weeknd',album:'YouTube',duration:273,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=34Na4j8AVgA',viewCount:2_400_000_000},
    {id:'vid_lyric_most',title:'The Weeknd - Starboy (Official Lyric Video)',artist:'The Weeknd',album:'YouTube',duration:230,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=lyricMost11',viewCount:85_000_000},
    {id:'vid_lyric_low',title:'The Weeknd - Starboy Lyrics',artist:'The Weeknd',album:'YouTube',duration:230,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=lyricLow111',viewCount:120_000},
  ];
  const musicRanked=rankYouTubeBackgroundCandidates(candidates,track,'music');
  expect(musicRanked[0].id).toBe('vid_low_views');
  expect(musicRanked.some(s=>s.id==='vid_audio_topic')).toBe(false);
  const lyricRanked=rankYouTubeBackgroundCandidates(candidates,track,'lyrics');
  expect(lyricRanked[0].id).toBe('vid_lyric_most');
  expect(lyricRanked.every(s=>/\blyric(?:s|al)?\b/i.test(s.title))).toBe(true);
});

it('renders video thumbnails in YouTubeBackgroundPicker custom video finding',async()=>{
  const providers=await import('../music/providers');
  vi.spyOn(providers,'searchStashCatalog').mockResolvedValue([
    {
      id:'yt_34Na4j8AVgA',
      title:'The Weeknd - Starboy ft. Daft Punk (Official Video)',
      artist:'The Weeknd',
      album:'',
      duration:273,
      provider:'resolver',
      sourceUrl:'https://www.youtube.com/watch?v=34Na4j8AVgA',
      artwork:'https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg',
      viewCount:2_400_000_000
    }
  ]);
  const {default:YouTubeBackgroundPicker}=await import('../music/YouTubeBackgroundPicker');
  const track={title:'Starboy',artist:'The Weeknd',album:'Starboy',duration:230,source:'provider' as const,confidence:1,provider:'jiosaavn' as const};
  await act(async()=>root.render(
    <YouTubeBackgroundPicker
      track={track}
      activeVideoId={null}
      preference="music"
      onPreferenceChange={vi.fn()}
      onChoose={vi.fn()}
    />
  ));
  const findBtn=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Find YouTube video background'))!;
  await act(async()=>findBtn.click());
  const thumb=host.querySelector<HTMLImageElement>('img.candidate-thumb');
  expect(thumb).not.toBeNull();
  expect(thumb?.src).toContain('https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg');
});

it('detects Spotify advertisements and pauses lyrics lookup during ads',async()=>{
  const {isAdvertisementTrack}=await import('../metadata/trackInfo');
  expect(isAdvertisementTrack({title:'Advertisement',artist:'Spotify',packageName:'com.spotify.music'})).toBe(true);
  expect(isAdvertisementTrack({title:'Spotify',artist:'Spotify',packageName:'com.spotify.music',duration:30})).toBe(true);
  expect(isAdvertisementTrack({title:'Sponsored Message',artist:'',packageName:'com.spotify.music',duration:20})).toBe(true);
  expect(isAdvertisementTrack({title:'Starboy',artist:'The Weeknd',packageName:'com.spotify.music',duration:230})).toBe(false);

  const {default:TrackFinder}=await import('../metadata/TrackFinder');
  const onLyricsFound=vi.fn();
  const onStatusChange=vi.fn();
  const adTrack={title:'Advertisement',artist:'Spotify',album:'',duration:30,source:'provider' as const,confidence:1,provider:'external' as const,isAd:true};
  await act(async()=>root.render(
    <TrackFinder
      track={adTrack}
      customEditOpen={true}
      onMetadataChange={vi.fn()}
      onLyricsFound={onLyricsFound}
      onStatusChange={onStatusChange}
    />
  ));
  expect(onLyricsFound).not.toHaveBeenCalled();
  expect(onStatusChange).toHaveBeenCalledWith(expect.stringContaining('Advertisement playing'));
});

it('shows External Player as Not available in web on browsers and enables Notification + Mic/Internal Audio on Android app',async()=>{
  const {default:AudioSourceHub}=await import('../audio/AudioSourceHub');
  const {setAndroidAppOverrideForTest}=await import('../audio/externalPlayer');
  setAndroidAppOverrideForTest(false);
  let selectedMode:string|null=null;
  const renderHub=(mode:'local'|'online'|'external'|null)=>(
    <AudioSourceHub
      open={true}
      onClose={vi.fn()}
      activeMode={mode}
      onSelectMode={m=>{selectedMode=m;}}
      onPickLocal={vi.fn()}
      onPlaySong={vi.fn()}
    />
  );
  await act(async()=>root.render(renderHub(null)));
  expect(host.textContent).toContain('Not available in web');
  const extCard=Array.from(host.querySelectorAll<HTMLButtonElement>('.source-option-card')).find(b=>b.textContent?.includes('External Player'))!;
  await act(async()=>extCard.click());
  expect(selectedMode).toBeNull();
  expect(host.textContent).toContain('External Player · Not available in web');

  setAndroidAppOverrideForTest(true);
  await act(async()=>root.render(renderHub(null)));
  const androidExtCard=Array.from(host.querySelectorAll<HTMLButtonElement>('.source-option-card')).find(b=>b.textContent?.includes('External Player'))!;
  await act(async()=>androidExtCard.click());
  expect(selectedMode).toBe('external');
  expect(host.textContent).toContain('Android Notification Listening');
  expect(host.textContent).toContain('Internal Audio');
  expect(host.textContent).toContain('Mic');
  setAndroidAppOverrideForTest(null);
});

it('keeps interactive YouTube below the transparent lyrics canvas',async()=>{
  const {setYouTubeInteractivePlayer}=await import('../music/youtubeAuth');
  await act(async()=>setYouTubeInteractivePlayer(true));
  try {
    await act(async()=>root.render(<CinematicStage {...base}/>));
    const video=host.querySelector<HTMLElement>('.youtube-stage-backdrop')!;
    const lyrics=host.querySelector<HTMLCanvasElement>('.cinematic-canvas')!;
    expect(Number(video.style.zIndex)).toBeLessThan(Number(lyrics.style.zIndex));
    expect(lyrics.style.pointerEvents).toBe('none');
    expect(lyrics.style.background).toBe('transparent');
  } finally { await act(async()=>setYouTubeInteractivePlayer(false)); }
});

it('ignores stale video clocks during a track change without treating them as ads',async()=>{
  const clock=vi.fn(),ended=vi.fn();
  await act(async()=>root.render(<CinematicStage {...base} hasSeparateAudioStream={false} onYoutubeTimeUpdate={clock} onYoutubeEnded={ended}/>));
  const frame=host.querySelector('iframe')!;
  const send=vi.spyOn(frame.contentWindow!,'postMessage');
  const deliver=(id:string,time:number)=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{currentTime:time,duration:200,videoData:{video_id:id}}})}));
  await act(async()=>deliver('abcdefghijk',10));
  send.mockClear();clock.mockClear();
  await act(async()=>deliver('oldVideo123',199));
  expect(clock).not.toHaveBeenCalled();
  expect(ended).not.toHaveBeenCalled();
  expect(send.mock.calls.map(args=>JSON.parse(String(args[0]))).some(c=>c.func==='setPlaybackRate'||(c.func==='seekTo'&&c.args[0]===200))).toBe(false);
  await act(async()=>deliver('abcdefghijk',11));
  expect(clock).toHaveBeenCalledWith(11,200);
});

it('plays a selected YouTube video without an audio resolver',async()=>{
  const {resolveSong}=await import('../music/providers');
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('resolver offline'));
  const song={id:'yt_abcdefghijk',title:'Original',artist:'Author',album:'',duration:200,provider:'resolver' as const,sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',youtubeVideoId:'abcdefghijk'};
  const playable=await resolveSong(song,'');
  expect(playable.format).toBe('youtube');
  expect(playable.youtubeVideoId).toBe('abcdefghijk');
  expect(fetcher).not.toHaveBeenCalled();
});

it('allows ordinary Google video streams regardless of ctier metadata',async()=>{
  const {evaluateBlockyUrl}=await import('../music/youtubeAdBlocker');
  expect(evaluateBlockyUrl('https://r1.googlevideo.com/videoplayback?ctier=L&id=music').blocked).toBe(false);
});

it('keeps permanent video, theme and lyric layers and waits for a playing frame before revealing video',async()=>{
  await act(async()=>root.render(<CinematicStage {...base} reducedMotion={false}/>));
  const frame=host.querySelector('iframe')!,theme=host.querySelector<HTMLElement>('.theme-layer')!,lyrics=host.querySelector<HTMLElement>('[data-layer="lyrics"]')!;
  expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('themes');
  expect(Number(host.querySelector<HTMLElement>('[data-layer="video"]')!.style.zIndex)).toBeLessThan(Number(theme.style.zIndex));
  expect(Number(theme.style.zIndex)).toBeLessThan(Number(lyrics.style.zIndex));
  expect(theme.style.opacity).toBe('1');
  await act(async()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'onStateChange',info:1})})));
  expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('video');
  expect(theme.style.opacity).toBe('0');
  expect(theme.style.transition).toContain('440ms');
  await act(async()=>root.render(<CinematicStage {...base} reducedMotion={false} videoSearchPending/>));
  expect(host.querySelector('.theme-layer')).toBe(theme);
  expect(theme.style.opacity).toBe('1');
  expect(lyrics.style.background).toBe('transparent');
});

it('keeps primary YouTube audio running under themes and remounts muted before switching to separate audio',async()=>{
  await act(async()=>root.render(<CinematicStage {...base} hasSeparateAudioStream={false}/>));
  const primary=host.querySelector('iframe')!;
  expect(primary.src).toContain('autoplay=0');
  const send=vi.spyOn(primary.contentWindow!,'postMessage');
  await act(async()=>root.render(<CinematicStage {...base} hasSeparateAudioStream={false} youtubeBackgroundMode="theme"/>));
  expect(host.querySelector('iframe')).toBe(primary);
  const commands=send.mock.calls.map(args=>JSON.parse(String(args[0])));
  expect(commands.some(c=>c.func==='pauseVideo')).toBe(false);
  expect(commands.some(c=>c.func==='playVideo')).toBe(true);
  await act(async()=>root.render(<CinematicStage {...base} hasSeparateAudioStream/>));
  const background=host.querySelector('iframe')!;
  expect(background).not.toBe(primary);
  expect(background.src).toContain('mute=1');
  const backgroundSend=vi.spyOn(background.contentWindow!,'postMessage');
  await act(async()=>background.dispatchEvent(new Event('load')));
  const mutedCommands=backgroundSend.mock.calls.map(args=>JSON.parse(String(args[0]))).filter(c=>c.event==='command');
  expect(mutedCommands.findIndex(c=>c.func==='mute')).toBeLessThan(mutedCommands.findIndex(c=>c.func==='playVideo'));
  expect(mutedCommands.some(c=>c.func==='setVolume'&&c.args[0]===0)).toBe(true);
  expect(mutedCommands.some(c=>c.func==='unMute')).toBe(false);
});

it('removes the old iframe immediately when the song or video changes, including while searching',async()=>{
 await act(async()=>root.render(<CinematicStage {...base} recordingKey="first"/>));
 const original=host.querySelector('iframe');
 await act(async()=>root.render(<CinematicStage {...base} recordingKey="second" youtubeVideoId={null} videoSearchPending/>));
 expect(host.querySelector('iframe')).toBeNull();
 expect(host.querySelector('.theme-layer')?.getAttribute('aria-hidden')).toBe('false');
 await act(async()=>root.render(<CinematicStage {...base} recordingKey="second" youtubeVideoId="nextVideo12"/>));
 expect(host.querySelector('iframe')).not.toBe(original);
 expect(host.querySelector('iframe')?.src).toContain('nextVideo12');
});

it('shows previously loaded video candidates immediately and only searches again on request',async()=>{
 const providers=await import('../music/providers');
 const search=vi.spyOn(providers,'searchStashCatalog').mockResolvedValue([]);
 const {default:Picker}=await import('../music/YouTubeBackgroundPicker');
 const videos=Array.from({length:15},(_,i)=>({id:'yt_'+String(i).padStart(11,'0'),title:'Song Official Music Video',artist:'Artist',album:'',duration:200,provider:'resolver' as const,youtubeVideoId:String(i).padStart(11,'0'),sourceUrl:'https://www.youtube.com/watch?v='+String(i).padStart(11,'0')}));
 await act(async()=>root.render(<Picker track={{title:'Song',artist:'Artist',album:'',duration:200,source:'provider',confidence:1}} activeVideoId="abcdefghijk" preference="music" onPreferenceChange={()=>{}} onChoose={()=>{}} cachedCandidates={videos} cachedCandidateCount={35}/>));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Change YouTube background')!.click());
 expect(host.querySelectorAll('.video-candidate')).toHaveLength(15);
 expect(search).not.toHaveBeenCalled();
 const input=host.querySelector<HTMLInputElement>('input[aria-label="Custom YouTube video search"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'A different video query');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(search).toHaveBeenCalledWith('A different video query','resolver','',expect.any(AbortSignal));
});

it('rejects Topic channel videos at runtime before revealing them as a separate-audio background',async()=>{
 const onReject=vi.fn();
 await act(async()=>root.render(<CinematicStage {...base} hasSeparateAudioStream={true} onRejectBackgroundVideo={onReject}/>));
 const frame=host.querySelector('iframe')!;
 const send=vi.spyOn(frame.contentWindow!,'postMessage');
 await act(async()=>{
  window.dispatchEvent(new MessageEvent('message',{
   source:frame.contentWindow,
   data:JSON.stringify({
    event:'infoDelivery',
    info:{
     currentTime:5,
     duration:174,
     playerState:1,
     videoData:{video_id:'abcdefghijk',author:'Hanumankind - Topic',title:'Run It Up'}
    }
   })
  }));
 });
 expect(onReject).toHaveBeenCalledWith('abcdefghijk');
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('themes');
 expect(send.mock.calls.map(args=>JSON.parse(String(args[0]))).some(c=>c.func==='pauseVideo')).toBe(true);
});

it('switches to built-in themes when a YouTube background video starts late or ends early while audio continues',async()=>{
 await act(async()=>root.render(<CinematicStage {...base} playbackTime={10} videoDelaySeconds={0}/>));
 const frame=host.querySelector('iframe')!;
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'onStateChange',info:1})})));
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('video');

 // Video starts late (audio at 2s, video delay +6s): must switch back to built-in themes until playbackTime >= 6s
 await act(async()=>root.render(<CinematicStage {...base} playbackTime={2} videoDelaySeconds={6}/>));
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('themes');

 // Audio reaches 7s (>= 6s delay): switches back to YouTube video
 await act(async()=>root.render(<CinematicStage {...base} playbackTime={7} videoDelaySeconds={6}/>));
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('video');

 // Video ends early (e.g. 2:50 video clip on a 4:59 song): switches to built-in themes while audio keeps playing
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{currentTime:169.8,duration:170,playerState:0}})})));
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('themes');

 // Seeking backward in the song before the video's end restores the video background
 await act(async()=>root.render(<CinematicStage {...base} playbackTime={60} videoDelaySeconds={0}/>));
 expect(host.querySelector('.cinematic-stack')?.getAttribute('data-background-state')).toBe('video');
});

