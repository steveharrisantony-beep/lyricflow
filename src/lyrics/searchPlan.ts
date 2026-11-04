import type { TrackInfo } from '../metadata/trackInfo';

export const lyricsStageProviders = ['isrc', 'paxsenix', 'lrclib', 'musixmatch', 'kugou', 'boidu'] as const;
export type LyricsStageProvider = typeof lyricsStageProviders[number];

export interface LyricsSearchContext {
  /** Set only for the current recording's selected, visible YouTube background. */
  backgroundVideoId?: string;
}

export interface LyricsQuery {
  number: number;
  label: string;
  title: string;
  artist?: string;
}

export interface LyricsSearchPlan {
  key: string;
  strategy: 'A' | 'B';
  audioSource: 'youtube' | 'local' | 'external' | 'stream';
  reason: string;
  originalTitle: string;
  originalArtist: string;
  filteredTitle: string;
  duration: number;
  stages: LyricsQuery[];
  artistHint?: string;
  backgroundVideoId?: string;
  sourceTrackId?: string;
}

export interface ProviderLyric {
  id: string;
  title?: string;
  artist?: string;
  duration?: number;
  source: string;
  sourceUrl?: string;
  lrc?: string;
  ttml?: string;
  plain?: string;
  structured?: unknown;
  instrumental?: boolean;
}

export interface LyricsSearchCandidate extends Omit<ProviderLyric, 'ttml' | 'structured'> {
  romanized?: string;
  quality: number;
  confidence: number;
  difference?: number;
  rejection?: string;
}

export interface LyricsStageReport {
  query: LyricsQuery;
  candidates: LyricsSearchCandidate[];
  failures: string[];
  notes?: string[];
  providerCounts?: Record<string,number>;
  selectedId?: string;
  selectionReason?: string;
  pending: boolean;
}

export interface LyricsSearchReport {
  plan: LyricsSearchPlan;
  stages: LyricsStageReport[];
  status: 'searching' | 'found' | 'empty' | 'failed' | 'cancelled';
  selected?: LyricsSearchCandidate;
  timestamp: number;
}

const invisibleFormatting = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const uploadDescriptor = /\b(?:official\s+(?:(?:music|lyric)\s+)?(?:video|audio)|music\s+video|(?:lyrics?|lyrical)\s+(?:video|song)|full\s+(?:video|song)|(?:video|audio)\s+song|visuali[sz]er|karaoke(?:\s+version)?|sing\s+along|teaser|trailer|promo|jukebox|[48]k|hd|hq|featuring|feat\.?|ft\.?|by)\b/i;
const versionWords = /\b(?:live|remix(?:ed)?|acoustic|unplugged|instrumental|karaoke|cover|sped\s+up|slowed|reverb|extended|radio\s+edit|demo|remaster(?:ed)?|reprise)\b/gi;
const versions = (value: string) => [...new Set((value.toLowerCase().match(versionWords) || []).map(word =>
  word.startsWith('remix') ? 'remix' : word.startsWith('remaster') ? 'remaster' : word
))].sort().join('|');

