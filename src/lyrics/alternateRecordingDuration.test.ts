import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackInfo } from '../metadata/trackInfo';
import {
  buildLyricsSearchPlan, hasExactSecondDurationMatch, validateLyricsCandidate,
  type ProviderLyric,
} from './searchPlan';
import { executeLyricsSearchPlan } from './searchLyrics';

const track: TrackInfo = {
  title: 'Apna Bana Le', artist: 'Original Artist', album: '',
  duration: 191.4, provider: 'jiosaavn', source: 'provider', confidence: 1,
};
const wordLrc = '[00:01.00]<00:01.00>Hello <00:01.50>world\n[00:03.00]<00:03.00>Good <00:03.50>night';
const lineLrc = '[00:01.00]Hello world\n[00:03.00]Good night';
const alternate: ProviderLyric = {
  id: 'lrclib:42', title: 'Apna Bana Le (Live)', artist: 'Other Singer',
  duration: 191.49, source: 'LRCLIB', lrc: wordLrc,
};

afterEach(() => vi.unstubAllGlobals());

describe('alternative synced recording with exact whole-second duration', () => {
  it('rounds both recorded durations to seconds, never requiring millisecond equality', () => {
    expect(hasExactSecondDurationMatch(191.49, 191.4)).toBe(true);
    expect(hasExactSecondDurationMatch(192.01, 191.4)).toBe(false);
    expect(hasExactSecondDurationMatch(undefined, 191.4)).toBe(false);
    expect(hasExactSecondDurationMatch(191.49, 0)).toBe(false);
  });

  it('allows a different recording artist and version for synced lyrics only', () => {
    const plan = buildLyricsSearchPlan(track);
    const query = plan.stages[0];
    for (const quality of [2, 3]) {
      const result = validateLyricsCandidate(alternate, plan, query, quality);
      expect(result.rejection).toBeUndefined();
      expect(result.matchNote).toContain('Alternate recording accepted');
    }
    expect(validateLyricsCandidate(alternate, plan, query, 1).rejection).toBe('Different recording version');
    expect(validateLyricsCandidate({ ...alternate, duration: 192.01 }, plan, query, 3).rejection)
      .toBe('Different recording version');
  });

  it('never accepts an unrelated song, an instrumental, or a missing duration on the exception', () => {
    const plan = buildLyricsSearchPlan(track);
    const query = plan.stages[0];
    expect(validateLyricsCandidate({ ...alternate, title: 'Completely Different Song' }, plan, query, 3).rejection)
      .toBe('Different song title');
    expect(validateLyricsCandidate({ ...alternate, instrumental: true }, plan, query, 3).rejection)
      .toBe('Instrumental recording');
    expect(validateLyricsCandidate({ ...alternate, duration: undefined }, plan, query, 3).rejection)
      .toBe('Different recording version');
  });

  function mockStageProviders(syncedLrc: string) {
    const mock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), 'http://localhost');
      const isFirstStage = url.searchParams.has('artist');
      return Response.json({
        candidates: isFirstStage && url.searchParams.get('provider') === 'lrclib'
          ? [{ ...alternate, lrc: syncedLrc }] : [],
        failures: [],
      });
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('stops before later search stages after finding word-synced alternate lyrics', async () => {
    const plan = buildLyricsSearchPlan(track);
    expect(plan.stages.length).toBeGreaterThan(1);
    const fetcher = mockStageProviders(wordLrc);
    const onReport = vi.fn();
    const selected = await executeLyricsSearchPlan(plan, 'lyricflow', undefined, undefined, onReport);
    expect(selected?.quality).toBe(3);
    expect(selected?.matchNote).toContain('Alternate recording accepted');
    expect(fetcher).toHaveBeenCalledTimes(3); // One stage, three providers
    expect(onReport.mock.lastCall?.[0].status).toBe('found');
    expect(onReport.mock.lastCall?.[0].stages).toHaveLength(1);
  });

  it('uses an exact-second line-synced alternate but keeps searching for word sync', async () => {
    const plan = buildLyricsSearchPlan(track);
    const fetcher = mockStageProviders(lineLrc);
    const selected = await executeLyricsSearchPlan(plan, 'lyricflow');
    expect(selected?.quality).toBe(2);
    expect(selected?.matchNote).toContain('Alternate recording accepted');
    expect(fetcher).toHaveBeenCalledTimes(3 * plan.stages.length);
  });
});
