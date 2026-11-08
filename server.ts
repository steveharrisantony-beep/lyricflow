import {convertTtmlToEnhancedLrc} from './src/lyrics/ttml';
import {hasWordTiming} from './src/lyrics/lyricsQuality';
import { LYRICS_USER_AGENT, searchLrcRedRecordings, searchLyricsStageProvider } from './server/lyricsStage';
import { lyricsStageProviders, type LyricsStageProvider } from './src/lyrics/searchPlan';
import {searchMusicVideos,mergeVideoMetadata,hydrateVideoMetadata,VideoSearchCache,youtubeViews} from './server/youtubeSearch';
import {AUTO_VIDEO_ATTEMPT_LIMIT} from './src/music/videoMatching';
import {backgroundVideoQuery} from './src/music/backgroundQuery';
import {fetchYouTubeCaptions,CaptionFetchError} from './server/youtubeCaptions';
import {buildYouTubeAuthHeaders,verifyYouTubeAccount,type YouTubeAuthContext} from './server/youtubeAuth';
import express, { type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import dns from 'node:dns';
import nodeHttp, { type Server } from 'node:http';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Match Stash LyricsDns.kt: prefer IPv4 first to avoid IPv6 blackholes on lyrics.paxsenix.org, lrc.red, etc.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported in environment
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TrackMetadata {
  id: string;
  rawId: string;
  provider: 'ytmusic' | 'soundcloud' | 'jiosaavn' | 'audius' | 'youtube';
  title: string;
  videoTitle?: string;
  artist: string;
  primaryArtist?: string;
  featuredArtist?: string;
  album: string;
  duration: number;
  sourceUrl: string;
  artwork?: string;
  audioSource?: string;
  videoType?: 'ATV' | 'OMV' | 'UGC';
  viewCount?: number;
  channelId?:string;channelVerified?:boolean;uploaderName?:string;artistCredits?:string[];artistChannelIds?:string[];
  counterpartOf?:string;catalogueTitle?:string;catalogueArtists?:string[];catalogueAlbum?:string;embeddable?:boolean;
  visualContent?:'motion'|'static'|'unknown';metadataSource?:'ytmusic'|'innertube'|'mirror'|'oembed';
  encryptedMediaUrl?: string;
  transcodings?: Array<{
    url?: string;
    snipped?: boolean;
    format?: { protocol?: string; mime_type?: string };
  }>;
}

interface StreamCacheEntry {
  url: string;
  format: 'audio' | 'hls' | 'youtube';
  audioSource?: string;
  youtubeVideoId?: string;
  track?: TrackMetadata;
  createdAt: number;
}

export interface ServerLyricsResponse {
  ttml?: string;
  lrc?: string;
  plain?: string;
  source: string;
  sourceUrl?: string;
  title?: string;
  artist?: string;
  duration?: number;
  hasWordSync: boolean;
  subtitleTracks?: Array<{
    id: string;
    languageCode: string;
    label: string;
    lrc: string;
    lineCount: number;
  }>;
}

const trackMetaCache = new Map<string, TrackMetadata>();
const streamCache = new Map<string, StreamCacheEntry>();
const lyricsCache = new Map<string, { data: ServerLyricsResponse; createdAt: number }>();
const MAX_CACHE_SIZE = 500;

function setStreamCache(key: string, entry: StreamCacheEntry) {
  if (streamCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = streamCache.keys().next().value;
    if (oldestKey) streamCache.delete(oldestKey);
  }
  streamCache.set(key, entry);
}

function setTrackMetaCache(key: string, meta: TrackMetadata) {
  if (trackMetaCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = trackMetaCache.keys().next().value;
    if (oldestKey) trackMetaCache.delete(oldestKey);
  }
  trackMetaCache.set(key, meta);
}

function setLyricsCache(key: string, data: ServerLyricsResponse):ServerLyricsResponse {
  const previous=lyricsCache.get(key);
  if(previous&&Date.now()-previous.createdAt<30*60_000&&previous.data.hasWordSync&&!data.hasWordSync)return previous.data;
  if (lyricsCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey) lyricsCache.delete(oldestKey);
  }
  lyricsCache.set(key, { data, createdAt: Date.now() });
  return data;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&');
}

function parseDurationText(value: string): number {
  if (!value || !/^\d+(?::\d+)+$/.test(value.trim())) return 0;
  return value
    .trim()
    .split(':')
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

function parseViewCountFromRenderer(vr:Record<string,unknown>):number|undefined {
  return youtubeViews(vr.viewCountText)||youtubeViews(vr.shortViewCountText);
}
function rendererChannelId(renderer:Record<string,unknown>):string|undefined {
  for(const field of [renderer.ownerText,renderer.longBylineText,renderer.shortBylineText]){
    const runs=(field&&typeof field==='object')?(field as Record<string,unknown>).runs:null;
    if(!Array.isArray(runs))continue;
    for(const run of runs){
      const endpoint=run?.navigationEndpoint?.browseEndpoint?.browseId;
      if(typeof endpoint==='string'&&endpoint.startsWith('UC'))return endpoint;
    }
  }
  const thumbnail=renderer.channelThumbnailSupportedRenderers as {channelThumbnailWithLinkRenderer?:{navigationEndpoint?:{browseEndpoint?:{browseId?:unknown}}}}|undefined;
  const id=thumbnail?.channelThumbnailWithLinkRenderer?.navigationEndpoint?.browseEndpoint?.browseId;
  return typeof id==='string'&&id.startsWith('UC')?id:undefined;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const STASH_ANDROID_UA = 'Stash/1.0.0 (Android)';

// JioSaavn requires an Indian client IP header to unlock the full global & Indian original catalog
// instead of returning third-party covers/nightcore on non-Indian Cloud Run regions.
const SAAVN_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
  'X-Forwarded-For': '49.36.128.1',
  'CF-Connecting-IP': '49.36.128.1',
  'True-Client-IP': '49.36.128.1',
};

// ============================================================================
// 1. JIOSAAVN FULL-TRACK SEARCH & 320KBPS STREAM RESOLVER
// ============================================================================
function jioSaavnArtistCredits(info: Record<string, unknown>) {
  const map = info.artistMap && typeof info.artistMap === 'object'
    ? info.artistMap as Record<string, unknown>
    : {};
  const names = (key: 'primary_artists' | 'featured_artists') => {
    const entries = map[key] ?? info[key];
    const list = Array.isArray(entries) ? entries : typeof entries === 'string' ? entries.split(/[,;]/) : [];
    return list.map(entry => {
      const name = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).name : entry;
      return typeof name === 'string' ? decodeHtmlEntities(name).trim() : '';
    }).filter(Boolean);
  };
  const primary = names('primary_artists');
  return { artistNames: primary.join(', '), primaryArtist: primary[0], featuredArtist: names('featured_artists')[0] };
}

async function searchJioSaavn(query: string, limit = 12): Promise<TrackMetadata[]> {
  const url =
    'https://www.jiosaavn.com/api.php?' +
    new URLSearchParams({
      __call: 'search.getResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'web6dot0',
      n: String(Math.max(limit * 2, 24)),
      p: '1',
      q: query.trim(),
    }).toString();

  const res = await fetch(url, {
    headers: SAAVN_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const results = Array.isArray(data.results) ? data.results : [];
  const tracks: TrackMetadata[] = [];

  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const rawId = String(item.id || '').trim();
    const rawTitle = decodeHtmlEntities(String(item.title || item.song || '').trim());
    if (!rawId || !rawTitle) continue;

    const moreInfo =
      item.more_info && typeof item.more_info === 'object'
        ? (item.more_info as Record<string, unknown>)
        : {};
    const encryptedMediaUrl = String(moreInfo.encrypted_media_url || '').trim();
    if (!encryptedMediaUrl) continue;

    const duration = Number(moreInfo.duration || item.duration || 0);
    // Exclude 30-second ringtones or preview clips
    if (duration > 0 && duration < 45) continue;

    const {artistNames,primaryArtist,featuredArtist} = jioSaavnArtistCredits(moreInfo);
    const artist = artistNames || decodeHtmlEntities(String(moreInfo.music || item.subtitle || 'Unknown artist'));
    const album = decodeHtmlEntities(String(moreInfo.album || item.album || ''));
    const artwork = String(item.image || '')
      .replace('150x150', '500x500')
      .replace('50x50', '500x500');
    const sourceUrl = String(item.perma_url || 'https://www.jiosaavn.com');

    const trackId = `saavn_${rawId.replace(/[^\w-]/g, '')}`;
    const meta: TrackMetadata = {
      id: trackId,
      rawId,
      provider: 'jiosaavn',
      title: rawTitle,
      artist,
      primaryArtist,
      featuredArtist,
      album,
      duration: Number.isFinite(duration) ? duration : 0,
      sourceUrl,
      artwork: artwork || undefined,
      encryptedMediaUrl,
    };
    setTrackMetaCache(trackId, meta);
    tracks.push(meta);
    if (tracks.length >= limit) break;
  }

  return tracks;
}

function jioSaavnVariantUrl(url: string, kbps: string): string {
  const safe = url.trim().replace(/^http:\/\//i, 'https://');
  return safe.replace(/_(?:96|160|320)(?=\.(?:mp4|m4a)(?:\?|$))/i, `_${kbps}`);
}

async function isStreamUrlPlayable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Range: 'bytes=0-0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
    });
    const ok = res.status === 200 || res.status === 206;
    res.body?.cancel().catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

