import express, { type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import dns from 'node:dns';
import nodeHttp, { type Server } from 'node:http';
import nodeHttps from 'node:https';
import nodeTls from 'node:tls';
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
  artist: string;
  album: string;
  duration: number;
  sourceUrl: string;
  artwork?: string;
  audioSource?: string;
  videoType?: 'ATV' | 'OMV' | 'UGC';
  viewCount?: number;
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

function setLyricsCache(key: string, data: ServerLyricsResponse) {
  if (lyricsCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey) lyricsCache.delete(oldestKey);
  }
  lyricsCache.set(key, { data, createdAt: Date.now() });
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

function parseViewCountFromRenderer(vr: Record<string, unknown>): number | undefined {
  const extractText = (field: unknown): string => {
    if (!field || typeof field !== 'object') return '';
    const rec = field as Record<string, unknown>;
    if (typeof rec.simpleText === 'string') return rec.simpleText;
    if (Array.isArray(rec.runs)) {
      return rec.runs
        .map(r => (r && typeof r === 'object' ? String((r as Record<string, unknown>).text || '') : ''))
        .join('');
    }
    return '';
  };
  const raw = extractText(vr.viewCountText) || extractText(vr.shortViewCountText);
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, '').trim();
  const suffixMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*([KMBkmb])\b/);
  if (suffixMatch) {
    const base = Number(suffixMatch[1]);
    const mult =
      suffixMatch[2].toUpperCase() === 'B'
        ? 1_000_000_000
        : suffixMatch[2].toUpperCase() === 'M'
          ? 1_000_000
          : 1_000;
    return Number.isFinite(base) ? Math.round(base * mult) : undefined;
  }
  const digitsMatch = cleaned.match(/(\d+)/);
  if (digitsMatch) {
    const val = Number(digitsMatch[1]);
    return Number.isFinite(val) && val > 0 ? val : undefined;
  }
  return undefined;
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

    const artistMap =
      moreInfo.artistMap && typeof moreInfo.artistMap === 'object'
        ? (moreInfo.artistMap as Record<string, unknown>)
        : {};
    const primaryArtists = Array.isArray(artistMap.primary_artists)
      ? artistMap.primary_artists
      : [];
    const artistNames = primaryArtists
      .map(a => (a && typeof a === 'object' ? String((a as Record<string, unknown>).name || '') : ''))
      .filter(Boolean)
      .join(', ');
    const artist = decodeHtmlEntities(
      artistNames || String(moreInfo.music || item.subtitle || 'Unknown artist')
    );
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

  const artistMap =
    moreInfo.artistMap && typeof moreInfo.artistMap === 'object'
      ? (moreInfo.artistMap as Record<string, unknown>)
      : {};
  const primaryArtists = Array.isArray(artistMap.primary_artists)
    ? artistMap.primary_artists
    : [];
  const artistNames = primaryArtists
    .map(a => (a && typeof a === 'object' ? String((a as Record<string, unknown>).name || '') : ''))
    .filter(Boolean)
    .join(', ');

  const trackId = `saavn_${rawId.replace(/[^\w-]/g, '')}`;
  const meta: TrackMetadata = {
    id: trackId,
    rawId,
    provider: 'jiosaavn',
    title: decodeHtmlEntities(String(item.title || item.song || 'Unknown title')),
    artist: decodeHtmlEntities(
      artistNames || String(moreInfo.primary_artists || item.primary_artists || item.subtitle || 'Unknown artist')
    ),
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

interface YouTubeAuthContext {
  accessToken?: string;
  cookie?: string;
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

function buildYouTubeAuthHeaders(
  auth?: YouTubeAuthContext,
  origin = 'https://www.youtube.com'
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!auth) return headers;
  const token = (auth.accessToken || '').trim();
  const cookie = (auth.cookie || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (cookie) {
    headers.Cookie = cookie;
    headers['X-Origin'] = origin;
    headers['X-Goog-AuthUser'] = '0';
    const sapisidMatch =
      cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/) ||
      cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/);
    if (sapisidMatch?.[1] && !headers.Authorization) {
      const sapisid = sapisidMatch[1].trim();
      const ts = Math.floor(Date.now() / 1000);
      const digest = createHash('sha1')
        .update(`${ts} ${sapisid} ${origin}`)
        .digest('hex');
      const tokenHash = `${ts}_${digest}`;
      headers.Authorization = `SAPISIDHASH ${tokenHash} SAPISID1PHASH ${tokenHash} SAPISID3PHASH ${tokenHash}`;
    }
  }
  return headers;
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
        const trackId = `yt_${videoId}`;
        const meta: TrackMetadata = {
          id: trackId,
          rawId: videoId,
          provider: 'youtube',
          title,
          artist: author.replace(/\s*[-–]\s*Topic$/i, '').trim() || 'YouTube',
          album: '',
          duration: 0,
          videoType: 'OMV',
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

async function fetchYouTubeDataApiVideos(
  query: string,
  accessToken: string,
  limit = 16
): Promise<TrackMetadata[]> {
  if (!accessToken.trim()) return [];
  try {
    const searchUrl =
      'https://www.googleapis.com/youtube/v3/search?' +
      new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: String(Math.min(25, Math.max(10, limit))),
        q: query.trim(),
      }).toString();
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };
    const items = Array.isArray(data.items) ? data.items : [];
    const tracks: TrackMetadata[] = [];
    for (const item of items) {
      const videoId = String(item.id?.videoId || '').trim();
      const rawTitle = decodeHtmlEntities(String(item.snippet?.title || '').trim());
      const rawChannel = decodeHtmlEntities(String(item.snippet?.channelTitle || 'YouTube').trim());
      if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !rawTitle) continue;
      const isTopic = /\s*[-–]\s*Topic$/i.test(rawChannel);
      const channelName = rawChannel.replace(/\s*[-–]\s*Topic$/i, '').trim();
      const trackId = `yt_${videoId}`;
      const meta: TrackMetadata = {
        id: trackId,
        rawId: videoId,
        provider: 'youtube',
        title: rawTitle,
        artist: isTopic ? `${channelName} - Topic` : channelName,
        album: isTopic ? 'Audio Track' : '',
        duration: 0,
        videoType: isTopic ? 'ATV' : 'OMV',
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
      setTrackMetaCache(trackId, meta);
      tracks.push(meta);
      if (tracks.length >= limit) break;
    }
    return tracks;
  } catch {
    return [];
  }
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

