import express, { type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import dns from 'node:dns';
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
  encryptedMediaUrl?: string;
  transcodings?: Array<{
    url?: string;
    snipped?: boolean;
    format?: { protocol?: string; mime_type?: string };
  }>;
}

interface StreamCacheEntry {
  url: string;
  format: 'audio' | 'hls';
  audioSource?: string;
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
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseDurationText(value: string): number {
  if (!value || !/^\d+(?::\d+)+$/.test(value.trim())) return 0;
  return value
    .trim()
    .split(':')
    .reduce((acc, part) => acc * 60 + Number(part), 0);
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

async function searchYouTubeMusic(
  query: string,
  provider: 'ytmusic' | 'youtube',
  limit = 12
): Promise<TrackMetadata[]> {
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

    const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Origin: 'https://music.youtube.com',
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
                artist,
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
        // Prioritize official album audio tracks (MUSIC_VIDEO_TYPE_ATV) first, matching Stash & ytmusicapi
        tracks.sort((a, b) => (a.videoType === 'ATV' ? -1 : 1) - (b.videoType === 'ATV' ? -1 : 1));
        return tracks.slice(0, limit);
      }
    }
  } catch {
    // Fall through to JioSaavn backup search
  }

  const saavnFallback = await searchJioSaavn(query, limit);
  return saavnFallback.map(t => ({ ...t, provider }));
}

