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
  searchStashCatalog: vi.fn().mockImplementation(async query=>[{id:'yt_abcdefghijk',title:'Original test song '+(query.includes('lyric')?'Official Lyrics Video':'Official Music Video'),artist:'Test artist',viewCount:5432100,album:'Studio',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',youtubeVideoId:'abcdefghijk'}]),
}));
vi.mock('../metadata/TrackFinder', () => ({ default: (props:{onLyricsFound:(value:Omit<import('../lyrics/ManualLyrics').IncomingLyrics,'token'>)=>void;onStatusChange?:(message:string)=>void}) => <>
 <button onClick={()=>props.onStatusChange?.('Searching synced lyrics…')}>Fixture lyrics loading</button>
 <button onClick={()=>props.onStatusChange?.('No automatic lyrics found.')}>Fixture lyrics missing</button>
 <button onClick={()=>props.onLyricsFound({original:'[00:01]Original fixture lyrics',romanized:'',source:'LRCLIB · Synced',title:'Matched lyrics title',artist:'Matched artist'})}>Fixture lyrics ready</button>
</> }));
import App from '../App';
import {LYRIC_MOTIONS,ORIGINAL_LYRIC_MOTIONS,VOXELVERSE_STYLES} from '../visualization/cinematic/kineticTypography';
import { searchStashCatalog } from '../music/providers';
import {createBackup} from '../data/backupData';
let root: Root, host: HTMLDivElement;
function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text);
  if (!button) throw Error('Missing button: ' + text);
  button.click();
}

it('offers separate data transfers in Others and applies imported settings immediately',async()=>{
 await act(async()=>click('Others'));
 for(const name of ['Export settings','Import settings','Export song mapping data','Import song mapping data']){
  expect(host.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
 }
 const input=host.querySelector<HTMLInputElement>('input[aria-label="Settings backup file"]')!;
 const upload=async(content:string)=>{
  const file=new File([],'backup.json',{type:'application/json'});
  Object.defineProperty(file,'text',{value:async()=>content});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 };
 const before=localStorage.getItem('lyricflow.extendedSettings.v1');
 await upload(JSON.stringify(createBackup('song-mappings',null)));
 expect(host.textContent).toContain('Choose a settings backup');
 expect(localStorage.getItem('lyricflow.extendedSettings.v1')).toBe(before);
 const backup=createBackup('settings',null);
 if(backup.kind!=='settings')throw Error('Wrong fixture');
 backup.data.preferences.intensity=37;
 backup.data.extended.themeMode='light';
 backup.data.extended.enabledWordStyles=[];backup.data.extended.enabledWordAnimations=[];
 backup.data.extended.themeDurationSeconds=11;
 await upload(JSON.stringify(backup));
 expect(host.textContent).toContain('Settings imported.');
 expect(host.querySelector<HTMLInputElement>('input[aria-label="Visual intensity"]')?.value).toBe('37');
 expect(document.documentElement.dataset.theme).toBe('light');
 expect(JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!)).toMatchObject({themeMode:'light',enabledWordStyles:[],enabledWordAnimations:[],themeDurationSeconds:11});
});