async function resolveJioSaavnStreamUrl(encryptedMediaUrl: string): Promise<string | null> {
  for (const bitrate of ['320', '160', '96']) {
    try {
      const authApi =
        'https://www.jiosaavn.com/api.php?' +
        new URLSearchParams({
          __call: 'song.generateAuthToken',
          _format: 'json',
          _marker: '0',
          api_version: '4',
          ctx: 'web6dot0',
          bitrate,
          url: encryptedMediaUrl,
        }).toString();

      const res = await fetch(authApi, {
        headers: SAAVN_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { auth_url?: string };
      if (!data.auth_url) continue;
      const parsed = new URL(data.auth_url);
      const baseCdnUrl = `https://aac.saavncdn.com${parsed.pathname}`;

      // Probe 320 -> 160 -> 96 variants just like Stash JioSaavnClient.kt
      for (const variantBitrate of [bitrate, '320', '160', '96']) {
        const candidateUrl = jioSaavnVariantUrl(baseCdnUrl, variantBitrate);
        if (await isStreamUrlPlayable(candidateUrl)) {
          return candidateUrl;
        }
      }
      return baseCdnUrl;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchJioSaavnTrackById(rawId: string): Promise<TrackMetadata | null> {
  const url =
    'https://www.jiosaavn.com/api.php?' +
    new URLSearchParams({
      __call: 'song.getDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'web6dot0',
      pids: rawId,
    }).toString();
  const res = await fetch(url, {
    headers: SAAVN_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const songs = Array.isArray(data.songs) ? data.songs : Object.values(data);
  const item = songs.find(s => s && typeof s === 'object') as Record<string, unknown> | undefined;
  if (!item) return null;
  const moreInfo =
    item.more_info && typeof item.more_info === 'object'
      ? (item.more_info as Record<string, unknown>)
      : {};
  const encryptedMediaUrl = String(moreInfo.encrypted_media_url || item.encrypted_media_url || '').trim();
  if (!encryptedMediaUrl) return null;

  const {artistNames,primaryArtist,featuredArtist} = jioSaavnArtistCredits(moreInfo);

  const trackId = `saavn_${rawId.replace(/[^\w-]/g, '')}`;
  const meta: TrackMetadata = {
    id: trackId,
    rawId,
    provider: 'jiosaavn',
    title: decodeHtmlEntities(String(item.title || item.song || 'Unknown title')),
    artist: artistNames || decodeHtmlEntities(String(moreInfo.primary_artists || item.primary_artists || item.subtitle || 'Unknown artist')),
    primaryArtist,
    featuredArtist,
    album: decodeHtmlEntities(String(moreInfo.album || item.album || '')),
    duration: Number(moreInfo.duration || item.duration || 0),
    sourceUrl: String(item.perma_url || 'https://www.jiosaavn.com'),
    artwork: String(item.image || '').replace('150x150', '500x500') || undefined,
    encryptedMediaUrl,
  };
  setTrackMetaCache(trackId, meta);
  return meta;
}

// ============================================================================
// 2. SOUNDCLOUD FULL-TRACK SEARCH & STREAM RESOLVER (EXCLUDING 30S SNIPS)
// ============================================================================
let cachedScClientId = '3GKD969NJWD1eB6gvQJN0GnueYbcWszv';
let scClientIdFetchedAt = 0;

async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedScClientId && now - scClientIdFetchedAt < 3600_000) {
    return cachedScClientId;
  }
  try {
    const home = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.text());
    const scriptUrls = [...home.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(
      m => m[1]
    );
    for (const scriptUrl of scriptUrls.slice(-4).reverse()) {
      const js = await fetch(scriptUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      }).then(r => r.text());
      const match = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
      if (match?.[1]) {
        cachedScClientId = match[1];
        scClientIdFetchedAt = now;
        return cachedScClientId;
      }
    }
  } catch {
    // Keep existing fallback client_id
  }
  return cachedScClientId;
}

async function searchSoundCloud(query: string, limit = 12): Promise<TrackMetadata[]> {
  let clientId = await getSoundCloudClientId(false);
  const buildUrl = (cid: string) =>
    'https://api-v2.soundcloud.com/search/tracks?' +
    new URLSearchParams({
      q: query.trim(),
      client_id: cid,
      limit: '35',
    }).toString();

  let res = await fetch(buildUrl(clientId), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) {
    clientId = await getSoundCloudClientId(true);
    res = await fetch(buildUrl(clientId), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  }
  if (!res.ok) return [];

  const data = (await res.json()) as { collection?: Array<Record<string, unknown>> };
  const collection = Array.isArray(data.collection) ? data.collection : [];
  const tracks: TrackMetadata[] = [];

  for (const item of collection) {
    if (!item || typeof item !== 'object') continue;
    const rawId = String(item.id || '').trim();
    const title = String(item.title || '').trim();
    if (!rawId || !title) continue;

    // Strictly filter out 30-second Go+ SNIP previews and blocked tracks
    const policy = String(item.policy || '').toUpperCase();
    if (policy === 'SNIP' || policy === 'BLOCK' || item.streamable === false) continue;

    const durMs = Number(item.duration || 0);
    const fullDurMs = Number(item.full_duration || durMs);
    if (durMs < 45_000) continue;
    if (fullDurMs > durMs + 2000) continue;

    const media =
      item.media && typeof item.media === 'object'
        ? (item.media as { transcodings?: TrackMetadata['transcodings'] })
        : {};
    const transcodings = Array.isArray(media.transcodings)
      ? media.transcodings.filter(tr => tr && !tr.snipped && tr.url)
      : [];
    if (transcodings.length === 0) continue;

    const user =
      item.user && typeof item.user === 'object' ? (item.user as Record<string, unknown>) : {};
    const pubMeta =
      item.publisher_metadata && typeof item.publisher_metadata === 'object'
        ? (item.publisher_metadata as Record<string, unknown>)
        : {};
    const artist = String(pubMeta.artist || user.username || user.full_name || 'Unknown artist');
    const album = String(pubMeta.album_title || '');
    const artwork = String(item.artwork_url || user.avatar_url || '').replace('-large', '-t500x500');
    const sourceUrl = String(item.permalink_url || 'https://soundcloud.com');

    const trackId = `sc_${rawId.replace(/[^\w-]/g, '')}`;
    const meta: TrackMetadata = {
      id: trackId,
      rawId,
      provider: 'soundcloud',
      title,
      artist,
      album,
      duration: Math.round(durMs / 1000),
      sourceUrl,
      artwork: artwork || undefined,
      transcodings,
    };
    setTrackMetaCache(trackId, meta);
    tracks.push(meta);
    if (tracks.length >= limit) break;
  }

  return tracks;
}

async function resolveSoundCloudStream(
  meta: TrackMetadata
): Promise<{ url: string; format: 'audio' | 'hls' } | null> {
  let clientId = await getSoundCloudClientId(false);
  let transcodings = meta.transcodings || [];

  if (transcodings.length === 0) {
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(meta.rawId)}?client_id=${encodeURIComponent(clientId)}`,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (trackRes.ok) {
      const item = (await trackRes.json()) as Record<string, unknown>;
      const media =
        item.media && typeof item.media === 'object'
          ? (item.media as { transcodings?: TrackMetadata['transcodings'] })
          : {};
      transcodings = Array.isArray(media.transcodings)
        ? media.transcodings.filter(tr => tr && !tr.snipped && tr.url)
        : [];
    }
  }

  // Prefer progressive HTTP stream first for instant playback & seeking, then non-snipped HLS
  const progressive = transcodings.find(
    tr => !tr.snipped && tr.format?.protocol === 'progressive' && tr.url
  );
  const hlsMpeg = transcodings.find(
    tr =>
      !tr.snipped &&
      tr.format?.protocol === 'hls' &&
      (tr.format?.mime_type?.includes('mpeg') || tr.format?.mime_type?.includes('mp4')) &&
      tr.url
  );
  const chosen = progressive || hlsMpeg || transcodings.find(tr => !tr.snipped && tr.url);
  if (!chosen?.url) return null;

  const sep = chosen.url.includes('?') ? '&' : '?';
  const resolveRes = await fetch(`${chosen.url}${sep}client_id=${encodeURIComponent(clientId)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resolveRes.ok) return null;
  const payload = (await resolveRes.json()) as { url?: string };
  if (!payload.url) return null;

  const isHls = chosen.format?.protocol === 'hls' || payload.url.includes('.m3u8');
  return { url: payload.url, format: isHls ? 'hls' : 'audio' };
}

// ============================================================================
// 3. YOUTUBE MUSIC & YOUTUBE SEARCH + STASH MATCH SCORER (JioSaavnMatcher.kt)
// ============================================================================
// Ported directly from Stash JioSaavnMatcher.kt & MatchScorer.kt:
// Whole-word version marker patterns so "Alive" doesn't match "live" and "Deluxe Edition" doesn't match "edit"
const VERSION_MARKERS: Record<string, RegExp> = {
  karaoke: /\b(?:karaoke|instrumental|backing track)\b/i,
  cover: /\b(?:cover|tribute)\b/i,
  live: /\b(?:live|concert)\b/i,
  remix: /\b(?:remix|mix|vip|bootleg|flip|edit|rework|refix|extended|mashup|lofi|lo-fi)\b/i,
  acoustic: /\b(?:acoustic|unplugged|stripped|piano version|guitar version)\b/i,
  sped: /\b(?:sped up|nightcore)\b/i,
  slowed: /\b(?:slowed|reverb|chopped|screwed|8d|bass boosted)\b/i,
};

const SAFE_EDITION_PHRASES =
  /\b(?:deluxe|expanded|anniversary|special|collector'?s?|remastered|remaster|single|album|original)\s+(?:edition|version|mix|release)\b/gi;

function versionSignature(title: string): Set<string> {
  const cleaned = title.replace(SAFE_EDITION_PHRASES, ' ');
  const found = new Set<string>();
  for (const [tag, regex] of Object.entries(VERSION_MARKERS)) {
    if (regex.test(cleaned)) {
      found.add(tag);
    }
  }
  return found;
}

function sameVersionSignature(a: string, b: string): boolean {
  const sigA = versionSignature(a);
  const sigB = versionSignature(b);
  if (sigA.size !== sigB.size) return false;
  for (const item of sigA) {
    if (!sigB.has(item)) return false;
  }
  return true;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*[-–]\s*topic$/i, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(?:feat\.?|ft\.?|featuring|official|video|audio|lyrics|hd|hq|4k|vevo)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function artistTokens(artist: string): string[] {
  return artist
    .toLowerCase()
    .replace(/\s*[-–]\s*topic$/i, '')
    .split(/[,&/;x•·]|(?:\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b)/i)
    .map(part =>
      part
        .replace(/\b(?:official|vevo|topic|music|channel)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(part => part.length >= 2);
}

function hasArtistOverlap(artistA: string, artistB: string): boolean {
  const tokensA = artistTokens(artistA);
  const tokensB = artistTokens(artistB);
  if (!tokensA.length || !tokensB.length) return false;
  return tokensA.some(a =>
    tokensB.some(b => a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)))
  );
}

function scoreCandidateMatch(target: TrackMetadata, cand: TrackMetadata): number {
  const targetCleanTitle = normalizeText(target.title);
  const candCleanTitle = normalizeText(cand.title);
  if (!targetCleanTitle || !candCleanTitle) return -100;

  let score = 0;

  // 1. Version signature guard (Stash JioSaavnMatcher.kt: reject unrequested remix/cover/slowed/karaoke)
  const targetSigStr = `${target.title} ${target.artist}`;
  const candSigStr = `${cand.title} ${cand.album}`;
  if (!sameVersionSignature(targetSigStr, candSigStr)) {
    score -= 110;
  }

  // 2. Title alignment
  if (candCleanTitle === targetCleanTitle) {
    score += 65;
  } else if (
    candCleanTitle.startsWith(targetCleanTitle) ||
    targetCleanTitle.startsWith(candCleanTitle)
  ) {
    score += 38;
  } else if (
    candCleanTitle.includes(targetCleanTitle) ||
    targetCleanTitle.includes(candCleanTitle)
  ) {
    score += 20;
  } else {
    return -100;
  }

  // 3. Artist alignment (Stash ArtistMatching.kt)
  if (hasArtistOverlap(target.artist, `${cand.artist} ${cand.title}`)) {
    score += 55;
  } else {
    score -= 50;
  }

  // 4. Duration proximity (Stash MatchScorer.kt: <= 2s ideal, <= 5s strong, > 15s penalized)
  if (target.duration > 0 && cand.duration > 0) {
    const diff = Math.abs(target.duration - cand.duration);
    if (diff <= 2) score += 35;
    else if (diff <= 5) score += 25;
    else if (diff <= 10) score += 12;
    else if (diff <= 20) score -= 10;
    else score -= 60;
  }

  return score;
}

let serverYouTubeAuth: YouTubeAuthContext = {
  accessToken: process.env.YOUTUBE_ACCESS_TOKEN || '',
  cookie: process.env.YOUTUBE_COOKIE || '',
};

function extractRequestYouTubeAuth(req?: Request): YouTubeAuthContext {
  const headerToken = req
    ? String(req.headers['x-youtube-token'] || '').trim().replace(/^Bearer\s+/i, '')
    : '';
  const headerCookie = req ? String(req.headers['x-youtube-cookie'] || '').trim() : '';
  return {
    accessToken: headerToken || serverYouTubeAuth.accessToken || '',
    cookie: headerCookie || serverYouTubeAuth.cookie || '',
  };
}

function extractDirectVideoIdFromQuery(query: string): string | null {
  const q = query.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(q)) return q;
  const match = q.match(
    /(?:youtube\.com\/(?:watch\?.*?\bv=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match?.[1] || null;
}

async function resolveDirectYouTubeVideoQuery(videoId: string): Promise<TrackMetadata | null> {
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (oembedRes.ok) {
      const data = (await oembedRes.json()) as { title?: string; author_name?: string };
      const title = decodeHtmlEntities(String(data.title || '').trim());
      const author = decodeHtmlEntities(String(data.author_name || 'YouTube').trim());
      if (title) {
        const trackId = validId ? `yt_${videoId}` : `candidate:${tracks.length}`;
        const meta: TrackMetadata = {
          id: trackId,
          rawId: videoId,
          provider: 'youtube',
          title,
          artist: author.replace(/\s*[-–]\s*Topic$/i, '').trim() || 'YouTube',
          album: '',
          duration: 0,
          videoType: 'UGC',
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
        setTrackMetaCache(trackId, meta);
        return meta;
      }
    }
  } catch {
    // Fall back to search
  }
  return null;
}

function extractTextFromRunsOrSimple(field: unknown): string {
  if (!field || typeof field !== 'object') return '';
  const rec = field as Record<string, unknown>;
  if (typeof rec.simpleText === 'string') return rec.simpleText;
  if (typeof rec.content === 'string') return rec.content;
  if (Array.isArray(rec.runs)) {
    return rec.runs
      .map(r => (r && typeof r === 'object' ? String((r as Record<string, unknown>).text || '') : ''))
      .join('');
  }
  return '';
}

function parseYouTubeSearchTree(root: unknown, limit: number, preserveCandidates = false): TrackMetadata[] {
  const webTracks: TrackMetadata[] = [];
  const seenWebIds = new Set<string>();

  const walkWeb = (node: unknown) => {
    if (!node || typeof node !== 'object' || webTracks.length >= limit) return;
    if (Array.isArray(node)) {
      for (const child of node) walkWeb(child);
      return;
    }
    const rec = node as Record<string, unknown>;
    const renderer =
      (rec.videoRenderer as Record<string, unknown> | undefined) ||
      (rec.videoWithContextRenderer as Record<string, unknown> | undefined) ||
      (rec.compactVideoRenderer as Record<string, unknown> | undefined);

    if (renderer && typeof renderer === 'object') {
      const videoId = String(renderer.videoId || '').trim();
      const validId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
      if (preserveCandidates || (validId && !seenWebIds.has(videoId))) {
        const rawTitle = decodeHtmlEntities(
          extractTextFromRunsOrSimple(renderer.title || renderer.headline).trim()
        );
        const ownerText = extractTextFromRunsOrSimple(renderer.ownerText);
        const longBylineText = extractTextFromRunsOrSimple(renderer.longBylineText);
        const shortBylineText = extractTextFromRunsOrSimple(renderer.shortBylineText);
        const rawChannel = decodeHtmlEntities(
          (ownerText || longBylineText || shortBylineText || 'YouTube').trim()
        );
        const allBylines = decodeHtmlEntities(`${ownerText} ${longBylineText} ${shortBylineText}`);
        const rendererStr = JSON.stringify(renderer);
        const isTopicChannel =
          /\s*[-–—]\s*Topic\b/i.test(rawChannel) ||
          /\s*[-–—]\s*Topic\b/i.test(allBylines) ||
          /\b(?:Provided to YouTube by|Auto-generated by YouTube)\b/i.test(rendererStr);
        const channelName = rawChannel.replace(/\s*[-–—]\s*Topic\b/i, '').trim();
        const lengthText = extractTextFromRunsOrSimple(renderer.lengthText);
        const duration = parseDurationText(lengthText);
        const viewCount = parseViewCountFromRenderer(renderer);
        if (preserveCandidates || (rawTitle && (duration === 0 || duration >= 45))) {
          seenWebIds.add(videoId);
          const trackId = validId ? `yt_${videoId}` : `candidate:${webTracks.length}`;
          const isStaticAudio =
            !preserveCandidates && (isTopicChannel ||
            rendererStr.includes('MUSIC_VIDEO_TYPE_ATV') ||
            /\b(?:official\s+audio|audio\s+only|full\s+audio|audio\s+track|audio\s+song|provided\s+to\s+youtube\s+by|auto-generated\s+by\s+youtube)\b/i.test(
              rawTitle
            ));
          const meta: TrackMetadata = {
            id: trackId,
            rawId: videoId,
            provider: 'youtube',
            title: rawTitle,
            artist: preserveCandidates ? rawChannel : isStaticAudio ? `${channelName} - Topic` : channelName,
            album: preserveCandidates ? String(typeof renderer.album==='string' ? renderer.album : extractTextFromRunsOrSimple(renderer.album)) : isStaticAudio ? 'Audio Track' : '',
            duration,
            viewCount,
            channelId:rendererChannelId(renderer),uploaderName:preserveCandidates ? rawChannel : channelName,
            embeddable:typeof renderer.embeddable==='boolean'?renderer.embeddable:undefined,
            channelVerified:rendererStr.includes('BADGE_STYLE_TYPE_VERIFIED_ARTIST')||rendererStr.includes('BADGE_STYLE_TYPE_VERIFIED')||rendererStr.includes('OWNER_BADGE_TYPE_VERIFIED'),
            artistCredits:rendererStr.includes('BADGE_STYLE_TYPE_VERIFIED_ARTIST')?[channelName]:undefined,
            metadataSource:'innertube',visualContent:isStaticAudio||renderer.visualContent==='static'?'static':'unknown',
            videoType: isStaticAudio || renderer.videoType==='ATV' || /"musicVideoType":"MUSIC_VIDEO_TYPE_ATV"/.test(rendererStr)
              ? 'ATV'
              : renderer.videoType==='OMV'||/"musicVideoType":"MUSIC_VIDEO_TYPE_OMV"/.test(rendererStr) ? 'OMV' : 'UGC',
            sourceUrl: validId ? `https://www.youtube.com/watch?v=${videoId}` : '',
            artwork: validId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined,
          };
          if (validId) setTrackMetaCache(trackId, meta);
          webTracks.push(meta);
        }
      }
    }
    for (const val of Object.values(rec)) walkWeb(val);
  };

  walkWeb(root);
  return webTracks;
}

async function fetchPipedOrInvidiousVideos(query: string, limit = 16, deadline = Date.now()+6500, preserveCandidates = false): Promise<TrackMetadata[]> {
  const q = encodeURIComponent(query.trim());
  const endpoints = [
    { url: `https://pipedapi.kavin.rocks/search?q=${q}&filter=videos`, type: 'piped' as const },
    { url: `https://api.piped.private.coffee/search?q=${q}&filter=videos`, type: 'piped' as const },
    { url: `https://inv.nadeko.net/api/v1/search?q=${q}&type=video`, type: 'invidious' as const },
    { url: `https://invidious.nerdvpn.de/api/v1/search?q=${q}&type=video`, type: 'invidious' as const },
  ];

  for (const ep of endpoints) {
    if(Date.now()>=deadline)break;
    try {
      const res = await fetch(ep.url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(Math.max(1,Math.min(2500,deadline-Date.now()))),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      const items: Array<Record<string, unknown>> =
        ep.type === 'piped' && data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as Array<Record<string, unknown>>)
          : Array.isArray(data)
            ? (data as Array<Record<string, unknown>>)
            : [];

      const tracks: TrackMetadata[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const urlStr = String(item.url || '');
        const videoId = String(
          item.videoId ||
            (urlStr.match(/(?:v=|\/watch\?v=|\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/)?.[1] ?? '')
        ).trim();
        const validId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
        if (!preserveCandidates && (!validId || seen.has(videoId))) continue;
        const title = decodeHtmlEntities(String(item.title || '').trim());
        if (!preserveCandidates && !title) continue;
        const rawAuthor = decodeHtmlEntities(
          String(item.uploaderName || item.author || 'YouTube').trim()
        );
        const rawDesc = decodeHtmlEntities(
          String(item.shortDescription || item.description || '').trim()
        );
        const isTopic =
          !preserveCandidates && (/\s*[-–—]\s*Topic\b/i.test(rawAuthor) ||
          /\b(?:Provided to YouTube by|Auto-generated by YouTube)\b/i.test(rawDesc) ||
          /\b(?:official\s+audio|audio\s+only|full\s+audio|audio\s+track)\b/i.test(title));
        const artist = rawAuthor.replace(/\s*[-–—]\s*Topic\b/i, '').trim() || 'YouTube';
        const duration = Number(item.duration ?? item.lengthSeconds ?? 0);
        if (!preserveCandidates && duration > 0 && duration < 45) continue;
        const views = Number(item.views ?? item.viewCount ?? 0);
        seen.add(videoId);
        const trackId = `yt_${videoId}`;
        const meta: TrackMetadata = {
          id: trackId,
          rawId: videoId,
          provider: 'youtube',
          title,
          artist: preserveCandidates ? rawAuthor : isTopic ? `${artist} - Topic` : artist,
          album: preserveCandidates && typeof item.album==='string' ? item.album : isTopic ? 'Audio Track' : '',
          duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
          viewCount: Number.isFinite(views) && views > 0 ? views : undefined,
          videoType: isTopic||item.videoType==='ATV' ? 'ATV' : 'UGC',
          metadataSource:'mirror',visualContent:isTopic||item.visualContent==='static'?'static':'unknown',
          embeddable:typeof item.embeddable==='boolean'?item.embeddable:undefined,
          channelVerified:item.uploaderVerified===true||item.authorVerified===true,
          channelId:typeof item.authorId==='string'&&item.authorId.startsWith('UC')?item.authorId:undefined,
          sourceUrl: validId ? `https://www.youtube.com/watch?v=${videoId}` : '',
          artwork: validId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined,
        };
        if (validId) setTrackMetaCache(trackId, meta);
        tracks.push(meta);
        if (tracks.length >= limit) break;
      }
      if (tracks.length > 0) return tracks;
    } catch {
      // Try next mirror
    }
  }
  return [];
}

async function runYouTubeWebSearch(
  upstreamQuery: string,
  limit = 20,
  ytAuth?: YouTubeAuthContext,
  preserveCandidates = false,
): Promise<TrackMetadata[]> {
  const deadline=Date.now()+10000;
  const authHeaders = buildYouTubeAuthHeaders(ytAuth, 'https://www.youtube.com');

  // 2. Try WEB Innertube client (with user's YouTube session cookies / SAPISIDHASH if signed in)
  const innertubeClients = [
    {
      name: 'WEB',
      version: '2.20250219.01.00',
      ua: USER_AGENT,
      extra: {},
    },
    {
      name: 'IOS',
      version: '20.10.4',
      ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)',
      extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.1.22D72' },
    },
    {
      name: 'ANDROID',
      version: '20.10.38',
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      extra: { androidSdkVersion: 34, osName: 'Android', osVersion: '14' },
    },
  ];

  for (const clientCfg of innertubeClients) {
    if(Date.now()>=deadline)break;
    try {
      const ytRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': clientCfg.ua,
          Origin: 'https://www.youtube.com',
          ...(clientCfg.name === 'WEB' ? authHeaders : {}),
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: clientCfg.name,
              clientVersion: clientCfg.version,
              hl: 'en',
              gl: process.env.YOUTUBE_REGION || 'IN',
              ...clientCfg.extra,
            },
          },
          query: upstreamQuery,
          params:'EgIQAQ%3D%3D', // YoutubeExplode: request videos rather than mixed search results.
        }),
        signal: AbortSignal.timeout(Math.max(1,Math.min(3500,deadline-Date.now()))),
      });
      if (!ytRes.ok) continue;
      const rawJson = await ytRes.json();
      const tracks = parseYouTubeSearchTree(rawJson, preserveCandidates ? limit : Math.max(limit, 20), preserveCandidates);
      if (tracks.length > 0) return tracks;
    } catch {
      // Try next Innertube client
    }
  }

  // 3. Fallback to Piped / Invidious public video search mirrors if YouTube Innertube is rate-limited
  return fetchPipedOrInvidiousVideos(upstreamQuery, preserveCandidates ? limit : Math.max(limit, 20),deadline,preserveCandidates);
}

const videoSearchCache = new VideoSearchCache<TrackMetadata[]>();
async function searchBackgroundVideos(title:string,artist:string,preference:'music'|'lyrics',ytAuth?:YouTubeAuthContext,refresh=false){
  const query = backgroundVideoQuery(title,artist,preference);
  const scope = createHash('sha256').update(JSON.stringify(ytAuth||{})).digest('hex');
  const region = process.env.YOUTUBE_REGION||'IN';
  const load=async()=>{
    const pool = (await runYouTubeWebSearch(query,AUTO_VIDEO_ATTEMPT_LIMIT,ytAuth,true)).slice(0,AUTO_VIDEO_ATTEMPT_LIMIT);
    const firstCandidates = pool.filter(video=>/^[\w-]{11}$/.test(video.rawId));
    const hydrated = await hydrateVideoMetadata(firstCandidates,buildYouTubeAuthHeaders(ytAuth),scope,true);
    const details = new Map(hydrated.map(video=>[video.rawId,video]));
    return pool.map(video=>details.get(video.rawId)??video);
  };
  return refresh?load():videoSearchCache.get(JSON.stringify(['background',scope,region,query]),load);
}
async function runSingleYouTubeWebSearch(query:string,limit=40,ytAuth?:YouTubeAuthContext,{refresh=false}={}):Promise<TrackMetadata[]> {
  const scope=createHash('sha256').update(JSON.stringify(ytAuth||{})).digest('hex');
  const region=process.env.YOUTUBE_REGION||'IN';
  const load=async()=>{
    const [music,web]=await Promise.all([
      searchMusicVideos(query,buildYouTubeAuthHeaders(ytAuth,'https://music.youtube.com'),region),
      runYouTubeWebSearch(query,Math.max(limit,40),ytAuth),
    ]);
    const decodedMusic=music.map(v=>({...v,title:decodeHtmlEntities(v.title),artist:decodeHtmlEntities(v.artist),artistCredits:v.artistCredits?.map(decodeHtmlEntities)}));
    const pooled=mergeVideoMetadata<TrackMetadata>(refresh?[web,decodedMusic as TrackMetadata[]]:[decodedMusic as TrackMetadata[],web]);
    const enriched=await hydrateVideoMetadata(pooled,buildYouTubeAuthHeaders(ytAuth),scope);
    for(const video of enriched)setTrackMetaCache(video.id,video);
    return enriched;
  };
  return refresh?load():videoSearchCache.get(scope+'|'+region+'|'+query.trim().toLowerCase()+'|'+limit,load);
}

async function fetchYouTubeWebVideos(
  query: string,
  limit = 20,
  ytAuth?: YouTubeAuthContext,
  refresh = false,
): Promise<TrackMetadata[]> {
  const directVideoId = extractDirectVideoIdFromQuery(query);
  if (directVideoId) {
    const directMeta = await resolveDirectYouTubeVideoQuery(directVideoId);
    if (directMeta) {
      directMeta.metadataSource='oembed';
      const scope=createHash('sha256').update(JSON.stringify(ytAuth||{})).digest('hex');
      return hydrateVideoMetadata([directMeta],buildYouTubeAuthHeaders(ytAuth),scope);
    }
  }

  const trimmed = query.trim();
  if (refresh) return runSingleYouTubeWebSearch(trimmed, limit, ytAuth, {refresh});

  const baseQuery = trimmed
    .replace(/\s+\b(?:official\s+(?:music\s+)?video|music\s+video)$/i, '')
    .trim();
  const upstreamQuery = trimmed
    .replace(/\bmusic\s+video$/i, 'Official Video')
    .replace(/\blyrics\s+video$/i, 'Official Lyric Video');

  if (baseQuery && baseQuery.toLowerCase() !== trimmed.toLowerCase()) {
    const [baseTracks, explicitTracks] = await Promise.all([
      runSingleYouTubeWebSearch(baseQuery, limit, ytAuth).catch(() => []),
      runSingleYouTubeWebSearch(upstreamQuery, limit, ytAuth).catch(() => []),
    ]);
    // Merge the complete pools before the client ranks them. Base-query order
    // must not consume the explicit-video query's candidate budget.
    const merged = mergeVideoMetadata<TrackMetadata>([baseTracks,explicitTracks]);
    if (merged.length > 0) return merged;
  }

  return runSingleYouTubeWebSearch(upstreamQuery, limit, ytAuth);
}

async function searchYouTubeMusic(
  query: string,
  provider: 'ytmusic' | 'youtube',
  limit = 16,
  ytAuth?: YouTubeAuthContext,
  refresh = false,
): Promise<TrackMetadata[]> {
  if (provider === 'youtube') {
    return fetchYouTubeWebVideos(query.trim(),limit,ytAuth,refresh);
  }

  try {
    const body: Record<string, unknown> = {
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20250219.01.00',
          hl: 'en',
          gl: 'US',
        },
      },
      query: query.trim(),
      // Filtered to Songs on YouTube Music (sigma67/ytmusicapi songs filter param)
      params: provider === 'ytmusic' ? 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D' : undefined,
    };

    const musicAuthHeaders = buildYouTubeAuthHeaders(ytAuth, 'https://music.youtube.com');
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Origin: 'https://music.youtube.com',
        ...musicAuthHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const raw = await res.json();
      const tracks: TrackMetadata[] = [];
      const seenIds = new Set<string>();

      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object' || tracks.length >= limit * 2) return;
        if (Array.isArray(node)) {
          for (const child of node) walk(child);
          return;
        }
        const rec = node as Record<string, unknown>;
        if (rec.musicResponsiveListItemRenderer && typeof rec.musicResponsiveListItemRenderer === 'object') {
          const item = rec.musicResponsiveListItemRenderer as Record<string, unknown>;
          const playlistItemData =
            item.playlistItemData && typeof item.playlistItemData === 'object'
              ? (item.playlistItemData as Record<string, unknown>)
              : {};
          const videoId = String(playlistItemData.videoId || '').trim();
          if (videoId && !seenIds.has(videoId)) {
            const rawJson = JSON.stringify(item);
            const videoType: TrackMetadata['videoType'] = rawJson.includes('MUSIC_VIDEO_TYPE_ATV')
              ? 'ATV'
              : rawJson.includes('MUSIC_VIDEO_TYPE_OMV')
                ? 'OMV'
                : 'UGC';

            const flexColumns = Array.isArray(item.flexColumns) ? item.flexColumns : [];
            const colTexts: string[][] = flexColumns.map(col => {
              const r =
                col && typeof col === 'object'
                  ? ((col as Record<string, unknown>)
                      .musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>)
                  : undefined;
              const textObj = r?.text && typeof r.text === 'object' ? (r.text as Record<string, unknown>) : {};
              const runs = Array.isArray(textObj.runs) ? textObj.runs : [];
              return runs
                .map(run => (run && typeof run === 'object' ? String((run as Record<string, unknown>).text || '') : ''))
                .filter(tx => tx && tx !== ' • ' && tx !== ' · ');
            });

            const title = (colTexts[0]?.[0] || '').trim();
            const metaRuns = colTexts[1] || [];
            let duration = 0;
            const nonDurationRuns: string[] = [];
            for (const part of metaRuns) {
              const d = parseDurationText(part);
              if (d > 0) duration = d;
              else if (!['Song', 'Video', 'Single', 'EP', 'Album'].includes(part)) nonDurationRuns.push(part);
            }
            const artist = (nonDurationRuns[0] || 'Unknown artist').replace(/\s*[-–]\s*Topic$/i, '').trim();
            const album = (nonDurationRuns[1] || '').trim();

            if (title && (duration === 0 || duration >= 45)) {
              let artwork = '';
              try {
                const thumbRenderer = (item.thumbnail as Record<string, unknown>)
                  ?.musicThumbnailRenderer as Record<string, unknown>;
                const thumbs = ((thumbRenderer?.thumbnail as Record<string, unknown>)?.thumbnails as Array<
                  Record<string, unknown>
                >) || [];
                artwork = String(thumbs.at(-1)?.url || '');
              } catch {
                artwork = '';
              }

              seenIds.add(videoId);
              const prefix = provider === 'ytmusic' ? 'ytm_' : 'yt_';
              const trackId = `${prefix}${videoId.replace(/[^\w-]/g, '')}`;
              const meta: TrackMetadata = {
                id: trackId,
                rawId: videoId,
                provider,
                title,
                artist: videoType === 'ATV' && provider === 'youtube' ? `${artist} - Topic` : artist,
                album,
                duration,
                videoType,
                sourceUrl:
                  provider === 'ytmusic'
                    ? `https://music.youtube.com/watch?v=${videoId}`
                    : `https://www.youtube.com/watch?v=${videoId}`,
                artwork: artwork || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              };
              setTrackMetaCache(trackId, meta);
              tracks.push(meta);
            }
          }
        }
        for (const val of Object.values(rec)) walk(val);
      };

      walk(raw);
      if (tracks.length > 0) {
        if (provider === 'ytmusic') {
          // Prioritize official album audio tracks (MUSIC_VIDEO_TYPE_ATV) for YouTube Music audio mode
          tracks.sort((a, b) => (a.videoType === 'ATV' ? -1 : 1) - (b.videoType === 'ATV' ? -1 : 1));
        } else {
          // Prioritize Official Music Videos (MUSIC_VIDEO_TYPE_OMV) over static audio tracks when searching for YouTube videos
          const rankType = (t: TrackMetadata['videoType']) => (t === 'OMV' ? 0 : t === 'UGC' ? 1 : 2);
          tracks.sort((a, b) => rankType(a.videoType) - rankType(b.videoType));
        }
        return tracks.slice(0, limit);
      }
    }
  } catch {
    // Fall through to JioSaavn backup search
  }

  if (provider === 'youtube') {
    return [];
  }
  const saavnFallback = await searchJioSaavn(query, limit);
  return saavnFallback.map(t => ({ ...t, provider }));
}

