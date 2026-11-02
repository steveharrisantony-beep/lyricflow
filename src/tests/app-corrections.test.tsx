// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../visualization/cinematic/CinematicStage', () => ({ default: () => null, CAMERA_VIEWS: ['Front'] }));
vi.mock('../audio/LocalPlayer', () => ({ default: (props: { onTrackChange: (track: unknown) => void; onFileChange: (loaded: boolean) => void; onOpenSourceSelector: () => void }) => <div>
  <button onClick={() => { props.onTrackChange({ title: 'Original test song', artist: 'Test artist', album: 'Studio', duration: 200, provider: 'local', source: 'manual', confidence: 1 }); props.onFileChange(true); }}>Load fixture audio</button>
  <button onClick={() => { props.onTrackChange({ title: 'Original test song', artist: 'Test artist', album: 'Studio', duration: 200, provider: 'jiosaavn', sourceTrackId: 'saavn_123', source: 'provider', audioSource: 'JioSaavn', confidence: 1 }); props.onFileChange(true); }}>Load JioSaavn fixture</button>
  <button onClick={() => { props.onTrackChange({ title: 'Next test song', artist: 'Test artist', album: 'Studio', duration: 200, provider: 'jiosaavn', sourceTrackId: 'saavn_next', source: 'provider', confidence: 1 }); props.onFileChange(true); }}>Load next JioSaavn fixture</button>
  <button onClick={props.onOpenSourceSelector}>Select source</button>
</div> }));
vi.mock('../music/providers', async importOriginal => ({
  ...await importOriginal<typeof import('../music/providers')>(),
  searchStashCatalog: vi.fn().mockImplementation(async query=>[{id:'yt_abcdefghijk',title:'Original test song '+(query.includes('lyric')?'Official Lyrics Video':'Official Music Video'),artist:'Test artist',album:'Studio',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',youtubeVideoId:'abcdefghijk'}]),
}));
vi.mock('../metadata/TrackFinder', () => ({ default: () => null }));
import App from '../App';
import { searchStashCatalog } from '../music/providers';
let root: Root, host: HTMLDivElement;
function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text);
  if (!button) throw Error('Missing button: ' + text);
  button.click();
}
beforeEach(async () => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('keeps guest mode available without Firebase configuration', async () => {
  await act(async () => click('Sign in / sync'));
  expect(host.textContent).toContain('Cloud sync is not configured yet');
});
it('stores manual-lyrics delay on device and restores it after remount', async () => {
  await act(async () => click('Load fixture audio'));
  // Exercise the actual manual editor and its lyrics-revision callback.
  await act(async () => {
    const toggle = [...host.querySelectorAll('button')].find(b => /Custom Edit|Edit.*lyrics|Change Lyrics/i.test(b.textContent || ''));
    toggle?.click();
  });
  const area = host.querySelector<HTMLTextAreaElement>('textarea');
  expect(area).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, '[00:01]Original test words\n[00:03]Another original phrase');
    area!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.25s"]')!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.25s"]')!.click());
  expect(host.querySelector<HTMLInputElement>('[aria-label="Lyrics delay seconds"]')?.value).toBe('0.5');
  expect(host.textContent).toContain('Lyrics timing: personal');
  expect(localStorage.getItem('lyricflow.v3.guest.corrections')).toContain('"delaySeconds":0.5');
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await act(async () => click('Load fixture audio'));
  // The same lyrics revision finds the same correction; a new revision must not.
  await act(async () => click('Edit or import lyrics'));
  const area2 = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area2, '[00:01]Original test words\n[00:03]Another original phrase');
    area2.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Lyrics delay seconds"]')?.value).toBe('0.5');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area2, '[00:02]A different lyrics revision');
    area2.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Lyrics delay seconds"]')?.value).toBe('0');
});