it('saves visibility in the respective song mapping sections and restores it per recording',async()=>{
 const stage=await import('../visualization/cinematic/CinematicStage');
 const probe=vi.spyOn(stage,'default').mockImplementation(props=><div data-testid="visibility-stage"
  data-hide-lyrics={String(Boolean(props.hideStageLyrics))} data-hide-video={String(Boolean(props.hideVideo))} data-mode={props.youtubeBackgroundMode}/>);
 const flag=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
 const output=()=>host.querySelector('[data-testid="visibility-stage"]')!;
 try{
  expect(flag('Hide lyrics for this song').disabled).toBe(true);
  await act(async()=>click('Load JioSaavn fixture'));
  expect(flag('Hide lyrics for this song').closest('.lyrics-mapping-section')).not.toBeNull();
  expect(flag('Hide video for this song').closest('.video-mapping-section')).not.toBeNull();
  await act(async()=>{flag('Hide lyrics for this song').click();flag('Hide video for this song').click();});
  expect(output().getAttribute('data-hide-lyrics')).toBe('true');
  expect(output().getAttribute('data-hide-video')).toBe('true');
  expect(output().getAttribute('data-mode')).toBe('theme');
  expect(localStorage.getItem('lyricflow.v3.guest.songMappings')).toContain('"hideLyrics":true');
  await act(async()=>click('Load next JioSaavn fixture'));
  expect(flag('Hide lyrics for this song').checked).toBe(false);
  expect(flag('Hide video for this song').checked).toBe(false);
  expect(output().getAttribute('data-hide-lyrics')).toBe('false');
  expect(output().getAttribute('data-hide-video')).toBe('false');
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
  await act(async()=>click('Load JioSaavn fixture'));
  expect(flag('Hide lyrics for this song').checked).toBe(true);
  expect(flag('Hide video for this song').checked).toBe(true);
  await act(async()=>{flag('Hide lyrics for this song').click();flag('Hide video for this song').click();});
  const mappings=JSON.parse(localStorage.getItem('lyricflow.v3.guest.songMappings')!);
  expect(Object.values(mappings)).toContainEqual(expect.objectContaining({hideLyrics:false,hideVideo:false}));
 }finally{probe.mockRestore();}
});
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
  // Lyrics mapping disclosure is collapsed by default and opens when clicked.
  const lyricsMappingDetails = host.querySelector<HTMLDetailsElement>('details.lyrics-mapping-section')!;
  expect(lyricsMappingDetails).not.toBeNull();
  expect(lyricsMappingDetails.open).toBe(false);
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
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.5s"]')!.click());
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

it('calibrates lyric delay via Text seen and Voice heard buttons in either order and treats empty delay input as 0', async () => {
  await act(async () => click('Load fixture audio'));
  await act(async () => click('Edit or import lyrics'));
  const area = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, '[00:01]Original test words');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  let nowMs = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  await act(async () => click('Text seen'));
  nowMs = 2250;
  await act(async () => click('Voice heard'));
  const delayInput = host.querySelector<HTMLInputElement>('[aria-label="Lyrics delay seconds"]')!;
  expect(delayInput.value).toBe('1.25');

  // Reverse order: Voice heard first, then Text seen 0.75s later -> 1.25 - 0.75 = 0.5
  nowMs = 4000;
  await act(async () => click('Voice heard'));
  nowMs = 4750;
  await act(async () => click('Text seen'));
  expect(delayInput.value).toBe('0.5');

  // Clearing input box means 0
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(delayInput, '');
    delayInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(localStorage.getItem('lyricflow.v3.guest.corrections')).toContain('"delaySeconds":0');
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
  expect(JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!).intensity).toBe(100);
});

