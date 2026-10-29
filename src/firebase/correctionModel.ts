import type { TrackInfo } from '../metadata/trackInfo';

export type CorrectionKind = 'delay' | 'lyrics' | 'video';
export type LyricsSelection = { engine: 'lyricflow' | 'apple' | 'lrclib' | 'youtube'; lrclibId: number | null; subtitleTrackId: string | null };
export interface RecordingIdentity {
  provider: string; providerId: string; title: string; artist: string; album: string; duration: number;
}
export interface CorrectionContext {
  recordingKey: string; identity: RecordingIdentity; kind: CorrectionKind; lyricsKey: string;
}
export interface Correction extends CorrectionContext {
  delaySeconds: number | null; selection: LyricsSelection | null; youtubeVideoId: string | null;
}

// Keep version words (live, remix, remaster) and native scripts. Never strip them.
const clean = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function fingerprint(text: string): string {
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function recordingIdentity(track: TrackInfo | null): RecordingIdentity | null {
  if (!track?.title.trim()) return null;
  return {
    provider: track.provider || 'local', providerId: track.sourceTrackId || track.videoId || '',
    title: clean(track.title), artist: clean(track.artist), album: clean(track.album),
    duration: Math.max(0, Math.round(track.duration || 0)),
  };
}
export function correctionContext(track: TrackInfo | null, kind: CorrectionKind, lyricsKey = ''): CorrectionContext | null {
  const identity = recordingIdentity(track);
  if (!identity || (kind === 'delay' && !lyricsKey)) return null;
  return { identity, recordingKey: 'r3_' + fingerprint(JSON.stringify(identity)), kind, lyricsKey: kind === 'delay' ? lyricsKey : '' };
}
export function correctionKey(context: CorrectionContext): string {
  return `${context.recordingKey}_${context.kind}_${context.lyricsKey || 'recording'}`;
}
export function lyricFingerprint(original: string, sourceUrl = ''): string {
  return original.trim() ? 'l3_' + fingerprint(sourceUrl + '\n' + original.replace(/\r\n/g, '\n').trim()) : '';
}
export function sameContext(a: CorrectionContext, b: CorrectionContext): boolean {
  return a.recordingKey === b.recordingKey && a.kind === b.kind && a.lyricsKey === b.lyricsKey
    && (['provider', 'providerId', 'title', 'artist', 'album', 'duration'] as const).every(k => a.identity[k] === b.identity[k]);
}
export function validCorrection(raw: unknown, context: CorrectionContext): Correction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Correction;
  if (!r.identity || !sameContext(r, context)) return null;
  const base = { ...context, delaySeconds: null, selection: null, youtubeVideoId: null };
  if (r.kind === 'delay' && typeof r.delaySeconds === 'number' && Number.isFinite(r.delaySeconds) && Math.abs(r.delaySeconds) <= 30) {
    return { ...base, delaySeconds: r.delaySeconds };
  }
  if (r.kind === 'video' && typeof r.youtubeVideoId === 'string' && /^[\w-]{11}$/.test(r.youtubeVideoId)) {
    return { ...base, youtubeVideoId: r.youtubeVideoId };
  }
  if (r.kind === 'lyrics' && r.selection && ['lyricflow', 'apple', 'lrclib', 'youtube'].includes(r.selection.engine)) {
    const s = r.selection;
    if (s.lrclibId !== null && (!Number.isSafeInteger(s.lrclibId) || s.lrclibId <= 0 || s.engine !== 'lrclib')) return null;
    if (s.subtitleTrackId !== null && (typeof s.subtitleTrackId !== 'string' || s.subtitleTrackId.length > 256)) return null;
    return { ...base, selection: { engine: s.engine, lrclibId: s.lrclibId, subtitleTrackId: s.subtitleTrackId } };
  }
  return null;
}
export function makeCorrection(context: CorrectionContext, value: Partial<Correction>): Correction {
  const correction = validCorrection({ ...context, delaySeconds: null, selection: null, youtubeVideoId: null, ...value }, context);
  if (!correction) throw new Error('Invalid correction.');
  return correction;
}
export function chooseCorrection(personal: Correction | null, approved: Correction | null) {
  return personal ? { correction: personal, source: 'personal' as const }
    : approved ? { correction: approved, source: 'approved' as const } : { correction: null, source: 'automatic' as const };
}