function comparable(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(invisibleFormatting, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function artistWords(value: string): string[] {
  return comparable(value).split(' ').filter(word => word.length > 1 && !/^(?:the|and|official|music|records|topic|vevo)$/.test(word));
}

function hasArtistWord(artist: string, context: string): boolean {
  const words = new Set(artistWords(context));
  return artistWords(artist).some(word => words.has(word));
}

function nearArtistWord(left: string, right: string): boolean {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 5 || longer.length - shorter.length > 1) return false;
  const firstDifference = [...shorter].findIndex((letter, index) => letter !== longer[index]);
  if (firstDifference < 0) return true;
  const skipped = shorter.length === longer.length ? 1 : 0;
  return shorter.slice(firstDifference + skipped) === longer.slice(firstDifference + 1);
}

function matchesArtistPrefix(prefix: string, context: string): boolean {
  if (hasArtistWord(prefix, context)) return true;
  const hints = artistWords(context);
  return artistWords(prefix).some(word => hints.some(hint => nearArtistWord(word, hint)));
}

function cleanArtist(value: string): string {
  const credit=value.replace(/\s*[-–—]\s*Topic\s*$/i, '').trim();
  return /^(?:unknown(?: artist)?|youtube|-+)$/i.test(credit)?'':credit;
}

function artistCredits(credit: string) {
  return cleanArtist(credit).split(/[,;]|\s+(?:[([]\s*)?(?:feat\.?|featuring|ft\.?)\s+|\s+[&/×x]\s+/i).map(part => part.trim()).filter(Boolean);
}

export function firstArtistWord(credit: string): string | undefined {
  const primary = artistCredits(credit)[0] || '';
  const words = primary.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  // Initials like A. R. Rahman are not artist search terms.
  return words.find(word => word.length > 1) || (words.length === 1 && !primary.includes('.') ? words[0] : undefined);
}

/** Remove upload packaging without touching the playback title or writing metadata. */
export function cleanTitleForLyrics(rawTitle: string, artistContext = ''): string {
  const visible = rawTitle.replace(invisibleFormatting, '').replace(/(?:^|\s)@[\p{L}\p{M}\p{N}_.-]+/gu, ' ').trim();
  const sections = visible.split(/\s*(?:\||\/\/)\s*|\s+[-–—]\s+/);
  const first = sections[0]?.trim() || '';
  const titleSection = sections[1] && matchesArtistPrefix(first, artistContext) ? sections[1] : first;
  const bracket = titleSection.search(/[([{]/);
  const descriptor = titleSection.search(uploadDescriptor);
  const cut = Math.min(bracket < 0 ? titleSection.length : bracket, descriptor < 0 ? titleSection.length : descriptor);
  let title = titleSection.slice(0, cut).replace(/^\s*[-–—]\s+/, '').replace(/[\s\-–—:|]+$/, '').trim();

  // Preserve explicit recording versions while stripping soundtrack/upload credits.
  if (bracket >= 0 && bracket === cut) {
    const version = titleSection.slice(bracket).match(/^[([{]([^\])}]+)[\])}]/);
    if (version && versions(version[1]) && !/\bkaraoke\b/i.test(version[1])) {
      title = [title, version[0]].filter(Boolean).join(' ');
    }
  }
  return title || visible || rawTitle.trim();
}

export function buildLyricsSearchPlan(
  track: TrackInfo,
  context: LyricsSearchContext = {},
): LyricsSearchPlan {
  const youtube = track.lyricsAudioSource === 'youtube' ||
    (track.lyricsAudioSource !== 'stream' && (track.provider === 'resolver' || track.provider === 'ytmusic'));
  const local = track.provider === 'local' || track.source === 'filename';
  const externalBackground = track.provider === 'external' && context.backgroundVideoId;
  const strategy = youtube || local || externalBackground ? 'A' : 'B';
  const reason = youtube ? 'Built-in YouTube audio' : local ? 'Local audio file'
    : externalBackground ? 'External audio with a selected YouTube background' : 'Original audio source metadata';
  const originalTitle = youtube ? track.videoTitle || track.title : track.title;
  const artistHint = youtube ? cleanArtist(track.artist) || cleanArtist(track.channelHint || '') : undefined;
  const artistCredit = cleanArtist(track.artist) ? track.artist : track.primaryArtist || '';
  const featured = track.featuredArtist?.trim();
  const originalArtist = featured && artistCredit && !artistCredits(artistCredit).some(name => comparable(name) === comparable(featured))
    ? artistCredit + ' feat. ' + featured : artistCredit;
  const audioSource = youtube ? 'youtube' : local ? 'local' : track.provider === 'external' ? 'external' : 'stream';
  const queryArtist = originalArtist || artistHint;
  const filteredTitle = cleanTitleForLyrics(originalTitle, [track.artist, youtube ? track.channelHint : ''].filter(Boolean).join(' '));
  const firstName = firstArtistWord(track.primaryArtist || queryArtist || '');
  const stages: LyricsQuery[] = [];
  const seen = new Set<string>();
  const add = (number: number, label: string, title: string, artist?: string) => {
    if (title.trim().length < 2) return;
    const key = JSON.stringify([title, artist]);
    if (seen.has(key)) return;
    seen.add(key);
    stages.push(artist ? { number, label, title, artist } : { number, label, title });
  };
  if (strategy === 'B') {
    add(1, 'Original title + full artist credits', originalTitle, queryArtist);
    if (firstName) add(2, 'Original title + primary artist first name', originalTitle, firstName);
    add(3, 'Filtered title + full artist credits', filteredTitle, queryArtist);
    if (firstName) add(4, 'Filtered title + primary artist first name', filteredTitle, firstName);
    add(5, 'Filtered title only', filteredTitle);
  } else {
    if (firstName) add(1, 'Filtered title + primary artist first word', filteredTitle, firstName);
    add(2, 'Filtered title only', filteredTitle);
  }
  const backgroundVideoId = externalBackground || undefined;
  const sourceTrackId = track.sourceTrackId;
  const key = JSON.stringify([strategy, audioSource, reason, backgroundVideoId, sourceTrackId, originalTitle, originalArtist, artistHint, filteredTitle, firstName]);
  return { key, strategy, audioSource, reason, originalTitle, originalArtist, filteredTitle, artistHint,
    duration: track.duration, backgroundVideoId, sourceTrackId, stages };
}

export function validateLyricsCandidate(
  candidate: ProviderLyric,
  plan: LyricsSearchPlan,
  query: LyricsQuery,
): { confidence: number; difference?: number; rejection?: string } {
  const difference = candidate.duration && plan.duration > 0 ? candidate.duration - plan.duration : undefined;
  const reject = (rejection: string) => ({ confidence: 0, difference, rejection });
  if (candidate.instrumental) return reject('Instrumental recording');
  if (!candidate.title?.trim()) return reject('Provider did not identify the recording title');
  if (versions(plan.originalTitle) !== versions(candidate.title)) return reject('Different recording version');

  const title = comparable(candidate.title);
  const cleaned = comparable(cleanTitleForLyrics(candidate.title, candidate.artist));
  if (title !== comparable(plan.originalTitle) && cleaned !== comparable(plan.filteredTitle)) {
    return reject('Different song title');
  }
  if (difference !== undefined && Math.abs(difference) > 5) return reject('Duration differs by more than 5 seconds');

  const artist = candidate.artist?.trim();
  if (!artist) return reject('Provider did not identify the artist');
  const expectedArtist = plan.audioSource === 'youtube' ? plan.artistHint : cleanArtist(plan.originalArtist);
  const verifiedCredits = artistCredits(expectedArtist || '').map(comparable);
  const matchingArtist = plan.audioSource === 'youtube'
    ? hasArtistWord(artist, expectedArtist || '')
    : verifiedCredits.some(credit => artistCredits(artist).some(name => comparable(name) === credit));
  const artistInTitle = hasArtistWord(artist, plan.originalTitle);
  if (plan.audioSource !== 'youtube' && expectedArtist && !matchingArtist) return reject('Different recording artist');
  if (!query.artist && plan.strategy === 'B' && plan.duration > 0 && difference === undefined) {
    return reject('Title-only result has no verifiable duration');
  }
  if (plan.strategy === 'A' && !query.artist && !artistInTitle) {
    return reject('No candidate artist word appears in the original title');
  }
  if (!matchingArtist && !artistInTitle && (query.artist || difference === undefined || Math.abs(difference) > 2)) {
    return reject('Artist or recording length could not be verified');
  }

  const confidence = matchingArtist && difference !== undefined ? 1 : matchingArtist || artistInTitle ? 0.9 : 0.75;
  return { confidence, difference };
}

export function isPreferredWordSync(candidate: LyricsSearchCandidate): boolean {
  return candidate.quality === 3 && candidate.difference !== undefined && Math.abs(candidate.difference) <= 2;
}

function timingPriority(candidate: LyricsSearchCandidate): number {
  if (isPreferredWordSync(candidate)) return 4;
  if (candidate.quality === 2) return 3;
  return candidate.quality === 3 ? 2 : candidate.quality;
}

/** Prefer verified word timing within two seconds, then the closest verified line timing. */
export function compareLyricCandidates(a: LyricsSearchCandidate, b: LyricsSearchCandidate): number {
  const durationDelta = (item: LyricsSearchCandidate) => item.difference === undefined ? Infinity : Math.abs(item.difference);
  return Number(Boolean(a.rejection)) - Number(Boolean(b.rejection)) ||
    Number(a.difference === undefined) - Number(b.difference === undefined) ||
    timingPriority(b) - timingPriority(a) || durationDelta(a) - durationDelta(b) ||
    (b.difference ?? 0) - (a.difference ?? 0) || b.confidence - a.confidence;
}
