import { providerRequest } from '../network/request';
import type { TrackInfo } from '../metadata/trackInfo';
import { cleanLyricMetadata } from './providers';

export interface AppleLyricResult {
  lrc: string;
  romanizedLrc?: string;
  plain?: string;
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
 * Implements Stash TtmlParser.kt & Spicy Lyrics JoinSplitWords syllable gluing:
 * - Extracts <span ttm:role="x-roman"> romanized lines when present
 * - Unwraps nested <span ttm:role="x-bg"> background vocal containers
 * - Strips non-sung <span ttm:role="x-translation"> / <span ttm:role="x-roman"> metadata spans from main vocal body
 * - Glues adjacent syllable spans that have no whitespace between </span> and <span into unified words
 */
export function convertTtmlToEnhancedLrc(ttml: string): { lrc: string; romanizedLrc?: string; hasWordSync: boolean } {
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
  const leafSpanRegex = /<span\b([^>]*)>([^<]*)<\/span>/gi;
  const romanSpanRegex = /<span\b[^>]*\bttm:role\s*=\s*["']x-roman["'][^>]*>([\s\S]*?)<\/span>/gi;
  const lines: string[] = [];
  const romanLines: string[] = [];
  let hasWordSync = false;

  for (const pMatch of ttml.matchAll(pRegex)) {
    const pAttrs = pMatch[1] || '';
    let pInner = pMatch[2] || '';
    const pBegin = parseTtmlTime(getAttr(pAttrs, 'begin'));

    // Extract any embedded <span ttm:role="x-roman"> romanized line before stripping
    const romanMatches = [...pInner.matchAll(romanSpanRegex)];
    const extractedRoman = romanMatches
      .map(m => decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))
      .filter(Boolean)
      .join(' ');

    // 1. Strip translation / romanization metadata spans inside <p>
    pInner = pInner.replace(
      /<span\b[^>]*\bttm:role\s*=\s*["']x-(?:translation|roman)["'][^>]*>[\s\S]*?<\/span>/gi,
      ''
    );

    // 2. Unwrap outer <span ttm:role="x-bg"> wrappers that contain nested timed <span ...> children
    pInner = pInner.replace(
      /<span\b[^>]*\bttm:role\s*=\s*["']x-bg["'][^>]*>([\s\S]*?<span\b[\s\S]*?)<\/span>\s*<\/span>/gi,
      '$1</span>'
    );

    const wordTokens: { text: string; start: number; end: number; trailingSpace: boolean }[] = [];
    let lastSpanEndIndex = -1;

    for (const sMatch of pInner.matchAll(leafSpanRegex)) {
      const sAttrs = sMatch[1] || '';
      const role = getAttr(sAttrs, 'ttm:role');
      if (role && role !== 'x-bg') continue;

      const sBegin = parseTtmlTime(getAttr(sAttrs, 'begin'));
      const sEnd = parseTtmlTime(getAttr(sAttrs, 'end'));
      const rawContent = decodeEntities(sMatch[2]);
      const hadLeadingSpace = /^\s/.test(rawContent);
      const hadTrailingSpace = /\s$/.test(rawContent);
      const text = rawContent.replace(/\s+/g, ' ').trim();

      const matchStartIndex = sMatch.index ?? 0;
      const betweenText =
        lastSpanEndIndex >= 0 ? pInner.slice(lastSpanEndIndex, matchStartIndex) : ' ';
      const hasGapWhitespace = /\s/.test(betweenText);
      lastSpanEndIndex = matchStartIndex + sMatch[0].length;

      if (text && sBegin !== null) {
        const endSec = sEnd !== null && sEnd >= sBegin ? sEnd : sBegin + 0.35;
        const prev = wordTokens[wordTokens.length - 1];
        if (
          prev &&
          !hasGapWhitespace &&
          !prev.trailingSpace &&
          !hadLeadingSpace
        ) {
          prev.text += text;
          prev.end = Math.max(prev.end, endSec);
          prev.trailingSpace = hadTrailingSpace;
        } else {
          wordTokens.push({
            text,
            start: sBegin,
            end: endSec,
            trailingSpace: hadTrailingSpace,
          });
        }
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
      if (extractedRoman) {
        romanLines.push(`${formatLrcTimestamp(lineStart, '[')}${extractedRoman}`);
      }
    } else {
      const plainText = decodeEntities(pInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (plainText && pBegin !== null) {
        lines.push(`${formatLrcTimestamp(pBegin, '[')}${plainText}`);
        if (extractedRoman) {
          romanLines.push(`${formatLrcTimestamp(pBegin, '[')}${extractedRoman}`);
        }
      }
    }
  }

  return {
    lrc: lines.join('\n'),
    romanizedLrc: romanLines.length > 0 ? romanLines.join('\n') : undefined,
    hasWordSync,
  };
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
  if (typeof data.ttmlContent === 'string' && data.ttmlContent.includes('<p')) {
    return convertTtmlToEnhancedLrc(data.ttmlContent);
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
      const tokens: { text: string; start: number; end: number; partOfWord: boolean }[] = [];
      for (const syl of syllables) {
        if (!syl || typeof syl !== 'object') continue;
        const s = syl as Record<string, unknown>;
        const rawTxt = String(s.text ?? s.word ?? '');
        const txt = rawTxt.trim();
        if (!txt) continue;
        const tStartRaw = Number(s.time ?? s.startTimeMs ?? s.start ?? lineSec * 1000);
        const tDurRaw = Number(s.duration ?? s.durationMs ?? 300);
        const startSec = tStartRaw > 1000 || rawTime > 1000 ? tStartRaw / 1000 : tStartRaw;
        const durSec = tDurRaw > 50 ? tDurRaw / 1000 : tDurRaw;
        const endSec = startSec + Math.max(0.08, durSec);
        const isPartOfWord = s.partOfWord === true;

        const prev = tokens[tokens.length - 1];
        if (prev && prev.partOfWord) {
          prev.text += txt;
          prev.end = Math.max(prev.end, endSec);
          prev.partOfWord = isPartOfWord;
        } else {
          tokens.push({
            text: txt,
            start: startSec,
            end: endSec,
            partOfWord: isPartOfWord,
          });
        }
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
 * Stash-style Apple Music & Multi-Source word-synced lyrics lookup:
 * 1. Queries our server-side Stash lyrics pipeline (/music/lyrics) which resolves:
 *    - lrc.red & Binimum ISRC Word-Synced Apple Music TTML
 *    - iTunes Search API + Paxsenix Apple Music TTML
 *    - Musixmatch RichSync word-synced & synced subtitles
 *    - KuGou synced LRC
 *    - YouTube Music InnerTube lyrics
 * 2. Falls back to direct client-side lookup if running in offline/test mode.
 */
export async function fetchAppleMusicWordSyncedLyrics(
  track: TrackInfo,
  signal?: AbortSignal
): Promise<AppleLyricResult | null> {
  const title = cleanLyricMetadata(track.title.trim());
  const artist = cleanLyricMetadata(track.artist.trim());
  if (title.length < 2) return null;

  // Step 1: Query our server-side Stash multi-source lyrics endpoint (/music/lyrics)
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      signal?.throwIfAborted();
      const params = new URLSearchParams({
        title,
        artist,
        duration: String(Math.round(track.duration || 0)),
      });
      const serverUrl = `${window.location.origin}/music/lyrics?${params.toString()}`;
      const res = await fetch(serverUrl, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ttml?: string;
          lrc?: string;
          plain?: string;
          source?: string;
          sourceUrl?: string;
          hasWordSync?: boolean;
        };
        if (typeof data.ttml === 'string' && data.ttml.includes('<p')) {
          const parsed = convertTtmlToEnhancedLrc(data.ttml);
          if (parsed.lrc) {
            return {
              lrc: parsed.lrc,
              romanizedLrc: parsed.romanizedLrc,
              hasWordSync: parsed.hasWordSync,
              source: data.source || 'Apple Music · Word-Synced TTML',
              sourceUrl: data.sourceUrl,
            };
          }
        }
        if (typeof data.lrc === 'string' && data.lrc.includes('[')) {
          return {
            lrc: data.lrc,
            hasWordSync: Boolean(data.hasWordSync || data.lrc.includes('<')),
            source: data.source || 'Stash · Synced Lyrics',
            sourceUrl: data.sourceUrl,
          };
        }
        if (typeof data.plain === 'string' && data.plain.trim().length > 10) {
          return {
            lrc: '',
            plain: data.plain.trim(),
            hasWordSync: false,
            source: data.source || 'YouTube Music · InnerTube Lyrics',
            sourceUrl: data.sourceUrl,
          };
        }
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Fall through to direct client lookup if server route is unavailable
    }
  }

  let appleTrackName = title;
  let appleArtistName = artist;
  let appleAlbumName = track.album || '';
  let appleDuration = track.duration || 0;
  let appleTrackViewUrl = '';

  // Step 2: Canonicalize track against Apple Music / iTunes catalog (same as Stash)
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

  // Step 3: Fallback direct endpoints
  const endpoints = [
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
            romanizedLrc: parsed.romanizedLrc,
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
    }
  }

  return null;
}
