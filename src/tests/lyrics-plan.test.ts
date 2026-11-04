import { afterEach, expect, it, vi } from 'vitest';
import type { TrackInfo } from '../metadata/trackInfo';
import { resolveStashLyricsChain } from '../lyrics/providers';
import { buildLyricsSearchPlan, cleanTitleForLyrics, firstArtistWord, lyricsStageProviders, type LyricsSearchReport, type ProviderLyric } from '../lyrics/searchPlan';

const track: TrackInfo = {
  title: 'Apna Bana Le (From "Bhediya")', artist: 'Arijit Singh, Sachin-Jigar',
  album: 'Bhediya', duration: 190, provider: 'jiosaavn', source: 'provider', confidence: 1,
};
const words = '[00:01]<00:01>Original <00:02>words';
const lines = '[00:01]Original line\n[00:05]Another line';
const candidate: ProviderLyric = {
  id: 'lrclib:1', title: 'Apna Bana Le', artist: 'Arijit Singh', duration: 190, source: 'LRCLIB',
  sourceUrl: 'https://lrclib.net/api/get/1', lrc: lines,
};
const reply = (candidates: ProviderLyric[] = [], failures: string[] = []) => Response.json({ candidates, failures });
function fetchStages(handler: (query: URLSearchParams, signal: AbortSignal) => Response | Promise<Response>) {
  const calls: URLSearchParams[] = [];
  const fetcher = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input, 'https://app.example');
    expect(url.pathname).toBe('/music/lyrics-stage');
    calls.push(url.searchParams);
    return handler(url.searchParams, init.signal!);
  });
  vi.stubGlobal('fetch', fetcher);
  return calls;
}
const pairs = (calls: URLSearchParams[]) => calls.map(query => [query.get('title'), query.get('artist')]);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([
  [{ provider: 'resolver' }, 'A'],
  [{ provider: 'ytmusic', lyricsAudioSource: 'youtube' }, 'A'],
  [{ provider: 'local', source: 'filename' }, 'A'],
  [{ provider: 'external', externalPackageName: 'com.google.android.youtube' }, 'A'],
  [{ provider: 'external', externalPackageName: 'com.google.android.apps.youtube.music' }, 'A'],
  [{ provider: 'jiosaavn', youtubeVideoId: 'abcdefghijk' }, 'B'],
  [{ provider: 'external', externalPackageName: 'com.spotify.music', youtubeVideoId: 'abcdefghijk' }, 'B'],
  [{ provider: 'external', externalPackageName: 'com.apple.android.music' }, 'B'],
  [{ provider: 'external', externalPackageName: 'com.android.chrome', audioSource: 'External Player (YouTube)' }, 'B'],
  [{ provider: 'resolver', lyricsAudioSource: 'stream', youtubeVideoId: 'abcdefghijk' }, 'B'],
  [{ provider: undefined, youtubeVideoId: 'abcdefghijk' }, 'B'],
] as const)('chooses a strategy from the app playing the audio', (source, expected) => {
  const original = { ...track, ...source };
  const plan = buildLyricsSearchPlan(original);
  expect(plan.strategy).toBe(expected);
  expect(plan.originalTitle).toBe(track.title);
  expect(plan.originalArtist).toBe(track.artist);
  expect(original.title).toBe(track.title);
});

it.each([
  ['@SaiAbhyankkar - Aasa Kooda (Official Music Video) | Preity', 'SaiAbhyankkar', 'Aasa Kooda'],
  ['Punchiri - Eechuu | Suhas | Chris Wayne', 'Eechuu', 'Punchiri'],
  ['Ed Sheeran - Shape of You (Official Video)', 'Ed Sheeran', 'Shape of You'],
  ['Aristrocrat - Amsham ft. Sam, Kalyani', 'Aristrocat, Sam', 'Amsham'],
  ['മലയാളം\u200B (Official Video)', '', 'മലയാളം'],
  ['தமிழ் [Lyrics Video]', '', 'தமிழ்'],
  ['हिन्दी (Official Music Video)', '', 'हिन्दी'],
  ['Bengali-বাংলা', '', 'Bengali-বাংলা'],
  ['A-Team (Live) | Tour', '', 'A-Team (Live)'],
  ['AC/DC', '', 'AC/DC'],
  ['(Song)', '', '(Song)'],
])('cleans %s without corrupting recording text', (title, artist, expected) => {
  expect(cleanTitleForLyrics(title, artist)).toBe(expected);
});

