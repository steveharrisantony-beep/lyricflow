import { cleanYouTubeTitleForLyrics } from '../lyrics/lyricFlowEngine';

/** Pure, replaceable track matching. Never treats a filename as verified metadata. */
export interface TrackInfo {
  title:string; artist:string; album:string; duration:number; fileName?:string;
  source:'filename'|'manual'|'provider'; confidence:number;
  artwork?:string;
  provider?:'ytmusic'|'soundcloud'|'jiosaavn'|'audius'|'resolver'|'local';
  audioSource?:string;
  sourceUrl?:string;
  youtubeVideoId?:string;
  videoId?:string;
  videoTitle?:string;
  sponsorblockOffsetSec?:number;
}

const LYRIC_VIDEO_PATTERN=/\b(?:lyrical|lyrics|lyric\s*video|official\s*lyric|with\s*lyrics|lyrical\s*video|lyrics\s*video)\b/i;

/**
 * Extracts an 11-character YouTube video ID from a TrackInfo or SongResult if the source is YouTube.
 */
export function extractYouTubeVideoId(
 item?: {
  id?:string;
  provider?:string;
  sourceUrl?:string;
  youtubeVideoId?:string;
 }|null
):string|null{
 if(!item)return null;
 if(typeof item.youtubeVideoId==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(item.youtubeVideoId.trim())){
  return item.youtubeVideoId.trim();
 }
 if(typeof item.id==='string'){
  if(item.id.startsWith('yt_')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id.slice(3))){
   return item.id.slice(3);
  }
  if(item.id.startsWith('ytm_')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id.slice(4))){
   return item.id.slice(4);
  }
  if((item.provider==='resolver'||item.provider==='youtube')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id)){
   return item.id;
  }
 }
 if(typeof item.sourceUrl==='string'&&item.sourceUrl){
  const m=item.sourceUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if(m?.[1])return m[1];
 }
 return null;
}

/**
 * Detects whether a currently playing video already contains embedded lyrics
 * by searching for terms like "lyrical", "lyrics", or "lyric video" in its metadata.
 */
export function isLyricVideoTrack(
 track?: {
  title?:string;
  videoTitle?:string;
  artist?:string;
  album?:string;
 }|null
):boolean{
 if(!track)return false;
 const combined=[track.videoTitle,track.title,track.album,track.artist]
  .filter(Boolean)
  .join(' ');
 return LYRIC_VIDEO_PATTERN.test(combined);
}

/**
 * Prepares a TrackInfo for lyrics lookup:
 * - For YouTube-sourced tracks (`provider === 'resolver'` or `youtubeVideoId` present):
 *   cleans noisy YouTube titles (`@handle`, brackets `(...)`/`[...]` and everything after, pipes `|`)
 *   and skips `artist` and `album` because YouTube channel names are unreliable as artist names.
 * - For JioSaavn / local tracks: cleans any `@handle` or bracket suffixes on the title while preserving artist/album.
 */
export function normalizeTrackForLyricsLookup(track: TrackInfo): TrackInfo {
 const isYt = track.provider === 'resolver' || Boolean(track.youtubeVideoId);
 const rawOriginalTitle = track.videoTitle || track.title;
 const cleanedTitle = cleanYouTubeTitleForLyrics(rawOriginalTitle, isYt ? track.artist : '');
 if (isYt) {
  return {
   ...track,
   title: cleanedTitle || track.title.trim(),
   videoTitle: rawOriginalTitle,
   artist: '',
   album: '',
  };
 }
 return {
  ...track,
  title: cleanedTitle || stripTags(track.title),
  videoTitle: rawOriginalTitle,
  artist: stripTags(track.artist),
  album: stripTags(track.album),
 };
}

const stripTags=(text:string)=>text
 .replace(/\.(mp3|m4a|aac|wav|flac|ogg)$/i,'')
 .replace(/\b(?:mp3[_ -]?(?:128|192|256|320)k?|(?:128|192|256|320)kbps|lossless|hi[- ]?res|official(?: music)? video|official audio|lyric video|lyrical video|lyrical|audio song|full song|4k|hq)\b/gi,' ')
 .replace(/[\[\](){}]/g,' ')
 .replace(/[_]+/g,' ')
 .replace(/\s+/g,' ').trim();