it('stages an account edit before the first cloud snapshot or debounce, without touching guest settings', async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  const user = {uid:'accountA',email:'a@example.com',emailVerified:true,providerData:[]} as never;
  await act(async () => root.render(<App user={user} />));
  const slider = [...host.querySelectorAll('label')].find(label => label.textContent?.includes('Visual intensity'))?.querySelector<HTMLInputElement>('input')!;
  expect(slider).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '80');
    slider.dispatchEvent(new Event('input', {bubbles:true}));
  });
  const pending = JSON.parse(localStorage.getItem('lyricflow.v3.user:accountA.preferencesPending') || 'null');
  expect(pending?.intensity).toBe(80);
  expect(JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!).intensity).toBe(65);
});

it('finds a music or lyrical YouTube background for JioSaavn and saves both source mappings without changing audio', async () => {
  await act(async () => click('Load JioSaavn fixture'));
  await act(async () => click('Find video'));
  expect(searchStashCatalog).toHaveBeenCalledWith('Original test song Test artist music video', 'resolver', '', expect.any(AbortSignal));
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Preferred YouTube background"]')!;
  await act(async () => { select.value = 'lyrics'; select.dispatchEvent(new Event('change',{bubbles:true})); });
  await act(async () => click('Find video'));
  expect(searchStashCatalog).toHaveBeenCalledWith('Original test song Test artist lyrics video', 'resolver', '', expect.any(AbortSignal));
  await act(async () => click('Use video'));
  expect(localStorage.getItem('lyricflow.lastSourceMode')).toBe('online');
  await act(async () => click('Edit or import lyrics'));
  const area = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'[00:01]Original test words');
    area.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.25s"]')!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.25s"]')!.click());
  const maps = Object.values(JSON.parse(localStorage.getItem('lyricflow.v3.guest.songMappings') || '{}')) as {identity:{title:string;artist:string;duration:number};lyrics:{sourceFile:{revision:string};delaySeconds:number};video:{youtubeVideoId:string;delaySeconds:number}}[];
  expect(maps).toHaveLength(1);
  expect(maps[0]).toMatchObject({identity:{title:'original test song',artist:'test artist',duration:200},lyrics:{delaySeconds:.5},video:{youtubeVideoId:'abcdefghijk',delaySeconds:null}});
  expect(maps[0].lyrics.sourceFile.revision).toMatch(/^l3_/);
  expect(JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!).display.preferredVideoType).toBe('lyrics');
});

it('switches external advertisements to themes, aborts video search and unmounts lyric lookup',async()=>{
  const external=await import('../audio/externalPlayer');
  const finder=await import('../metadata/TrackFinder');
  const stage=await import('../visualization/cinematic/CinematicStage');
  let deliver:Parameters<typeof external.subscribeExternalMedia>[0]|undefined;
  const subscribe=vi.spyOn(external,'subscribeExternalMedia').mockImplementation(async callback=>{deliver=callback;return()=>{};});
  const capture=vi.spyOn(external,'startExternalAudioCapture').mockResolvedValue({ok:true,activeMode:'internal',message:'Fixture capture'});
  const stop=vi.spyOn(external,'stopExternalAudioCapture').mockResolvedValue();
  const find=vi.spyOn(finder,'default').mockImplementation(()=> <span data-testid="lyrics-lookup"/>);
  const draw=vi.spyOn(stage,'default').mockImplementation(props=><span data-testid="stage-ad" data-ad={String(props.advertisementPlaying)} data-external={String(props.externalPlayer)} data-video={props.youtubeVideoId||''} data-mode={props.youtubeBackgroundMode}/>);
  external.setAndroidAppOverrideForTest(true);
  try{
    await act(async()=>click('Select source'));
    await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.source-option-card')].find(b=>b.textContent?.includes('External player'))!.click());
    const media={title:'Original fixture song',artist:'Fixture Artist',album:'',duration:200,position:1,playing:true,packageName:'fixture.player',appName:'Fixture Player',updatedAt:Date.now()};
    await act(async()=>deliver!(media,true));
    expect(host.querySelector('[data-testid="lyrics-lookup"]')).not.toBeNull();
    const calls=vi.mocked(searchStashCatalog).mock.calls;
    const searchSignal=calls.at(-1)?.[3];
    const count=calls.length;
    await act(async()=>deliver!({...media,title:'Advertisement',isAd:true},true));
    expect(host.querySelector('[data-testid="lyrics-lookup"]')).toBeNull();
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-ad')).toBe('true');
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-video')).toBe('');
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-mode')).toBe('theme');
    expect(vi.mocked(searchStashCatalog).mock.calls.length).toBe(count);
    expect(searchSignal?.aborted).toBe(true);
    await act(async()=>click('Load JioSaavn fixture'));
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-ad')).toBe('false');
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-external')).toBe('false');
    await act(async()=>deliver!({...media,title:'Advertisement',isAd:true},true));
    expect(host.querySelector('[data-testid="stage-ad"]')?.getAttribute('data-ad')).toBe('false');
  }finally{external.setAndroidAppOverrideForTest(null);subscribe.mockRestore();capture.mockRestore();stop.mockRestore();find.mockRestore();draw.mockRestore();}
});