it.each([['A. R. Rahman', 'Rahman'], ['Shreya Ghoshal, Armaan Malik', 'Shreya'], ['Ed Sheeran', 'Ed'], ['', undefined]])(
  'extracts a meaningful first artist word from %s', (credit, expected) => expect(firstArtistWord(credit)).toBe(expected),
);

it('uses structured primary and featured credits when the audio provider supplies them separately', () => {
  const song = { ...track, primaryArtist: 'A. R. Rahman', artist: 'A. R. Rahman, Guest', featuredArtist: 'Featured Artist' };
  const plan = buildLyricsSearchPlan(song);
  expect(plan.stages[0].artist).toBe('A. R. Rahman, Guest feat. Featured Artist');
  expect(plan.stages[1].artist).toBe('Rahman');
  expect(song.artist).toBe('A. R. Rahman, Guest');
});

it('waits for the active stage and sends all five original/filtered queries in order', async () => {
  let finish!: (value: Response) => void;
  const first = new Promise<Response>(resolve => { finish = resolve; });
  const calls = fetchStages(query => query.get('artist') === track.artist && query.get('title') === track.title ? first.then(() => reply()) : reply());
  const report = vi.fn();
  const result = resolveStashLyricsChain(track, undefined, 'lyricflow', 0, undefined, undefined, {}, report);
  expect(calls.map(query => query.get('provider'))).toEqual(lyricsStageProviders);
  await Promise.resolve();
  expect(calls.every(query => query.get('title') === track.title && query.get('artist') === track.artist)).toBe(true);
  finish(reply());
  expect(await result).toBeNull();
  expect(pairs(calls.filter(query => query.get('provider') === 'lrclib'))).toEqual([
    [track.title, track.artist], [track.title, 'Arijit'],
    ['Apna Bana Le', track.artist], ['Apna Bana Le', 'Arijit'], ['Apna Bana Le', null],
  ]);
  expect(calls.slice(-lyricsStageProviders.length).every(query => !query.has('artist'))).toBe(true);
  expect(report.mock.calls.at(-1)?.[0].status).toBe('empty');
});

it('skips identical queries and omits artist when the source has no credit', async () => {
  const calls = fetchStages(() => reply());
  await resolveStashLyricsChain({ ...track, title: 'Song', artist: '' }, undefined, 'lrclib');
  expect(pairs(calls)).toEqual([['Song', null]]);
  expect(calls[0].has('artist')).toBe(false);
});

it('uses filtered title plus hint first, then requires an artist word in the raw title', async () => {
  const youtube = { ...track, title: 'Apna Bana Le', videoTitle: 'Arijit Singh - Apna Bana Le (Official Video)', provider: 'resolver' as const };
  const calls = fetchStages(query => query.has('artist') ? reply() : reply([
    { ...candidate, id: 'wrong', artist: 'Different Performer', lrc: words },
    { ...candidate, lrc: words },
  ]));
  const result = await resolveStashLyricsChain(youtube, undefined, 'lrclib');
  expect(result?.artist).toBe('Arijit Singh');
  expect(pairs(calls)).toEqual([['Apna Bana Le', 'Arijit'], ['Apna Bana Le', null]]);
});