export function parseTrackFilename(filename:string):TrackInfo {
 const clean=stripTags(filename);
 const parts=clean.split(/\s+[-–—]\s+/).filter(Boolean);
 const artist=parts.length>=2?parts[0]:'';
 const title=parts.length>=2?parts.slice(1).join(' - '):clean;
 return {title,artist,album:'',duration:0,fileName:filename,provider:'local',audioSource:`Local Audio File (${filename})`,source:'filename',confidence:parts.length>=2?0.55:0.20};
}
export function normalizeTrack(text:string){
 return text.toLocaleLowerCase().normalize('NFKD')
  .replace(/\b(feat|ft|featuring|remastered|official|version|from|lyrical|lyrics|lyric video)\b.*$/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export interface TrackCandidate {
  syncedLyrics?: string;
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  instrumental: boolean;
  hasSynced: boolean;
  hasWordSync: boolean;
  url: string;
  confidence: number;
}
export interface SearchRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
  hasSynced?: boolean;
  hasWordSync?: boolean;
}
export function rankCandidate(track: TrackInfo, candidate: SearchRecord): TrackCandidate {
  const isYt = track.provider === 'resolver' || Boolean(track.youtubeVideoId);
  const t = normalizeTrack(cleanYouTubeTitleForLyrics(track.title));
  const c = normalizeTrack(cleanYouTubeTitleForLyrics(candidate.trackName) || candidate.trackName);
  const a = isYt ? '' : normalizeTrack(track.artist);
  const ca = normalizeTrack(candidate.artistName);
  const calb = normalizeTrack(candidate.albumName);
  const words = (s: string) => new Set(s.split(' ').filter(Boolean));
  const target = words(t);
  const found = words(c);
  let common = 0;
  for (const w of target) if (found.has(w)) common++;
  const overlap = common / Math.max(1, Math.max(target.size, found.size));

  // Strict title matching gate so wrong/unrelated songs get 0 confidence even if artist/duration match
  const titleConfidence =
    t === c && t !== ''
      ? 0.78
      : (c.startsWith(t + ' ') || t.startsWith(c + ' ')) && Math.min(t.length, c.length) >= 3
        ? 0.70
        : overlap >= 0.65
          ? 0.68 * overlap
          : 0;

  let confidence = titleConfidence;

  if (titleConfidence > 0) {
    if (a) {
      confidence += a === ca ? 0.16 : ca.includes(a) || a.includes(ca) ? 0.06 : 0;
    } else if (isYt) {
      // Post-search candidate matching: match candidate artist & album names against the full raw video title
      const rawContext = normalizeTrack(`${track.videoTitle || track.title}`);
      const rawCompact = rawContext.replace(/\s+/g, '');
      const rawWords = words(rawContext);
      const artistTokens = [...words(ca)].filter(w => w.length >= 2 && !target.has(w));
      if (artistTokens.length > 0) {
        let matchedArtist = 0;
        for (const tok of artistTokens) {
          if (rawWords.has(tok) || (tok.length >= 4 && rawCompact.includes(tok))) matchedArtist++;
        }
        const joinedArtist = artistTokens.join('');
        if (joinedArtist.length >= 5 && rawCompact.includes(joinedArtist)) {
          matchedArtist = artistTokens.length;
        }
        if (matchedArtist > 0) {
          confidence += 0.10 + 0.12 * (matchedArtist / artistTokens.length);
        }
      }
      const albumTokens = [...words(calb)].filter(w => w.length >= 2 && !target.has(w) && w !== 'single');
      if (albumTokens.length > 0) {
        let matchedAlbum = 0;
        for (const tok of albumTokens) {
          if (rawWords.has(tok) || (tok.length >= 4 && rawCompact.includes(tok))) matchedAlbum++;
        }
        if (matchedAlbum > 0) {
          confidence += 0.05 + 0.06 * (matchedAlbum / albumTokens.length);
        }
      }
    }

    if (track.duration > 0 && candidate.duration > 0) {
      const delta = Math.abs(track.duration - candidate.duration);
      if (!isYt) {
        confidence +=
          delta <= 2
            ? 0.16
            : delta <= 5
              ? 0.11
              : delta <= 10
                ? 0.05
                : delta > 25
                  ? -0.18
                  : 0;
      } else {
        if (candidate.duration <= track.duration + 15 && candidate.duration >= 60) {
          confidence += delta <= 12 ? 0.10 : delta <= 60 ? 0.06 : 0.03;
        } else if (candidate.duration > track.duration + 60) {
          confidence -= 0.12;
        }
      }
    }
    if (candidate.hasSynced || Boolean(candidate.syncedLyrics)) confidence += 0.04;
    if (candidate.hasWordSync) confidence += 0.04;
    if (candidate.instrumental) confidence -= 0.08;
  }
  return {
    syncedLyrics: candidate.syncedLyrics || undefined,
    id: candidate.id,
    title: candidate.trackName,
    artist: candidate.artistName,
    album: candidate.albumName,
    duration: candidate.duration,
    hasSynced: Boolean(candidate.syncedLyrics),
    hasWordSync: Boolean(candidate.hasWordSync),
    instrumental: candidate.instrumental,
    url: 'https://lrclib.net/api/get/' + candidate.id,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
