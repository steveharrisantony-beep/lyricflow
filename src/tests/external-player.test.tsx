// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const control = vi.hoisted(() => vi.fn());
vi.mock('../audio/externalPlayer', () => ({controlExternalMedia: control}));
vi.mock('../lyrics/ManualLyrics', () => ({describeAudioSource: () => ({providerName: 'Fixture'})}));
vi.mock('../music/SongSearch', () => ({default: () => null}));
vi.mock('../music/sponsorBlock', async original => ({
  ...await original<typeof import('../music/sponsorBlock')>(), fetchSponsorBlockSegments: vi.fn().mockResolvedValue([]),
}));
import LocalPlayer from '../audio/LocalPlayer';
import type {ExternalMediaState} from '../audio/externalPlayer';

let root: Root, host: HTMLDivElement;
const changed = vi.fn(), clock = vi.fn();
const media: ExternalMediaState = {
  title:'External song',artist:'Artist',album:'Album',duration:200,position:40,playing:true,
  packageName:'fixture.player',appName:'Fixture',updatedAt:1,sessionId:'session-one',
  artwork:'data:image/jpeg;base64,fixture',volume:60,shuffleEnabled:false,repeatEnabled:false,
  controls:{play:true,pause:true,previous:true,next:true,seek:true,shuffle:true,repeat:true,volume:true},
};
function render(state = media) {
  return <LocalPlayer sourceMode="external" externalTrack={{...state,source:'provider',provider:'external',confidence:1}}
    externalMedia={state} externalTime={state.position} externalPlaying={state.playing}
    onOpenSourceSelector={vi.fn()} onActiveChange={changed} onTimeChange={clock}
    onFileChange={vi.fn()} onTrackChange={vi.fn()} onDurationChange={vi.fn()}/>;
}
const button = (label:string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
beforeEach(async () => {
  vi.clearAllMocks();control.mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(() => {});
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root.render(render()));
});
afterEach(async () => {await act(async () => root.unmount());host.remove();vi.restoreAllMocks();});

it('shows external artwork and sends transport buttons to the displayed media session', async () => {
  expect(host.querySelector<HTMLImageElement>('.spotify-mini-art img')?.src).toBe(media.artwork);
  for (const [label,command] of [['Pause track','pause'],['Previous track','previous'],['Next track','next']]) {
    expect(button(label).disabled).toBe(false);
    await act(async () => button(label).click());
    expect(control).toHaveBeenLastCalledWith(media,command,undefined);
  }
  expect(changed).not.toHaveBeenCalled();expect(clock).not.toHaveBeenCalled();
  await act(async () => root.render(render({...media,playing:false})));
  await act(async () => button('Play track').click());
  expect(control).toHaveBeenLastCalledWith({...media,playing:false},'play',undefined);
});

it('routes seek, volume, shuffle and repeat through the external player', async () => {
  for (const [label,value,command] of [['Song position','70','seek'],['Volume','30','volume']]) {
    const input=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    expect(control).toHaveBeenLastCalledWith(media,command,Number(value));
  }
  await act(async () => button('Shuffle queue').click());
  expect(control).toHaveBeenLastCalledWith(media,'shuffle',1);
  await act(async () => button('Repeat track').click());
  expect(control).toHaveBeenLastCalledWith(media,'repeat',1);
  expect(clock).not.toHaveBeenCalled();
});

it('uses current native capabilities and removes art when the next song has none', async () => {
  await act(async () => root.render(render({...media,artwork:undefined,controls:{...media.controls!,next:false,seek:false}})));
  expect(host.querySelector('.spotify-mini-art')).toBeNull();
  expect(button('Next track').disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Song position"]')?.disabled).toBe(true);
  await act(async () => button('Next track').click());
  expect(control).not.toHaveBeenCalled();
});

it('reports a failed external command without pretending that playback changed', async () => {
  control.mockRejectedValueOnce(new Error('The external player changed. Please try again.'));
  await act(async () => button('Pause track').click());
  expect(host.textContent).toContain('The external player changed. Please try again.');
  expect(changed).not.toHaveBeenCalled();
});
