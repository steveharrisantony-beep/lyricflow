import {backendOrigin} from '../network/backend';
/**
 * SponsorBlock Integration (https://github.com/ajayyy/SponsorBlockServer)
 * Queries SponsorBlock skip segments to:
 * 1. Automatically skip non-music portions (`music_offtopic`), sponsors (`sponsor`),
 *    intros (`intro`), outros (`outro`), self-promotion (`selfpromo`), and interaction reminders.
 * 2. Calculate the true music start offset (when a music video has a non-music intro skit/dialogue)
 *    and true musical duration so lyrics match and sync accurately on YouTube music videos.
 */

export type SponsorBlockCategory =
  | 'music_offtopic'
  | 'sponsor'
  | 'selfpromo'
  | 'intro'
  | 'outro'
  | 'interaction'
  | 'preview'
  | 'filler';

export interface SponsorBlockSegment {
  uuid: string;
  segment: [number, number];
  start?: number;
  end?: number;
  category: SponsorBlockCategory;
  actionType: 'skip' | 'mute' | 'full' | 'poi';
  videoDuration?: number;
}

export const SPONSORBLOCK_CATEGORY_LABELS: Record<SponsorBlockCategory, string> = {
  music_offtopic: 'Non-Music Section',
  sponsor: 'Sponsor',
  selfpromo: 'Unpaid / Self Promotion',
  intro: 'Intermission / Intro',
  outro: 'Endcards / Credits',
  interaction: 'Interaction Reminder',
  preview: 'Preview / Recap',
  filler: 'Filler Tangent',
};

export function formatSegmentCategory(category: SponsorBlockCategory | string): string {
  return (
    SPONSORBLOCK_CATEGORY_LABELS[category as SponsorBlockCategory] ||
    String(category).replace(/_/g, ' ')
  );
}

const DEFAULT_CATEGORIES: SponsorBlockCategory[] = [
  'music_offtopic',
  'sponsor',
  'selfpromo',
  'intro',
  'outro',
  'interaction',
];

const segmentCache = new Map<string, SponsorBlockSegment[]>();

function parseRawSegments(data: unknown): SponsorBlockSegment[] {
  if (!Array.isArray(data)) return [];
  const valid: SponsorBlockSegment[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const seg = Array.isArray(rec.segment) ? rec.segment : [];
    const start = Number(seg[0]);
    const end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const actionType = String(rec.actionType || 'skip');
    if (actionType !== 'skip' && actionType !== 'mute') continue;
    const category = String(rec.category || 'music_offtopic') as SponsorBlockCategory;
    const safeStart = Math.max(0, start);
    valid.push({
      uuid: String(rec.UUID || rec.uuid || `${category}-${safeStart.toFixed(1)}-${end.toFixed(1)}`),
      segment: [safeStart, end],
      start: safeStart,
      end,
      category,
      actionType: actionType === 'mute' ? 'mute' : 'skip',
      videoDuration:
        typeof rec.videoDuration === 'number' && Number.isFinite(rec.videoDuration)
          ? rec.videoDuration
          : undefined,
    });
  }
  return valid.sort((a, b) => a.segment[0] - b.segment[0]);
}

/**
 * Fetch SponsorBlock segments for a YouTube video ID via server proxy with direct fallback
 * to https://sponsor.ajay.app/api/skipSegments.
 */
export async function fetchSponsorBlockSegments(
  videoId: string | null | undefined,
  signal?: AbortSignal
): Promise<SponsorBlockSegment[]> {
  const cleanId = (videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) return [];

  const cached = segmentCache.get(cleanId);
  if (cached) return cached;

  // 1. Try local backend proxy first (/music/sponsorblock/:videoId)
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      const proxyRes = await fetch(
        `${backendOrigin()}/music/sponsorblock/${encodeURIComponent(cleanId)}`,
        {
          headers: { Accept: 'application/json' },
          signal,
        }
      );
      if (proxyRes.ok) {
        const payload = (await proxyRes.json()) as { segments?: unknown } | unknown[];
        const rawList = Array.isArray(payload)
          ? payload
          : payload && typeof payload === 'object' && Array.isArray((payload as { segments?: unknown }).segments)
            ? (payload as { segments: unknown[] }).segments
            : [];
        const parsed = parseRawSegments(rawList);
        segmentCache.set(cleanId, parsed);
        return parsed;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }

  // 2. Fallback to direct public SponsorBlock API (https://sponsor.ajay.app)
  try {
    const params = new URLSearchParams({
      videoID: cleanId,
      categories: JSON.stringify(DEFAULT_CATEGORIES),
    });
    const directRes = await fetch(`https://sponsor.ajay.app/api/skipSegments?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (directRes.status === 404) {
      segmentCache.set(cleanId, []);
      return [];
    }
    if (directRes.ok) {
      const json: unknown = await directRes.json();
      const parsed = parseRawSegments(json);
      segmentCache.set(cleanId, parsed);
      return parsed;
    }
  } catch (e) {
    if (signal?.aborted) throw e;
  }

  return [];
}

/**
 * Find an active skip segment that contains `currentTime`.
 * Returns null if `currentTime` is within 0.45s of the segment end to prevent seek loops.
 */
export function findActiveSkipSegment(
  segments: readonly SponsorBlockSegment[],
  currentTime: number
): SponsorBlockSegment | null {
  if (!segments.length || !Number.isFinite(currentTime) || currentTime < 0) return null;
  for (const seg of segments) {
    const [start, end] = seg.segment;
    if (end - start < 0.8) continue;
    if (currentTime >= start && currentTime < end - 0.45) {
      return seg;
    }
  }
  return null;
}

/**
 * Compute how many seconds of non-music intro precede the actual song in a YouTube video.
 * Merges contiguous leading `music_offtopic` / `intro` / `sponsor` segments that begin near 0:00.
 */
export function computeLeadingNonMusicOffset(segments: readonly SponsorBlockSegment[]): number {
  if (!segments.length) return 0;
  const sorted = [...segments].sort((a, b) => a.segment[0] - b.segment[0]);
  let cursor = 0;
  for (const seg of sorted) {
    const [start, end] = seg.segment;
    if (
      (seg.category === 'music_offtopic' ||
        seg.category === 'intro' ||
        seg.category === 'sponsor' ||
        seg.category === 'selfpromo') &&
      start <= cursor + 2.5
    ) {
      cursor = Math.max(cursor, end);
    } else if (start > cursor + 2.5) {
      break;
    }
  }
  return cursor;
}

/**
 * Estimate the true studio song duration of a YouTube music video by subtracting
 * non-overlapping `music_offtopic`, `sponsor`, `intro`, and `outro` segments from the video duration.
 */
export function computeEffectiveMusicDuration(
  videoDuration: number,
  segments: readonly SponsorBlockSegment[]
): number {
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) return 0;
  if (!segments.length) return videoDuration;

  const intervals: [number, number][] = segments
    .filter(s => s.actionType === 'skip')
    .map(s => [
      Math.max(0, Math.min(videoDuration, s.segment[0])),
      Math.max(0, Math.min(videoDuration, s.segment[1])),
    ] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  if (!intervals.length) return videoDuration;

  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = intervals[i];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }

  const skippedTotal = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
  const remaining = videoDuration - skippedTotal;
  return remaining >= 30 ? remaining : videoDuration;
}
