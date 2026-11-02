/**
 * Direct YouTube caption retrieval, following jdepoix/youtube-transcript-api:
 * watch page -> session consent -> InnerTube ANDROID player -> signed timedtext URL.
 * https://github.com/jdepoix/youtube-transcript-api
 * Kept in Node so the existing app server needs no Python sidecar or API key.
 */
export interface SubtitleTrack {
  id: string;
  languageCode: string;
  label: string;
  lrc: string;
  lineCount: number;
  isGenerated: boolean;
}

export class YouTubeSubtitleError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = 'YouTubeSubtitleError';
  }
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
}
interface PlayerData {
  videoDetails?: { videoId?: string };
  playabilityStatus?: { status?: string; reason?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

const WATCH = 'https://www.youtube.com/watch?v=';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? whole;
    const hex = entity[1].toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function cleanText(text: string): string {
  return decodeEntities(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '').trim();
}

function timestamp(seconds: number): string {
  // Round before splitting minutes so 59.999 becomes 01:00.00, never 00:60.00.
  const centiseconds = Math.round(seconds * 100);
  return `[${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${(centiseconds % 6000 / 100).toFixed(2).padStart(5, '0')}]`;
}

/** Formats returned by timedtext: default XML, srv3 XML, JSON3 and WebVTT. */
export function parseYouTubeSubtitles(raw: string): string {
  const cues: Array<{ start: number; text: string }> = [];
  const add = (start: number, body: string) => {
    const text = cleanText(body);
    if (Number.isFinite(start) && start >= 0 && text && !/^\[(?:music|applause|silence|♪|♫|♬|\s)+\]$/i.test(text)) {
      cues.push({ start, text });
    }
  };
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as { events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }> };
      for (const event of data.events ?? []) {
        if (typeof event.tStartMs === 'number' && Array.isArray(event.segs)) {
          add(event.tStartMs / 1000, event.segs.map(seg => seg.utf8 ?? '').join(''));
        }
      }
    } catch { /* An invalid provider response is handled as unreadable captions. */ }
  } else if (/^WEBVTT\b/i.test(trimmed) || trimmed.includes('-->')) {
    for (const block of trimmed.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
      const lines = block.split('\n');
      const index = lines.findIndex(line => /-->/.test(line));
      if (index < 0) continue;
      const match = lines[index].match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->/);
      if (match) add(Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000, lines.slice(index + 1).join(' '));
    }
  } else {
    for (const match of trimmed.matchAll(/<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const attribute = match[1].toLowerCase() === 'text' ? 'start' : 't';
      const time = match[2].match(new RegExp(`\\b${attribute}=["']([\\d.]+)["']`, 'i'));
      if (time) add(Number(time[1]) / (attribute === 't' ? 1000 : 1), match[3]);
    }
  }
  return cues.sort((a, b) => a.start - b.start).map(cue => `${timestamp(cue.start)}${cue.text}`).join('\n');
}

function assertPlayable(data: PlayerData): void {
  const status = data.playabilityStatus?.status;
  const reason = data.playabilityStatus?.reason ?? '';
  if (!status || status === 'OK') return;
  if (/bot|automated|unusual traffic/i.test(reason)) {
    throw new YouTubeSubtitleError('REQUEST_BLOCKED', 503, 'YouTube blocked subtitle requests from this server. Try again later.');
  }
  if (status === 'LOGIN_REQUIRED' || /age|sign in|private/i.test(reason)) {
    throw new YouTubeSubtitleError('VIDEO_RESTRICTED', 403, 'This video requires sign-in or is restricted.');
  }
  throw new YouTubeSubtitleError('VIDEO_UNAVAILABLE', 404, 'This YouTube video is unavailable.');
}

