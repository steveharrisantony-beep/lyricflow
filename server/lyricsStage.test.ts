import { afterEach, expect, it, vi } from 'vitest';
import { searchLyricsStageProvider } from './lyricsStage';
import { lyricsStageProviders } from '../src/lyrics/searchPlan';

const title = 'Apna Bana Le (From "Bhediya")';
const artist = 'Arijit Singh, Sachin-Jigar';
const ttml = '<tt><body><p begin="1s" end="3s"><span begin="1s" end="2s">Fixture</span></p></body></tt>';
const track = { title, artist, duration: 191 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixtures() {
  const urls: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    urls.push(url);
    if (url.hostname === 'lrc.red' && url.pathname === '/api/v1') return Response.json({ results: [{ ...track, isrc: 'TEST00000001' }] });
    if (url.pathname.endsWith('.ttml') || url.pathname.startsWith('/apple-music/cache/')) return new Response(ttml);
    if (url.hostname === 'itunes.apple.com') return Response.json({ results: [{ trackId: 12, trackName: title, artistName: artist, trackTimeMillis: 191000 }] });
    if (url.hostname === 'lrclib.net') return Response.json([{ id: 3, trackName: title, artistName: artist, duration: 191, syncedLyrics: '[00:01]Fixture' }]);
    throw new Error('Unexpected fixture URL');
  }));
  return urls;
}

it.each(lyricsStageProviders)('%s preserves exact stage title and artist and returns real catalog duration', async provider => {
  const urls = fixtures();
  const result = await searchLyricsStageProvider(provider, track, new AbortController().signal);
  expect(result.failures).toEqual([]);
  expect(result.candidates[0]).toMatchObject({ title, artist, duration: 191 });
  const query = urls[0].searchParams;
  if (provider === 'paxsenix') expect(query.get('term')).toBe(title + ' ' + artist);
  else {
    expect(query.get(provider === 'lrclib' ? 'track_name' : 'track')).toBe(title);
    expect(query.get(provider === 'lrclib' ? 'artist_name' : 'artist')).toBe(artist);
  }
  if (provider === 'isrc') expect(result.candidates.map(item => item.source)).toEqual(['lrc.red', 'Binimum']);
});

it.each(lyricsStageProviders)('%s uses a title-only query when the artist is unknown', async provider => {
  const urls = fixtures();
  await searchLyricsStageProvider(provider, { title, duration: 191 }, new AbortController().signal);
  const query = urls[0].searchParams;
  expect(query.has('artist')).toBe(false);
  expect(query.has('artist_name')).toBe(false);
  if (provider === 'paxsenix') expect(query.get('term')).toBe(title);
});

it('retries a transient failure with the identical query, but keeps a terminal error distinct from no match', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(new Response('', { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = searchLyricsStageProvider('lrclib', track, controller.signal);
  await vi.advanceTimersByTimeAsync(250);
  expect(await pending).toEqual({ candidates: [], failures: [] });
  expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
  expect(await searchLyricsStageProvider('lrclib', track, controller.signal))
    .toEqual({ candidates: [], failures: ['LRCLIB: HTTP 429'] });
});