it('clears the previous background while the next recording search is pending',async()=>{
 const stage=await import('../visualization/cinematic/CinematicStage');
 const draw=vi.spyOn(stage,'default').mockImplementation(props=><span data-testid="video-recording" data-video={props.youtubeVideoId||''} data-searching={String(props.videoSearchPending)}/>);
 const search=vi.mocked(searchStashCatalog),original=search.getMockImplementation()!;
 search.mockImplementation((query,...args)=>query.startsWith('Next test song')?new Promise(()=>{}):original(query,...args));
 try{
  await act(async()=>click('Load JioSaavn fixture'));
  expect(host.querySelector('[data-testid="video-recording"]')?.getAttribute('data-video')).toBe('abcdefghijk');
  await act(async()=>click('Load next JioSaavn fixture'));
  expect(host.querySelector('[data-testid="video-recording"]')?.getAttribute('data-video')).toBe('');
  expect(host.querySelector('[data-testid="video-recording"]')?.getAttribute('data-searching')).toBe('true');
 }finally{draw.mockRestore();search.mockImplementation(original);}
});

it('restores LyricFlow lookup for old automatically pinned LRCLIB mappings',async()=>{
 const {correctionContext}=await import('../firebase/correctionModel');
 const track={title:'Original test song',artist:'Test artist',album:'Studio',duration:200,provider:'jiosaavn' as const,source:'provider' as const,confidence:1};
 const context=correctionContext(track,'lyrics')!;
 localStorage.setItem('lyricflow.v3.guest.songMappings',JSON.stringify({[context.recordingKey]:{identity:context.identity,lyrics:{sourceFile:{name:'LyricFlow Engine · LRC Library',url:'https://lrclib.net/api/get/42',revision:'l3_0123456789abcdef'},selection:{engine:'lrclib',lrclibId:42,subtitleTrackId:null},delaySeconds:0}}}));
 const finder=await import('../metadata/TrackFinder');
 const render=vi.spyOn(finder,'default').mockImplementation(props=><span data-testid="legacy-engine" data-engine={props.lyricEngineOption} data-pin={props.preferredSelection?.lrclibId||''}/>);
 try{
  await act(async()=>click('Load JioSaavn fixture'));
  expect(host.querySelector('[data-testid="legacy-engine"]')?.getAttribute('data-engine')).toBe('lyricflow');
  expect(host.querySelector('[data-testid="legacy-engine"]')?.getAttribute('data-pin')).toBe('');
 }finally{render.mockRestore();}
});