export async function fetchYouTubeSubtitles(
  videoId: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal; headers?: Record<string, string> } = {}
) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeSubtitleError('INVALID_VIDEO_ID', 400, 'Valid 11-character YouTube videoId is required.');
  }
  const http = options.fetch ?? fetch;
  // The embedded Android runtime targets Node 18.20. Use portable controllers
  // and tolerate Headers implementations without getSetCookie().
  const deadline = new AbortController();
  const signal = deadline.signal;
  const cancel = () => deadline.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => deadline.abort(new DOMException('Subtitle lookup timed out', 'TimeoutError')), 30000);
  const sessionHeaders = new Headers({ 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' });
  new Headers(options.headers).forEach((value, key) => sessionHeaders.set(key, value));
  const cookies = new Map<string, string>();
  for (const pair of (sessionHeaders.get('Cookie') ?? '').split(';')) {
    const equal = pair.indexOf('=');
    if (equal > 0) cookies.set(pair.slice(0, equal).trim(), pair.slice(equal + 1).trim());
  }
  sessionHeaders.delete('Cookie');
  const request = async (url: string, init: RequestInit = {}) => {
    signal.throwIfAborted();
    const attempt = new AbortController();
    const stop = () => attempt.abort(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    const timeout = setTimeout(() => attempt.abort(new DOMException('YouTube request timed out', 'TimeoutError')), 10000);
    try {
      const response = await http(url, {
        ...init,
        headers: {
          ...Object.fromEntries(sessionHeaders),
          ...Object.fromEntries(new Headers(init.headers)),
          ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
        },
        signal: attempt.signal,
      });
      const cookieHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
      const setCookies = typeof cookieHeaders.getSetCookie === 'function'
        ? cookieHeaders.getSetCookie()
        : (cookieHeaders.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=[^;])/);
      for (const cookie of setCookies) {
        const pair = cookie.split(';')[0];
        const equal = pair.indexOf('=');
        if (equal > 0) cookies.set(pair.slice(0, equal).trim(), pair.slice(equal + 1));
      }
      if ([401, 403, 429].includes(response.status)) {
        throw new YouTubeSubtitleError('REQUEST_BLOCKED', 503, 'YouTube blocked subtitle requests. Try again later or use another lyric source.');
      }
      if (!response.ok) throw new YouTubeSubtitleError('UPSTREAM_ERROR', 502, 'YouTube could not return subtitles. Try again later.');
      if (Number(response.headers.get('content-length')) > 10_000_000) {
        throw new YouTubeSubtitleError('CAPTIONS_UNREADABLE', 502, 'YouTube returned an oversized caption response.');
      }
      const body = await response.text();
      if (body.length > 10_000_000) throw new YouTubeSubtitleError('CAPTIONS_UNREADABLE', 502, 'YouTube returned an oversized caption response.');
      return body;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', stop);
    }
  };

  try {
    let html = decodeEntities(await request(`${WATCH}${videoId}`));
    if (/action=["']https:\/\/consent.youtube.com\/s["']/.test(html)) {
      const input = [...html.matchAll(/<input\b[^>]*>/gi)].find(match => /\bname=["']v["']/.test(match[0]));
      const value = input?.[0].match(/\bvalue=["']([^"']+)["']/)?.[1];
      if (!value) throw new YouTubeSubtitleError('CONSENT_REQUIRED', 502, 'YouTube consent could not be completed.');
      cookies.set('CONSENT', `YES+${value}`);
      html = decodeEntities(await request(`${WATCH}${videoId}`));
      if (/action=["']https:\/\/consent.youtube.com\/s["']/.test(html)) {
        throw new YouTubeSubtitleError('CONSENT_REQUIRED', 502, 'YouTube consent could not be completed.');
      }
    }
    if (/class=["']g-recaptcha["']/.test(html)) {
      throw new YouTubeSubtitleError('REQUEST_BLOCKED', 503, 'YouTube blocked subtitle requests from this server. Try again later.');
    }
    const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([A-Za-z0-9_-]+)"/)?.[1];
    if (!apiKey) throw new YouTubeSubtitleError('PLAYER_UNREADABLE', 502, 'YouTube player data could not be read.');
    const data = JSON.parse(await request(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId }),
    })) as PlayerData;
    if (data.videoDetails?.videoId && data.videoDetails.videoId !== videoId) {
      throw new YouTubeSubtitleError('PLAYER_UNREADABLE', 502, 'YouTube returned captions for a different video.');
    }
    assertPlayable(data);
    const available = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(available) || !available.length) {
      throw new YouTubeSubtitleError('NO_CAPTIONS', 404, 'No YouTube subtitles are available for this video.');
    }
    const isGenerated = (track: CaptionTrack) => track.kind === 'asr' || Boolean(track.vssId?.startsWith('a.'));
    // Stable sort: uploaded captions first, then auto-generated captions. Do not drop ASR-only videos.
    const tracks = [...available].sort((a, b) => Number(isGenerated(a)) - Number(isGenerated(b))).slice(0, 6);
    let trackError: unknown;
    const collected = await Promise.all(tracks.map(async (track): Promise<SubtitleTrack | null> => {
      try {
        const url = new URL(track.baseUrl ?? '');
        if (url.protocol !== 'https:' || url.username || url.password || !['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'video.google.com'].includes(url.hostname) || !url.pathname.endsWith('/timedtext')) {
          throw new YouTubeSubtitleError('PLAYER_UNREADABLE', 502, 'YouTube returned an invalid caption track.');
        }
        // youtube-transcript-api removes srv3 before fetching the original signed URL.
        url.searchParams.delete('fmt');
        if (url.searchParams.get('exp') === 'xpe') {
          throw new YouTubeSubtitleError('PO_TOKEN_REQUIRED', 503, 'YouTube requires a playback token for these subtitles.');
        }
        let lrc = '';
        for (const format of ['', 'json3', 'srv1']) {
          const candidate = new URL(url);
          if (format) candidate.searchParams.set('fmt', format);
          lrc = parseYouTubeSubtitles(await request(candidate.toString()));
          if (lrc) break;
        }
        if (!lrc) throw new YouTubeSubtitleError('CAPTIONS_UNREADABLE', 502, 'YouTube returned empty or unreadable subtitles.');
        const generated = isGenerated(track);
        const languageCode = track.languageCode || 'und';
        const name = track.name?.simpleText || track.name?.runs?.map(run => run.text ?? '').join('') || languageCode.toUpperCase();
        return {
          id: track.vssId || `${generated ? 'asr' : 'manual'}-${languageCode}`,
          languageCode,
          label: generated && !/auto-generated/i.test(name) ? `${name} (auto-generated)` : name,
          lrc,
          lineCount: lrc.split('\n').length,
          isGenerated: generated,
        };
      } catch (error) { trackError = error; return null; }
    }));
    signal.throwIfAborted();
    const subtitleTracks = collected.filter((track): track is SubtitleTrack => track !== null);
    if (!subtitleTracks.length) throw trackError;
    const primary = subtitleTracks[0];
    return {
      lrc: primary.lrc,
      source: `YouTube Subtitles (${primary.label})`,
      sourceUrl: `${WATCH}${videoId}`,
      hasWordSync: false,
      subtitleTracks,
    };
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (error instanceof YouTubeSubtitleError) throw error;
    if (signal.aborted || (error instanceof Error && /Timeout|Abort/.test(error.name))) {
      throw new YouTubeSubtitleError('SUBTITLES_TIMEOUT', 504, 'YouTube subtitles timed out. Try again.');
    }
    throw new YouTubeSubtitleError('UPSTREAM_ERROR', 502, 'YouTube subtitles could not be fetched. Try again later.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