function parseYouTubeSearchTree(root: unknown, limit: number): TrackMetadata[] {
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
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId) && !seenWebIds.has(videoId)) {
        const rawTitle = decodeHtmlEntities(
          extractTextFromRunsOrSimple(renderer.title || renderer.headline).trim()
        );
        const rawChannel = decodeHtmlEntities(
          (
            extractTextFromRunsOrSimple(renderer.ownerText) ||
            extractTextFromRunsOrSimple(renderer.longBylineText) ||
            extractTextFromRunsOrSimple(renderer.shortBylineText) ||
            'YouTube'
          ).trim()
        );
        const isTopicChannel = /\s*[-–]\s*Topic$/i.test(rawChannel);
        const channelName = rawChannel.replace(/\s*[-–]\s*Topic$/i, '').trim();
        const lengthText = extractTextFromRunsOrSimple(renderer.lengthText);
        const duration = parseDurationText(lengthText);
        const viewCount = parseViewCountFromRenderer(renderer);
        if (rawTitle && (duration === 0 || duration >= 45)) {
          seenWebIds.add(videoId);
          const trackId = `yt_${videoId}`;
          const meta: TrackMetadata = {
            id: trackId,
            rawId: videoId,
            provider: 'youtube',
            title: rawTitle,
            artist: isTopicChannel ? `${channelName} - Topic` : channelName,
            album: isTopicChannel ? 'Audio Track' : '',
            duration,
            viewCount,
            videoType: isTopicChannel ? 'ATV' : 'OMV',
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          };
          setTrackMetaCache(trackId, meta);
          webTracks.push(meta);
        }
      }
    }
    for (const val of Object.values(rec)) walkWeb(val);
  };

  walkWeb(root);
  return webTracks;
}

async function fetchPipedOrInvidiousVideos(query: string, limit = 16): Promise<TrackMetadata[]> {
  const q = encodeURIComponent(query.trim());
  const endpoints = [
    { url: `https://pipedapi.kavin.rocks/search?q=${q}&filter=videos`, type: 'piped' as const },
    { url: `https://api.piped.private.coffee/search?q=${q}&filter=videos`, type: 'piped' as const },
    { url: `https://inv.nadeko.net/api/v1/search?q=${q}&type=video`, type: 'invidious' as const },
    { url: `https://invidious.nerdvpn.de/api/v1/search?q=${q}&type=video`, type: 'invidious' as const },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6500),
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
        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
        const title = decodeHtmlEntities(String(item.title || '').trim());
        if (!title) continue;
        const rawAuthor = decodeHtmlEntities(
          String(item.uploaderName || item.author || 'YouTube').trim()
        );
        const isTopic = /\s*[-–]\s*Topic$/i.test(rawAuthor);
        const artist = rawAuthor.replace(/\s*[-–]\s*Topic$/i, '').trim() || 'YouTube';
        const duration = Number(item.duration ?? item.lengthSeconds ?? 0);
        if (duration > 0 && duration < 45) continue;
        const views = Number(item.views ?? item.viewCount ?? 0);
        seen.add(videoId);
        const trackId = `yt_${videoId}`;
        const meta: TrackMetadata = {
          id: trackId,
          rawId: videoId,
          provider: 'youtube',
          title,
          artist: isTopic ? `${artist} - Topic` : artist,
          album: isTopic ? 'Audio Track' : '',
          duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
          viewCount: Number.isFinite(views) && views > 0 ? views : undefined,
          videoType: isTopic ? 'ATV' : 'OMV',
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
        setTrackMetaCache(trackId, meta);
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

async function fetchYouTubeWebVideos(
  query: string,
  limit = 16,
  ytAuth?: YouTubeAuthContext
): Promise<TrackMetadata[]> {
  const directVideoId = extractDirectVideoIdFromQuery(query);
  if (directVideoId) {
    const directMeta = await resolveDirectYouTubeVideoQuery(directVideoId);
    if (directMeta) return [directMeta];
  }

  // 1. If user signed in with YouTube OAuth token, query official YouTube Data API v3 first
  if (ytAuth?.accessToken) {
    const apiTracks = await fetchYouTubeDataApiVideos(query, ytAuth.accessToken, limit);
    if (apiTracks.length > 0) return apiTracks;
  }

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
              gl: 'US',
              ...clientCfg.extra,
            },
          },
          query: query.trim(),
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!ytRes.ok) continue;
      const rawJson = await ytRes.json();
      const tracks = parseYouTubeSearchTree(rawJson, limit);
      if (tracks.length > 0) return tracks;
    } catch {
      // Try next Innertube client
    }
  }

  // 3. Fallback to Piped / Invidious public video search mirrors if YouTube Innertube is rate-limited
  return fetchPipedOrInvidiousVideos(query, limit);
}