async function resolveByMetadataMatch(
  meta: TrackMetadata
): Promise<{ url: string; format: 'audio' | 'hls'; streamSource: string } | null> {
  const query = `${meta.title} ${meta.artist}`.trim();

  // 1. Try JioSaavn 320kbps full-track catalog (with Indian IP header + Stash JioSaavnMatcher scoring)
  try {
    const saavnCandidates = await searchJioSaavn(query, 15);
    if (saavnCandidates.length > 0) {
      const scored = saavnCandidates
        .map(cand => ({ cand, score: scoreCandidateMatch(meta, cand) }))
        .sort((a, b) => b.score - a.score);

      for (const candidate of scored.slice(0, 3)) {
        if (candidate.score >= 50 && candidate.cand.encryptedMediaUrl) {
          const streamUrl = await resolveJioSaavnStreamUrl(candidate.cand.encryptedMediaUrl);
          if (streamUrl) return { url: streamUrl, format: 'audio', streamSource: 'JioSaavn 320kbps AAC' };
        }
      }
    }
  } catch {
    // Continue to SoundCloud full-track fallback
  }

  // 2. Try SoundCloud full-length track match (strictly non-snipped >= 45s & verified score)
  try {
    const scCandidates = await searchSoundCloud(query, 12);
    if (scCandidates.length > 0) {
      const scoredSc = scCandidates
        .map(cand => ({ cand, score: scoreCandidateMatch(meta, cand) }))
        .sort((a, b) => b.score - a.score);

      const bestSc = scoredSc[0];
      if (bestSc && bestSc.score >= 35) {
        const scStream = await resolveSoundCloudStream(bestSc.cand);
        if (scStream) return { ...scStream, streamSource: 'SoundCloud Full Stream' };
      }
    }
  } catch {
    // Continue to Audius fallback
  }

  // 3. Try Audius full-length stream match if verified score
  try {
    const audiusCandidates = await searchAudius(query, 8);
    if (audiusCandidates.length > 0) {
      const scoredAudius = audiusCandidates
        .map(cand => ({ cand, score: scoreCandidateMatch(meta, cand) }))
        .sort((a, b) => b.score - a.score);
      const bestAudius = scoredAudius[0];
      if (bestAudius && bestAudius.score >= 40) {
        return {
          url: `https://api.audius.co/v1/tracks/${encodeURIComponent(bestAudius.cand.rawId)}/stream?app_name=LyricFlow`,
          format: 'audio',
          streamSource: 'Audius Direct Stream',
        };
      }
    }
  } catch {
    // No match
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

// 5A. ISRC + Word-Synced TTML (Stash IsrcResolver.kt & IsrcTtmlLyricsSource.kt)
async function fetchIsrcWordSyncedTtml(
  title: string,
  artist: string,
  durationSec: number
): Promise<ServerLyricsResponse | null> {
  const isrcCandidates: string[] = [];

  // Step 1: Resolve ISRC via lrc.red/api/v1 (Stash IsrcResolver.kt primary)
  try {
    const searchUrl =
      'https://lrc.red/api/v1?' +
      new URLSearchParams({
        track: title,
        artist,
      }).toString();

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
      const ranked = results
        .filter(item => {
          const isrc = String(item.isrc || '').trim();
          if (isrc.length !== 12) return false;
          const rawDur = Number(item.duration || 0);
          // lrc.red returns duration in seconds (e.g. 233.71); normalize if > 1500 (ms)
          const itemDurSec = rawDur > 1500 ? rawDur / 1000 : rawDur;
          if (durationSec > 0 && itemDurSec > 0 && Math.abs(itemDurSec - durationSec) > 8) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aWord = String(a.timing_type || '').toLowerCase() === 'word' ? 0 : 1;
          const bWord = String(b.timing_type || '').toLowerCase() === 'word' ? 0 : 1;
          return aWord - bWord;
        });

      for (const item of ranked) {
        const isrc = String(item.isrc || '').trim().toUpperCase();
        if (isrc && !isrcCandidates.includes(isrc)) {
          isrcCandidates.push(isrc);
        }
      }
    }
  } catch {
    // Continue to MusicBrainz ISRC fallback
  }

  // Step 2: MusicBrainz ISRC fallback (Stash IsrcResolver.kt secondary)
  if (isrcCandidates.length === 0) {
    try {
      const mbQuery = artist
        ? `recording:"${title.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`
        : `recording:"${title.replace(/"/g, '')}"`;
      const mbUrl =
        'https://musicbrainz.org/ws/2/recording/?' +
        new URLSearchParams({
          query: mbQuery,
          limit: '5',
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
          recordings?: Array<{ length?: number; isrcs?: string[] }>;
        };
        for (const rec of mbData.recordings || []) {
          const recDurSec = Number(rec.length || 0) / 1000;
          if (durationSec > 0 && recDurSec > 0 && Math.abs(recDurSec - durationSec) > 8) continue;
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
  for (const isrc of isrcCandidates.slice(0, 3)) {
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
  durationSec: number
): Promise<{ appleTrackViewUrl?: string; lyrics?: ServerLyricsResponse }> {
  let songId = '';
  let trackViewUrl = '';
  try {
    const itunesUrl =
      'https://itunes.apple.com/search?' +
      new URLSearchParams({
        term: `${title} ${artist}`.trim(),
        media: 'music',
        entity: 'song',
        limit: '10',
      }).toString();

    const res = await fetch(itunesUrl, {
      headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(data.results) ? data.results : [];
      const best =
        results.find(item => {
          const trackName = String(item.trackName || '');
          const artistName = String(item.artistName || '');
          const dur = Number(item.trackTimeMillis || 0) / 1000;
          if (!sameVersionSignature(title, trackName)) return false;
          if (artist && !hasArtistOverlap(artist, artistName)) return false;
          if (durationSec > 0 && dur > 0 && Math.abs(dur - durationSec) > 8) return false;
          return true;
        }) || results[0];

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
  durationSec: number
): Promise<ServerLyricsResponse | null> {
  try {
    if (artist && durationSec > 0) {
      const getUrl =
        'https://lrclib.net/api/get?' +
        new URLSearchParams({
          track_name: title,
          artist_name: artist,
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
    if (artist) searchParams.set('artist_name', artist);
    const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
      headers: { 'User-Agent': STASH_ANDROID_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5500),
    });
    if (searchRes.ok) {
      const list = (await searchRes.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(list)) {
        const best = list.find(item => {
          if (item.instrumental === true) return false;
          const synced = typeof item.syncedLyrics === 'string' ? item.syncedLyrics : '';
          if (!synced.includes('[')) return false;
          const trackName = String(item.trackName || '');
          const artistName = String(item.artistName || '');
          const dur = Number(item.duration || 0);
          if (!sameVersionSignature(title, trackName)) return false;
          if (artist && !hasArtistOverlap(artist, artistName)) return false;
          if (durationSec > 0 && dur > 0 && Math.abs(dur - durationSec) > 8) return false;
          return true;
        });
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
  durationSec: number
): Promise<ServerLyricsResponse | null> {
  try {
    const keyword = artist ? `${title} - ${artist}` : title;
    const searchUrl =
      'http://mobilecdn.kugou.com/api/v3/search/song?' +
      new URLSearchParams({
        format: 'json',
        page: '1',
        pagesize: '8',
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
    const bestSong = infoList.find(item => {
      const songName = String(item.songname || '');
      const singerName = String(item.singername || '');
      const dur = Number(item.duration || 0);
      if (!sameVersionSignature(title, songName)) return false;
      if (artist && singerName && !hasArtistOverlap(artist, singerName)) return false;
      if (durationSec > 0 && dur > 0 && Math.abs(dur - durationSec) > 8) return false;
      return Boolean(item.hash);
    });
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
async function startServer() {
  const app = express();

  app.use((_req, res, next) => {
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
      lyricsSources: ['lrc.red-ttml', 'binimum-ttml', 'paxsenix-ttml', 'lrclib', 'kugou', 'innertube'],
    });
  };

  const handleLyrics = async (req: Request, res: Response) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const duration = Number(req.query.duration || 0);
    const videoId = String(req.query.videoId || '').trim();

    if (title.length < 2) {
      res.status(400).json({ detail: 'Track title is required.' });
      return;
    }

    const cacheKey = `${title.toLowerCase()}|${artist.toLowerCase()}|${Math.round(duration)}`;
    const cached = lyricsCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 30 * 60_000) {
      res.json(cached.data);
      return;
    }

    try {
      // 1. Word-synced Apple Music TTML via ISRC (lrc.red & Binimum)
      const isrcTtml = await fetchIsrcWordSyncedTtml(title, artist, duration);
      if (isrcTtml) {
        setLyricsCache(cacheKey, isrcTtml);
        res.json(isrcTtml);
        return;
      }

      // 2. Apple Music TTML via iTunes Song ID + Paxsenix
      const paxResult = await fetchItunesPaxsenixLyrics(title, artist, duration);
      if (paxResult.lyrics) {
        setLyricsCache(cacheKey, paxResult.lyrics);
        res.json(paxResult.lyrics);
        return;
      }

      // 3. LRCLIB synced / word-synced recording lookup
      const lrclibResult = await fetchLrclibServerLyrics(title, artist, duration);
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
      const kugouResult = await fetchKugouSyncedLrc(title, artist, duration);
      if (kugouResult) {
        setLyricsCache(cacheKey, kugouResult);
        res.json(kugouResult);
        return;
      }

      // 6. YouTube Music InnerTube plain lyrics (if videoId is provided)
      if (videoId) {
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

    try {
      let results: TrackMetadata[] = [];
      if (provider === 'jiosaavn') {
        results = await searchJioSaavn(q, 12);
      } else if (provider === 'soundcloud') {
        results = await searchSoundCloud(q, 12);
      } else if (provider === 'ytmusic' || provider === 'youtube') {
        results = await searchYouTubeMusic(q, provider, 12);
      } else if (provider === 'audius') {
        results = await searchAudius(q, 12);
      }

      res.json({
        data: results.map(t => ({
          id: t.id,
          provider: t.provider === 'youtube' ? 'resolver' : t.provider,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          sourceUrl: t.sourceUrl,
          artwork: t.artwork,
          audioSource:
            t.provider === 'jiosaavn'
              ? 'JioSaavn (320kbps AAC)'
              : t.provider === 'ytmusic'
                ? 'YouTube Music'
                : t.provider === 'soundcloud'
                  ? 'SoundCloud (Full Stream)'
                  : t.provider === 'audius'
                    ? 'Audius (Direct Stream)'
                    : 'YouTube',
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
          track: existingStream.track,
        });
        return;
      }

      let meta = trackMetaCache.get(rawTrackId);
      if (!meta && rawTrackId.startsWith('saavn_')) {
        meta = (await fetchJioSaavnTrackById(rawTrackId.slice('saavn_'.length))) || undefined;
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

      let resolvedStream: { url: string; format: 'audio' | 'hls'; streamSource?: string } | null = null;
      let audioSourceLabel = 'Online Stream';

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
      } else if (meta.provider === 'ytmusic' || meta.provider === 'youtube') {
        const matched = await resolveByMetadataMatch(meta);
        if (matched) {
          resolvedStream = matched;
          const catalogLabel = meta.provider === 'ytmusic' ? 'YouTube Music' : 'YouTube';
          audioSourceLabel = `${catalogLabel} · ${matched.streamSource}`;
        }
      }

      if (!resolvedStream) {
        res.status(404).json({
          detail:
            'Exact studio recording stream unavailable for this track. Try the JioSaavn or SoundCloud tab for direct catalog streams.',
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
        track: enrichedTrack,
        createdAt: Date.now(),
      });

      res.json({
        streamPath: `/audio/${rawTrackId}`,
        format: resolvedStream.format,
        audioSource: audioSourceLabel,
        track: {
          id: meta.id,
          provider: meta.provider === 'youtube' ? 'resolver' : meta.provider,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          duration: meta.duration,
          sourceUrl: meta.sourceUrl,
          artwork: meta.artwork,
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
  app.get(['/music/health', '/health'], handleHealth);
  app.get(['/music/lyrics', '/lyrics'], handleLyrics);
  app.get(['/music/search', '/search'], handleSearch);
  app.get(['/music/resolve/:trackId', '/resolve/:trackId'], handleResolve);
  app.get(['/music/audio/:trackId', '/audio/:trackId'], handleAudio);

  if (process.env.NODE_ENV !== 'production') {
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

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`LyricFlow server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