it('lets a personal automatic video-sync choice override a published fixed delay',async()=>{
 const {correctionContext}=await import('../firebase/correctionModel');
 const song={title:'Original test song',artist:'Test artist',album:'Studio',duration:200,provider:'jiosaavn' as const,source:'provider' as const,confidence:1};
 const context=correctionContext(song,'video')!;
 localStorage.setItem('lyricflow.v4.publishedSongMappings',JSON.stringify({[context.recordingKey]:{identity:context.identity,video:{youtubeVideoId:'abcdefghijk',delaySeconds:5}}}));
 const stage=await import('../visualization/cinematic/CinematicStage');
 const draw=vi.spyOn(stage,'default').mockImplementation(props=><span data-testid="automatic-video-delay" data-delay={props.videoDelaySeconds}/>);
 try{
  await act(async()=>click('Load JioSaavn fixture'));
  expect(host.querySelector('[data-testid="automatic-video-delay"]')?.getAttribute('data-delay')).toBe('5');
  await act(async()=>click('Use automatic video sync'));
  expect(host.querySelector('[data-testid="automatic-video-delay"]')?.getAttribute('data-delay')).toBe('0');
  expect(host.textContent).toContain('Automatic video sync active');
 }finally{draw.mockRestore();}
});

it('uses independent selection windows, removes the old dropdowns, and restores disabled options',async()=>{
  const switchFor=(text:string)=>[...host.querySelectorAll<HTMLLabelElement>('label')].find(label=>label.textContent===text)?.querySelector<HTMLInputElement>('input')!;
  const animation=switchFor('Lyric animations'),styles=switchFor('Current word styles');
  expect(animation.checked).toBe(true);expect(styles.checked).toBe(true);
  for(const name of ['Theme selection','Theme colour palette','Video lyric placement','Theme lyric placement','Lyric font','Lyric animation','Current word style']){
    expect(host.querySelector(`select[aria-label="${name}"]`)).toBeNull();
  }
  const option=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(option('Ship').checked).toBe(true);expect(option('Classic Focus').checked).toBe(true);
  await act(async()=>option('Ship').click());await act(async()=>option('Classic Focus').click());
  expect(option('Ship').checked).toBe(false);expect(option('Classic Focus').checked).toBe(false);
  await act(async()=>animation.click());expect(styles.checked).toBe(true);
  await act(async()=>styles.click());
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
  expect(switchFor('Lyric animations').checked).toBe(false);expect(switchFor('Current word styles').checked).toBe(false);
  expect(option('Ship').checked).toBe(false);expect(option('Classic Focus').checked).toBe(false);
});

it('allows every animation and word style to be disabled and persists empty selection windows',async()=>{
  for(const summary of ['Animations','Current word styles']){
    const details=[...host.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent?.startsWith(summary))!;
    const inputs=[...details.querySelectorAll<HTMLInputElement>('input[role="switch"]')];
    expect(inputs).toHaveLength(summary==='Animations'?12:8);
    await act(async()=>{for(const input of inputs)input.click();});
    expect(inputs.every(input=>!input.checked)).toBe(true);
  }
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
  const saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
  expect(saved.enabledKineticMotions).toEqual([]);expect(saved.enabledWordStyles).toEqual([]);
});

it('previews a disabled option without changing its toggle or saved preferences',async()=>{
  const input=host.querySelector<HTMLInputElement>('input[aria-label="Ship"]')!;
  await act(async()=>input.click());const saved=localStorage.getItem('lyricflow.extendedSettings.v1');
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  try{
    await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Preview Ship"]')!.click());
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(input.checked).toBe(false);expect(localStorage.getItem('lyricflow.extendedSettings.v1')).toBe(saved);
    await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')!.click());
    expect(document.querySelector('.option-preview-dialog')).toBeNull();
  }finally{context.mockRestore();}
});


it('stores independently disabled theme and lyric transitions, including an empty window',async()=>{
 for(const name of ['Theme transitions','Lyric transitions']){
  const window=[...host.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent?.startsWith(name))!;
  const inputs=[...window.querySelectorAll<HTMLInputElement>('input[role="switch"]')];
  expect(inputs).toHaveLength(name==='Theme transitions'?7:6);
  await act(async()=>{for(const input of inputs)input.click();});
 }
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 const saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
 expect(saved.enabledThemeTransitions).toEqual([]);expect(saved.enabledLyricTransitions).toEqual([]);
});