it('finds a music or lyrical YouTube background for JioSaavn and saves both source mappings without changing audio', async () => {
  await act(async () => click('Load JioSaavn fixture'));
  await act(async () => click('Show preloaded videos'));
  expect(searchStashCatalog).toHaveBeenCalledWith('Original test song Test artist music video', 'resolver', '', expect.any(AbortSignal));
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Preferred YouTube background"]')!;
  await act(async () => { select.value = 'lyrics'; select.dispatchEvent(new Event('change',{bubbles:true})); });
  await act(async () => click('Show preloaded videos'));
  expect(searchStashCatalog).toHaveBeenCalledWith('Original test song Test artist lyrics video', 'resolver', '', expect.any(AbortSignal));
  await act(async () => click('Use video'));
  expect(localStorage.getItem('lyricflow.lastSourceMode')).toBe('online');
  await act(async () => click('Edit or import lyrics'));
  const area = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'[00:01]Original test words');
    area.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase lyric delay 0.5s"]')!.click());
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
    expect(capture).not.toHaveBeenCalled();
    const media={title:'Original fixture song',artist:'Fixture Artist',album:'',duration:200,position:1,playing:true,packageName:'fixture.player',appName:'Fixture Player',updatedAt:Date.now()};
    await act(async()=>deliver!(media,true));
    expect(capture).not.toHaveBeenCalled();
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
    expect(inputs).toHaveLength(summary==='Animations'?25:4);
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


it('removes lyric transition choices and persists independent word animation switches',async()=>{
 expect(host.textContent).not.toContain('Lyric transitions');
 const wordWindow=[...host.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent?.startsWith('Current word animations'))!;
 const wordOptions=[...wordWindow.querySelectorAll<HTMLInputElement>('input[role="switch"]')];
 expect(wordOptions.map(input=>input.getAttribute('aria-label'))).toEqual(['Word animation · Lift','Word animation · Zoom']);
 const themeWindow=[...host.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent?.startsWith('Theme transitions'))!;
 const themes=[...themeWindow.querySelectorAll<HTMLInputElement>('input[role="switch"]')];expect(themes).toHaveLength(7);
 await act(async()=>{for(const input of [...wordOptions,...themes])input.click();});
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 const saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
 expect(saved.enabledThemeTransitions).toEqual([]);expect(saved.enabledLyricTransitions).toBeUndefined();
 expect(saved.enabledWordAnimations).toEqual([]);expect(saved.wordStylesEnabled).toBe(true);
});

it('positions Save for current song above Lyrics mapping, shows exact fetched lyrics title, and does not restart song on manual search',async()=>{
  const finder=await import('../metadata/TrackFinder');
  const stage=await import('../visualization/cinematic/CinematicStage');
  let capturedFinderProps:Parameters<typeof finder.default>[0]|null=null;
  const renderFinder=vi.spyOn(finder,'default').mockImplementation(props=>{
    capturedFinderProps=props;
    return <span data-testid="finder-probe"/>;
  });
  const renderStage=vi.spyOn(stage,'default').mockImplementation(props=>{
    return <span data-testid="stage-probe" data-recording-key={props.recordingKey||''}/>;
  });
  try{
    await act(async()=>click('Load JioSaavn fixture'));
    const saveBtn=host.querySelector<HTMLButtonElement>('button.save-song-button')!;
    const lyricsDetails=host.querySelector<HTMLDetailsElement>('details.lyrics-mapping-section')!;
    expect(saveBtn).not.toBeNull();
    expect(lyricsDetails).not.toBeNull();
    expect(Boolean(saveBtn.compareDocumentPosition(lyricsDetails)&Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    // Emit fetched lyrics with an exact record title different from the raw track title
    await act(async()=>{
      capturedFinderProps?.onLyricsFound({
        original:'[00:05.00]Exact fetched line',
        romanized:'[00:05.00]Exact fetched line',
        source:'LRC Library (LRCLIB)',
        sourceUrl:'https://lrclib.net/api/get/999',
        title:'21 (Fetched Record Title)',
        artist:'Gracie Abrams',
      });
    });
    const currentSongCards=[...host.querySelectorAll('.current-song')];
    expect(currentSongCards[0]?.textContent).toContain('21 (Fetched Record Title)');

    // Triggering onMetadataChange from manual search must not mutate localTrack or recordingKey
    const initialRecordingKey=host.querySelector('[data-testid="stage-probe"]')?.getAttribute('data-recording-key');
    await act(async()=>{
      capturedFinderProps?.onMetadataChange({
        title:'Manual Search Query Title',
        artist:'Manual Artist',
        album:'',
        duration:200,
        source:'manual',
        confidence:1,
      });
    });
    const afterSearchRecordingKey=host.querySelector('[data-testid="stage-probe"]')?.getAttribute('data-recording-key');
    expect(afterSearchRecordingKey).toBe(initialRecordingKey);

    // Clicking Save for current song saves both lyrics and video preferences
    await act(async()=>saveBtn.click());
    const maps=Object.values(JSON.parse(localStorage.getItem('lyricflow.v3.guest.songMappings')||'{}')) as {lyrics?:unknown;video?:{youtubeVideoId:string}}[];
    expect(maps).toHaveLength(1);
    expect(maps[0].lyrics).toBeTruthy();
    expect(maps[0].video?.youtubeVideoId).toBe('abcdefghijk');
  }finally{
    renderFinder.mockRestore();
    renderStage.mockRestore();
  }
});


it('enables the expanded catalog for an old all-enabled install, then preserves a chosen original-only pool',async()=>{
 await act(async()=>root.unmount());
 localStorage.setItem('lyricflow.extendedSettings.v1',JSON.stringify({enabledKineticMotions:[...ORIGINAL_LYRIC_MOTIONS]}));
 root=createRoot(host);await act(async()=>root.render(<App/>));
 let saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
 expect(saved.enabledKineticMotions).toEqual([...LYRIC_MOTIONS]);expect(saved.motionCatalogVersion).toBe(2);
 for(const motion of VOXELVERSE_STYLES.filter(style=>!ORIGINAL_LYRIC_MOTIONS.includes(style.id as typeof ORIGINAL_LYRIC_MOTIONS[number]))){
  const option=host.querySelector<HTMLInputElement>(`input[aria-label="${motion.name}"]`)!;
  expect(option.checked,motion.name).toBe(true);await act(async()=>option.click());
 }
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
 expect(saved.enabledKineticMotions).toEqual([...ORIGINAL_LYRIC_MOTIONS]);
 expect(saved.motionCatalogVersion).toBe(2);
});

it('adjusts font-size limits independently of the overall slider and restores them after reload',async()=>{
 const input=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
 const set=async(label:string,value:number)=>act(async()=>{
  const control=input(label);expect(control).not.toBeNull();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(control,String(value));
  control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await set('Minimum lyric font size',60);
 expect(input('Minimum lyric font size').value).toBe('60');expect(input('Lyrics font size scale').value).toBe('100');
 await set('Maximum lyric font size',40);
 expect(input('Maximum lyric font size').value).toBe('40');expect(input('Minimum lyric font size').value).toBe('40');
 await set('Lyrics font size scale',150);
 expect(input('Maximum lyric font size').value).toBe('40');expect(input('Minimum lyric font size').value).toBe('40');
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 expect(input('Lyrics font size scale').value).toBe('150');expect(input('Maximum lyric font size').value).toBe('40');expect(input('Minimum lyric font size').value).toBe('40');
});

it('saves independent lyric padding and placement-box controls without changing font limits',async()=>{
 const controls={'Horizontal lyrics padding':7,'Vertical lyrics padding':0,'Maximum lyrics width':45,'Maximum lyrics height':25};
 const input=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
 for(const [label,value] of Object.entries(controls))await act(async()=>{
  const control=input(label);expect(control).not.toBeNull();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(control,String(value));
  control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));
 });
 const saved=JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!);
 expect(saved.lyricLayout).toEqual({horizontalPadding:7,verticalPadding:0,maxWidth:45,maxHeight:25});
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 for(const [label,value] of Object.entries(controls))expect(input(label).value).toBe(String(value));
 expect(input('Minimum lyric font size').value).toBe('30');expect(input('Maximum lyric font size').value).toBe('100');
});

it('requests External Player audio only after Start and stops it when notification access is revoked',async()=>{
 const external=await import('../audio/externalPlayer');
 let granted=true;
 const status=vi.spyOn(external,'getExternalSetupStatus').mockImplementation(async()=>({granted,androidSdk:35}));
 const subscribe=vi.spyOn(external,'subscribeExternalMedia').mockImplementation(async callback=>{callback(null,true);return()=>{};});
 const capture=vi.spyOn(external,'startExternalAudioCapture').mockResolvedValue({ok:true,activeMode:'mic',message:'Fixture capture active'});
 const stop=vi.spyOn(external,'stopExternalAudioCapture').mockResolvedValue();
 external.setAndroidAppOverrideForTest(true);
 try{
  await act(async()=>click('Select source'));
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.source-option-card')].find(b=>b.textContent?.includes('External player'))!.click());
  expect(capture).not.toHaveBeenCalled();
  await act(async()=>click('Microphone'));expect(capture).not.toHaveBeenCalled();
  await act(async()=>click('Start microphone'));expect(capture).toHaveBeenCalledExactlyOnceWith('mic');
  expect(host.textContent).toContain('Fixture capture active');
  const stopCount=stop.mock.calls.length;granted=false;
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(stop.mock.calls.length).toBeGreaterThan(stopCount);
  expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Stop audio capture')).toBe(false);
 }finally{external.setAndroidAppOverrideForTest(null);status.mockRestore();subscribe.mockRestore();capture.mockRestore();stop.mockRestore();}
});

it('supports multiple palette switches without randomization controls and restores the set after remount',async()=>{
 expect(host.textContent).not.toContain('Randomize enabled themes');
 expect(host.textContent).not.toContain('Auto-randomize colour palette');
 const palette=(name:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="Color Riot · ${name}"]`)!;
 expect(palette('Peach Sorbet').checked).toBe(true);
 expect(palette('Lavender Milk').type).toBe('checkbox');
 await act(async()=>palette('Lavender Milk').click());
 expect(palette('Peach Sorbet').checked).toBe(true);expect(palette('Lavender Milk').checked).toBe(true);
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App/>));
 expect(palette('Peach Sorbet').checked).toBe(true);expect(palette('Lavender Milk').checked).toBe(true);
 await act(async()=>palette('Peach Sorbet').click());
 expect(palette('Peach Sorbet').checked).toBe(false);expect(palette('Lavender Milk').checked).toBe(true);
});
it('derives automatic theme rotation from the enabled set',async()=>{
 const switches=[...host.querySelectorAll<HTMLInputElement>('.theme-selection > .preview-setting input')];
 expect(switches.length).toBe(28);
 await act(async()=>{for(const input of switches)if(input.getAttribute('aria-label')!=='Pixel Garden')input.click();});
 let prefs=JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!);
 expect(prefs.enabledScenes).toEqual(['pixel-garden']);expect(prefs.autoScenes).toBe(false);
 await act(async()=>host.querySelector<HTMLInputElement>('input[aria-label="Spectrum Prism"]')!.click());
 prefs=JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!);
 expect(prefs.enabledScenes).toEqual(['pixel-garden','spectrum-prism']);expect(prefs.autoScenes).toBe(true);
});

it('provides options to enable all colour palettes alongside enable all themes',async()=>{
 const enableThemesBtn=[...host.querySelectorAll('button')].find(b=>b.textContent==='Enable all themes');
 const enablePalettesBtn=[...host.querySelectorAll('button')].find(b=>b.textContent==='Enable all colour palettes');
 expect(enableThemesBtn).not.toBeUndefined();
 expect(enablePalettesBtn).not.toBeUndefined();
 await act(async()=>enablePalettesBtn!.click());
 const prefs=JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!);
 expect(Object.keys(prefs.themePalettes).length).toBe(28);
 expect(prefs.themePalettes['color-riot']).toContain('peach-sorbet');
 expect(prefs.themePalettes['color-riot']).toContain('lavender-milk');
 expect(prefs.themePalettes['pixel-garden']).toContain('botanical-mint');
});



it('opens Song Mapping first and resets expanded disclosures when settings reopen',async()=>{
 const open=()=>host.querySelector<HTMLButtonElement>('.settings-trigger')!.click();
 await act(async()=>open());
 expect(host.querySelector('#settings-tab-mapping')?.getAttribute('aria-selected')).toBe('true');
 expect(host.querySelectorAll('#app-settings details[open]')).toHaveLength(0);
 await act(async()=>click('Lyrics'));
 const details=host.querySelector<HTMLDetailsElement>('#settings-page-lyrics details')!;details.open=true;
 host.querySelector<HTMLDetailsElement>('.lyrics-mapping-section')!.open=true;
 host.querySelector<HTMLDetailsElement>('.video-mapping-section')!.open=true;
 await act(async()=>host.querySelector<HTMLButtonElement>('.settings-close')!.click());
 await act(async()=>open());
 expect(host.querySelector('#settings-tab-mapping')?.getAttribute('aria-selected')).toBe('true');
 expect(host.querySelectorAll('#app-settings details[open]')).toHaveLength(0);
 const preview=host.querySelector('.song-lyrics-mapping details')!;
 const timing=[...host.querySelectorAll('.song-lyrics-mapping h3')].find(h=>h.textContent==='Lyrics timing fix')!;
 expect(preview.compareDocumentPosition(timing)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('starts with the requested video, placement, lyric, rendering and language defaults',()=>{
 const input=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
 const expected={'Video dimming':0,'Theme duration without lyrics':6,'Horizontal lyrics padding':0,'Vertical lyrics padding':10,'Maximum lyrics width':60,'Maximum lyrics height':50,'Lyrics font size scale':100,'Minimum lyric font size':30,'Maximum lyric font size':100,'Bass threshold sensitivity':50,'Visual intensity':100,'Audio sensitivity':50,'Motion blur':80,'Animation speed':30,'Spectrum gain':40};
 for(const [label,value] of Object.entries(expected))expect(input(label)?.value,label).toBe(String(value));
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Fill')?.getAttribute('aria-pressed')).toBe('true');
 expect(host.querySelector<HTMLSelectElement>('[aria-label="Lyric fill pace"]')?.value).toBe('letter');
 expect(input('Show FPS on visualizer').checked).toBe(true);
 expect(JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!).display.playerVolume).toBe(100);
 const enabled=(kind:string)=>[...host.querySelectorAll<HTMLInputElement>(`input[aria-label^="${kind} · "]`)].filter(i=>i.checked).map(i=>i.getAttribute('aria-label'));
 expect(enabled('Video')).toEqual(['Video · Left Stage Sweep','Video · Right Stage Sweep','Video · Bottom-Right Cinema','Video · Bottom-Left Editorial']);
 expect(enabled('Theme')).toEqual(['Theme · Center Stage']);
 expect(host.textContent).not.toContain('Alternating Left ↔ Right');
 expect([...host.querySelectorAll('label')].some(l=>/^Genre/.test(l.textContent?.trim()||''))).toBe(false);
 for(const language of ['Japanese','Korean','Chinese','Russian / Cyrillic','Arabic','Hebrew','Thai'])expect(host.querySelector(`[aria-label="Romanize ${language}"]`)?.getAttribute('aria-checked'),language).toBe('false');
});
it('shows loading or not found until actual lyrics load, then includes their source library',async()=>{
 const summary=()=>host.querySelector('#settings-page-mapping .current-song')!;
 await act(async()=>click('Load fixture audio'));
 expect(summary().textContent).not.toContain('Original test song');
 await act(async()=>click('Fixture lyrics loading'));expect(summary().querySelector('strong')?.textContent).toBe('Loading…');
 await act(async()=>click('Fixture lyrics missing'));expect(summary().querySelector('strong')?.textContent).toBe('Not found');
 await act(async()=>click('Fixture lyrics ready'));
 expect(summary().querySelector('strong')?.textContent).toBe('Matched lyrics title');
 expect(summary().textContent).toContain('LRC Library');
});
it('includes the selected video channel and view count beside its title',async()=>{
 await act(async()=>{click('Load JioSaavn fixture');await new Promise(r=>setTimeout(r,750));});
 const video=host.querySelectorAll('#settings-page-mapping .current-song')[1];
 expect(video.textContent).toContain('Official Music Video');expect(video.textContent).toContain('Test artist');expect(video.textContent).toContain('5.4M views');
});