it('uses the notification title and artist for external YouTube rather than the background title', () => {
  const plan = buildLyricsSearchPlan({
    ...track, provider: 'external', externalPackageName: 'com.google.android.apps.youtube.music',
    videoTitle: 'Other Artist - Unrelated Song',
  });
  expect(plan.stages.map(query => [query.title,query.artist])).toEqual([
    ['Apna Bana Le','Arijit'],['Apna Bana Le',undefined],
  ]);
  expect(plan.originalTitle).toBe(track.title);
  expect(plan.originalArtist).toBe(track.artist);
});

it('keeps a Paxsenix line end from winning as word sync', async () => {
  const calls = fetchStages(query => query.get('provider') === 'paxsenix' && query.get('artist') === track.artist
    ? reply([{ ...candidate, source:'Paxsenix', id:'paxsenix:1', lrc:undefined,
      ttml:'<tt><p begin="1s" end="8s"><span begin="1s" end="8s">One entire line</span></p></tt>' }])
    : query.get('provider') === 'isrc' && query.get('artist') === 'Arijit'
      ? reply([{ ...candidate, source:'lrc.red', lrc:words }])
      : reply());
  const progress=vi.fn();
  const result=await resolveStashLyricsChain(track,undefined,'lyricflow',0,undefined,progress);
  expect(progress.mock.calls[0][0]).toMatchObject({source:'Paxsenix',hasWordSync:false});
  expect(result).toMatchObject({source:'lrc.red',hasWordSync:true});
  expect(calls).toHaveLength(2 * lyricsStageProviders.length);
});

it('shows the first valid line while providers finish and upgrades only after a later stage finds valid words', async () => {
  const progress = vi.fn(), report = vi.fn();
  const calls = fetchStages(query => {
    if (query.get('provider') === 'lrclib' && query.get('artist') === track.artist) return reply([candidate]);
    if (query.get('provider') === 'isrc' && query.get('artist') === 'Arijit') return reply([
      { ...candidate, source: 'lrc.red', id: 'bad-title', title: 'Apna Other Song', lrc: words },
      { ...candidate, source: 'lrc.red', id: 'bad-artist', artist: 'Arijit Another', lrc: words },
      { ...candidate, source: 'lrc.red', id: 'bad-version', title: 'Apna Bana Le (Live)', lrc: words },
      { ...candidate, source: 'lrc.red', id: 'word', lrc: words },
    ]);
    return reply();
  });
  const result = await resolveStashLyricsChain(track, undefined, 'lyricflow', 0, undefined, progress, {}, report);
  expect(progress.mock.calls[0][0].original).toBe(lines);
  expect(result).toMatchObject({ original: words, hasWordSync: true, searchComplete: true });
  expect(calls).toHaveLength(2 * lyricsStageProviders.length);
  const last = (report.mock.calls.at(-1)![0] as LyricsSearchReport).stages.at(-1)!;
  expect(last.candidates.filter(item => item.rejection)).toHaveLength(3);
  expect(last.selectedId).toBe('word');
});

it.each([[185, 191, 191], [188, 192, 192], [189, 195, 189]])(
  'ranks recording durations %s and %s against 190s', async (a, b, expected) => {
    const reports = vi.fn();
    fetchStages(() => reply([{ ...candidate, id: 'first', duration: a, lrc: words }, { ...candidate, id: 'second', duration: b, lrc: words }]));
    await resolveStashLyricsChain(track, undefined, 'lrclib', 0, undefined, undefined, {}, reports);
    expect(reports.mock.calls.at(-1)?.[0].selected.duration).toBe(expected);
  },
);

it.each([
  ['Binimum', 'Binimum'], [null, 'Paxsenix'],
])('uses provider preference for equally timed recordings (ISRC result: %s)', async (isrcSource, expected) => {
  fetchStages(query => {
    const provider = query.get('provider');
    const source = provider === 'isrc' ? isrcSource : provider === 'paxsenix' ? 'Paxsenix' : 'LRCLIB';
    return reply(source ? [{ ...candidate, id: source, source, lrc: words }] : []);
  });
  expect((await resolveStashLyricsChain(track, undefined, 'lyricflow'))?.source).toBe(expected);
});

