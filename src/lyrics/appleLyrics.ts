import {convertTtmlToEnhancedLrc,formatLrcTimestamp} from './ttml';
export {convertTtmlToEnhancedLrc,parseTtmlTime} from './ttml';
import {normalizeLyricSource} from './sourceLabels';
import {hasWordTiming,lyricsQuality} from './lyricsQuality';
import {backendOrigin} from '../network/backend';
import {getYouTubeRequestHeaders} from '../music/youtubeAuth';
import { isYouTubeAudioTrack, hasValidLrcTimestamps, type TrackCandidate, type TrackInfo } from '../metadata/trackInfo';
import { cleanLyricMetadata } from './providers';
import {
  scoreCandidateAgainstRawMetadata,
  type YouTubeSubtitleTrackItem,
} from './lyricFlowEngine';

export interface AppleLyricResult {
  lrc: string;
  romanizedLrc?: string;
  plain?: string;
  hasWordSync: boolean;
  source: string;
  sourceUrl?: string;
  title?: string;
  artist?: string;
  subtitleTracks?: YouTubeSubtitleTrackItem[];
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
    return { lrc: data.lrc, hasWordSync:hasWordTiming(data.lrc) };
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

  const lrc=out.join('\n');
  return {lrc,hasWordSync:hasWordTiming(lrc)};
}

/**
 * Fetch available caption text. Automatic captions are explicitly labelled, never treated as verified word sync.
 */
export async function fetchYouTubeSubtitlesForTrack(
  videoId: string | null | undefined,
  signal?: AbortSignal
): Promise<AppleLyricResult | null> {
  const cleanId = (videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) return null;
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  const controller=new AbortController();
  const cancel=()=>controller.abort(signal?.reason);
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('YouTube caption lookup timed out.')),35000);
  try {
    signal?.throwIfAborted();
    const res = await fetch(
      `${backendOrigin()}/music/yt-subtitles?videoId=${encodeURIComponent(cleanId)}`,
      {
        headers: { Accept: 'application/json',...getYouTubeRequestHeaders() },
        signal:controller.signal,
      }
    );
    if(res.status===404)return null;
    if(!res.ok){
      const failure=await res.json().catch(()=>null) as {detail?:string}|null;
      throw new Error(failure?.detail||'YouTube captions are unavailable. Try again or import a subtitle file.');
    }
    const data = (await res.json()) as {
      lrc?: string;
      source?: string;
      sourceUrl?: string;
      subtitleTracks?: YouTubeSubtitleTrackItem[];
    };
    if (typeof data.lrc === 'string' && data.lrc.includes('[')) {
      return {
        lrc: data.lrc,
        hasWordSync: false,
        source: data.source || 'YouTube Subtitles',
        sourceUrl: data.sourceUrl || `https://www.youtube.com/watch?v=${cleanId}`,
        subtitleTracks: Array.isArray(data.subtitleTracks) ? data.subtitleTracks : undefined,
      };
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    if(controller.signal.aborted)throw new Error('YouTube caption lookup timed out. Try again or import a subtitle file.');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',cancel);
  }
  return null;
}