async function resolveByMetadataMatch(
  meta: TrackMetadata
): Promise<{ url: string; format: 'audio' | 'hls'; streamSource: string } | null> {
  const query = `${meta.title} ${meta.artist}`.trim();

  // Only match verified JioSaavn 320kbps full-track studio recordings
  try {
    const saavnCandidates = await searchJioSaavn(query, 15);
    if (saavnCandidates.length > 0) {
      const scored = saavnCandidates
        .map(cand => ({ cand, score: scoreCandidateMatch(meta, cand) }))
        .sort((a, b) => b.score - a.score);

      for (const candidate of scored.slice(0, 3)) {
        if (candidate.score >= 65 && candidate.cand.encryptedMediaUrl) {
          const streamUrl = await resolveJioSaavnStreamUrl(candidate.cand.encryptedMediaUrl);
          if (streamUrl) return { url: streamUrl, format: 'audio', streamSource: 'JioSaavn 320kbps AAC' };
        }
      }
    }
  } catch {
    // Ignore JioSaavn lookup error
  }

  return null;
}

// ============================================================================
// 4. AUDIUS FULL-TRACK SEARCH & STREAM RESOLVER
// ============================================================================
async function searchAudius(query: string, limit = 12): Promise<TrackMetadata[]> {
  const url =
    'https://api.audius.co/v1/tracks/search?' +
    new URLSearchParams({
      query: query.trim(),
      limit: String(Math.max(limit * 2, 20)),
      app_name: 'LyricFlow',
    }).toString();

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const list = Array.isArray(payload.data) ? payload.data : [];
  const tracks: TrackMetadata[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (item.is_streamable === false || item.is_stream_gated === true) continue;
    const rawId = String(item.id || '').trim();
    const title = String(item.title || '').trim();
    if (!rawId || !title) continue;

    const duration = Number(item.duration || 0);
    if (duration > 0 && duration < 45) continue;

    const user =
      item.user && typeof item.user === 'object' ? (item.user as Record<string, unknown>) : {};
    const art =
      item.artwork && typeof item.artwork === 'object'
        ? (item.artwork as Record<string, unknown>)
        : {};
    const trackId = `audius_${rawId.replace(/[^\w-]/g, '')}`;
    const meta: TrackMetadata = {
      id: trackId,
      rawId,
      provider: 'audius',
      title,
      artist: String(user.name || user.handle || 'Unknown artist'),
      album: '',
      duration: Number.isFinite(duration) ? duration : 0,
      sourceUrl: `https://audius.co${String(item.permalink || '')}`,
      artwork: String(art['480x480'] || art['150x150'] || '') || undefined,
    };
    setTrackMetaCache(trackId, meta);
    tracks.push(meta);
    if (tracks.length >= limit) break;
  }

  return tracks;
}