it('keeps the verified duration and word timing ahead of provider preference', async () => {
  fetchStages(query => {
    const provider = query.get('provider');
    if (provider === 'isrc') return reply([{ ...candidate, source: 'lrc.red', lrc: words, duration: 193 }]);
    if (provider === 'paxsenix') return reply([{ ...candidate, source: 'Paxsenix', lrc: lines }]);
    return reply([{ ...candidate, lrc: words, duration: 188 }]);
  });
  expect(await resolveStashLyricsChain(track, undefined, 'lyricflow')).toMatchObject({ source: 'LRCLIB', hasWordSync: true });
});

it('skips collapsed TTML before showing progress even when the recording duration matches', async () => {
  const song = { ...track, duration: 281.867 };
  const ttml = '<tt><body dur="281.867s">' + Array.from({ length: 54 }, (_, index) => {
    const start = 250.595 + index / 100;
    return `<p begin="${start}s" end="${start + .02}s"><span begin="${start}s">First </span><span begin="${start + .01}s">word</span></p>`;
  }).join('') + '</body></tt>';
  fetchStages(query => query.get('provider') === 'isrc'
    ? reply([{ ...candidate, id:'collapsed', duration: song.duration, source:'lrc.red', lrc:undefined, ttml }])
    : query.get('provider') === 'lrclib' ? reply([{ ...candidate, duration: song.duration }]) : reply());
  const progress = vi.fn(), report = vi.fn();
  const result = await resolveStashLyricsChain(song, undefined, 'lyricflow', 0, undefined, progress, {}, report);
  expect(result).toMatchObject({ source:'LRCLIB', original:lines });
  expect(progress.mock.calls.map(([lyrics]) => lyrics.source)).toEqual(['LRCLIB']);
  expect(report.mock.calls.at(-1)?.[0].stages[0].candidates[0]).toMatchObject({
    id:'collapsed', quality:0, rejection:'Collapsed line timing: 54 lyric lines start within 0.53 seconds',
  });
});

it('counts the main lyric cue once when TTML includes simultaneous backing lines', async () => {
  const backing = Array.from({ length: 8 }, (_, index) => {
    const start = 10 + index / 10;
    return `<span ttm:role="x-bg"><span begin="${start}s">Backing </span><span begin="${start + .5}s">vocals</span></span>`;
  }).join('');
  const ttml = `<tt><body><p begin="10s" end="14s"><span begin="10s">Main </span><span begin="12s">vocal</span>${backing}</p></body></tt>`;
  fetchStages(query => query.get('provider') === 'isrc'
    ? reply([{ ...candidate, lrc:undefined, source:'lrc.red', ttml }]) : reply());
  expect(await resolveStashLyricsChain(track)).toMatchObject({ source:'lrc.red', hasWordSync:true });
});

it('tries the next stage when many distinct LRC lines use the same timestamp', async () => {
  const collapsed = Array.from({ length: 10 }, (_, index) => `[02:50]Lyric line ${index}`).join('\n');
  const calls = fetchStages(query => query.get('artist') === track.artist
    ? reply([{ ...candidate, lrc:collapsed }]) : reply([{ ...candidate, lrc:words }]));
  const progress = vi.fn();
  expect(await resolveStashLyricsChain(track, undefined, 'lrclib', 0, undefined, progress)).toMatchObject({
    original:words, hasWordSync:true,
  });
  expect(calls).toHaveLength(2);
  expect(progress.mock.calls.map(([lyrics]) => lyrics.original)).toEqual([words]);
});