async function searchYouTubeMusic(
  query: string,
  provider: 'ytmusic' | 'youtube',
  limit = 16,
  ytAuth?: YouTubeAuthContext
): Promise<TrackMetadata[]> {
  if (provider === 'youtube') {
    const trimmed = query.trim();
    const strippedQuery = trimmed
      .replace(/\b(?:official\s*)?music\s*video$/i, '')
      .replace(/\(from\s+["']?[^)"']+["']?\)/gi, ' ')
      .replace(/\[from\s+["']?[^\]"']+["']?\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const queries =
      strippedQuery && strippedQuery.toLowerCase() !== trimmed.toLowerCase() && !/\blyric(?:s|al)?\s*video$/i.test(trimmed)
        ? [strippedQuery, trimmed]
        : [trimmed];
    const batches = await Promise.all(queries.map(q => fetchYouTubeWebVideos(q, limit, ytAuth)));
    const merged: TrackMetadata[] = [];
    const seenIds = new Set<string>();
    for (const list of batches) {
      for (const item of list) {
        if (!seenIds.has(item.rawId)) {
          seenIds.add(item.rawId);
          merged.push(item);
        }
      }
    }
    if (merged.length > 0) {
      return merged.slice(0, limit);
    }
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
//    Exact Stash LyricsModule.kt chain:
//    1. isrcTtml (lrc.red + MusicBrainz ISRC -> lrc.red/s/{isrc}.ttml & lyrics-storage.binimum.org/{isrc}.ttml)
//    2. appleTtml (itunes.apple.com -> lyrics.paxsenix.org)
//    3. lrclib (lrclib.net/api/get & /api/search)
//    4. kugou (mobilecdn.kugou.com -> krcs.kugou.com)
//    5. innerTube (music.youtube.com/youtubei/v1/next -> MPLY* browse)
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
  const strippedUnicode = rawTitle.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
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
    if (/^(?:track\s*\d+|song|video|audio|ost|bgm|official)$/i.test(candidateLeft) && candidateRight.length >= 2) {
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
 * After retrieving multiple options from Apple Library / lrc.red / iTunes / LRCLIB,
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
  const cleanCandTitle = normalizeServerText(
    ctx.rawOverride ? cand.title : cleanServerYouTubeTitle(cand.title) || cand.title
  );
  const strippedCandTitle = normalizeServerText(cleanServerYouTubeTitle(cand.title) || cand.title);
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
      return -1;
    }
    const dist = durationDistanceScore(candDur, ctx.durationSec, ctx.isYouTube || Boolean(ctx.rawOverride));
    score += Math.max(0, 20 - Math.round(dist * 1.2));
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
  rawOverride = false
): Promise<ServerLyricsResponse | null> {
  const isrcCandidates: string[] = [];
  const effectiveArtist = isYouTube && !rawOverride ? '' : artist;
  const matchCtx = {
    cleanTitle: title,
    rawTitle: rawTitle || title,
    rawArtist: rawArtist || artist,
    durationSec,
    isYouTube,
    rawOverride,
  };

  // Step 1: Resolve ISRC via lrc.red/api/v1 (Stash IsrcResolver.kt primary)
  try {
    const params = new URLSearchParams({ track: title });
    if (effectiveArtist) params.set('artist', effectiveArtist);
    const searchUrl = 'https://lrc.red/api/v1?' + params.toString();

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': STASH_ANDROID_UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (searchRes.ok) {
      const body = (await searchRes.json()) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(body.results) ? body.results : [];
      const scored = results
        .map(item => {
          const isrc = String(item.isrc || '').trim().toUpperCase();
          if (isrc.length !== 12) return { isrc: '', score: -1 };
          const rawDur = Number(item.duration || 0);
          const itemDurSec = rawDur > 1500 ? rawDur / 1000 : rawDur;
          const itemTitle = String(item.title || item.name || item.track || title);
          const itemArtist = String(item.artist || item.artist_name || '');
          const itemAlbum = String(item.album || item.album_name || '');
          const hasWordSync = String(item.timing_type || '').toLowerCase() === 'word';
          const score = scoreServerCandidateAgainstContext(
            {
              title: itemTitle,
              artist: itemArtist,
              album: itemAlbum,
              duration: itemDurSec,
              hasWordSync,
            },
            matchCtx
          );
          return { isrc, score };
        })
        .filter(entry => entry.score >= 45 && entry.isrc.length === 12)
        .sort((a, b) => b.score - a.score);

      for (const entry of scored) {
        if (!isrcCandidates.includes(entry.isrc)) {
          isrcCandidates.push(entry.isrc);
        }
      }
    }
  } catch {
    // Continue to MusicBrainz ISRC fallback
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
            return { rec, score };
          })
          .filter(x => x.score >= 45)
          .sort((a, b) => b.score - a.score);

        for (const { rec } of scoredRecs) {
          for (const rawIsrc of rec.isrcs || []) {
            const cleanIsrc = String(rawIsrc || '').trim().toUpperCase();
            if (cleanIsrc.length === 12 && !isrcCandidates.includes(cleanIsrc)) {
              isrcCandidates.push(cleanIsrc);
            }
          }
        }
      }
    } catch {
      // Ignore MusicBrainz error
    }
  }

  // Step 3: Fetch TTML XML from lrc.red and Binimum (Stash IsrcTtmlLyricsSource.kt)
  for (const isrc of isrcCandidates.slice(0, 4)) {
    const ttmlProviders = [
      { name: 'Apple Music · Word-Synced TTML (lrc.red)', url: `https://lrc.red/s/${isrc}.ttml` },
      {
        name: 'Apple Music · Word-Synced TTML (Binimum)',
        url: `https://lyrics-storage.binimum.org/${isrc}.ttml`,
      },
    ];
    for (const provider of ttmlProviders) {
      try {
        const ttmlRes = await fetch(provider.url, {
          headers: { 'User-Agent': STASH_ANDROID_UA },
          signal: AbortSignal.timeout(5000),
        });
        if (!ttmlRes.ok) continue;
        const xml = await ttmlRes.text();
        if (xml.includes('<p') && xml.includes('<span')) {
          return {
            ttml: xml,
            source: provider.name,
            sourceUrl: provider.url,
            hasWordSync: true,
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
  let songId = '';
  let trackViewUrl = '';
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
    const itunesUrl =
      'https://itunes.apple.com/search?' +
      new URLSearchParams({
        term: `${title} ${effectiveArtist}`.trim(),
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
      const scored = results
        .map(item => {
          const trackName = String(item.trackName || '');
          const artistName = String(item.artistName || '');
          const albumName = String(item.collectionName || '');
          const dur = Number(item.trackTimeMillis || 0) / 1000;
          const score = scoreServerCandidateAgainstContext(
            { title: trackName, artist: artistName, album: albumName, duration: dur },
            matchCtx
          );
          return { item, score };
        })
        .filter(x => x.score >= 45)
        .sort((a, b) => b.score - a.score);

      const best = scored[0]?.item;
      if (best) {
        songId = String(best.trackId || '').trim();
        trackViewUrl = String(best.trackViewUrl || '').trim();
      }
    }
  } catch {
    // Ignore iTunes error
  }

  if (!songId || Date.now() < paxsenixSkipUntilMs) {
    return { appleTrackViewUrl: trackViewUrl || undefined };
  }

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
            source: 'Apple Music · Word-Synced TTML (Paxsenix)',
            sourceUrl: trackViewUrl || undefined,
            hasWordSync: body.includes('<span'),
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
              source: 'Apple Music · Word-Synced TTML (Paxsenix)',
              sourceUrl: trackViewUrl || undefined,
              hasWordSync: embeddedTtml.includes('<span'),
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

  return { appleTrackViewUrl: trackViewUrl || undefined };
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
            source: synced.includes('<') ? 'LRCLIB · Word-Synced' : 'LRCLIB · Synced Recording',
            sourceUrl: item.id ? `https://lrclib.net/api/get/${String(item.id)}` : undefined,
            hasWordSync: synced.includes('<'),
          };
        }
      }
    }

    const searchParams = new URLSearchParams({ track_name: title });
    if (effectiveArtist) searchParams.set('artist_name', effectiveArtist);
    const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
      headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5500),
    });
    if (searchRes.ok) {
      const list = (await searchRes.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(list)) {
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
                hasWordSync: synced.includes('<'),
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
            source: synced.includes('<') ? 'LRCLIB · Word-Synced' : 'LRCLIB · Synced',
            sourceUrl: best.id ? `https://lrclib.net/api/get/${String(best.id)}` : undefined,
            hasWordSync: synced.includes('<'),
          };
        }
      }
    }
  } catch {
    // Ignore LRCLIB errors
  }
  return null;
}