/** Keep line/plain lyrics usable while retrying for the preferred word timestamps. */
export async function fetchAppleMusicWordSyncedLyrics(
  track: TrackInfo,
  signal?: AbortSignal,
  requestedSource: 'all' | 'apple' | 'lrclib' | 'youtube' = 'all',
  rawOverride = false,
  onProgress?: (result:AppleLyricResult)=>void
): Promise<AppleLyricResult | null> {
  if (requestedSource !== 'apple') {
    return fetchAppleMusicWordSyncedLyricsOnce(track, signal, requestedSource, rawOverride);
  }
  if (track.title.trim().length < 2) return null;
  let best:AppleLyricResult|null=null;
  for (const delay of [0, 1000, 2000]) {
    signal?.throwIfAborted();
    if (delay) await waitForAppleRetry(delay, signal);
    try {
      const result = await fetchAppleMusicWordSyncedLyricsOnce(track, signal, requestedSource, rawOverride, delay>0);
      signal?.throwIfAborted();
      if (result && lyricsQuality(result.lrc||result.plain)>0) {
        if(!best||lyricsQuality(result.lrc||result.plain)>=lyricsQuality(best.lrc||best.plain)){
          best=result;onProgress?.(result);
        }
        if(lyricsQuality(best.lrc||best.plain)===3)return best;
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return best;
}

function waitForAppleRetry(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, delay);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

async function fetchAppleMusicWordSyncedLyricsOnce(
  track: TrackInfo,
  signal?: AbortSignal,
  requestedSource: 'all' | 'apple' | 'lrclib' | 'youtube' = 'all',
  rawOverride = false,
  refresh = false
): Promise<AppleLyricResult | null> {
  const isYt = !rawOverride && (isYouTubeAudioTrack(track));
  const artistHint = (track.channelHint || track.artist || '').trim();
  const title = rawOverride ? track.title.trim() : cleanLyricMetadata(track.title.trim());
  // Album names are never search terms. YouTube channel names are also skipped unless manually overridden.
  const artist = rawOverride ? track.artist.trim() : isYt ? '' : cleanLyricMetadata(track.artist.trim());
  if (title.length < 2) return null;

  const rawOriginalTitle = rawOverride ? title : (track.videoTitle || track.title).trim();

  // Step 1: Query our server-side Stash multi-source lyrics endpoint (/music/lyrics)
  // Pass the full raw original title for YouTube tracks so the server can both clean it for search
  // AND score returned library candidates' author/album against the full video title.
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      signal?.throwIfAborted();
      const params = new URLSearchParams({
        title: isYt ? rawOriginalTitle : title,
        artist: isYt ? artistHint : artist,
        duration: String(Math.round(track.duration || 0)),
        source: requestedSource,
      });
      if (isYt) params.set('isYouTube', '1');
      if (rawOverride) params.set('rawOverride', '1');
      if (refresh) params.set('refresh', '1');
      if (isYt && track.youtubeVideoId && !rawOverride) params.set('videoId', track.youtubeVideoId);
      const serverUrl = `${backendOrigin()}/music/lyrics?${params.toString()}`;
      const res = await fetch(serverUrl, {
        headers: { Accept: 'application/json' },
        cache:'no-store',
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ttml?: string;
          lrc?: string;
          plain?: string;
          source?: string;
          sourceUrl?: string;
          title?: string;
          artist?: string;
          hasWordSync?: boolean;
          subtitleTracks?: YouTubeSubtitleTrackItem[];
        };
        if (typeof data.ttml === 'string' && data.ttml.includes('<p')) {
          const parsed = convertTtmlToEnhancedLrc(data.ttml);
          if (parsed.lrc && hasValidLrcTimestamps(parsed.lrc)) {
            return {
              lrc: parsed.lrc,
              romanizedLrc: parsed.romanizedLrc,
              hasWordSync: parsed.hasWordSync,
              source: normalizeLyricSource(data.source || 'Synced lyrics · TTML',data.sourceUrl,parsed.hasWordSync),
              sourceUrl: data.sourceUrl,
              title: data.title,
              artist: data.artist,
            };
          }
        }
        if (typeof data.lrc === 'string' && hasValidLrcTimestamps(data.lrc)) {
          return {
            lrc: data.lrc,
            hasWordSync: hasWordTiming(data.lrc),
            source: normalizeLyricSource(data.source || 'Synced lyrics',data.sourceUrl,hasWordTiming(data.lrc)),
            sourceUrl: data.sourceUrl,
            title: data.title,
            artist: data.artist,
            subtitleTracks: Array.isArray(data.subtitleTracks) ? data.subtitleTracks : undefined,
          };
        }
        if (typeof data.plain === 'string' && data.plain.trim().length > 10) {
          return {
            lrc: '',
            plain: data.plain.trim(),
            hasWordSync: false,
            source: normalizeLyricSource(data.source || 'YouTube Music · InnerTube Lyrics',data.sourceUrl),
            sourceUrl: data.sourceUrl,
            title: data.title,
            artist: data.artist,
          };
        }
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // A failed lookup can be retried by the caller.
    }
  }

  return null;
}

/**
 * Fetch selectable Apple Music word-synced / timed lyrics candidates for Manual Search.
 */
export async function fetchAppleMusicCandidates(
  track: TrackInfo,
  signal?: AbortSignal,
  rawOverride = true,
  allowSingleFallback = true
): Promise<TrackCandidate[]> {
  const title = rawOverride ? track.title.trim() : cleanLyricMetadata(track.title.trim());
  const artist = rawOverride ? track.artist.trim() : cleanLyricMetadata(track.artist.trim());
  if (title.length < 2) return [];

  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      signal?.throwIfAborted();
      const params = new URLSearchParams({
        title,
        artist,
        duration: String(Math.round(track.duration || 0)),
      });
      if (rawOverride) params.set('rawOverride', '1');
      const res = await fetch(`${backendOrigin()}/music/apple-candidates?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache:'no-store',
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{
            id: number;
            title: string;
            artist: string;
            album?: string;
            duration: number;
            ttml?: string;
            lrc?: string;
            source?: string;
            sourceLabel?: string;
            sourceUrl?: string;
            url?: string;
            confidence?: number;
          }>;
        };
        const rawList = Array.isArray(data.candidates) ? data.candidates : [];
        const out: TrackCandidate[] = [];
        for (const item of rawList) {
          let syncedLyrics: string | undefined;
          let hasWordSync = false;
          if (item.ttml && item.ttml.includes('<p')) {
            const parsed = convertTtmlToEnhancedLrc(item.ttml);
            if (parsed.lrc && hasValidLrcTimestamps(parsed.lrc)) {
              syncedLyrics = parsed.lrc;
              hasWordSync = parsed.hasWordSync;
            }
          } else if (item.lrc && hasValidLrcTimestamps(item.lrc)) {
            syncedLyrics = item.lrc;
            hasWordSync=hasWordTiming(item.lrc);
          }
          if (!syncedLyrics) continue;
          const sourceUrl=item.sourceUrl||item.url||'';
          const sourceLabel=normalizeLyricSource(item.sourceLabel||item.source||'Synced lyrics',sourceUrl,hasWordSync);
          const cleanItemTitle = (item.title || title).replace(/\s*\[Apple Library\]$/i, '').trim();
          const confidence=scoreCandidateAgainstRawMetadata({title:cleanItemTitle,artist:item.artist||artist,album:item.album||'',duration:Number(item.duration)||track.duration,hasWordSync,hasSynced:true},
            {cleanTitle:title,rawTitle:(isYouTubeAudioTrack(track)?track.videoTitle:undefined)||title,artistHint:track.channelHint||track.artist,albumHint:'',duration:track.duration,isYouTube:isYouTubeAudioTrack(track)});
          if(!rawOverride&&confidence<.45)continue;
          out.push({
            id: Number.isSafeInteger(item.id) ? item.id : 900_000_000 + out.length + 1,
            title: cleanItemTitle || title,
            artist: item.artist || artist,
            album: item.album || track.album || '',
            sourceLabel,
            duration: Number(item.duration) || Math.round(track.duration || 0),
            confidence: rawOverride?(typeof item.confidence === 'number'?item.confidence:0.92):confidence,
            hasSynced: true,
            hasWordSync,
            instrumental: false,
            syncedLyrics,
            provider: 'apple',
            url: sourceUrl,
          });
        }
        if (out.length > 0) return out.sort((a,b)=>lyricsQuality(b.syncedLyrics)-lyricsQuality(a.syncedLyrics)||b.confidence-a.confidence);
      }
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }

  // Fallback: single Apple lookup wrapped as a selectable candidate
  if(!allowSingleFallback)return [];
  const single = await fetchAppleMusicWordSyncedLyrics(track, signal, 'apple', rawOverride).catch(() => null);
  if (single && single.lrc && hasValidLrcTimestamps(single.lrc)) {
    return [
      {
        id: 900_000_001,
        title: track.title.trim(),
        artist: single.artist || track.artist.trim() || 'Unknown artist',
        album: track.album || '',
        sourceLabel: normalizeLyricSource(single.source,single.sourceUrl),
        duration: Math.round(track.duration || 0),
        confidence: 0.94,
        hasSynced: true,
        hasWordSync: single.hasWordSync,
        instrumental: false,
        syncedLyrics: single.lrc,
        provider: 'apple',
        url: single.sourceUrl || '',
      },
    ];
  }
  return [];
}

