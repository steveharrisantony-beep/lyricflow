import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../music/providers', () => ({ searchSongs: vi.fn(), resolveSong: vi.fn() }));
import { searchSongs, resolveSong } from '../music/providers';
import { DEMO_TRACKS, prepareDemoPlaylist } from '../music/demoPlaylist';

const catalog = DEMO_TRACKS.map((track, index) => ({ id:String(index), title:track.title, artist:track.artists.join(', '), album:'', duration:200, provider:'jiosaavn' as const, sourceUrl:'' }));
afterEach(() => vi.resetAllMocks());

it('finds the requested JioSaavn recordings and retains playlist order when responses arrive out of order', async () => {
  vi.mocked(searchSongs).mockImplementation(async query => {
    const track = catalog.find(song => query.startsWith(song.title))!;
    return [ { ...track, title:track.title + ' (Remix)' }, { ...track, artist:'Cover Performer' }, track ];
  });
  vi.mocked(resolveSong).mockImplementation(async song => ({ ...song, format:'audio', streamUrl:'/audio/' + song.id }));
  const songs = await prepareDemoPlaylist('https://app.example/music', new AbortController().signal);
  expect(songs.map(song => song.title)).toEqual(['Big Dawgs','Blinding Lights','STAY']);
  expect(vi.mocked(searchSongs).mock.calls.map(([query, source]) => [query, source])).toEqual(DEMO_TRACKS.map(track => [track.title + ' ' + track.artists.join(' '), 'jiosaavn']));
  expect(vi.mocked(resolveSong).mock.calls.map(([song]) => song.artist)).toEqual(catalog.map(song => song.artist));
});

it('fails the whole demo when a requested recording is missing', async () => {
  vi.mocked(searchSongs).mockResolvedValue([]);
  await expect(prepareDemoPlaylist('', new AbortController().signal)).rejects.toThrow('Could not find Big Dawgs');
  expect(resolveSong).not.toHaveBeenCalled();
});

it('rejects a resolved source that changes to YouTube', async () => {
  vi.mocked(searchSongs).mockImplementation(async query => [catalog.find(song => query.startsWith(song.title))!]);
  vi.mocked(resolveSong).mockImplementation(async song => ({ ...song, provider:'resolver', format:'youtube', streamUrl:'https://youtube.com' }));
  await expect(prepareDemoPlaylist('', new AbortController().signal)).rejects.toThrow('JioSaavn recording');
});

it('cancels all catalog work when the invitation is dismissed', async () => {
  const controller = new AbortController();
  const requests: AbortSignal[] = [];
  vi.mocked(searchSongs).mockImplementation((_query, _source, _base, signal) => new Promise((_, reject) => {
    requests.push(signal!);
    signal!.addEventListener('abort', () => reject(signal!.reason), { once:true });
  }));
  const pending = prepareDemoPlaylist('', controller.signal);
  const assertion = expect(pending).rejects.toMatchObject({ name:'AbortError' });
  controller.abort();
  await assertion;
  expect(requests).toHaveLength(3);
  expect(requests.every(signal => signal.aborted)).toBe(true);
  expect(resolveSong).not.toHaveBeenCalled();
});