// ============================================================================
// 5. STASH MULTI-SOURCE LYRICS RESOLVER
//    Provider lookup order:
//    1. isrcTtml (lrc.red + MusicBrainz ISRC -> lrc.red/s/{isrc}.ttml & lyrics-storage.binimum.org/{isrc}.ttml)
//    2. appleTtml (itunes.apple.com -> lyrics.paxsenix.org)
//    3. lrclib (lrclib.net/api/get & /api/search)
//    4. innerTube (music.youtube.com/youtubei/v1/next -> MPLY* browse)
// ============================================================================
let paxsenixConsecutiveTimeouts = 0;
let paxsenixSkipUntilMs = 0;
const PAXSENIX_SKIP_AFTER_TIMEOUTS = 3;
const PAXSENIX_SKIP_WINDOW_MS = 10 * 60_000;

function normalizeServerText(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanServerYouTubeTitle(rawTitle: string, channelHint = ''): string {
  if (!rawTitle) return '';
  const strippedUnicode = rawTitle
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const withoutHandles = strippedUnicode.replace(/(?:^|\s)@\S+/g, ' ').trim();
  const firstBracketIdx = withoutHandles.search(/[([{]/);
  const preBracket = firstBracketIdx >= 0 ? withoutHandles.slice(0, firstBracketIdx) : withoutHandles;
  const hasPipeCreditsAfterDash = /^[^|]+?\s+[-–—]\s+[^|]+?\s*\|/.test(preBracket);

  let text = withoutHandles
    .replace(/\s*[([{][\s\S]*$/, '')
    .replace(/\s*(?:\||\/\/)[\s\S]*$/, '')
    .replace(
      /\b(?:official\s*(?:music\s*)?(?:video|audio|lyric(?:al)?(?:\s*video)?)|music\s*video|lyric(?:al)?(?:\s*video|\s*song)?|lyrics(?:\s*video|\s*song)?|sing\s*along(?:\s*video)?|full\s*(?:video|song|audio)|video\s*song|audio\s*song|karaoke(?:\s*version)?|visualizer|promo|teaser|trailer|jukebox|4k|8k|hd|hq)\b[\s\S]*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(/^[\s\-–—:|•·"'“”‘’]+|[\s\-–—:|•·"'“”‘’]+$/g, '').trim();

  const dashParts = text
    .split(/\s+[-–—]\s+/)
    .map(p =>
      p
        .replace(
          /\b(?:official\s*(?:music\s*)?(?:video|audio)|music\s*video|lyric(?:al)?(?:\s*video|\s*song)?|lyrics|sing\s*along|full\s*(?:video|song)|video\s*song|audio\s*song|4k|8k|hd|hq)\b[\s\S]*$/i,
          ''
        )
        .replace(/^[\s\-–—:|•·"'“”‘’]+|[\s\-–—:|•·"'“”‘’]+$/g, '')
        .trim()
    )
    .filter(Boolean);

  if (dashParts.length >= 2) {
    const candidateLeft = dashParts[0];
    const candidateRight = dashParts[1];
    const normChannel = normalizeServerText(channelHint.replace(/\b(?:vevo|official|music|records|topic)\b/gi, ''));
    const normLeft = normalizeServerText(candidateLeft);
    const normRight = normalizeServerText(candidateRight);

    if (hasPipeCreditsAfterDash && candidateLeft.length >= 2) {
      return candidateLeft;
    }
    if (
      normChannel.length >= 3 &&
      normLeft.length >= 3 &&
      (normChannel.includes(normLeft) || normLeft.includes(normChannel)) &&
      candidateRight.length >= 2
    ) {
      return candidateRight;
    }
    if (
      normChannel.length >= 3 &&
      normRight.length >= 3 &&
      (normChannel.includes(normRight) || normRight.includes(normChannel)) &&
      candidateLeft.length >= 2
    ) {
      return candidateLeft;
    }
    if (
      /^(?:from\b|live\b|acoustic\b|remaster(?:ed)?\b|remix\b|radio\s+edit\b|edit\b|version\b|mix\b|ost\b|soundtrack\b|instrumental\b|karaoke\b|demo\b|unplugged\b|single\b|deluxe\b|bonus\b|mono\b|stereo\b|part\s+\d|pt\.?\s*\d|vol\.?\s*\d|\d{4}\b)/i.test(
        candidateRight
      ) &&
      candidateLeft.length >= 2
    ) {
      return candidateLeft;
    }
    if (candidateRight.length >= 2) {
      return candidateRight;
    }
    return candidateLeft;
  }
  return text || rawTitle.trim();
}

const SERVER_STOPWORDS = new Set([
  'official',
  'music',
  'video',
  'lyrical',
  'lyrics',
  'lyric',
  'song',
  'audio',
  'full',
  'single',
  'original',
  'motion',
  'picture',
  'soundtrack',
  'from',
  'feat',
  'ft',
  'featuring',
  'prod',
  'version',
  'remastered',
  'hd',
  'hq',
  '4k',
  '8k',
  'the',
  'and',
]);

/**
 * Post-search candidate scorer on the backend:
 * After retrieving multiple options from lrc.red / Binimum / iTunes / LRCLIB,
 * matches the candidate's title, artist (author), and album against the full raw song title
 * and returns the match score (-1 if the candidate song title does not match).
 */
function scoreServerCandidateAgainstContext(
  cand: {
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
    hasWordSync?: boolean;
  },
  ctx: {
    cleanTitle: string;
    rawTitle: string;
    rawArtist: string;
    durationSec: number;
    isYouTube: boolean;
    rawOverride?: boolean;
  }
): number {
  const cleanTarget = normalizeServerText(ctx.cleanTitle);
  const candArtistHint = cand.artist || ctx.rawArtist || '';
  const cleanCandTitle = normalizeServerText(
    ctx.rawOverride ? cand.title : cleanServerYouTubeTitle(cand.title, candArtistHint) || cand.title
  );
  const strippedCandTitle = normalizeServerText(
    cleanServerYouTubeTitle(cand.title, candArtistHint) || cand.title
  );
  const rawCandTitle = normalizeServerText(cand.title);
  if (!cleanTarget || (!cleanCandTitle && !rawCandTitle)) return -1;

  if (!ctx.rawOverride && !sameVersionSignature(ctx.rawTitle || ctx.cleanTitle, cand.title)) {
    return -1;
  }

  const targetWords = new Set(cleanTarget.split(' ').filter(Boolean));
  const candWords = new Set((rawCandTitle || cleanCandTitle).split(' ').filter(Boolean));
  const strippedWords = new Set(strippedCandTitle.split(' ').filter(Boolean));
  let commonTitleWords = 0;
  for (const w of targetWords) {
    if (candWords.has(w) || strippedWords.has(w)) commonTitleWords++;
  }
  const denom = Math.max(1, Math.min(targetWords.size + candWords.size, targetWords.size + strippedWords.size));
  const titleOverlap = (2 * commonTitleWords) / denom;

  let score = 0;
  if (
    cleanCandTitle === cleanTarget ||
    rawCandTitle === cleanTarget ||
    strippedCandTitle === cleanTarget
  ) {
    score += 55;
  } else if (
    cleanCandTitle.startsWith(cleanTarget + ' ') ||
    rawCandTitle.startsWith(cleanTarget + ' ') ||
    strippedCandTitle.startsWith(cleanTarget + ' ') ||
    (ctx.rawOverride && (rawCandTitle.includes(cleanTarget) || cleanTarget.includes(strippedCandTitle)))
  ) {
    score += 46;
  } else if (titleOverlap >= (ctx.rawOverride ? 0.5 : 0.72)) {
    score += Math.round(titleOverlap * 45);
  } else {
    return -1;
  }

  // Match candidate author/artist and album against full raw title + channel/artist context
  const fullContext = normalizeServerText(`${ctx.rawTitle} ${ctx.rawArtist}`);
  const fullCompact = fullContext.replace(/\s+/g, '');
  const contextTokens = new Set(
    fullContext.split(' ').filter(w => w.length >= 2 && !SERVER_STOPWORDS.has(w))
  );

  const candArtistNorm = normalizeServerText(cand.artist || '');
  if (candArtistNorm) {
    const artistTokens = candArtistNorm
      .split(' ')
      .filter(w => w.length >= 2 && !SERVER_STOPWORDS.has(w) && !targetWords.has(w));
    if (artistTokens.length > 0) {
      let matched = 0;
      for (const tok of artistTokens) {
        if (contextTokens.has(tok) || (tok.length >= 4 && fullCompact.includes(tok))) matched++;
      }
      const joined = artistTokens.join('');
      if (joined.length >= 5 && fullCompact.includes(joined)) {
        matched = artistTokens.length;
      }
      if (matched > 0) {
        score += 15 + Math.round((matched / artistTokens.length) * 24);
      } else if (!ctx.isYouTube && !ctx.rawOverride && ctx.rawArtist) {
        score -= 25;
      }
    }
  }

  const candAlbumNorm = normalizeServerText(cand.album || '');
  if (candAlbumNorm) {
    const albumTokens = candAlbumNorm
      .split(' ')
      .filter(w => w.length >= 2 && !SERVER_STOPWORDS.has(w) && !targetWords.has(w));
    if (albumTokens.length > 0) {
      let matched = 0;
      for (const tok of albumTokens) {
        if (contextTokens.has(tok) || (tok.length >= 4 && fullCompact.includes(tok))) matched++;
      }
      if (matched > 0) {
        score += 8 + Math.round((matched / albumTokens.length) * 14);
      }
    }
  }

  const candDur = Number(cand.duration || 0);
  if (ctx.durationSec > 0 && candDur > 0) {
    if (!ctx.rawOverride && !isDurationCompatible(candDur, ctx.durationSec, ctx.isYouTube)) {
      score -= 15;
    } else {
      const dist = durationDistanceScore(candDur, ctx.durationSec, ctx.isYouTube || Boolean(ctx.rawOverride));
      score += Math.max(0, 20 - Math.round(dist * 1.2));
    }
  }

  if (cand.hasWordSync) score += 8;
  return score;
}

function isDurationCompatible(
  candidateDurSec: number,
  targetDurSec: number,
  isYouTube: boolean
): boolean {
  if (targetDurSec <= 0 || candidateDurSec <= 0) return true;
  if (!isYouTube) {
    return Math.abs(candidateDurSec - targetDurSec) <= 15;
  }
  return candidateDurSec >= 45 && candidateDurSec <= targetDurSec + 45;
}

function durationDistanceScore(
  candidateDurSec: number,
  targetDurSec: number,
  isYouTube: boolean
): number {
  if (targetDurSec <= 0 || candidateDurSec <= 0) return 50;
  const diff = Math.abs(candidateDurSec - targetDurSec);
  if (!isYouTube) return diff;
  if (candidateDurSec <= targetDurSec + 10 && candidateDurSec >= targetDurSec - 120) {
    return diff * 0.35;
  }
  return diff;
}

// 5A. ISRC + Word-Synced TTML (Stash IsrcResolver.kt & IsrcTtmlLyricsSource.kt)
async function fetchIsrcWordSyncedTtml(
  title: string,
  artist: string,
  durationSec: number,
  isYouTube = false,
  rawTitle = '',
  rawArtist = '',
  rawOverride = false,
  preferredProvider = ''
): Promise<ServerLyricsResponse | null> {
  const isrcCandidates: Array<{ isrc: string; title: string; artist: string; duration?: number }> = [];
  const effectiveArtist = isYouTube && !rawOverride ? '' : artist;
  const matchCtx = {
    cleanTitle: title,
    rawTitle: rawTitle || title,
    rawArtist: rawArtist || artist,
    durationSec,
    isYouTube,
    rawOverride,
  };

  // Get recording metadata before scoring or downloading lyrics by ISRC.
  const recordings = await searchLrcRedRecordings(title, effectiveArtist, async url => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': LYRICS_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  });
  const scored = recordings.map(item => ({
    ...item,
    score: scoreServerCandidateAgainstContext({ ...item, duration: item.duration ?? 0 }, matchCtx),
  })).filter(item => item.score >= 45).sort((a, b) => b.score - a.score);
  for (const { isrc, title, artist, duration } of scored) {
    if (!isrcCandidates.some(item => item.isrc === isrc)) isrcCandidates.push({ isrc, title, artist, duration });
  }

  // Step 2: MusicBrainz ISRC fallback (Stash IsrcResolver.kt secondary)
  if (isrcCandidates.length === 0) {
    try {
      const mbQuery = effectiveArtist
        ? `recording:"${title.replace(/"/g, '')}" AND artist:"${effectiveArtist.replace(/"/g, '')}"`
        : `recording:"${title.replace(/"/g, '')}"`;
      const mbUrl =
        'https://musicbrainz.org/ws/2/recording/?' +
        new URLSearchParams({
          query: mbQuery,
          limit: '12',
          fmt: 'json',
        }).toString();
      const mbRes = await fetch(mbUrl, {
        headers: {
          'User-Agent': 'Stash/1.0.0 ( https://github.com/rawnaldclark/Stash )',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (mbRes.ok) {
        const mbData = (await mbRes.json()) as {
          recordings?: Array<{
            title?: string;
            length?: number;
            isrcs?: string[];
            'artist-credit'?: Array<{ name?: string }>;
            releases?: Array<{ title?: string }>;
          }>;
        };
        const scoredRecs = (mbData.recordings || [])
          .map(rec => {
            const recDurSec = Number(rec.length || 0) / 1000;
            const recTitle = String(rec.title || '');
            const recArtist = (rec['artist-credit'] || [])
              .map(c => String(c.name || ''))
              .filter(Boolean)
              .join(' ');
            const recAlbum = String(rec.releases?.[0]?.title || '');
            const score = scoreServerCandidateAgainstContext(
              { title: recTitle, artist: recArtist, album: recAlbum, duration: recDurSec },
              matchCtx
            );
            return { rec, recTitle, recArtist, recDurSec, score };
          })
          .filter(x => x.recTitle.trim() && x.recArtist.trim() && x.score >= 45)
          .sort((a, b) => b.score - a.score);

        for (const { rec, recTitle, recArtist, recDurSec } of scoredRecs) {
          for (const rawIsrc of rec.isrcs || []) {
            const cleanIsrc = String(rawIsrc || '').trim().toUpperCase();
            if (/^[A-Z0-9]{12}$/.test(cleanIsrc) && !isrcCandidates.some(c => c.isrc === cleanIsrc)) {
              isrcCandidates.push({ isrc: cleanIsrc, title: recTitle, artist: recArtist, duration: recDurSec || undefined });
            }
          }
        }
      }
    } catch {
      // Ignore MusicBrainz error
    }
  }

  // Step 3: Fetch TTML XML from lrc.red and Binimum (Stash IsrcTtmlLyricsSource.kt)
  for (const cand of isrcCandidates.slice(0, 4)) {
    const ttmlProviders = [
      { name: 'lrc.red · Word-Synced TTML', url: `https://lrc.red/s/${cand.isrc}.ttml` },
      {
        name: 'Binimum · Word-Synced TTML',
        url: `https://lyrics-storage.binimum.org/${cand.isrc}.ttml`,
      },
    ];
    for (const provider of ttmlProviders) {
      if(preferredProvider&&!provider.name.toLowerCase().startsWith(preferredProvider))continue;
      try {
        const ttmlRes = await fetch(provider.url, {
          headers: { 'User-Agent': LYRICS_USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (!ttmlRes.ok) continue;
        const xml = await ttmlRes.text();
        if (xml.includes('<p') && xml.includes('<span')) {
          const hasWordSync=convertTtmlToEnhancedLrc(xml).hasWordSync;
          return {
            ttml: xml,
            source: hasWordSync?provider.name:provider.name.replace('Word-Synced TTML','TTML'),
            sourceUrl: provider.url,
            title: cand.title,
            artist: cand.artist,
            duration: cand.duration,
            hasWordSync,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

// 5B. iTunes Song ID + Paxsenix Apple Music TTML (Stash AppleTtmlLyricsSource.kt)
async function fetchItunesPaxsenixLyrics(
  title: string,
  artist: string,
  durationSec: number,
  isYouTube = false,
  rawTitle = '',
  rawArtist = '',
  rawOverride = false
): Promise<{ appleTrackViewUrl?: string; lyrics?: ServerLyricsResponse }> {
  const effectiveArtist = isYouTube && !rawOverride ? '' : artist;
  const matchCtx = {
    cleanTitle: title,
    rawTitle: rawTitle || title,
    rawArtist: rawArtist || artist,
    durationSec,
    isYouTube,
    rawOverride,
  };
  const scoredCandidates: Array<{ item: Record<string, unknown>; score: number }> = [];
  const searchTerms = [`${title} ${effectiveArtist}`.trim()];
  const channelArtistHint = (rawArtist || artist || '').replace(/\s*-\s*Topic$/i, '').trim();
  if (isYouTube && !effectiveArtist && channelArtistHint && !searchTerms.includes(`${title} ${channelArtistHint}`.trim())) {
    searchTerms.push(`${title} ${channelArtistHint}`.trim());
  }

  for (const term of searchTerms) {
    try {
      const itunesUrl =
        'https://itunes.apple.com/search?' +
        new URLSearchParams({
          term,
          media: 'music',
          entity: 'song',
          limit: '20',
        }).toString();

      const res = await fetch(itunesUrl, {
        headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
        const results = Array.isArray(data.results) ? data.results : [];
        for (const item of results) {
          const trackId = String(item.trackId || '').trim();
          if (!trackId || scoredCandidates.some(c => String(c.item.trackId || '').trim() === trackId)) continue;
          const trackName = String(item.trackName || '');
          const artistName = String(item.artistName || '');
          const albumName = String(item.collectionName || '');
          const dur = Number(item.trackTimeMillis || 0) / 1000;
          const score = scoreServerCandidateAgainstContext(
            { title: trackName, artist: artistName, album: albumName, duration: dur },
            matchCtx
          );
          if (score >= 45) {
            scoredCandidates.push({ item, score });
          }
        }
      }
      scoredCandidates.sort((a, b) => b.score - a.score);
      if (scoredCandidates[0] && scoredCandidates[0].score >= 70) {
        break;
      }
    } catch {
      // Ignore iTunes error
    }
  }

  const firstTrackViewUrl = scoredCandidates[0]?.item
    ? String(scoredCandidates[0].item.trackViewUrl || '').trim()
    : '';

  if (scoredCandidates.length === 0 || Date.now() < paxsenixSkipUntilMs) {
    return { appleTrackViewUrl: firstTrackViewUrl || undefined };
  }

  for (const cand of scoredCandidates.slice(0, 3)) {
    const songId = String(cand.item.trackId || '').trim();
    const trackViewUrl = String(cand.item.trackViewUrl || '').trim() || firstTrackViewUrl;
    const matchedTitle = String(cand.item.trackName || title).trim();
    const matchedArtist = String(cand.item.artistName || artist).trim();
    if (!songId || Date.now() < paxsenixSkipUntilMs) continue;

    const paxUrls = [
      { url: `https://lyrics.paxsenix.org/apple-music/cache/${encodeURIComponent(songId)}`, timeout: 3500 },
      {
        url: `https://lyrics.paxsenix.org/apple-music/lyrics?id=${encodeURIComponent(songId)}&ttml=true`,
        timeout: 5000,
      },
    ];

    for (const endpoint of paxUrls) {
      try {
        const res = await fetch(endpoint.url, {
          headers: { 'User-Agent': STASH_ANDROID_UA },
          signal: AbortSignal.timeout(endpoint.timeout),
        });
        paxsenixConsecutiveTimeouts = 0;
        if (!res.ok) continue;
        const body = await res.text();
        if (!body || body.length < 15) continue;
        if (body.includes('<tt') || body.includes('<p')) {
          return {
            appleTrackViewUrl: trackViewUrl || undefined,
            lyrics: {
              ttml: body,
              source: 'Paxsenix · TTML',
              sourceUrl: endpoint.url,
              title: matchedTitle,
              artist: matchedArtist || undefined,
              hasWordSync: convertTtmlToEnhancedLrc(body).hasWordSync,
            },
          };
        }
        if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          const embeddedTtml = String(parsed.ttmlContent || parsed.ttml || '');
          if (embeddedTtml.includes('<p')) {
            return {
              appleTrackViewUrl: trackViewUrl || undefined,
              lyrics: {
                ttml: embeddedTtml,
                source: 'Paxsenix · TTML',
                sourceUrl: endpoint.url,
                title: matchedTitle,
                artist: matchedArtist || undefined,
                hasWordSync: convertTtmlToEnhancedLrc(embeddedTtml).hasWordSync,
              },
            };
          }
        }
      } catch {
        paxsenixConsecutiveTimeouts += 1;
        if (paxsenixConsecutiveTimeouts >= PAXSENIX_SKIP_AFTER_TIMEOUTS) {
          paxsenixSkipUntilMs = Date.now() + PAXSENIX_SKIP_WINDOW_MS;
          break;
        }
      }
    }
  }

  return { appleTrackViewUrl: firstTrackViewUrl || undefined };
}

// 5C. LRCLIB Synced & Word-Synced Lyrics (Stash LrclibLyricsSource.kt)
async function fetchLrclibServerLyrics(
  title: string,
  artist: string,
  durationSec: number,
  isYouTube = false,
  rawTitle = '',
  rawArtist = '',
  rawOverride = false
): Promise<ServerLyricsResponse | null> {
  const effectiveArtist = isYouTube && !rawOverride ? '' : artist;
  const matchCtx = {
    cleanTitle: title,
    rawTitle: rawTitle || title,
    rawArtist: rawArtist || artist,
    durationSec,
    isYouTube,
    rawOverride,
  };
  try {
    if (!isYouTube && effectiveArtist && durationSec > 0) {
      const getUrl =
        'https://lrclib.net/api/get?' +
        new URLSearchParams({
          track_name: title,
          artist_name: effectiveArtist,
          duration: String(Math.round(durationSec)),
        }).toString();
      const getRes = await fetch(getUrl, {
        headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (getRes.ok) {
        const item = (await getRes.json()) as Record<string, unknown>;
        const synced = typeof item.syncedLyrics === 'string' ? item.syncedLyrics.trim() : '';
        if (synced.includes('[')) {
          return {
            lrc: synced,
            source: hasWordTiming(synced) ? 'LRCLIB · Word-Synced' : 'LRCLIB · Synced Recording',
            sourceUrl: item.id ? `https://lrclib.net/api/get/${String(item.id)}` : undefined,
            title: String(item.trackName || title).trim(),
            artist: String(item.artistName || effectiveArtist).trim() || undefined,
            hasWordSync: hasWordTiming(synced),
          };
        }
      }
    }

    const searchQueries: Array<URLSearchParams> = [];
    const primaryParams = new URLSearchParams({ track_name: title });
    if (effectiveArtist) primaryParams.set('artist_name', effectiveArtist);
    searchQueries.push(primaryParams);

    const channelArtistHint = (rawArtist || artist || '').replace(/\s*-\s*Topic$/i, '').trim();
    if (effectiveArtist && /[,&]|\b(?:feat|ft)\b/i.test(effectiveArtist)) {
      searchQueries.push(new URLSearchParams({ track_name: title }));
    } else if (isYouTube && !effectiveArtist && channelArtistHint) {
      searchQueries.push(
        new URLSearchParams({
          track_name: title,
          artist_name: channelArtistHint,
        })
      );
    }

    for (const searchParams of searchQueries) {
      const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });
      if (!searchRes.ok) continue;
      const list = (await searchRes.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(list) || list.length === 0) continue;

      const scored = list
        .map(item => {
          if (item.instrumental === true) return { item, score: -1 };
          const synced = typeof item.syncedLyrics === 'string' ? item.syncedLyrics : '';
          if (!synced.includes('[')) return { item, score: -1 };
          const trackName = String(item.trackName || '');
          const artistName = String(item.artistName || '');
          const albumName = String(item.albumName || '');
          const dur = Number(item.duration || 0);
          const score = scoreServerCandidateAgainstContext(
            {
              title: trackName,
              artist: artistName,
              album: albumName,
              duration: dur,
              hasWordSync: hasWordTiming(synced),
            },
            matchCtx
          );
          return { item, score };
        })
        .filter(x => x.score >= 45)
        .sort((a, b) => b.score - a.score);

      const best = scored[0]?.item;
      if (best && typeof best.syncedLyrics === 'string') {
        const synced = best.syncedLyrics.trim();
        return {
          lrc: synced,
          source: hasWordTiming(synced) ? 'LRCLIB · Word-Synced' : 'LRCLIB · Synced',
          sourceUrl: best.id ? `https://lrclib.net/api/get/${String(best.id)}` : undefined,
          title: String(best.trackName || title).trim(),
          artist: String(best.artistName || effectiveArtist).trim() || undefined,
          hasWordSync: hasWordTiming(synced),
        };
      }
    }
  } catch {
    // Ignore LRCLIB errors
  }
  return null;
}

// 5E. YouTube Music InnerTube Lyrics (Stash InnerTubeLyricsGatewayImpl.kt)
async function fetchInnerTubePlainLyrics(videoId: string): Promise<ServerLyricsResponse | null> {
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) return null;
  try {
    const clientContext = {
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20250219.01.00',
          hl: 'en',
          gl: 'US',
        },
      },
    };

    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({ ...clientContext, videoId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!nextRes.ok) return null;
    const nextRaw = await nextRes.text();
    const browseMatch = nextRaw.match(/"browseId"\s*:\s*"(MPLY[^"]+)"/);
    if (!browseMatch?.[1]) return null;

    const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({ ...clientContext, browseId: browseMatch[1] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!browseRes.ok) return null;
    const browseJson = await browseRes.json();
    let lyricsText = '';

    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object' || lyricsText) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      const rec = node as Record<string, unknown>;
      if (rec.musicDescriptionShelfRenderer && typeof rec.musicDescriptionShelfRenderer === 'object') {
        const shelf = rec.musicDescriptionShelfRenderer as Record<string, unknown>;
        const desc = shelf.description as { runs?: Array<{ text?: string }> } | undefined;
        if (Array.isArray(desc?.runs)) {
          const joined = desc.runs.map(r => r.text || '').join('').trim();
          if (joined.length > 20) {
            lyricsText = joined;
            return;
          }
        }
      }
      for (const val of Object.values(rec)) walk(val);
    };
    walk(browseJson);

    if (lyricsText) {
      return {
        plain: lyricsText,
        source: 'YouTube Music · InnerTube Lyrics',
        sourceUrl: `https://music.youtube.com/watch?v=${videoId}`,
        hasWordSync: false,
      };
    }
  } catch {
    // Ignore InnerTube failure
  }
  return null;
}

// ============================================================================
// 6. EXPRESS SERVER & ROUTES
// ============================================================================
export interface BackendOptions {
  host?: string;
  port?: number;
  apiOnly?: boolean;
  localToken?: string;
}

export async function startServer(options: BackendOptions = {}): Promise<Server> {
  const app = express();

  app.use((_req, res, next) => {
    if (options.localToken && _req.get('X-LyricFlow-Token') !== options.localToken) {
      res.status(403).json({detail: 'Local service authorization required.'});
      return;
    }
    if (options.apiOnly) {
      res.setHeader('Cache-Control', 'no-store');
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges, Content-Type'
    );
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const handleHealth = (_req: Request, res: Response) => {
    res.json({
      ok: true,
      providers: ['jiosaavn', 'ytmusic', 'soundcloud', 'audius', 'youtube'],
      lyricsSources: [
        'lyricflow-hybrid',
        'lrc.red-ttml',
        'binimum-ttml',
        'paxsenix-ttml',
        'lrclib',
        'youtube-subtitles',
        'innertube',
      ],
    });
  };

  // SponsorBlock Server Proxy (https://github.com/ajayyy/SponsorBlockServer)
  const handleSponsorBlock = async (req: Request, res: Response) => {
    const videoId = String(req.params.videoId || req.query.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ segments: [] });
      return;
    }
    try {
      const categories = JSON.stringify([
        'music_offtopic',
        'sponsor',
        'selfpromo',
        'intro',
        'outro',
        'interaction',
      ]);
      const sbUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(categories)}`;
      const sbRes = await fetch(sbUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (sbRes.status === 404 || !sbRes.ok) {
        res.status(200).json({ segments: [] });
        return;
      }
      const data = await sbRes.json();
      res.json({ segments: Array.isArray(data) ? data : [] });
    } catch {
      res.status(200).json({ segments: [] });
    }
  };

  const fetchYouTubeSubtitlesLrc = (videoId:string,auth?:YouTubeAuthContext,signal?:AbortSignal):Promise<ServerLyricsResponse|null> =>
    fetchYouTubeCaptions(videoId,{headers:buildYouTubeAuthHeaders(auth),signal});

  // ============================================================================
  // Spotify-Karaoke (https://github.com/haroldalan/spotify-karaoke) Romanizer API
  // ============================================================================
  const googleRomanizeServerChunk = async (
    text: string,
    sourceLang = 'auto'
  ): Promise<string | null> => {
    const endpoints = [
      'https://translate.google.com/translate_a/single?client=at',
      'https://translate.googleapis.com/translate_a/single?client=gtx',
    ];
    for (const base of endpoints) {
      try {
        const params = new URLSearchParams({ sl: sourceLang, tl: 'en', q: text });
        params.append('dt', 't');
        params.append('dt', 'rm');
        const res = await fetch(`${base}&${params.toString()}`, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            Referer: 'https://translate.google.com/',
          },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as unknown[];
        const allSegments = ((data?.[0] as unknown[]) ?? []) as unknown[][];
        if (allSegments.length > 0) {
          const lastBlock = allSegments[allSegments.length - 1];
          if (Array.isArray(lastBlock) && !lastBlock[0] && !lastBlock[1]) {
            const firstString = lastBlock.find(val => typeof val === 'string');
            if (typeof firstString === 'string' && firstString.trim()) {
              return firstString
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            }
          }
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  const handleRomanize = async (req: Request, res: Response) => {
    try {
      const rawLines = Array.isArray(req.body?.lines)
        ? (req.body.lines as unknown[]).map(l => String(l ?? ''))
        : typeof req.query.q === 'string'
          ? String(req.query.q).split('\n')
          : [];
      const sourceLang = String(req.body?.sourceLang || req.query.sl || 'auto').trim() || 'auto';
      if (rawLines.length === 0) {
        res.json({ romanized: [] });
        return;
      }
      // Chunk into 500-char blocks like spotify-karaoke
      const chunks: string[][] = [];
      let cur: string[] = [];
      let curLen = 0;
      for (const line of rawLines) {
        const nextLen = cur.length === 0 ? line.length : curLen + 1 + line.length;
        if (cur.length > 0 && nextLen > 500) {
          chunks.push(cur);
          cur = [line];
          curLen = line.length;
        } else {
          cur.push(line);
          curLen = nextLen;
        }
      }
      if (cur.length > 0) chunks.push(cur);

      const out: string[] = [];
      for (const chunk of chunks) {
        const rom = await googleRomanizeServerChunk(chunk.join('\n'), sourceLang);
        if (rom && rom.trim()) {
          const split = rom.trim().split('\n');
          for (let i = 0; i < chunk.length; i++) {
            out.push(split[i]?.trim() || chunk[i]);
          }
        } else {
          out.push(...chunk);
        }
      }
      res.json({ romanized: out });
    } catch (err) {
      res.status(502).json({
        detail: err instanceof Error ? err.message : 'Romanization failed.',
      });
    }
  };

  // Synced-source candidate search for Manual Search in TrackFinder.tsx
  const handleAppleCandidates = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control','no-store');
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const duration = Number(req.query.duration || 0);
    if (rawTitle.length < 2) {
      res.json({ candidates: [] });
      return;
    }
    try {
      const candidates: Array<{
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
        ttml?: string;
        syncedLyrics?: string;
        sourceLabel?: string;
      }> = [];

      // 1. Check lrc.red & Binimum ISRC word-sync TTML
      const isrcMatch = await fetchIsrcWordSyncedTtml(
        rawTitle,
        rawArtist,
        duration,
        false,
        rawTitle,
        rawArtist,
        true
      ).catch(() => null);
      if (isrcMatch?.ttml && isrcMatch.title && isrcMatch.artist) {
        candidates.push({
          id: -1001,
          title: isrcMatch.title,
          artist: isrcMatch.artist,
          album: '',
          duration: isrcMatch.duration ?? duration,
          instrumental: false,
          hasSynced: true,
          hasWordSync: isrcMatch.hasWordSync,
          url: isrcMatch.sourceUrl || '',
          confidence: 0.98,
          ttml: isrcMatch.ttml,
          sourceLabel: isrcMatch.source,
        });
      }

      // 2. Search iTunes catalog and check Paxsenix for top matches
      const itunesUrl =
        'https://itunes.apple.com/search?' +
        new URLSearchParams({
          term: `${rawTitle} ${rawArtist}`.trim(),
          media: 'music',
          entity: 'song',
          limit: '6',
        }).toString();
      const itunesRes = await fetch(itunesUrl, {
        headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (itunesRes?.ok) {
        const data = (await itunesRes.json()) as { results?: Array<Record<string, unknown>> };
        const items = (Array.isArray(data.results) ? data.results : []).slice(0, 4);
        await Promise.all(
          items.map(async (item, idx) => {
            const songId = String(item.trackId || '').trim();
            if (!songId || Date.now() < paxsenixSkipUntilMs) return;
            const trackName = String(item.trackName || rawTitle);
            const artistName = String(item.artistName || rawArtist);
            const albumName = String(item.collectionName || '');
            const dur = Math.round(Number(item.trackTimeMillis || 0) / 1000);
            const lyricsUrl = `https://lyrics.paxsenix.org/apple-music/lyrics?id=${encodeURIComponent(songId)}&ttml=true`;
            try {
              const paxRes = await fetch(
                lyricsUrl,
                {
                  headers: { 'User-Agent': STASH_ANDROID_UA },
                  signal: AbortSignal.timeout(4500),
                }
              );
              if (!paxRes.ok) return;
              const body = await paxRes.text();
              let ttml = '';
              if (body.includes('<tt') || body.includes('<p')) {
                ttml = body;
              } else if (body.trim().startsWith('{')) {
                const parsed = JSON.parse(body) as Record<string, unknown>;
                ttml = String(parsed.ttmlContent || parsed.ttml || '');
              }
              if (ttml.includes('<p')) {
                candidates.push({
                  id: -(Number(songId) || 2000 + idx),
                  title: trackName,
                  artist: artistName,
                  album: albumName,
                  duration: dur,
                  instrumental: false,
                  hasSynced: true,
                  hasWordSync: convertTtmlToEnhancedLrc(ttml).hasWordSync,
                  url: lyricsUrl,
                  confidence: Math.max(0.75, 0.95 - idx * 0.04),
                  ttml,
                  sourceLabel: 'Paxsenix · TTML',
                });
              }
            } catch {
              // Ignore individual candidate timeout
            }
          })
        );
      }

      res.json({ candidates });
    } catch {
      res.json({ candidates: [] });
    }
  };

  const handleYouTubeSubtitles = async (req:Request,res:Response) => {
    const videoId=String(req.query.videoId||req.params.videoId||'').trim();
    if(!/^[\w-]{11}$/.test(videoId)){res.status(400).json({detail:'Valid 11-character YouTube videoId is required.'});return;}
    const auth=extractRequestYouTubeAuth(req);
    // Private caption responses must never be shared between signed-in sessions.
    const scope=createHash('sha256').update((auth.accessToken||'')+'|'+(auth.cookie||'')).digest('hex').slice(0,20);
    const cacheKey='ytsub|'+scope+'|'+videoId,cached=lyricsCache.get(cacheKey);
    if(cached&&Date.now()-cached.createdAt<30*60_000){res.json(cached.data);return;}
    const controller=new AbortController();
    const disconnect=()=>{if(!res.writableEnded)controller.abort();};
    res.once('close',disconnect);
    try{
      const result=await fetchYouTubeSubtitlesLrc(videoId,auth,controller.signal);
      if(result){res.json(setLyricsCache(cacheKey,result));}
      else res.status(404).json({code:'no-captions',detail:'This video does not expose a caption track. Import a subtitle file or choose another lyric source.'});
    }catch(error){
      if(controller.signal.aborted)return;
      const code=error instanceof CaptionFetchError?error.code:'unavailable';
      res.status(code==='timeout'?504:code==='restricted'?403:502).json({code,detail:error instanceof Error?error.message:'YouTube caption lookup failed.'});
    }finally{res.removeListener('close',disconnect);}
  };

  const handleLyrics = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control','no-store');
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const duration = Number(req.query.duration || 0);
    const videoId = String(req.query.videoId || '').trim();
    const rawOverride = req.query.rawOverride === '1' || req.query.rawOverride === 'true';
    const isYouTube =
      !rawOverride &&
      (req.query.isYouTube === '1' || req.query.isYouTube === 'true' || Boolean(videoId));
    const requestedSource = String(req.query.source || 'all').toLowerCase();
    if (!['all', 'apple', 'lrclib', 'youtube', 'lrc.red', 'binimum', 'paxsenix'].includes(requestedSource)) {
      res.status(400).json({ detail: 'Unsupported lyrics source.' });
      return;
    }

    // When rawOverride is true (Manual Search), do NOT delete brackets or wipe artist
    const title = rawOverride
      ? rawTitle
      : isYouTube
        ? cleanServerYouTubeTitle(rawTitle, rawArtist)
        : rawTitle;
    const artist = rawOverride ? rawArtist : isYouTube ? '' : rawArtist;

    if (title.length < 2 && !videoId) {
      res.status(400).json({ detail: 'Track title is required.' });
      return;
    }

    const captionAuth=extractRequestYouTubeAuth(req);
    const captionScope=videoId?createHash('sha256').update((captionAuth.accessToken||'')+'|'+(captionAuth.cookie||'')).digest('hex').slice(0,20):'';
    const cacheKey = `${requestedSource}|${rawOverride ? 'raw' : isYouTube ? 'yt' : 'std'}|${title.toLowerCase()}|${artist.toLowerCase()}|${Math.round(duration)}|${videoId}|${captionScope}`;
    const cached = lyricsCache.get(cacheKey);
    const refresh=req.query.refresh==='1'||req.query.refresh==='true';
    if (!refresh && cached && Date.now() - cached.createdAt < 30 * 60_000) {
      res.json(cached.data);
      return;
    }

    try {
      if (requestedSource === 'youtube' && videoId) {
        const ytSub = await fetchYouTubeSubtitlesLrc(videoId,extractRequestYouTubeAuth(req));
        if (ytSub) {
          res.json(setLyricsCache(cacheKey, ytSub));
          return;
        }
        res.status(404).json({ detail: 'No accessible YouTube subtitles available for this video.' });
        return;
      }

      if (requestedSource === 'lrclib') {
        const lrclibOnly = await fetchLrclibServerLyrics(
          title,
          artist,
          duration,
          isYouTube,
          rawTitle,
          rawArtist,
          rawOverride
        );
        if (lrclibOnly) {
          res.json(setLyricsCache(cacheKey, lrclibOnly));
          return;
        }
        res.status(404).json({ detail: 'No matching LRC Library recording found.' });
        return;
      }

      // A broken mapped file retries its original service before the general chain.
      if(['lrc.red','binimum','paxsenix'].includes(requestedSource)){
        let result:ServerLyricsResponse|null=null;
        if(requestedSource==='lrc.red'||requestedSource==='binimum')result=await fetchIsrcWordSyncedTtml(title,artist,duration,isYouTube,rawTitle,rawArtist,rawOverride,requestedSource);
        else result=(await fetchItunesPaxsenixLyrics(title,artist,duration,isYouTube,rawTitle,rawArtist,rawOverride)).lyrics||null;
        if(result){res.json(setLyricsCache(cacheKey,result));}
        else res.status(404).json({detail:'No matching lyrics available from the mapped source.'});
        return;
      }

      // 1. Word-synced TTML via ISRC (lrc.red & Binimum)
      const isrcTtml = await fetchIsrcWordSyncedTtml(
        title,
        artist,
        duration,
        isYouTube,
        rawTitle,
        rawArtist,
        rawOverride
      );
      if (isrcTtml) {
        res.json(setLyricsCache(cacheKey, isrcTtml));
        return;
      }

      // 2. Paxsenix TTML matched through the iTunes catalogue
      const paxResult = await fetchItunesPaxsenixLyrics(
        title,
        artist,
        duration,
        isYouTube,
        rawTitle,
        rawArtist,
        rawOverride
      );
      if (paxResult.lyrics) {
        res.json(setLyricsCache(cacheKey, paxResult.lyrics));
        return;
      }

      if (requestedSource === 'apple') {
        res.status(404).json({ detail: 'No matching lyrics found from lrc.red, Binimum or Paxsenix for this song.' });
        return;
      }

      // 3. LRCLIB synced / word-synced recording lookup
      const lrclibResult = await fetchLrclibServerLyrics(
        title,
        artist,
        duration,
        isYouTube,
        rawTitle,
        rawArtist,
        rawOverride
      );
      if (lrclibResult) {
        if (paxResult.appleTrackViewUrl && !lrclibResult.sourceUrl) {
          lrclibResult.sourceUrl = paxResult.appleTrackViewUrl;
        }
        res.json(setLyricsCache(cacheKey, lrclibResult));
        return;
      }

      // 4. YouTube Subtitles / InnerTube plain lyrics (if videoId is provided)
      if (videoId) {
        const ytSub = await fetchYouTubeSubtitlesLrc(videoId,extractRequestYouTubeAuth(req));
        if (ytSub) {
          res.json(setLyricsCache(cacheKey, ytSub));
          return;
        }
        const innerTubeResult = await fetchInnerTubePlainLyrics(videoId);
        if (innerTubeResult) {
          res.json(setLyricsCache(cacheKey, innerTubeResult));
          return;
        }
      }

      res.status(404).json({ detail: 'No server-side lyrics match found.' });
    } catch (err) {
      res.status(502).json({
        detail: err instanceof Error ? err.message : 'Lyrics lookup failed.',
      });
    }
  };

  let youTubeAuthRevision = 0;
  const handleYouTubeAuth = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const revision = ++youTubeAuthRevision;
    const body = (req.body || {}) as { accessToken?: string; cookie?: string };
    const explicit = Object.hasOwn(body, 'accessToken') || Object.hasOwn(body, 'cookie');
    const previous = serverYouTubeAuth;
    const next: YouTubeAuthContext = {
      accessToken: (typeof body.accessToken === 'string' ? body.accessToken : explicit ? '' :
        String(req.headers['x-youtube-token'] || req.query.accessToken || (req.method === 'GET' ? previous.accessToken || '' : ''))).trim().replace(/^Bearer\s+/i, ''),
      cookie: (typeof body.cookie === 'string' ? body.cookie : explicit ? '' :
        String(req.headers['x-youtube-cookie'] || req.query.cookie || (req.method === 'GET' ? previous.cookie || '' : ''))).trim(),
    };
    // Stop using stale credentials immediately; only a verified account can replace them.
    serverYouTubeAuth = {};
    if (!next.accessToken && !next.cookie) {
      res.json({ authenticated: false, verified: false, hasAccessToken: false, hasCookie: false });
      return;
    }
    try {
      const accountLabel = await verifyYouTubeAccount(next);
      if (revision !== youTubeAuthRevision) {
        res.status(409).json({ authenticated: false, verified: false, detail: 'YouTube connection changed. Try again.' });
        return;
      }
      if (!accountLabel) {
        res.status(401).json({ authenticated: false, verified: false, detail: 'YouTube did not confirm a signed-in account. Sign in again.' });
        return;
      }
      serverYouTubeAuth = next;
      res.json({ authenticated: true, verified: true, accountLabel,
        hasAccessToken: Boolean(next.accessToken), hasCookie: Boolean(next.cookie) });
    } catch {
      res.status(502).json({ authenticated: false, verified: false, detail: 'Unable to verify your YouTube account. Try again when YouTube is reachable.' });
    }
  };

  let blockyCache: { hosts: string[]; syncedSources: string[]; updatedAt: number } | null = null;

  const handleAdBlockSync = async (_req: Request, res: Response) => {
    if (blockyCache && Date.now() - blockyCache.updatedAt < 30 * 60_000) {
      res.json({
        ok: true,
        engine: '0xERR0R/blocky + TheRealJoelmatic/RemoveAdblockThing',
        rulesCount: blockyCache.hosts.length,
        syncedSources: blockyCache.syncedSources,
        hosts: blockyCache.hosts.slice(0, 250),
      });
      return;
    }

    const hostsSet = new Set<string>([
      'doubleclick.net',
      'googlesyndication.com',
      'googleadservices.com',
      'adservice.google.com',
      'pagead2.googlesyndication.com',
      'ads.youtube.com',
      's.youtube.com',
      '2mdn.net',
      'innovid.com',
      'moatads.com',
      'fwmrm.net',
      'imasdk.googleapis.com',
      'fundingchoicesmessages.google.com',
      'google-analytics.com',
      'googletagmanager.com',
      'scorecardresearch.com',
      'quantserve.com',
    ]);
    const syncedSources: string[] = ['0xERR0R/blocky built-in YouTube ad & telemetry list'];

    try {
      const disconnectRes = await fetch('https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt', {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(4500),
      });
      if (disconnectRes.ok) {
        const text = await disconnectRes.text();
        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim().toLowerCase();
          if (!line || line.startsWith('#')) continue;
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(line) && !line.endsWith('youtube.com') && !line.endsWith('googlevideo.com')) {
            hostsSet.add(line);
          }
        }
        syncedSources.push('s3.amazonaws.com/lists.disconnect.me/simple_ad.txt');
      }
    } catch {
      // Non-fatal fallback to built-in list
    }

    const hosts = [...hostsSet];
    blockyCache = {
      hosts,
      syncedSources,
      updatedAt: Date.now(),
    };

    res.json({
      ok: true,
      engine: '0xERR0R/blocky + TheRealJoelmatic/RemoveAdblockThing',
      rulesCount: hosts.length,
      syncedSources,
      hosts: hosts.slice(0, 250),
    });
  };

  const handleSearch = async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const rawProvider = String(req.query.provider || 'jiosaavn').toLowerCase();

    const provider: TrackMetadata['provider'] =
      rawProvider === 'ytmusic'
        ? 'ytmusic'
        : rawProvider === 'soundcloud'
          ? 'soundcloud'
          : rawProvider === 'audius'
            ? 'audius'
            : rawProvider === 'youtube' || rawProvider === 'resolver'
              ? 'youtube'
              : 'jiosaavn';
    const refresh = provider === 'youtube' && req.query.refresh === '1';
    const backgroundTitle = provider === 'youtube' ? String(req.query.backgroundTitle || '') : '';
    const backgroundArtist = String(req.query.backgroundArtist || '').trim();
    const backgroundPreference = req.query.backgroundPreference==='lyrics'?'lyrics':'music';
    if (q.length < (refresh ? 1 : 2)) {
      res.status(400).json({ detail: refresh ? 'Enter a YouTube search query.' : 'Enter at least 2 characters.' });
      return;
    }

    const ytAuth = extractRequestYouTubeAuth(req);

    try {
      let results: TrackMetadata[] = [];
      if (provider === 'jiosaavn') {
        results = await searchJioSaavn(q, 12);
      } else if (provider === 'soundcloud') {
        results = await searchSoundCloud(q, 12);
      } else if (provider === 'ytmusic' || provider === 'youtube') {
        if (refresh) res.setHeader('Cache-Control', 'no-store');
        results = backgroundTitle
          ? await searchBackgroundVideos(backgroundTitle,backgroundArtist,backgroundPreference,ytAuth,refresh)
          : await searchYouTubeMusic(q, provider, provider === 'youtube' ? 28 : 20, ytAuth, refresh);
      } else if (provider === 'audius') {
        results = await searchAudius(q, 12);
      }

      res.json({
        data: results.map(t => ({
          id: t.id,
          provider: t.provider === 'youtube' ? 'resolver' : t.provider,
          title: t.title,
          videoTitle: t.videoTitle || t.title,
          artist: t.artist,
          primaryArtist: t.primaryArtist,
          featuredArtist: t.featuredArtist,
          album: t.album,
          duration: t.duration,
          viewCount: t.viewCount,
          channelId:t.channelId,channelVerified:t.channelVerified,uploaderName:t.uploaderName,artistCredits:t.artistCredits,artistChannelIds:t.artistChannelIds,
          counterpartOf:t.counterpartOf,catalogueTitle:t.catalogueTitle,catalogueArtists:t.catalogueArtists,catalogueAlbum:t.catalogueAlbum,embeddable:t.embeddable,
          visualContent:t.visualContent,metadataSource:t.metadataSource,
          videoType: t.videoType,
          sourceUrl: t.sourceUrl,
          artwork: t.artwork,
          youtubeVideoId:
            (t.provider === 'youtube' || t.provider === 'ytmusic') &&
            /^[a-zA-Z0-9_-]{11}$/.test(t.rawId)
              ? t.rawId
              : undefined,
          audioSource:
            t.provider === 'jiosaavn'
              ? 'JioSaavn (320kbps AAC)'
              : t.provider === 'ytmusic'
                ? 'YouTube Music'
                : t.provider === 'soundcloud'
                  ? 'SoundCloud (Full Stream)'
                  : t.provider === 'audius'
                    ? 'Audius (Direct Stream)'
                    : 'YouTube Video',
        })),
      });
    } catch (err) {
      res.status(502).json({
        detail: err instanceof Error ? err.message : 'Music search failed.',
      });
    }
  };

  const handleResolve = async (req: Request, res: Response) => {
    const rawTrackId = String(req.params.trackId || '').trim();
    if (!/^[\w-]{3,80}$/.test(rawTrackId)) {
      res.status(400).json({ detail: 'Invalid track identifier.' });
      return;
    }

    try {
      const existingStream = streamCache.get(rawTrackId);
      if (existingStream && Date.now() - existingStream.createdAt < 15 * 60_000) {
        res.json({
          streamPath: `/audio/${rawTrackId}`,
          format: existingStream.format,
          audioSource: existingStream.audioSource,
          youtubeVideoId: existingStream.youtubeVideoId,
          track: existingStream.track,
        });
        return;
      }

      let meta = trackMetaCache.get(rawTrackId);
      if (!meta && rawTrackId.startsWith('saavn_')) {
        meta = (await fetchJioSaavnTrackById(rawTrackId.slice('saavn_'.length))) || undefined;
      }
      if (!meta && rawTrackId.startsWith('yt_') && /^[a-zA-Z0-9_-]{11}$/.test(rawTrackId.slice(3))) {
        const vid = rawTrackId.slice(3);
        meta = {
          id: rawTrackId,
          rawId: vid,
          provider: 'youtube',
          title: 'YouTube Video',
          artist: 'YouTube',
          album: '',
          duration: 0,
          sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
          artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        };
      }
      if (!meta && rawTrackId.startsWith('sc_')) {
        meta = {
          id: rawTrackId,
          rawId: rawTrackId.slice('sc_'.length),
          provider: 'soundcloud',
          title: 'SoundCloud Track',
          artist: '',
          album: '',
          duration: 0,
          sourceUrl: 'https://soundcloud.com',
        };
      }
      if (!meta && rawTrackId.startsWith('audius_')) {
        meta = {
          id: rawTrackId,
          rawId: rawTrackId.slice('audius_'.length),
          provider: 'audius',
          title: 'Audius Track',
          artist: '',
          album: '',
          duration: 0,
          sourceUrl: 'https://audius.co',
        };
      }

      if (!meta) {
        res.status(404).json({ detail: 'Track expired or not found. Please search again.' });
        return;
      }

      let resolvedStream: { url: string; format: 'audio' | 'hls' | 'youtube'; streamSource?: string } | null = null;
      let audioSourceLabel = 'Online Stream';
      const ytVideoId =
        (meta.provider === 'youtube' || meta.provider === 'ytmusic') &&
        /^[a-zA-Z0-9_-]{11}$/.test(meta.rawId)
          ? meta.rawId
          : undefined;

      if (meta.provider === 'jiosaavn') {
        const encUrl =
          meta.encryptedMediaUrl ||
          (await fetchJioSaavnTrackById(meta.rawId))?.encryptedMediaUrl;
        if (encUrl) {
          const url = await resolveJioSaavnStreamUrl(encUrl);
          if (url) {
            resolvedStream = { url, format: 'audio', streamSource: 'JioSaavn 320kbps AAC' };
            audioSourceLabel = 'JioSaavn (320kbps AAC)';
          }
        }
      } else if (meta.provider === 'soundcloud') {
        const sc = await resolveSoundCloudStream(meta);
        if (sc) {
          resolvedStream = { ...sc, streamSource: 'SoundCloud Full Stream' };
          audioSourceLabel = 'SoundCloud (Full Stream)';
        }
      } else if (meta.provider === 'audius') {
        resolvedStream = {
          url: `https://api.audius.co/v1/tracks/${encodeURIComponent(meta.rawId)}/stream?app_name=LyricFlow`,
          format: 'audio',
          streamSource: 'Audius Direct Stream',
        };
        audioSourceLabel = 'Audius (Direct Stream)';
      } else if (meta.provider === 'youtube') {
        if (ytVideoId) {
          resolvedStream = {
            url: `https://www.youtube.com/watch?v=${ytVideoId}`,
            format: 'youtube',
            streamSource: 'YouTube Embedded Video',
          };
          audioSourceLabel = 'YouTube Video';
        }
      } else if (meta.provider === 'ytmusic') {
        const matched = await resolveByMetadataMatch(meta);
        if (matched) {
          resolvedStream = matched;
          audioSourceLabel = `YouTube Music · ${matched.streamSource}`;
        } else if (ytVideoId) {
          resolvedStream = {
            url: `https://www.youtube.com/watch?v=${ytVideoId}`,
            format: 'youtube',
            streamSource: 'YouTube Embedded Video',
          };
          audioSourceLabel = 'YouTube Video';
        }
      }

      if (!resolvedStream) {
        res.status(404).json({
          detail:
            'Exact studio recording stream unavailable for this track. Try the JioSaavn or YouTube tab.',
        });
        return;
      }

      const enrichedTrack = {
        ...meta,
        audioSource: audioSourceLabel,
      };

      setStreamCache(rawTrackId, {
        url: resolvedStream.url,
        format: resolvedStream.format,
        audioSource: audioSourceLabel,
        youtubeVideoId: ytVideoId,
        track: enrichedTrack,
        createdAt: Date.now(),
      });

      res.json({
        streamPath: `/audio/${rawTrackId}`,
        format: resolvedStream.format,
        audioSource: audioSourceLabel,
        youtubeVideoId: ytVideoId,
        track: {
          id: meta.id,
          provider: meta.provider === 'youtube' ? 'resolver' : meta.provider,
          title: meta.title,
          videoTitle: meta.videoTitle || meta.title,
          artist: meta.artist,
          primaryArtist: meta.primaryArtist,
          featuredArtist: meta.featuredArtist,
          album: meta.album,
          duration: meta.duration,
          sourceUrl: meta.sourceUrl,
          artwork: meta.artwork,
          youtubeVideoId: ytVideoId,
          audioSource: audioSourceLabel,
        },
      });
    } catch (err) {
      res.status(502).json({
        detail: err instanceof Error ? err.message : 'Unable to resolve stream.',
      });
    }
  };

  const handleAudio = async (req: Request, res: Response) => {
    const rawTrackId = String(req.params.trackId || '').trim();
    const entry = streamCache.get(rawTrackId);
    if (!entry) {
      res.status(404).json({ detail: 'Stream expired; resolve the track again.' });
      return;
    }

    try {
      // HLS M3U8 playlist rewriting so segments & init map load through our CORS-safe proxy
      if (entry.format === 'hls') {
        const playlistRes = await fetch(entry.url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(12000),
        });
        if (!playlistRes.ok) {
          res.status(502).json({ detail: 'Upstream HLS playlist unavailable.' });
          return;
        }
        const text = await playlistRes.text();
        const prefix = req.originalUrl.startsWith('/music/') ? '/music/audio/' : '/audio/';

        const registerSegment = (rawUri: string) => {
          const fullUrl = new URL(rawUri.trim(), entry.url).toString();
          const token = `segment_${createHash('sha1').update(fullUrl).digest('hex').slice(0, 24)}`;
          setStreamCache(token, {
            url: fullUrl,
            format: fullUrl.includes('.m3u8') ? 'hls' : 'audio',
            createdAt: Date.now(),
          });
          return `${prefix}${token}`;
        };

        const rewritten = text
          .split(/\r?\n/)
          .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${registerSegment(uri)}"`);
            }
            return registerSegment(trimmed);
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(rewritten);
        return;
      }

      // Standard audio / segment stream with HTTP Range support
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': USER_AGENT,
      };
      if (typeof req.headers.range === 'string') {
        upstreamHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(entry.url, {
        headers: upstreamHeaders,
        redirect: 'follow',
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({ detail: `Upstream audio returned ${upstream.status}` });
        return;
      }

      res.status(upstream.status);
      const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of forwardHeaders) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      if (!res.getHeader('content-type')) {
        res.setHeader('content-type', 'audio/mp4');
      }
      if (!res.getHeader('accept-ranges')) {
        res.setHeader('accept-ranges', 'bytes');
      }

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          detail: err instanceof Error ? err.message : 'Audio stream interrupted.',
        });
      }
    }
  };

  // Mount under both /music/* and root /* for full compatibility
  app.use(express.json({ limit: '512kb' }));
  app.get(['/music/health', '/health'], handleHealth);
  app.post(['/music/yt-auth', '/yt-auth'], handleYouTubeAuth);
  app.get(['/music/yt-auth', '/yt-auth'], handleYouTubeAuth);
  app.post(['/music/adblock/sync', '/adblock/sync', '/music/adblock/status', '/adblock/status'], handleAdBlockSync);
  app.get(['/music/adblock/sync', '/adblock/sync', '/music/adblock/status', '/adblock/status'], handleAdBlockSync);
  app.get(['/music/lyrics', '/lyrics'], handleLyrics);
  app.get(['/music/lyrics-stage', '/lyrics-stage'], async (req, res) => {
    const title = typeof req.query.title === 'string' ? req.query.title : '';
    const artist = typeof req.query.artist === 'string' && req.query.artist.trim() ? req.query.artist : undefined;
    const duration = Number(req.query.duration) || 0;
    const provider = req.query.provider as LyricsStageProvider;
    if (title.trim().length < 2 || title.length > 500 || (artist?.length ?? 0) > 500 ||
        !Number.isFinite(duration) || duration < 0 || !lyricsStageProviders.includes(provider)) {
      res.status(400).json({ detail: 'Invalid lyrics search stage.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    try {
      res.json(await searchLyricsStageProvider(provider, { title, artist, duration }, controller.signal));
    } catch {
      if (!controller.signal.aborted) res.status(502).json({ detail: 'Lyrics provider request failed.' });
    }
  });

  app.get(['/music/apple-candidates', '/apple-candidates'], handleAppleCandidates);
  app.post(['/music/romanize', '/romanize'], handleRomanize);
  app.get(['/music/romanize', '/romanize'], handleRomanize);
  app.get(['/music/yt-subtitles', '/yt-subtitles', '/music/yt-subtitles/:videoId'], handleYouTubeSubtitles);
  app.get(['/music/sponsorblock/:videoId', '/sponsorblock/:videoId', '/music/sponsorblock'], handleSponsorBlock);
  app.get(['/music/search', '/search'], handleSearch);
  app.get(['/music/resolve/:trackId', '/resolve/:trackId'], handleResolve);
  app.get(['/music/audio/:trackId', '/audio/:trackId'], handleAudio);

  if (options.apiOnly) {
    app.use((_req, res) => res.status(404).json({detail: 'Unknown local service endpoint.'}));
  } else if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = options.port ?? Number(process.env.PORT || 3000);
  // Local development should not expose audio/search endpoints to the LAN
  // without an explicit opt-in. Embedded Android already supplies loopback.
  const host = options.host ?? (process.env.HOST?.trim() || '127.0.0.1');
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.once('error', reject);
  });
}

if (process.env.LYRICFLOW_EMBEDDED !== '1') {
  void startServer().catch(error => {
    console.error('LyricFlow server could not start:', error);
    process.exitCode = 1;
  });
}