// 5C-2. MusixMatch Lyrics via Paxsenix (with strict scramble rejection)
function isScrambledMusixmatch(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('wob gopini') ||
    lower.includes('gopini den') ||
    lower.includes('musixmatch.com/verify') ||
    lower.includes('unfortunately we are not licensed')
  );
}

async function fetchMusixmatchServerLyrics(
  title: string,
  artist: string
): Promise<ServerLyricsResponse | null> {
  if (!artist || Date.now() < paxsenixSkipUntilMs) return null;
  try {
    const url =
      'https://lyrics.paxsenix.org/musixmatch/lyrics?' +
      new URLSearchParams({ title, artist }).toString();
    const res = await fetch(url, {
      headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const rawText = await res.text();
    if (!rawText || isScrambledMusixmatch(rawText)) return null;
    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const synced = String(parsed.synced || parsed.lrc || '').trim();
      if (synced.includes('[') && !isScrambledMusixmatch(synced)) {
        return {
          lrc: synced,
          source: synced.includes('<') ? 'MusixMatch · Word-Synced' : 'MusixMatch · Synced LRC',
          hasWordSync: synced.includes('<'),
        };
      }
    }
  } catch {
    // Ignore MusixMatch error
  }
  return null;
}

// 5D. KuGou Synced LRC (Stash KugouLyricsSource.kt)
const KUGOU_CREDIT_LINE =
  /^\s*(?:作词|作詞|作曲|编曲|編曲|制作人|製作人|混音|母带|母帶|吉他|贝斯|貝斯|鼓|弦乐|弦樂|和声|和聲|录音|錄音|监制|監製|出品|发行|發行|OP|SP|Lyrics by|Composed by|Arranged by|Produced by)\s*[:：]/i;

function normalizeKugouLrc(raw: string): string {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => {
      const textAfterTimestamps = line.replace(/^\s*(?:\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+/, '').trim();
      return !KUGOU_CREDIT_LINE.test(textAfterTimestamps);
    })
    .join('\n')
    .trim();
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(cleaned) ? cleaned : '';
}

async function fetchKugouSyncedLrc(
  title: string,
  artist: string,
  durationSec: number,
  isYouTube = false
): Promise<ServerLyricsResponse | null> {
  const effectiveArtist = isYouTube ? '' : artist;
  try {
    const keyword = effectiveArtist ? `${title} - ${effectiveArtist}` : title;
    const searchUrl =
      'http://mobilecdn.kugou.com/api/v3/search/song?' +
      new URLSearchParams({
        format: 'json',
        page: '1',
        pagesize: '10',
        showtype: '1',
        keyword,
      }).toString();

    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      data?: { info?: Array<Record<string, unknown>> };
    };
    const infoList = Array.isArray(searchJson.data?.info) ? searchJson.data!.info! : [];
    const matching = infoList
      .filter(item => {
        const songName = String(item.songname || '');
        const singerName = String(item.singername || '');
        const dur = Number(item.duration || 0);
        if (!sameVersionSignature(title, songName)) return false;
        if (effectiveArtist && singerName && !hasArtistOverlap(effectiveArtist, singerName)) return false;
        if (!isDurationCompatible(dur, durationSec, isYouTube)) return false;
        return Boolean(item.hash);
      })
      .sort((a, b) => {
        const aDur = Number(a.duration || 0);
        const bDur = Number(b.duration || 0);
        return (
          durationDistanceScore(aDur, durationSec, isYouTube) -
          durationDistanceScore(bDur, durationSec, isYouTube)
        );
      });

    const bestSong = matching[0];
    if (!bestSong?.hash) return null;

    const hash = String(bestSong.hash);
    const durMs = Math.max(1000, Number(bestSong.duration || durationSec || 180) * 1000);
    const krcSearchUrl =
      'https://krcs.kugou.com/search?' +
      new URLSearchParams({
        ver: '1',
        man: 'yes',
        client: 'pc',
        keyword,
        duration: String(durMs),
        hash,
      }).toString();

    const krcRes = await fetch(krcSearchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!krcRes.ok) return null;
    const krcJson = (await krcRes.json()) as {
      candidates?: Array<{ id?: string; accesskey?: string }>;
    };
    const cand = krcJson.candidates?.[0];
    if (!cand?.id || !cand?.accesskey) return null;

    const dlUrl =
      'https://krcs.kugou.com/download?' +
      new URLSearchParams({
        ver: '1',
        client: 'pc',
        id: String(cand.id),
        accesskey: String(cand.accesskey),
        fmt: 'lrc',
        charset: 'utf8',
      }).toString();

    const dlRes = await fetch(dlUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!dlRes.ok) return null;
    const dlJson = (await dlRes.json()) as { content?: string };
    if (!dlJson.content) return null;

    const decoded = Buffer.from(dlJson.content, 'base64').toString('utf8');
    const normalized = normalizeKugouLrc(decoded);
    if (normalized) {
      return {
        lrc: normalized,
        source: 'KuGou · Synced LRC',
        hasWordSync: normalized.includes('<'),
      };
    }
  } catch {
    // Ignore KuGou failure
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
        'kugou',
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

  const formatLrcSec = (seconds: number): string => {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(safe / 60);
    const secs = (safe % 60).toFixed(2).padStart(5, '0');
    return `[${String(mins).padStart(2, '0')}:${secs}]`;
  };

  const parseSubtitlesToLrc = (rawText: string): string => {
    const trimmed = rawText.trim();
    if (!trimmed) return '';
    // 1. WebVTT (WEBVTT) format
    if (/^WEBVTT\b/i.test(trimmed) || /\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[.,]\d{3}/.test(trimmed)) {
      const vttLines: string[] = [];
      const blocks = trimmed.replace(/\r\n/g, '\n').split(/\n{2,}/);
      for (const block of blocks) {
        const bLines = block
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
        if (bLines.length === 0) continue;
        const timeIdx = bLines.findIndex(l =>
          /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/.test(l)
        );
        if (timeIdx < 0) continue;
        const tm = bLines[timeIdx].match(
          /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->/
        );
        if (!tm) continue;
        const hours = tm[1] ? Number(tm[1]) : 0;
        const mins = Number(tm[2]);
        const secs = Number(tm[3]);
        const ms = Number(tm[4]);
        const startSec = hours * 3600 + mins * 60 + secs + ms / 1000;
        const textBody = decodeHtmlEntities(
          bLines
            .slice(timeIdx + 1)
            .join(' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
          .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '')
          .trim();
        if (!textBody || /^\[(?:music|applause|silence|♪|♫|♬|\s)+\]$/i.test(textBody)) continue;
        vttLines.push(`${formatLrcSec(startSec)}${textBody}`);
      }
      if (vttLines.length > 0) return vttLines.join('\n');
    }
    // 2. JSON3 format
    if (trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed) as {
          events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
        };
        if (Array.isArray(json.events)) {
          const lines: string[] = [];
          for (const ev of json.events) {
            if (!ev || typeof ev.tStartMs !== 'number' || !Array.isArray(ev.segs)) continue;
            const text = decodeHtmlEntities(
              ev.segs
                .map(s => String(s?.utf8 || ''))
                .join('')
                .replace(/\r?\n/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            )
              .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '')
              .trim();
            if (!text || /^\[(?:music|applause|silence|♪)+\]$/i.test(text)) continue;
            lines.push(`${formatLrcSec(ev.tStartMs / 1000)}${text}`);
          }
          if (lines.length > 0) return lines.join('\n');
        }
      } catch {
        // Fallback to XML
      }
    }
    // 3. YouTube TimedText XML (<text start="..."> or <p t="...">)
    const lines: string[] = [];
    for (const m of trimmed.matchAll(/<text\b[^>]*\bstart=["']([\d.]+)["'][^>]*>([\s\S]*?)<\/text>/gi)) {
      const startSec = Number(m[1]);
      const content = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '')
        .trim();
      if (Number.isFinite(startSec) && content) lines.push(`${formatLrcSec(startSec)}${content}`);
    }
    if (lines.length > 0) return lines.join('\n');
    for (const m of trimmed.matchAll(/<p\b[^>]*\bt=["'](\d+)["'][^>]*>([\s\S]*?)<\/p>/gi)) {
      const startSec = Number(m[1]) / 1000;
      const content = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '')
        .trim();
      if (Number.isFinite(startSec) && content) lines.push(`${formatLrcSec(startSec)}${content}`);
    }
    return lines.join('\n');
  };

  let cachedNadekoCookie = '';
  let cachedNadekoCookieAt = 0;

  const fetchNadekoCreatorSubtitles = async (
    videoId: string
  ): Promise<
    Array<{
      id: string;
      languageCode: string;
      label: string;
      lrc: string;
      lineCount: number;
    }>
  > => {
    const firefoxUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
    const baseHosts = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be'];

    for (const host of baseHosts) {
      try {
        // Step 1: Query /api/v1/captions/:videoId for language codes and labels
        const langByLabel = new Map<string, string>();
        try {
          const capListRes = await fetch(`${host}/api/v1/captions/${encodeURIComponent(videoId)}`, {
            headers: { 'User-Agent': firefoxUa, Accept: 'application/json' },
            signal: AbortSignal.timeout(4500),
          });
          if (capListRes.ok) {
            const capData = (await capListRes.json()) as {
              captions?: Array<{ label?: string; languageCode?: string; url?: string }>;
            };
            if (Array.isArray(capData.captions)) {
              for (const c of capData.captions) {
                if (c?.label && c?.languageCode) {
                  langByLabel.set(c.label.trim(), c.languageCode.trim());
                }
              }
            }
          }
        } catch {
          // Proceed to embed page even if captions JSON fails
        }

        // Step 2: Fetch /embed/:videoId (automatically solving meta-refresh challenge if 418 returned)
        const embedUrl = `${host}/embed/${encodeURIComponent(videoId)}`;
        const useCookie =
          host === 'https://inv.nadeko.net' &&
          cachedNadekoCookie &&
          Date.now() - cachedNadekoCookieAt < 25 * 60_000
            ? cachedNadekoCookie
            : '';

        let embedRes = await fetch(embedUrl, {
          headers: {
            'User-Agent': firefoxUa,
            ...(useCookie ? { Cookie: useCookie } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        let activeCookie = useCookie;
        if (embedRes.status === 418 || embedRes.status === 403) {
          const challengeHtml = await embedRes.text();
          const refreshMatch = challengeHtml.match(/url=([^"'>\s]+)/i);
          if (refreshMatch?.[1]) {
            const rawRefreshPath = refreshMatch[1].replace(/&amp;/g, '&');
            const verifyUrl = rawRefreshPath.startsWith('http')
              ? rawRefreshPath
              : `${host}${rawRefreshPath.startsWith('/') ? '' : '/'}${rawRefreshPath}`;
            const verifyRes = await fetch(verifyUrl, {
              headers: { 'User-Agent': firefoxUa, Referer: embedUrl },
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            });
            const setCookies =
              typeof verifyRes.headers.getSetCookie === 'function'
                ? verifyRes.headers.getSetCookie()
                : [verifyRes.headers.get('set-cookie') || ''].filter(Boolean);
            const joinedCookie = setCookies
              .map(c => c.split(';')[0].trim())
              .filter(Boolean)
              .join('; ');
            if (joinedCookie) {
              activeCookie = joinedCookie;
              if (host === 'https://inv.nadeko.net') {
                cachedNadekoCookie = joinedCookie;
                cachedNadekoCookieAt = Date.now();
              }
              embedRes = await fetch(embedUrl, {
                headers: { 'User-Agent': firefoxUa, Cookie: activeCookie },
                signal: AbortSignal.timeout(5000),
              });
            }
          }
        }

        if (!embedRes.ok) continue;
        const embedHtml = await embedRes.text();
        const trackTags = [...embedHtml.matchAll(/<track\b[^>]*>/gi)].map(m => m[0]);
        if (trackTags.length === 0) continue;

        const creatorTrackTargets: Array<{ src: string; label: string; languageCode: string }> = [];
        for (const tag of trackTags) {
          const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
          const labelMatch = tag.match(/\blabel=["']([^"']+)["']/i);
          const srclangMatch = tag.match(/\bsrclang=["']([^"']+)["']/i);
          if (!srcMatch?.[1]) continue;
          const label = decodeHtmlEntities((labelMatch?.[1] || 'Subtitles').trim());
          // Exclude auto-generated tracks; prefer only creator-uploaded captions
          if (/auto-generated|automatic/i.test(label)) continue;
          const rawSrc = decodeHtmlEntities(srcMatch[1].trim());
          const fullSrc = rawSrc.startsWith('http')
            ? rawSrc
            : `${host}${rawSrc.startsWith('/') ? '' : '/'}${rawSrc}`;
          const languageCode =
            srclangMatch?.[1]?.trim() ||
            langByLabel.get(label) ||
            label.slice(0, 2).toLowerCase();
          creatorTrackTargets.push({ src: fullSrc, label, languageCode });
        }

        if (creatorTrackTargets.length === 0) {
          return [];
        }

        const fetched = await Promise.all(
          creatorTrackTargets.slice(0, 6).map(async (target, idx) => {
            try {
              const vttRes = await fetch(target.src, {
                headers: {
                  'User-Agent': firefoxUa,
                  ...(activeCookie ? { Cookie: activeCookie } : {}),
                },
                signal: AbortSignal.timeout(5000),
              });
              if (!vttRes.ok) return null;
              const body = await vttRes.text();
              const lrc = parseSubtitlesToLrc(body);
              if (!lrc || !lrc.includes('[')) return null;
              const lineCount = lrc.split('\n').filter(line => line.trim().startsWith('[')).length;
              if (lineCount < 2) return null;
              return {
                id: `${target.languageCode}-${idx}`,
                languageCode: target.languageCode,
                label: target.label,
                lrc,
                lineCount,
              };
            } catch {
              return null;
            }
          })
        );

        const valid = fetched.filter(
          (t): t is NonNullable<typeof t> => t !== null
        );
        if (valid.length > 0) return valid;
      } catch {
        continue;
      }
    }
    return [];
  };

  // ============================================================================
  // YTBSD (https://github.com/roundyyy/yt-bulk-subtitles-downloader) Subtitle Engine:
  // Direct ANDROID Innertube Transcript API + ProxyPool Rotation from free-proxy-list.net
  // ============================================================================
  let ytbsdProxyList: string[] = [];
  let ytbsdProxyFetchedAt = 0;
  let ytbsdVerifiedProxy: string | null = null;
  const ytbsdFailedProxies = new Set<string>();

  const downloadFreshYtbsdProxies = async (): Promise<string[]> => {
    if (ytbsdProxyList.length > 0 && Date.now() - ytbsdProxyFetchedAt < 15 * 60_000) {
      return ytbsdProxyList;
    }
    try {
      const r = await fetch('https://free-proxy-list.net/en/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return ytbsdProxyList;
      const html = await r.text();
      const match = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
      const content = match ? match[1] : html;
      const proxies = [...new Set(content.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/g) || [])];
      if (proxies.length > 0) {
        ytbsdProxyList = proxies;
        ytbsdProxyFetchedAt = Date.now();
        ytbsdFailedProxies.clear();
      }
    } catch {
      // Ignore proxy scrape error
    }
    return ytbsdProxyList;
  };

  const httpsRequestViaProxy = (
    proxyStr: string,
    targetUrl: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
    timeoutMs = 6000
  ): Promise<{ status: number; body: string }> => {
    return new Promise((resolve, reject) => {
      const [proxyHost, proxyPortStr] = proxyStr.split(':');
      const proxyPort = Number(proxyPortStr);
      if (!proxyHost || !proxyPort) {
        reject(new Error('Invalid proxy'));
        return;
      }
      const parsed = new URL(targetUrl);
      let settled = false;
      const finish = (fn: (v: never) => void, val: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          fn(val as never);
        }
      };
      const timer = setTimeout(() => {
        connectReq.destroy();
        finish(reject, new Error('Proxy timeout'));
      }, timeoutMs);

      const connectReq = nodeHttp.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${parsed.hostname}:443`,
        headers: { Host: `${parsed.hostname}:443` },
      });

      connectReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          finish(reject, new Error(`CONNECT ${res.statusCode}`));
          return;
        }
        const tlsSocket = nodeTls.connect({
          socket,
          servername: parsed.hostname,
          rejectUnauthorized: false,
        });
        tlsSocket.on('error', err => finish(reject, err));
        const req = nodeHttps.request(
          {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: options.method || 'GET',
            headers: {
              'User-Agent':
                'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
              'Accept-Encoding': 'identity',
              'Accept-Language': 'en-US,en;q=0.9',
              ...(options.headers || {}),
            },
            createConnection: () => tlsSocket,
          },
          resp => {
            const chunks: Buffer[] = [];
            resp.on('data', (c: Buffer) => chunks.push(c));
            resp.on('end', () =>
              finish(resolve, {
                status: resp.statusCode || 0,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
            resp.on('error', err => finish(reject, err));
          }
        );
        req.on('error', err => finish(reject, err));
        if (options.body) req.write(options.body);
        req.end();
      });

      connectReq.on('error', err => finish(reject, err));
      connectReq.end();
    });
  };

  const fetchYouTubeSubtitlesLrc = async (videoId: string): Promise<ServerLyricsResponse | null> => {
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
    interface CapTrack {
      baseUrl?: string;
      languageCode?: string;
      kind?: string;
      vssId?: string;
      name?: { simpleText?: string; runs?: Array<{ text?: string }> };
    }
    let tracks: CapTrack[] = [];
    let winningProxy: string | null = null;

    // 1. Direct connection first (ytbsd.py / youtube-transcript-api ANDROID + IOS + watch HTML)
    let apiKey = '';
    let watchPageTracks: CapTrack[] = [];
    try {
      const wRes = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'CONSENT=YES+cb',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (wRes.ok) {
        const html = await wRes.text();
        const keyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/);
        if (keyMatch?.[1]) apiKey = keyMatch[1];
        const m = html.match(
          /"captionTracks"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"audioTracks"|\s*,\s*"translationLanguages"|\s*\})/
        );
        if (m?.[1]) {
          try {
            const parsed = JSON.parse(m[1]) as CapTrack[];
            if (Array.isArray(parsed)) watchPageTracks = parsed;
          } catch {
            // Ignore inline JSON parse issue
          }
        }
      }
    } catch {
      // Proceed to InnerTube player fallback
    }

    const playerEndpoint = apiKey
      ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`
      : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

    const clients = [
      {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 34,
        ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
      },
      {
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      {
        clientName: 'IOS',
        clientVersion: '20.03.02',
        ua: 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X)',
      },
    ];

    for (const c of clients) {
      if (tracks.length > 0) break;
      try {
        const clientContext: Record<string, unknown> = {
          clientName: c.clientName,
          clientVersion: c.clientVersion,
          hl: 'en',
          gl: 'US',
        };
        if ('androidSdkVersion' in c && c.androidSdkVersion) {
          clientContext.androidSdkVersion = c.androidSdkVersion;
        }
        const pRes = await fetch(playerEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': c.ua,
            'Accept-Language': 'en-US,en;q=0.9',
          },
          body: JSON.stringify({
            videoId,
            context: { client: clientContext },
          }),
          signal: AbortSignal.timeout(3500),
        });
        if (!pRes.ok) continue;
        const pJson = (await pRes.json()) as {
          captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CapTrack[] } };
        };
        const found = pJson.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(found) && found.length > 0) {
          tracks = found;
          break;
        }
      } catch {
        // Next client
      }
    }

    if (tracks.length === 0 && watchPageTracks.length > 0) {
      tracks = watchPageTracks;
    }

    // 2. YTBSD ProxyPool Fallback (`roundyyy/yt-bulk-subtitles-downloader`):
    // When direct connection gets LOGIN_REQUIRED on cloud/datacenter IPs, use ProxyPool from free-proxy-list.net
    if (tracks.length === 0) {
      const playerBody = JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
        videoId,
      });

      const tryProxyForTracks = async (proxy: string): Promise<{ proxy: string; tracks: CapTrack[] }> => {
        const res = await httpsRequestViaProxy(
          proxy,
          'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
            },
            body: playerBody,
          },
          5500
        );
        const data = JSON.parse(res.body) as {
          playabilityStatus?: { status?: string };
          captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CapTrack[] } };
        };
        const found = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(found) && found.length > 0) {
          return { proxy, tracks: found };
        }
        if (data?.playabilityStatus?.status === 'OK') {
          // Video genuinely has no captions
          return { proxy, tracks: [] };
        }
        throw new Error('Blocked or no tracks');
      };

      // Try cached verified proxy first for instant <500ms response
      if (ytbsdVerifiedProxy && !ytbsdFailedProxies.has(ytbsdVerifiedProxy)) {
        try {
          const hit = await tryProxyForTracks(ytbsdVerifiedProxy);
          tracks = hit.tracks;
          winningProxy = hit.proxy;
        } catch {
          ytbsdFailedProxies.add(ytbsdVerifiedProxy);
          ytbsdVerifiedProxy = null;
        }
      }

      if (tracks.length === 0 && !winningProxy) {
        const proxies = (await downloadFreshYtbsdProxies()).filter(p => !ytbsdFailedProxies.has(p));
        const candidateBatch = proxies.slice(0, 36);
        if (candidateBatch.length > 0) {
          try {
            const winner = await Promise.any(candidateBatch.map(p => tryProxyForTracks(p)));
            tracks = winner.tracks;
            winningProxy = winner.proxy;
            ytbsdVerifiedProxy = winner.proxy;
          } catch {
            // Fall through to Nadeko fallback
          }
        }
      }
    }

    // Prefer ONLY creator-uploaded captions (exclude auto-generated ASR tracks).
    // Auto-generated captions have kind === 'asr' or vssId starting with 'a.'
    const creatorTracks = tracks.filter(t => {
      if (typeof t?.baseUrl !== 'string' || !t.baseUrl.startsWith('http')) return false;
      const isAsr = t.kind === 'asr' || String(t.vssId || '').startsWith('a.');
      return !isAsr;
    });

    const extractTrackLabel = (tr: CapTrack, idx: number): string => {
      const rawName =
        tr.name?.simpleText ||
        (Array.isArray(tr.name?.runs) ? tr.name!.runs!.map(r => r.text || '').join('') : '') ||
        '';
      const cleanedName = rawName.trim();
      const langCode = String(tr.languageCode || `track-${idx + 1}`).trim();
      if (cleanedName) return cleanedName;
      return langCode.toUpperCase();
    };

    const fetchSingleTrackLrc = async (tr: CapTrack): Promise<string> => {
      // Follow youtube-transcript-api / ytbsd.py: strip &fmt=srv3 and try raw XML first, then json3/srv1
      const rawBase = String(tr.baseUrl || '').replace(/&fmt=srv3\b/g, '');
      const candidateUrls = [
        rawBase,
        `${rawBase}${rawBase.includes('?') ? '&' : '?'}fmt=json3`,
        `${rawBase}${rawBase.includes('?') ? '&' : '?'}fmt=srv1`,
      ];

      // If we obtained captionTracks via a working YTBSD proxy, try fetching the XML via that proxy first
      if (winningProxy) {
        for (const url of candidateUrls.slice(0, 2)) {
          try {
            const pr = await httpsRequestViaProxy(
              winningProxy,
              url,
              {
                headers: {
                  'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
                },
              },
              5500
            );
            if (pr.status === 200 && pr.body.trim()) {
              const lrc = parseSubtitlesToLrc(pr.body);
              if (lrc && lrc.includes('[')) return lrc;
            }
          } catch {
            continue;
          }
        }
      }

      for (const url of candidateUrls) {
        try {
          const r = await fetch(url, {
            headers: {
              'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
              'Accept-Language': 'en-US,en;q=0.9',
              Cookie: 'CONSENT=YES+cb',
            },
            signal: AbortSignal.timeout(4000),
          });
          if (!r.ok) continue;
          const body = await r.text();
          if (!body.trim()) continue;
          const lrc = parseSubtitlesToLrc(body);
          if (lrc && lrc.includes('[')) {
            return lrc;
          }
        } catch {
          continue;
        }
      }
      return '';
    };

    let collectedTracks: Array<{
      id: string;
      languageCode: string;
      label: string;
      lrc: string;
      lineCount: number;
    }> = [];

    for (let i = 0; i < Math.min(creatorTracks.length, 6); i++) {
      const tr = creatorTracks[i];
      const lrc = await fetchSingleTrackLrc(tr);
      if (!lrc) continue;
      const lineCount = lrc.split('\n').filter(line => line.trim().startsWith('[')).length;
      if (lineCount < 2) continue;
      const languageCode = String(tr.languageCode || `track-${i + 1}`);
      const label = extractTrackLabel(tr, i);
      if (/auto-generated|automatic/i.test(label)) continue;
      const id = String(tr.vssId || `${languageCode}-${i}`);
      collectedTracks.push({
        id,
        languageCode,
        label,
        lrc,
        lineCount,
      });
    }

    if (collectedTracks.length === 0) {
      collectedTracks = await fetchNadekoCreatorSubtitles(videoId);
    }

    if (collectedTracks.length === 0) {
      return null;
    }

    const primary = collectedTracks[0];
    return {
      lrc: primary.lrc,
      source: `YouTube Subtitles (${primary.label})`,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      hasWordSync: false,
      subtitleTracks: collectedTracks,
    };
  };

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

  // Apple Music candidate search for Manual Search in TrackFinder.tsx
  const handleAppleCandidates = async (req: Request, res: Response) => {
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
      if (isrcMatch?.ttml) {
        candidates.push({
          id: -1001,
          title: rawTitle,
          artist: rawArtist || 'Apple Music',
          album: 'Apple Music Word-Synced TTML',
          duration: duration || 200,
          instrumental: false,
          hasSynced: true,
          hasWordSync: true,
          url: isrcMatch.sourceUrl || 'https://music.apple.com',
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
            const viewUrl = String(item.trackViewUrl || 'https://music.apple.com');
            try {
              const paxRes = await fetch(
                `https://lyrics.paxsenix.org/apple-music/lyrics?id=${encodeURIComponent(songId)}&ttml=true`,
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
                  title: `${trackName} [Apple Library]`,
                  artist: artistName,
                  album: albumName,
                  duration: dur,
                  instrumental: false,
                  hasSynced: true,
                  hasWordSync: ttml.includes('<span'),
                  url: viewUrl,
                  confidence: Math.max(0.75, 0.95 - idx * 0.04),
                  ttml,
                  sourceLabel: 'Apple Music · Word-Synced TTML (Paxsenix)',
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

  const handleYouTubeSubtitles = async (req: Request, res: Response) => {
    const videoId = String(req.query.videoId || req.params.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ detail: 'Valid 11-character YouTube videoId is required.' });
      return;
    }
    const cacheKey = `ytsub|${videoId}`;
    const cached = lyricsCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 30 * 60_000) {
      res.json(cached.data);
      return;
    }
    const subResult = await fetchYouTubeSubtitlesLrc(videoId);
    if (subResult) {
      setLyricsCache(cacheKey, subResult);
      res.json(subResult);
      return;
    }
    res.status(404).json({ detail: 'No creator-uploaded YouTube subtitles found for this video.' });
  };

  const handleLyrics = async (req: Request, res: Response) => {
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const duration = Number(req.query.duration || 0);
    const videoId = String(req.query.videoId || '').trim();
    const rawOverride = req.query.rawOverride === '1' || req.query.rawOverride === 'true';
    const isYouTube =
      !rawOverride &&
      (req.query.isYouTube === '1' || req.query.isYouTube === 'true' || Boolean(videoId));
    const requestedSource = String(req.query.source || 'all').toLowerCase();

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

    const cacheKey = `${requestedSource}|${rawOverride ? 'raw' : isYouTube ? 'yt' : 'std'}|${title.toLowerCase()}|${artist.toLowerCase()}|${Math.round(duration)}|${videoId}`;
    const cached = lyricsCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 30 * 60_000) {
      res.json(cached.data);
      return;
    }

    try {
      if (requestedSource === 'youtube' && videoId) {
        const ytSub = await fetchYouTubeSubtitlesLrc(videoId);
        if (ytSub) {
          setLyricsCache(cacheKey, ytSub);
          res.json(ytSub);
          return;
        }
        res.status(404).json({ detail: 'No creator-uploaded YouTube subtitles available for this video.' });
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
          setLyricsCache(cacheKey, lrclibOnly);
          res.json(lrclibOnly);
          return;
        }
        res.status(404).json({ detail: 'No matching LRC Library recording found.' });
        return;
      }

      // 1. Word-synced Apple Music TTML via ISRC (lrc.red & Binimum)
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
        setLyricsCache(cacheKey, isrcTtml);
        res.json(isrcTtml);
        return;
      }

      // 2. Apple Music TTML via iTunes Song ID + Paxsenix
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
        setLyricsCache(cacheKey, paxResult.lyrics);
        res.json(paxResult.lyrics);
        return;
      }

      if (requestedSource === 'apple') {
        res.status(404).json({ detail: 'No Apple Music word-synced lyrics found for this song.' });
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
        setLyricsCache(cacheKey, lrclibResult);
        res.json(lrclibResult);
        return;
      }

      // 4. MusixMatch synced / word-synced lyrics (strictly unscrambled)
      const mmResult = await fetchMusixmatchServerLyrics(title, artist);
      if (mmResult) {
        setLyricsCache(cacheKey, mmResult);
        res.json(mmResult);
        return;
      }

      // 5. KuGou Synced LRC
      const kugouResult = await fetchKugouSyncedLrc(title, artist, duration, isYouTube);
      if (kugouResult) {
        setLyricsCache(cacheKey, kugouResult);
        res.json(kugouResult);
        return;
      }

      // 6. YouTube Subtitles / InnerTube plain lyrics (if videoId is provided)
      if (videoId) {
        const ytSub = await fetchYouTubeSubtitlesLrc(videoId);
        if (ytSub) {
          setLyricsCache(cacheKey, ytSub);
          res.json(ytSub);
          return;
        }
        const innerTubeResult = await fetchInnerTubePlainLyrics(videoId);
        if (innerTubeResult) {
          setLyricsCache(cacheKey, innerTubeResult);
          res.json(innerTubeResult);
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

  const handleYouTubeAuth = async (req: Request, res: Response) => {
    const body = (req.body || {}) as { accessToken?: string; cookie?: string };
    const headerAuth = extractRequestYouTubeAuth(req);
    const queryToken = typeof req.query.accessToken === 'string' ? req.query.accessToken.trim() : '';
    const queryCookie = typeof req.query.cookie === 'string' ? req.query.cookie.trim() : '';
    const nextToken =
      typeof body.accessToken === 'string'
        ? body.accessToken.trim().replace(/^Bearer\s+/i, '')
        : queryToken || headerAuth.accessToken || '';
    const nextCookie =
      typeof body.cookie === 'string'
        ? body.cookie.trim()
        : queryCookie || headerAuth.cookie || '';
    serverYouTubeAuth = {
      accessToken: nextToken,
      cookie: nextCookie,
    };
    res.json({
      authenticated: Boolean(serverYouTubeAuth.accessToken || serverYouTubeAuth.cookie),
      hasAccessToken: Boolean(serverYouTubeAuth.accessToken),
      hasCookie: Boolean(serverYouTubeAuth.cookie),
    });
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
    if (q.length < 2) {
      res.status(400).json({ detail: 'Enter at least 2 characters.' });
      return;
    }

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

    const ytAuth = extractRequestYouTubeAuth(req);

    try {
      let results: TrackMetadata[] = [];
      if (provider === 'jiosaavn') {
        results = await searchJioSaavn(q, 12);
      } else if (provider === 'soundcloud') {
        results = await searchSoundCloud(q, 12);
      } else if (provider === 'ytmusic' || provider === 'youtube') {
        results = await searchYouTubeMusic(q, provider, 12, ytAuth);
      } else if (provider === 'audius') {
        results = await searchAudius(q, 12);
      }

      res.json({
        data: results.map(t => ({
          id: t.id,
          provider: t.provider === 'youtube' ? 'resolver' : t.provider,
          title: t.title,
          videoTitle: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          viewCount: t.viewCount,
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
          videoTitle: meta.title,
          artist: meta.artist,
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
  const host = options.host ?? '0.0.0.0';
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
