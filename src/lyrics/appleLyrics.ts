import { providerRequest } from '../network/request';
import type { TrackInfo } from '../metadata/trackInfo';
import { cleanLyricMetadata } from './providers';

export interface AppleLyricResult {
  lrc: string;
  hasWordSync: boolean;
  source: string;
  sourceUrl?: string;
}

const formatLrcTimestamp = (seconds: number, bracket: '[' | '<' = '['): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(2).padStart(5, '0');
  const close = bracket === '[' ? ']' : '>';
  return `${bracket}${String(mins).padStart(2, '0')}:${secs}${close}`;
};

/** Parse TTML / XML time expressions like "01:23.45", "1:02:03.4", "83.45s", "12400ms". */
export function parseTtmlTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.endsWith('ms')) {
    const ms = Number(raw.slice(0, -2));
    return Number.isFinite(ms) ? ms / 1000 : null;
  }
  if (raw.endsWith('s')) {
    const s = Number(raw.slice(0, -1));
    return Number.isFinite(s) ? s : null;
  }
  const parts = raw.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

/**
 * Convert Apple Music TTML XML (<p begin="..." end="..."><span begin="..." end="...">word</span></p>)
 * into enhanced word-synced LRC ([mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word2).
 */
export function convertTtmlToEnhancedLrc(ttml: string): { lrc: string; hasWordSync: boolean } {
  if (!ttml || !ttml.includes('<p')) return { lrc: '', hasWordSync: false };
  const decodeEntities = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&apos;/g, "'");
  const getAttr = (attrs: string, name: string): string | null => {
    const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
    return match ? match[1] : null;
  };

  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
  const lines: string[] = [];
  let hasWordSync = false;

  for (const pMatch of ttml.matchAll(pRegex)) {
    const pAttrs = pMatch[1] || '';
    const pInner = pMatch[2] || '';
    const pBegin = parseTtmlTime(getAttr(pAttrs, 'begin'));

    const wordTokens: { text: string; start: number; end: number }[] = [];
    for (const sMatch of pInner.matchAll(spanRegex)) {
      const sAttrs = sMatch[1] || '';
      const role = getAttr(sAttrs, 'ttm:role');
      if (role && role !== 'x-bg') continue;
      const sBegin = parseTtmlTime(getAttr(sAttrs, 'begin'));
      const sEnd = parseTtmlTime(getAttr(sAttrs, 'end'));
      const text = decodeEntities(sMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (text && sBegin !== null) {
        wordTokens.push({
          text,
          start: sBegin,
          end: sEnd !== null && sEnd >= sBegin ? sEnd : sBegin + 0.35,
        });
      }
    }

    if (wordTokens.length > 0) {
      hasWordSync = true;
      const lineStart = pBegin !== null ? pBegin : wordTokens[0].start;
      const body = wordTokens
        .map(w => `${formatLrcTimestamp(w.start, '<')}${w.text}`)
        .join(' ');
      const lastEnd = wordTokens[wordTokens.length - 1].end;
      lines.push(`${formatLrcTimestamp(lineStart, '[')}${body}${formatLrcTimestamp(lastEnd, '<')}`);
    } else {
      const plainText = decodeEntities(pInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (plainText && pBegin !== null) {
        lines.push(`${formatLrcTimestamp(pBegin, '[')}${plainText}`);
      }
    }
  }

  return { lrc: lines.join('\n'), hasWordSync };
}

/**
 * Convert structured JSON lyrics (Stash / LyricsPlus / Paxsenix syllable format)
 * into enhanced word-synced LRC.
 */
export function convertStructuredAppleJsonToLrc(payload: unknown): { lrc: string; hasWordSync: boolean } {
  if (!payload || typeof payload !== 'object') return { lrc: '', hasWordSync: false };
  const data = payload as Record<string, unknown>;

  if (typeof data.ttml === 'string' && data.ttml.includes('<p')) {
    return convertTtmlToEnhancedLrc(data.ttml);
  }
  if (typeof data.lyrics === 'string' && data.lyrics.includes('<p')) {
    return convertTtmlToEnhancedLrc(data.lyrics);
  }
  if (typeof data.lrc === 'string' && data.lrc.includes('[')) {
    return { lrc: data.lrc, hasWordSync: data.lrc.includes('<') };
  }

  // Handle LyricsPlus / Paxsenix array of lines with syllabus / words
  const rawLines = Array.isArray(data.lyrics)
    ? data.lyrics
    : Array.isArray(data.lines)
    ? data.lines
    : Array.isArray(payload)
    ? (payload as unknown[])
    : null;

  if (!rawLines || !rawLines.length) return { lrc: '', hasWordSync: false };

  const out: string[] = [];
  let hasWordSync = false;

  for (const item of rawLines) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rawTime = Number(row.time ?? row.startTimeMs ?? row.start ?? 0);
    // Normalize ms vs seconds
    const lineSec = rawTime > 1000 ? rawTime / 1000 : rawTime;
    const syllables = Array.isArray(row.syllabus)
      ? row.syllabus
      : Array.isArray(row.words)
      ? row.words
      : null;

    if (syllables && syllables.length > 0) {
      const tokens: { text: string; start: number; end: number }[] = [];
      for (const syl of syllables) {
        if (!syl || typeof syl !== 'object') continue;
        const s = syl as Record<string, unknown>;
        const txt = String(s.text ?? s.word ?? '').trim();
        if (!txt) continue;
        const tStartRaw = Number(s.time ?? s.startTimeMs ?? s.start ?? lineSec * 1000);
        const tDurRaw = Number(s.duration ?? s.durationMs ?? 300);
        const startSec = tStartRaw > 1000 || rawTime > 1000 ? tStartRaw / 1000 : tStartRaw;
        const durSec = tDurRaw > 50 ? tDurRaw / 1000 : tDurRaw;
        tokens.push({ text: txt, start: startSec, end: startSec + Math.max(0.08, durSec) });
      }
      if (tokens.length > 0) {
        hasWordSync = true;
        const start = tokens[0].start;
        const body = tokens.map(w => `${formatLrcTimestamp(w.start, '<')}${w.text}`).join(' ');
        const end = tokens[tokens.length - 1].end;
        out.push(`${formatLrcTimestamp(start, '[')}${body}${formatLrcTimestamp(end, '<')}`);
        continue;
      }
    }

    const text = String(row.text ?? row.words ?? '').trim();
    if (text && Number.isFinite(lineSec) && lineSec >= 0) {
      out.push(`${formatLrcTimestamp(lineSec, '[')}${text}`);
    }
  }

  return { lrc: out.join('\n'), hasWordSync };
}

