import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYouTubeSubtitles, parseYouTubeSubtitles } from './youtubeSubtitles';

const VIDEO = 'abcdefghijk';
const XML = '<transcript><text start="1.25" dur="3">A sample line</text></transcript>';
const track = (id = '.ml', kind = '') => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=ml&fmt=srv3&sig=abc`,
  languageCode: 'ml', vssId: id, kind, name: { runs: [{ text: 'Malayalam' }] },
});
const player = (tracks: unknown[]) => ({
  playabilityStatus: { status: 'OK' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
});
const json = (value: unknown) => Response.json(value);
function upstream(data = player([track()])) {
  return vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/watch?')) return new Response('"INNERTUBE_API_KEY": "test-key"');
    if (url.includes('/youtubei/')) return json(data);
    if (url.includes('/api/timedtext')) return new Response(XML);
    throw new Error(`Unexpected upstream: ${url}`);
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('YouTube timed captions', () => {
  it('preserves multilingual text, removes encoded styling, sorts cues, and rounds timestamps at minute boundaries', () => {
    expect(parseYouTubeSubtitles('<transcript><text start="59.999">&lt;i&gt;മഴ&lt;/i&gt; &amp; தமிழ் &#x1F3B5;</text><text start="0.5">&#2361;&#2367;&#2306;&#2342;&#2368;</text></transcript>'))
      .toBe('[00:00.50]हिंदी\n[01:00.00]മഴ & தமிழ் 🎵');
  });

  it.each([
    ['<timedtext><body><p t="1250" d="2000"><s>Sample </s><s>words</s></p></body></timedtext>'],
    [JSON.stringify({ events: [{ tStartMs: 1250, segs: [{ utf8: 'Sample ' }, { utf8: 'words' }] }] })],
    ['WEBVTT\n\n00:01.250 --> 00:03.250\nSample words'],
  ])('supports alternative timedtext formats without losing word spaces: %s', raw => {
    expect(parseYouTubeSubtitles(raw)).toBe('[00:01.25]Sample words');
  });

  it('ignores metadata-only and invalid cues without manufacturing lyrics', () => {
    expect(parseYouTubeSubtitles('{"events":[{"tStartMs":0,"segs":[{"utf8":"[Music]"}]},{"segs":[{"utf8":"untimed"}]},{"tStartMs":-1,"segs":[{"utf8":"invalid"}]}]}')).toBe('');
    expect(parseYouTubeSubtitles('<html>Not captions</html>')).toBe('');
  });
});

describe('direct transcript API flow', () => {
  it('retains watch/player cookies and completes consent before downloading a one-line ASR transcript', async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<form action="https://consent.youtube.com/s"><input value="cb.2026" name="v"></form>', { headers: { 'Set-Cookie': 'VISITOR_INFO1_LIVE=session; Path=/; Domain=.youtube.com' } }))
      .mockResolvedValueOnce(new Response('"INNERTUBE_API_KEY": "test-key"'))
      .mockResolvedValueOnce(new Response(JSON.stringify(player([track('a.ml', 'asr')])), { headers: { 'Set-Cookie': 'YSC=player-session; Path=/' } }))
      .mockResolvedValueOnce(new Response(XML));
    const result = await fetchYouTubeSubtitles(VIDEO, { fetch: http });
    expect(result.lrc).toBe('[00:01.25]A sample line');
    expect(result.hasWordSync).toBe(false);
    expect(result.subtitleTracks[0]).toMatchObject({ id: 'a.ml', isGenerated: true, label: 'Malayalam (auto-generated)', lineCount: 1 });
    const consentHeaders = new Headers(http.mock.calls[1][1]?.headers);
    expect(consentHeaders.get('Cookie')).toContain('VISITOR_INFO1_LIVE=session');
    expect(consentHeaders.get('Cookie')).toContain('CONSENT=YES+cb.2026');
    expect(JSON.parse(String(http.mock.calls[2][1]?.body))).toEqual({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId: VIDEO });
    expect(new Headers(http.mock.calls[3][1]?.headers).get('Cookie')).toContain('YSC=player-session');
    expect(new URL(String(http.mock.calls[3][0])).searchParams.has('fmt')).toBe(false);
  });

  it('prefers uploaded tracks while exposing ASR and all available scripts with stable IDs', async () => {
    const http = upstream(player([track('a.ml', 'asr'), track('.ml'), { ...track('.ta'), languageCode: 'ta', name: { simpleText: 'Tamil' } }]));
    const first = await fetchYouTubeSubtitles(VIDEO, { fetch: http });
    const again = await fetchYouTubeSubtitles(VIDEO, { fetch: http });
    expect(first.subtitleTracks.map(t => t.id)).toEqual(['.ml', '.ta', 'a.ml']);
    expect(again.subtitleTracks).toEqual(first.subtitleTracks);
    expect(first.source).toBe('YouTube Subtitles (Malayalam)');
  });

  it('keeps a working ASR track when an uploaded track fails', async () => {
    const http = upstream(player([{ ...track('.ml'), baseUrl: track().baseUrl + '&broken=1' }, track('a.ml', 'asr')]));
    const fallback = http.getMockImplementation()!;
    http.mockImplementation(async (url, init) => String(url).includes('broken=1') ? new Response('', { status: 500 }) : fallback(url, init));
    expect((await fetchYouTubeSubtitles(VIDEO, { fetch: http })).subtitleTracks.map(t => t.id)).toEqual(['a.ml']);
  });

  it('tries JSON3 with a single fmt parameter if default XML is empty', async () => {
    const http = upstream();
    const fallback = http.getMockImplementation()!;
    http.mockImplementation(async (url, init) => {
      if (!String(url).includes('/api/timedtext')) return fallback(url, init);
      const parsed = new URL(String(url));
      expect(parsed.searchParams.getAll('fmt').length).toBeLessThanOrEqual(1);
      return new Response(parsed.searchParams.get('fmt') === 'json3' ? '{"events":[{"tStartMs":1000,"segs":[{"utf8":"Recovered"}]}]}' : '');
    });
    expect((await fetchYouTubeSubtitles(VIDEO, { fetch: http })).lrc).toBe('[00:01.00]Recovered');
  });

  it.each([
    [player([]), 'NO_CAPTIONS', 404],
    [{ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' } }, 'REQUEST_BLOCKED', 503],
    [{ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'This video may be inappropriate for some users.' } }, 'VIDEO_RESTRICTED', 403],
    [{ playabilityStatus: { status: 'ERROR', reason: 'This video is unavailable' } }, 'VIDEO_UNAVAILABLE', 404],
  ])('distinguishes unavailable captions from blocked/restricted videos', async (data, code, status) => {
    await expect(fetchYouTubeSubtitles(VIDEO, { fetch: upstream(data as ReturnType<typeof player>) })).rejects.toMatchObject({ code, status });
  });

  it('reports rate limits without retrying through public mirrors', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
    await expect(fetchYouTubeSubtitles(VIDEO, { fetch: http })).rejects.toMatchObject({ code: 'REQUEST_BLOCKED', status: 503 });
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('distinguishes token requirements and unreadable caption responses from absent captions', async () => {
    await expect(fetchYouTubeSubtitles(VIDEO, { fetch: upstream(player([{ ...track(), baseUrl: track().baseUrl + '&exp=xpe' }])) })).rejects.toMatchObject({ code: 'PO_TOKEN_REQUIRED', status: 503 });
    const http = upstream();
    const fallback = http.getMockImplementation()!;
    http.mockImplementation(async (url, init) => String(url).includes('/api/timedtext') ? new Response('') : fallback(url, init));
    await expect(fetchYouTubeSubtitles(VIDEO, { fetch: http })).rejects.toMatchObject({ code: 'CAPTIONS_UNREADABLE', status: 502 });
  });

  it('rejects invalid IDs without I/O and bounds stalled requests', async () => {
    const http = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(init!.signal!.reason);
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort, { once: true });
    }));
    await expect(fetchYouTubeSubtitles('https://youtube.com/test', { fetch: http })).rejects.toMatchObject({ code: 'INVALID_VIDEO_ID' });
    expect(http).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = fetchYouTubeSubtitles(VIDEO, { fetch: http, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});


it('retains provided Android sign-in headers and handles Node runtimes without getSetCookie', async () => {
  const first = new Response('"INNERTUBE_API_KEY":"fixture-key"', {headers:{'Set-Cookie':'VISITOR=session; Expires=Wed, 21 Oct 2030 07:28:00 GMT, YSC=visitor; Path=/'}});
  Object.defineProperty(first.headers, 'getSetCookie', {value:undefined});
  const http = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(Response.json(player([track()])))
    .mockResolvedValueOnce(new Response(XML));
  await fetchYouTubeSubtitles(VIDEO, {fetch:http, headers:{Cookie:'account=fixture',Authorization:'Bearer fixture-token'}});
  for (const [, init] of http.mock.calls) {
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer fixture-token');
    expect(headers.get('Cookie')).toContain('account=fixture');
  }
  const cookie = new Headers(http.mock.calls[2][1]?.headers).get('Cookie');
  expect(cookie).toContain('VISITOR=session');
  expect(cookie).toContain('YSC=visitor');
  expect(cookie).not.toContain('Expires');
});

it('rejects caption metadata returned for a different video', async () => {
  const http = upstream({...player([track()]),videoDetails:{videoId:'otherVid123'}} as ReturnType<typeof player>);
  await expect(fetchYouTubeSubtitles(VIDEO,{fetch:http})).rejects.toMatchObject({code:'PLAYER_UNREADABLE',status:502});
});

it('allows slow caption responses beyond the previous four-second timeout', async () => {
  vi.useFakeTimers();
  try {
    const http = upstream();
    const fallback = http.getMockImplementation()!;
    http.mockImplementation((url, init) => String(url).includes('/api/timedtext')
      ? new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(XML)), 7000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason); }, {once:true});
      })
      : fallback(url, init));
    const pending = fetchYouTubeSubtitles(VIDEO, {fetch:http});
    const assertion = expect(pending).resolves.toMatchObject({lrc:'[00:01.25]A sample line'});
    await vi.advanceTimersByTimeAsync(7000);
    await assertion;
  } finally { vi.useRealTimers(); }
});