it.each(['shared', 'per line'])('preserves line sync when only %s word timings collapse', async mode => {
  const clean = Array.from({ length: 8 }, (_, index) => `[00:${String(10 + index * 5).padStart(2, '0')}.00]First second third`).join('\n');
  const lrc = clean.split('\n').map((line, index) => {
    const start = mode === 'shared' ? '55' : String(10 + index * 5).padStart(2, '0');
    return line.replace('First second third', `<00:${start}.00>First <00:${start}.03>second <00:${start}.06>third`);
  }).join('\n');
  fetchStages(() => reply([{ ...candidate, source:'LRCLIB · Word-Synced', lrc }]));
  const report = vi.fn();
  const result = await resolveStashLyricsChain(track, undefined, 'lrclib', 0, undefined, undefined, {}, report);
  expect(result).toMatchObject({ original:clean, hasWordSync:false, source:'LRCLIB · Line-Synced' });
  expect(report.mock.calls.at(-1)?.[0].selected.timingNote).toMatch(/using line timing/);
});

it('keeps validated line lyrics when another recording has word timing', async () => {
  const calls = fetchStages(() => reply([
    candidate, { ...candidate, id: 'wrong', duration: 210, lrc: words },
  ]));
  expect((await resolveStashLyricsChain(track, undefined, 'lrclib'))?.original).toBe(lines);
  expect(calls).toHaveLength(5);
});

it('records upstream failures separately from an empty catalog', async () => {
  const report = vi.fn();
  fetchStages(() => reply([], ['LRCLIB: HTTP 503']));
  expect(await resolveStashLyricsChain(track, undefined, 'lrclib', 0, undefined, undefined, {}, report)).toBeNull();
  expect(report.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'failed' });
});

it('cancels current provider requests and never starts a later stage after a song change', async () => {
  const controller = new AbortController(), progress = vi.fn();
  const calls = fetchStages((_query, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = resolveStashLyricsChain(track, controller.signal, 'lyricflow', 0, undefined, progress);
  const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await check;
  expect(calls.map(query => query.get('provider'))).toEqual(lyricsStageProviders);
  expect(progress).not.toHaveBeenCalled();
});

it('bounds a hung provider and proceeds to the next query with a timeout diagnostic', async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const calls = fetchStages((query, signal) => query.get('artist') === track.artist && query.get('title') === track.title
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    : reply([{ ...candidate, lrc: words }]));
  const pending = resolveStashLyricsChain(track, undefined, 'lrclib', 0, undefined, undefined, {}, report);
  await vi.advanceTimersByTimeAsync(14999);
  expect(calls).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ hasWordSync: true });
  expect(report.mock.calls.at(-1)?.[0].stages[0].failures.join(' ')).toContain('timed out');
  expect(calls).toHaveLength(2);
});

it.each([188, 190, 192])('prefers word timing at %ss over an exact 190s line file', async duration => {
  const calls=fetchStages(()=>reply([candidate,{...candidate,id:'word',duration,lrc:words}]));
  expect(await resolveStashLyricsChain(track,undefined,'lrclib')).toMatchObject({original:words,hasWordSync:true});
  expect(calls).toHaveLength(1);
});

it.each([187,193])('chooses the closest line file when the word file is %ss', async duration => {
  const report=vi.fn();
  fetchStages(()=>reply([
    {...candidate,id:'line-farther',duration:188},
    {...candidate,id:'word',duration,lrc:words},
    candidate,
  ]));
  expect(await resolveStashLyricsChain(track,undefined,'lrclib',0,undefined,undefined,{},report))
    .toMatchObject({original:lines,hasWordSync:false});
  expect(report.mock.calls.at(-1)?.[0].selected.id).toBe(candidate.id);
});

it('continues beyond a word file outside two seconds and switches to the closest line match',async()=>{
  const calls=fetchStages(query=>reply(query.get('artist')===track.artist
    ?[{...candidate,id:'word',duration:193,lrc:words}]
    :[candidate]));
  const progress=vi.fn();
  const result=await resolveStashLyricsChain(track,undefined,'lrclib',0,undefined,progress);
  expect(calls).toHaveLength(5);
  expect(progress.mock.calls[0][0].original).toBe(words);
  expect(result).toMatchObject({original:lines,hasWordSync:false});
  expect(progress.mock.calls.at(-1)?.[0].original).toBe(lines);
});
