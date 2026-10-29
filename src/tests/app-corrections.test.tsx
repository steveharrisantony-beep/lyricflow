// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../visualization/cinematic/CinematicStage', () => ({ default: () => null, CAMERA_VIEWS: ['Front'] }));
vi.mock('../audio/LocalPlayer', () => ({ default: (props: { onTrackChange: (track: unknown) => void; onFileChange: (loaded: boolean) => void; lyricDelay: number; onLyricDelayChange: (delay: number) => void }) => <div>
  <button onClick={() => { props.onTrackChange({ title: 'Original test song', artist: 'Test artist', album: 'Studio', duration: 200, provider: 'local', source: 'manual', confidence: 1 }); props.onFileChange(true); }}>Load fixture audio</button>
  <button onClick={() => { props.onTrackChange({ title: 'Original test song', artist: 'Test artist', album: 'Studio', duration: 200, provider: 'jiosaavn', sourceTrackId: 'saavn_123', source: 'provider', audioSource: 'JioSaavn', confidence: 1 }); props.onFileChange(true); }}>Load JioSaavn fixture</button>
  <output data-testid="delay">{props.lyricDelay}</output>
  <button onClick={() => props.onLyricDelayChange(.5)}>Adjust fixture timing</button>
</div> }));
vi.mock('../music/providers', async importOriginal => ({
  ...await importOriginal<typeof import('../music/providers')>(),
  searchStashCatalog: vi.fn().mockResolvedValue([{id:'yt_abcdefghijk',title:'Original test song',artist:'Test artist',album:'Studio',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',youtubeVideoId:'abcdefghijk'}]),
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
  await act(async () => click('Adjust fixture timing'));
  expect(host.querySelector('[data-testid="delay"]')?.textContent).toBe('0.5');
  expect(host.textContent).toContain('Lyrics timing: personal');
  expect(localStorage.getItem('lyricflow.v3.guest.corrections')).toContain('"delaySeconds":0.5');
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await act(async () => click('Load fixture audio'));
  // The same lyrics revision finds the same correction; a new revision must not.
  await act(async () => click('Custom Edit (If Lyrics Mismatch)'));
  const area2 = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area2, '[00:01]Original test words\n[00:03]Another original phrase');
    area2.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-testid="delay"]')?.textContent).toBe('0.5');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area2, '[00:02]A different lyrics revision');
    area2.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-testid="delay"]')?.textContent).toBe('0');
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
  await act(async () => click('Find YouTube video background'));
  expect(searchStashCatalog).toHaveBeenLastCalledWith('Original test song Test artist music video', 'resolver', '', expect.any(AbortSignal));
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Preferred YouTube background"]')!;
  await act(async () => { select.value = 'lyrics'; select.dispatchEvent(new Event('change',{bubbles:true})); });
  await act(async () => click('Find YouTube video background'));
  expect(searchStashCatalog).toHaveBeenLastCalledWith('Original test song Test artist lyrics video', 'resolver', '', expect.any(AbortSignal));
  await act(async () => click('Use muted background'));
  expect(host.textContent).toContain('Source: JioSaavn');
  await act(async () => click('Custom Edit (If Lyrics Mismatch)'));
  const area = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'[00:01]Original test words');
    area.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async () => click('Adjust fixture timing'));
  const maps = Object.values(JSON.parse(localStorage.getItem('lyricflow.v3.guest.songMappings') || '{}')) as {identity:{title:string;artist:string;duration:number};lyrics:{sourceFile:{revision:string};delaySeconds:number};video:{youtubeVideoId:string;delaySeconds:number}}[];
  expect(maps).toHaveLength(1);
  expect(maps[0]).toMatchObject({identity:{title:'original test song',artist:'test artist',duration:200},lyrics:{delaySeconds:.5},video:{youtubeVideoId:'abcdefghijk',delaySeconds:0}});
  expect(maps[0].lyrics.sourceFile.revision).toMatch(/^l3_/);
  expect(JSON.parse(localStorage.getItem('lyricflow.v3.guest.preferences')!).display.preferredVideoType).toBe('lyrics');
});
