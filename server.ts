import express, { type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  track?: TrackMetadata;
  createdAt: number;
}

const trackMetaCache = new Map<string, TrackMetadata>();
const streamCache = new Map<string, StreamCacheEntry>();
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
      n: String(Math.max(limit * 2, 20)),
      p: '1',
      q: query.trim(),
    }).toString();

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { auth_url?: string };
      if (!data.auth_url) continue;
      const parsed = new URL(data.auth_url);
      // Direct aac.saavncdn.com URL serves the full-length MP4/AAC track with 200 OK
      return `https://aac.saavncdn.com${parsed.pathname}`;
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
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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

  const trackId = `saavn_${rawId.replace(/[^\w-]/g, '')}`;
  const meta: TrackMetadata = {
    id: trackId,
    rawId,
    provider: 'jiosaavn',
    title: decodeHtmlEntities(String(item.title || item.song || 'Unknown title')),
    artist: decodeHtmlEntities(String(moreInfo.primary_artists || item.primary_artists || item.subtitle || 'Unknown artist')),
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
// 3. YOUTUBE MUSIC & YOUTUBE SEARCH + STASH CROSS-CATALOG STREAM RESOLUTION
// ============================================================================
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
      // Song filter param on YouTube Music
      params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
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
        if (!node || typeof node !== 'object' || tracks.length >= limit) return;
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
              else if (!['Song', 'Video', 'Single', 'EP'].includes(part)) nonDurationRuns.push(part);
            }
            const artist = (nonDurationRuns[0] || 'Unknown artist').trim();
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
      if (tracks.length > 0) return tracks;
    }
  } catch {
    // Fall through to JioSaavn / SoundCloud backup search
  }

  const saavnFallback = await searchJioSaavn(query, limit);
  return saavnFallback.map(t => ({ ...t, provider }));
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveByMetadataMatch(
  meta: TrackMetadata
): Promise<{ url: string; format: 'audio' | 'hls' } | null> {
  const query = `${meta.title} ${meta.artist}`.trim();
  const targetTitle = normalizeMatchText(meta.title);
  const targetArtist = normalizeMatchText(meta.artist).split(' ')[0] || '';

  // 1. Try JioSaavn 320kbps full-track catalog match
  try {
    const saavnCandidates = await searchJioSaavn(query, 10);
    if (saavnCandidates.length > 0) {
      const scored = saavnCandidates
        .map(cand => {
          const cTitle = normalizeMatchText(cand.title);
          const cArtist = normalizeMatchText(cand.artist);
          let score = 0;
          if (cTitle === targetTitle) score += 50;
          else if (cTitle.includes(targetTitle) || targetTitle.includes(cTitle)) score += 30;
          if (targetArtist && cArtist.includes(targetArtist)) score += 25;
          if (meta.duration > 0 && cand.duration > 0) {
            const diff = Math.abs(meta.duration - cand.duration);
            if (diff <= 5) score += 25;
            else if (diff <= 15) score += 15;
            else if (diff <= 30) score += 5;
          }
          return { cand, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = scored[0]?.cand;
      if (best?.encryptedMediaUrl) {
        const streamUrl = await resolveJioSaavnStreamUrl(best.encryptedMediaUrl);
        if (streamUrl) return { url: streamUrl, format: 'audio' };
      }
    }
  } catch {
    // Continue to SoundCloud full-track fallback
  }

  // 2. Try SoundCloud full-length track match (strictly non-snipped >= 45s)
  try {
    const scCandidates = await searchSoundCloud(query, 8);
    if (scCandidates.length > 0) {
      const bestSc =
        scCandidates.find(c => {
          if (meta.duration > 0 && c.duration > 0) {
            return Math.abs(c.duration - meta.duration) <= 25;
          }
          return true;
        }) || scCandidates[0];
      const scStream = await resolveSoundCloudStream(bestSc);
      if (scStream) return scStream;
    }
  } catch {
    // Continue to Audius fallback
  }

  // 3. Try Audius full-length stream match
  try {
    const audiusCandidates = await searchAudius(query, 6);
    if (audiusCandidates.length > 0) {
      const bestAudius = audiusCandidates[0];
      return {
        url: `https://api.audius.co/v1/tracks/${encodeURIComponent(bestAudius.rawId)}/stream?app_name=LyricFlow`,
        format: 'audio',
      };
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
// 5. EXPRESS SERVER & ROUTES
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

      // If primary provider returned empty, fall back to JioSaavn or SoundCloud full tracks
      if (results.length === 0 && provider !== 'jiosaavn') {
        const backup = await searchJioSaavn(q, 10);
        results = backup.map(item => ({ ...item, provider }));
      }
      if (results.length === 0 && provider !== 'soundcloud') {
        const scBackup = await searchSoundCloud(q, 10);
        results = scBackup.map(item => ({ ...item, provider }));
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

    // Also allow passing title/artist/duration query params if resolving an uncached track
    const queryTitle = String(req.query.title || '').trim();
    const queryArtist = String(req.query.artist || '').trim();
    const queryDuration = Number(req.query.duration || 0);

    try {
      const existingStream = streamCache.get(rawTrackId);
      if (existingStream && Date.now() - existingStream.createdAt < 15 * 60_000) {
        res.json({
          streamPath: `/audio/${rawTrackId}`,
          format: existingStream.format,
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
          title: queryTitle || 'SoundCloud Track',
          artist: queryArtist || '',
          album: '',
          duration: Number.isFinite(queryDuration) ? queryDuration : 0,
          sourceUrl: 'https://soundcloud.com',
        };
      }
      if (!meta && rawTrackId.startsWith('audius_')) {
        meta = {
          id: rawTrackId,
          rawId: rawTrackId.slice('audius_'.length),
          provider: 'audius',
          title: queryTitle || 'Audius Track',
          artist: queryArtist || '',
          album: '',
          duration: Number.isFinite(queryDuration) ? queryDuration : 0,
          sourceUrl: 'https://audius.co',
        };
      }
      if (!meta && queryTitle) {
        meta = {
          id: rawTrackId,
          rawId: rawTrackId,
          provider: 'ytmusic',
          title: queryTitle,
          artist: queryArtist,
          album: '',
          duration: Number.isFinite(queryDuration) ? queryDuration : 0,
          sourceUrl: 'https://music.youtube.com',
        };
      }

      if (!meta) {
        res.status(404).json({ detail: 'Track expired or not found. Please search again.' });
        return;
      }

      let resolvedStream: { url: string; format: 'audio' | 'hls' } | null = null;

      if (meta.encryptedMediaUrl) {
        const url = await resolveJioSaavnStreamUrl(meta.encryptedMediaUrl);
        if (url) resolvedStream = { url, format: 'audio' };
      } else if (meta.provider === 'jiosaavn') {
        const fetched = await fetchJioSaavnTrackById(meta.rawId);
        if (fetched?.encryptedMediaUrl) {
          const url = await resolveJioSaavnStreamUrl(fetched.encryptedMediaUrl);
          if (url) resolvedStream = { url, format: 'audio' };
        }
      } else if (meta.provider === 'soundcloud') {
        resolvedStream = await resolveSoundCloudStream(meta);
      } else if (meta.provider === 'audius') {
        resolvedStream = {
          url: `https://api.audius.co/v1/tracks/${encodeURIComponent(meta.rawId)}/stream?app_name=LyricFlow`,
          format: 'audio',
        };
      }

      // Cross-catalog fallback (used by YouTube Music / YouTube or if primary CDN failed)
      if (!resolvedStream && meta.title) {
        resolvedStream = await resolveByMetadataMatch(meta);
      }

      if (!resolvedStream) {
        res.status(404).json({
          detail: 'Could not resolve a full-length playable stream for this track.',
        });
        return;
      }

      setStreamCache(rawTrackId, {
        url: resolvedStream.url,
        format: resolvedStream.format,
        track: meta,
        createdAt: Date.now(),
      });

      res.json({
        streamPath: `/audio/${rawTrackId}`,
        format: resolvedStream.format,
        track: {
          id: meta.id,
          provider: meta.provider === 'youtube' ? 'resolver' : meta.provider,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          duration: meta.duration,
          sourceUrl: meta.sourceUrl,
          artwork: meta.artwork,
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
  app.get(['/music/search', '/search'], handleSearch);
  app.get(['/music/resolve/:trackId', '/resolve/:trackId'], handleResolve);
  app.get(['/music/audio/:trackId', '/audio/:trackId'], handleAudio);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
