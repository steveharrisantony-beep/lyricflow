import { cleanYouTubeTitleForLyrics } from '../lyrics/lyricFlowEngine';

/** Pure, replaceable track matching. Never treats a filename as verified metadata. */
export interface TrackInfo {
  title:string; artist:string; album:string; duration:number; fileName?:string; sourceTrackId?:string;
  source:'filename'|'manual'|'provider'; confidence:number;
  artwork?:string;
  provider?:'ytmusic'|'soundcloud'|'jiosaavn'|'audius'|'resolver'|'local'|'external';
  audioSource?:string;
  sourceUrl?:string;
  youtubeVideoId?:string;
  videoId?:string;
  videoTitle?:string;
  sponsorblockOffsetSec?:number;
  isAd?:boolean;
}

const LYRIC_VIDEO_PATTERN=/\b(?:lyrical|lyrics|lyric\s*video|official\s*lyric|with\s*lyrics|lyrical\s*video|lyrics\s*video)\b/i;
const AD_TITLE_EXACT_PATTERN=/^(?:advertisement|ad|ads|sponsored|spotify|spotify\s+free|audio\s*ad|video\s*ad|commercial|promoted|sponsored\s+message|learn\s+more|listen\s+now)(?:\s*[-·•:|]\s*.*)?$/i;
const AD_KEYWORD_PATTERN=/\b(?:advertisement|sponsored\s+by|audio\s+ad|video\s+ad|ad\s+break|commercial\s+break)\b/i;
const AD_ARTIST_PATTERN=/^(?:advertisement|sponsored|spotify|spotify\s+ad|audio\s+ad)$/i;

/**
 * Detects whether a track or external media notification is an advertisement (e.g., Spotify Free ads).
 * During advertisements, lyrics lookup and YouTube background video search are skipped and built-in themes are shown.
 */
export function isAdvertisementTrack(
 item?: {
  title?:string;
  artist?:string;
  album?:string;
  duration?:number;
  packageName?:string;
  appName?:string;
  audioSource?:string;
  isAd?:boolean;
 }|null
):boolean{
 if(!item)return false;
 if(item.isAd===true)return true;
 const title=(item.title||'').trim();
 const artist=(item.artist||'').trim();
 const album=(item.album||'').trim();
 const pkg=(item.packageName||'').toLowerCase();
 const app=(item.appName||'').toLowerCase();
 const src=(item.audioSource||'').toLowerCase();
 if(!title)return false;
 if(AD_TITLE_EXACT_PATTERN.test(title))return true;
 if(AD_KEYWORD_PATTERN.test(title)||AD_KEYWORD_PATTERN.test(album))return true;
 if(artist&&AD_ARTIST_PATTERN.test(artist)){
  if(title.toLowerCase()==='spotify'||title.toLowerCase()==='advertisement'||!album||/spotify|ad|sponsor/i.test(title)){
   return true;
  }
 }
 const isSpotify=pkg.includes('spotify')||app.includes('spotify')||src.includes('spotify');
 if(isSpotify){
  if(title.toLowerCase()==='spotify'||artist.toLowerCase()==='spotify')return true;
  const dur=typeof item.duration==='number'?item.duration:0;
  if(dur>0&&dur<=35&&(!artist||/^(?:spotify|advertisement|sponsored)$/i.test(artist)))return true;
 }
 return false;
}

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
 * Returns true ONLY when the text contains at least one valid [mm:ss.xx] LRC line timestamp.
 */
export function hasValidLrcTimestamps(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(text);
}

/**
 * Prepares a TrackInfo for lyrics lookup:
 * - When `rawOverride` is true (e.g. Manual Search with bracket filter override), preserves the exact user-entered
 *   `track.title`, `track.artist`, and `track.album` without stripping brackets `(...)`/`[...]` or using `videoTitle`.
 * - For YouTube-sourced tracks (`provider === 'resolver'` or `youtubeVideoId` present) in automatic mode:
 *   cleans noisy YouTube titles (`@handle`, brackets `(...)`/`[...]` and everything after, pipes `|`)
 *   and skips `artist` and `album` because YouTube channel names are unreliable as artist names.
 * - For JioSaavn / local tracks in automatic mode: cleans any `@handle` or bracket suffixes on the title while preserving artist/album.
 */
export function normalizeTrackForLyricsLookup(track: TrackInfo, rawOverride = false): TrackInfo {
  if (rawOverride) {
    return {
      ...track,
      title: track.title.trim(),
      videoTitle: track.title.trim(),
      artist: track.artist.trim(),
      album: track.album.trim(),
    };
  }
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
  plainLyrics?: string;
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
  sourceLabel?: string;
  provider?: string;
}
export interface SearchRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
  plainLyrics?: string | null;
  hasSynced?: boolean;
  hasWordSync?: boolean;
}
export function rankCandidate(track: TrackInfo, candidate: SearchRecord, rawOverride = false): TrackCandidate {
  const isYt = !rawOverride && (track.provider === 'resolver' || Boolean(track.youtubeVideoId));
  const t = normalizeTrack(rawOverride ? track.title : cleanYouTubeTitleForLyrics(track.title));
  const c = normalizeTrack(
    rawOverride ? candidate.trackName : cleanYouTubeTitleForLyrics(candidate.trackName) || candidate.trackName
  );
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
        : overlap >= (rawOverride ? 0.45 : 0.65)
          ? 0.68 * overlap
          : rawOverride && (c.includes(t) || t.includes(c)) && Math.min(t.length, c.length) >= 3
            ? 0.55
            : 0;

  let confidence = titleConfidence;
  const validSynced = hasValidLrcTimestamps(candidate.syncedLyrics) || Boolean(candidate.hasSynced && !candidate.syncedLyrics);

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
      if (!isYt && !rawOverride) {
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
        } else if (candidate.duration > track.duration + 60 && !rawOverride) {
          confidence -= 0.12;
        }
      }
    }
    if (validSynced) confidence += 0.04;
    if (candidate.hasWordSync && validSynced) confidence += 0.04;
    if (candidate.instrumental) confidence -= 0.08;
  }
  return {
    syncedLyrics: validSynced && candidate.syncedLyrics ? candidate.syncedLyrics : undefined,
    plainLyrics: candidate.plainLyrics || undefined,
    id: candidate.id,
    title: candidate.trackName,
    artist: candidate.artistName,
    album: candidate.albumName,
    duration: candidate.duration,
    hasSynced: validSynced,
    hasWordSync: Boolean(candidate.hasWordSync && validSynced),
    instrumental: candidate.instrumental,
    url: 'https://lrclib.net/api/get/' + candidate.id,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

