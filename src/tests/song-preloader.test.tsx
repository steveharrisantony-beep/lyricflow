// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../data/songPreparation', () => ({prepareSongLyrics:vi.fn(),prepareSongVideo:vi.fn()}));
import {prepareSongLyrics,prepareSongVideo} from '../data/songPreparation';
import {useSongPreloader} from '../data/useSongPreloader';
import {temporarySongs} from '../data/temporarySongs';
const current={title:'Current song',artist:'Artist',album:'',duration:200,source:'provider' as const,confidence:1};
const queue=[{...current,title:'Queued song'}];
let root:Root,host:HTMLDivElement;
function Harness({enabled}:{enabled:boolean}){useSongPreloader(current,queue,null,'music',enabled);return null;}
beforeEach(() => {
  vi.clearAllMocks();temporarySongs.clear();localStorage.clear();
  vi.mocked(prepareSongLyrics).mockImplementation(() => new Promise<never>(() => {}));
  vi.mocked(prepareSongVideo).mockImplementation(() => new Promise<never>(() => {}));
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount());host.remove();});
it('stops queued searches when switching to an external source and resumes after leaving it', async () => {
  await act(async () => root.render(<Harness enabled/>));
  expect(prepareSongLyrics).toHaveBeenCalledOnce();expect(prepareSongVideo).toHaveBeenCalledOnce();
  const lyricsSignal=vi.mocked(prepareSongLyrics).mock.calls[0][3]!;
  const videoSignal=vi.mocked(prepareSongVideo).mock.calls[0][3]!;
  await act(async () => root.render(<Harness enabled={false}/>));
  expect(lyricsSignal.aborted).toBe(true);expect(videoSignal.aborted).toBe(true);
  expect(prepareSongLyrics).toHaveBeenCalledOnce();expect(prepareSongVideo).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness enabled/>));
  expect(prepareSongLyrics).toHaveBeenCalledTimes(2);expect(prepareSongVideo).toHaveBeenCalledTimes(2);
});
it('performs no queue searches when an external source is selected at startup', async () => {
  await act(async () => root.render(<Harness enabled={false}/>));
  expect(prepareSongLyrics).not.toHaveBeenCalled();expect(prepareSongVideo).not.toHaveBeenCalled();
});
