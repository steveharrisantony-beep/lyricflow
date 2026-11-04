import {hasWordTiming} from './lyricsQuality';

export const formatLrcTimestamp = (seconds: number, bracket: '[' | '<' = '['): string => {
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
 * - Extracts multi-word <span ttm:role="x-bg"> dual-singer phrases as simultaneous timed lines
 *   (while unwrapping single-word ad-libs inline)
 * - Preserves overlapping <p ttm:agent="v1"> / <p ttm:agent="v2"> lines for simultaneous two-side duet display
 * - Glues adjacent syllable spans that have no whitespace between </span> and <span into unified words
 */
export function convertTtmlToEnhancedLrc(ttml: string): { lrc: string; romanizedLrc?: string; hasWordSync: boolean; primaryLineStarts?: number[] } {
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
  const primaryLineStarts: number[] = [];

  const parseLeafTokens = (fragment: string) => {
    const wordTokens: { text: string; start: number; end: number; trailingSpace: boolean; endEstimated:boolean }[] = [];
    let lastSpanEndIndex = -1;
    for (const sMatch of fragment.matchAll(leafSpanRegex)) {
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
        lastSpanEndIndex >= 0 ? fragment.slice(lastSpanEndIndex, matchStartIndex) : ' ';
      const hasGapWhitespace = /\s/.test(betweenText);
      lastSpanEndIndex = matchStartIndex + sMatch[0].length;

      if (text && sBegin !== null) {
        const endSec = sEnd !== null && sEnd >= sBegin ? sEnd : sBegin + 0.35;
        const endEstimated=sEnd===null||sEnd<=sBegin;
        const prev = wordTokens[wordTokens.length - 1];
        if (prev && !hasGapWhitespace && !prev.trailingSpace && !hadLeadingSpace) {
          prev.text += text;
          prev.end = Math.max(prev.end, endSec);
          prev.trailingSpace = hadTrailingSpace;
          prev.endEstimated=endEstimated;
        } else {
          wordTokens.push({
            text,
            start: sBegin,
            end: endSec,
            trailingSpace: hadTrailingSpace,
            endEstimated,
          });
        }
      }
    }
    return wordTokens;
  };

  for (const pMatch of ttml.matchAll(pRegex)) {
    const pAttrs = pMatch[1] || '';
    let pInner = pMatch[2] || '';
    const pBegin = parseTtmlTime(getAttr(pAttrs, 'begin'));
    const pEnd=parseTtmlTime(getAttr(pAttrs,'end'));

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

    // 2. Check for nested <span ttm:role="x-bg"> containers:
    // If a container has 2+ timed words, emit it as a simultaneous second-singer line;
    // if it has only 1 word (e.g. "(yeah)"), unwrap it inline into the main line.
    const secondaryBgLines: string[] = [];
    pInner = pInner.replace(
      /<span\b[^>]*\bttm:role\s*=\s*["']x-bg["'][^>]*>([\s\S]*?<span\b[\s\S]*?<\/span>)\s*<\/span>/gi,
      (_full, innerSpans: string) => {
        const bgTokens = parseLeafTokens(innerSpans);
        if (bgTokens.length >= 2) {
          // Strip outer parentheses on simultaneous secondary vocal phrase for clean two-side display
          bgTokens[0].text = bgTokens[0].text.replace(/^\(+/, '').trim() || bgTokens[0].text;
          const lastIdx = bgTokens.length - 1;
          bgTokens[lastIdx].text = bgTokens[lastIdx].text.replace(/\)+$/, '').trim() || bgTokens[lastIdx].text;
          const bgStart = bgTokens[0].start;
          const bgEnd = bgTokens[lastIdx].end;
          const bgBody = bgTokens
            .map(w => `${formatLrcTimestamp(w.start, '<')}${w.text}`)
            .join(' ');
          secondaryBgLines.push(
            `${formatLrcTimestamp(bgStart, '[')}${bgBody}${bgTokens[lastIdx].endEstimated?'':formatLrcTimestamp(bgEnd, '<')}`
          );
          return '';
        }
        return innerSpans;
      }
    );

    const wordTokens = parseLeafTokens(pInner);

    if (wordTokens.length > 0) {
      const last=wordTokens[wordTokens.length-1];
      if(last.endEstimated&&pEnd!==null&&pEnd>last.start){last.end=pEnd;last.endEstimated=false;}
      const lineStart = pBegin !== null ? pBegin : wordTokens[0].start;
      const body = wordTokens
        .map(w => `${formatLrcTimestamp(w.start, '<')}${w.text}`)
        .join(' ');
      if (wordTokens.some(token => /[\p{L}\p{N}]/u.test(token.text))) primaryLineStarts.push(lineStart);
      const lastEnd = wordTokens[wordTokens.length - 1].end;
      lines.push(`${formatLrcTimestamp(lineStart, '[')}${body}${last.endEstimated?'':formatLrcTimestamp(lastEnd, '<')}`);
      for (const bgLine of secondaryBgLines) {
        lines.push(bgLine);
      }
      if (extractedRoman) {
        romanLines.push(`${formatLrcTimestamp(lineStart, '[')}${extractedRoman}`);
      }
    } else {
      const plainText = decodeEntities(pInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (plainText && pBegin !== null) {
        if (/[\p{L}\p{N}]/u.test(plainText)) primaryLineStarts.push(pBegin);
        lines.push(`${formatLrcTimestamp(pBegin, '[')}${plainText}${pEnd!==null&&pEnd>pBegin?formatLrcTimestamp(pEnd,'<'):''}`);
        if (extractedRoman) {
          romanLines.push(`${formatLrcTimestamp(pBegin, '[')}${extractedRoman}`);
        }
      }
    }
  }

  const lrc=lines.join('\n');
  return {
    lrc,
    romanizedLrc: romanLines.length > 0 ? romanLines.join('\n') : undefined,
    hasWordSync:hasWordTiming(lrc),
    primaryLineStarts,
  };
}