/**
 * Stash-style Apple Music word-synced lyrics lookup:
 * 1. Resolves canonical Apple Music / iTunes track ID & metadata via iTunes Search API
 * 2. Queries public Apple Music TTML / word-sync lyrics endpoints (LyricsPlus / Boidu TTML proxy)
 */
export async function fetchAppleMusicWordSyncedLyrics(
  track: TrackInfo,
  signal?: AbortSignal
): Promise<AppleLyricResult | null> {
  const title = cleanLyricMetadata(track.title.trim());
  const artist = cleanLyricMetadata(track.artist.trim());
  if (title.length < 2) return null;

  let appleTrackName = title;
  let appleArtistName = artist;
  let appleAlbumName = track.album || '';
  let appleDuration = track.duration || 0;
  let appleTrackViewUrl = '';

  // Step 1: Canonicalize track against Apple Music / iTunes catalog (same as Stash)
  try {
    const term = [title, artist].filter(Boolean).join(' ');
    const itunesUrl =
      'https://itunes.apple.com/search?' +
      new URLSearchParams({
        term,
        media: 'music',
        entity: 'song',
        limit: '5',
      }).toString();
    const res = await providerRequest(itunesUrl, signal);
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(data.results) ? data.results : [];
      const best = results.find(item => {
        const durSec = Number(item.trackTimeMillis || 0) / 1000;
        if (track.duration > 0 && durSec > 0 && Math.abs(track.duration - durSec) > 8) return false;
        return true;
      }) || results[0];

      if (best) {
        appleTrackName = String(best.trackName || title);
        appleArtistName = String(best.artistName || artist);
        appleAlbumName = String(best.collectionName || appleAlbumName);
        if (Number(best.trackTimeMillis) > 0) {
          appleDuration = Math.round(Number(best.trackTimeMillis) / 1000);
        }
        appleTrackViewUrl = String(best.trackViewUrl || '');
      }
    }
  } catch {
    // Proceed with user-supplied track metadata if iTunes lookup fails
  }

  // Step 2: Query Stash-compatible Apple Music TTML / word-sync endpoints
  const endpoints = [
    'https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?' +
      new URLSearchParams({
        title: appleTrackName,
        artist: appleArtistName,
        album: appleAlbumName,
        duration: String(Math.round(appleDuration || track.duration || 0)),
        source: 'apple,lyricsplus,musixmatch,spotify',
      }).toString(),
    'https://lyrics-api.boidu.dev/getLyrics?' +
      new URLSearchParams({
        s: appleTrackName,
        a: appleArtistName,
        al: appleAlbumName,
        d: String(Math.round(appleDuration || track.duration || 0)),
      }).toString(),
  ];

  for (const url of endpoints) {
    try {
      signal?.throwIfAborted();
      const response = await providerRequest(url, signal);
      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('xml') || contentType.includes('ttml')) {
        const xml = await response.text();
        const parsed = convertTtmlToEnhancedLrc(xml);
        if (parsed.lrc) {
          return {
            lrc: parsed.lrc,
            hasWordSync: parsed.hasWordSync,
            source: parsed.hasWordSync ? 'Apple Music · Word-Synced TTML' : 'Apple Music · Timed Lyrics',
            sourceUrl: appleTrackViewUrl || undefined,
          };
        }
      } else {
        const json = await response.json();
        const parsed = convertStructuredAppleJsonToLrc(json);
        if (parsed.lrc) {
          return {
            lrc: parsed.lrc,
            hasWordSync: parsed.hasWordSync,
            source: parsed.hasWordSync ? 'Apple Music · Word-Synced' : 'Apple Music · Synced',
            sourceUrl: appleTrackViewUrl || undefined,
          };
        }
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Try next Apple Music lyric mirror
    }
  }

  return null;
}
