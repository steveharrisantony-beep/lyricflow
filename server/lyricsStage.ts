import { type ProviderLyric, type LyricsStageProvider } from '../src/lyrics/searchPlan';
import { messytitlefixer } from '../src/lyrics/messytitlefixer';
export interface StageQuery { title: string; artist?: string; duration: number }
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.slice(0, 25).map(row) : [];
const str = (value: unknown) => typeof value === 'string' ? value : '';
const duration = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
};
export const LYRICS_USER_AGENT = 'LyricFlow Android (https://github.com/steveharrisantony-beep/lyricsflow-android)';

function queryUrl(base: string, fields: Record<string, string>, artistKey: string, artist?: string) {
  const query = new URLSearchParams(fields);
  if (artist) query.set(artistKey, artist);
  return base + '?' + query;
}

function lrcRedRecording(item: Row) {
  return {
    isrc: str(item.isrc).trim().toUpperCase(),
    title: str(item.title).trim(),
    artist: str(item.artist).trim(),
    album: str(item.album).trim(),
    duration: duration(item.duration),
  };
}

export async function searchLrcRedRecordings(title: string, artist: string | undefined, read: (url: string) => Promise<unknown>) {
  const query = new URLSearchParams({ q: [title, artist].filter(Boolean).join(' ') });
  const catalog = row(await read('https://lrc.red/search.json?' + query));
  const hits = rows(catalog.hits).map(lrcRedRecording).filter(item => /^[A-Z0-9]{12}$/.test(item.isrc));
  const recordings = await Promise.all(hits.map(async (item, index) => {
    if (index >= 5 || (item.title && item.artist && item.duration !== undefined)) return item;
    const metadata = lrcRedRecording(row(await read('https://lrc.red/s/' + item.isrc + '.json')));
    if (metadata.isrc !== item.isrc) return item;
    return {
      isrc: item.isrc,
      title: item.title || metadata.title,
      artist: item.artist || metadata.artist,
      album: item.album || metadata.album,
      duration: item.duration ?? metadata.duration,
    };
  }));
  return recordings.filter(item => item.title && item.artist);
}

function catalogOrder(items: ProviderLyric[], query: StageQuery) {
  // The catalog query remains untouched. Rank records before the bounded file downloads.
  const comparable=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
  const target=comparable(messytitlefixer(query.title,query.artist));
  const titleMatch=(item:ProviderLyric)=>item.title&&comparable(messytitlefixer(item.title,item.artist))===target;
  return items.sort((a, b) => {
    const distance = (item: ProviderLyric) => !query.duration || !item.duration ? Infinity : Math.abs(item.duration - query.duration);
    return Number(Boolean(titleMatch(b)))-Number(Boolean(titleMatch(a))) || distance(a) - distance(b);
  }).slice(0, 5);
}

export async function searchLyricsStageProvider(provider: LyricsStageProvider, query: StageQuery, parentSignal: AbortSignal) {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(13000)]);
  const failures = new Set<string>();
  const candidates: ProviderLyric[] = [];

  async function read(url: string, label: string, format: 'json' | 'text' = 'json'): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        signal.throwIfAborted();
        const response = await fetch(url, {
          headers: { 'User-Agent': LYRICS_USER_AGENT, Accept: format === 'json' ? 'application/json' : '*/*' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(4200)]),
        });
        if (response.status === 404 || response.status === 204) return null;
        if (response.ok) return format === 'json' ? await response.json() : await response.text();
        const retryAfter = response.headers.get('Retry-After');
        const retryable = response.status >= 500 || response.status === 408 ||
          (response.status === 429 && retryAfter !== null && Number(retryAfter) <= 1);
        if (attempt === 0 && retryable) {
          await new Promise<void>(resolve => setTimeout(resolve, response.status === 429 ? 1000 : 250));
          continue;
        }
        failures.add(label + ': HTTP ' + response.status);
      } catch (error) {
        if (parentSignal.aborted) throw parentSignal.reason;
        if (attempt === 0 && !signal.aborted) continue;
        const timeout = signal.aborted || (error instanceof Error && error.name === 'TimeoutError');
        failures.add(label + (timeout ? ': request timed out' : ': request failed'));
      }
      return null;
    }
    return null;
  }

  const { title, artist } = query;
  if (provider === 'lrclib') {
    const list = await read(queryUrl('https://lrclib.net/api/search', { track_name: title }, 'artist_name', artist), 'LRCLIB');
    for (const item of rows(list)) {
      if (!item.id) continue;
      const url = 'https://lrclib.net/api/get/' + encodeURIComponent(String(item.id));
      candidates.push({
        id: 'lrclib:' + item.id, title: str(item.trackName), artist: str(item.artistName),
        duration: duration(item.duration), source: 'LRCLIB', sourceUrl: url,
        lrc: str(item.syncedLyrics), plain: str(item.plainLyrics), instrumental: item.instrumental === true,
      });
    }
  } else if (provider === 'isrc') {
    const recordings = await searchLrcRedRecordings(title, artist, url => read(url, 'lrc.red catalog'));
    let tracks: ProviderLyric[] = recordings.map(({ isrc, title, artist, duration }) => ({
      id: isrc, title, artist, duration, source: 'lrc.red',
    }));
    if (!tracks.length && !signal.aborted) {
      // This is an alternate ISRC catalog using the same stage title and artist.
      const quoted = (value: string) => '"' + value.replace(/[\\"]/g, '\\$&') + '"';
      const queryText = 'recording:' + quoted(title) + (artist ? ' AND artist:' + quoted(artist) : '');
      const mb = row(await read(queryUrl('https://musicbrainz.org/ws/2/recording/', { query: queryText, limit: '12', fmt: 'json' }, 'artist'), 'MusicBrainz ISRC catalog'));
      tracks = rows(mb.recordings).flatMap(item => (Array.isArray(item.isrcs) ? item.isrcs : []).slice(0, 3).flatMap(code => {
        const id = str(code).toUpperCase();
        if (!/^[A-Z0-9]{12}$/.test(id)) return [];
        const title = str(item.title).trim();
        const artist = rows(item['artist-credit']).map(credit => str(credit.name).trim()).filter(Boolean).join(', ');
        if (!title || !artist) return [];
        const length = duration(item.length);
        return [{ id, title, artist, duration: length ? length / 1000 : undefined, source: 'lrc.red' }];
      }));
    }
    const distinct = [...new Map(tracks.map(track => [track.id, track])).values()];
    const files = await Promise.all(catalogOrder(distinct, query).flatMap(track => [
      ['lrc.red', 'https://lrc.red/s/'],
      ['Binimum', 'https://lyrics-storage.binimum.org/'],
    ].map(async ([source, base]) => {
      const url = base + track.id + '.ttml';
      const ttml = str(await read(url, source, 'text'));
      return /<p\b/.test(ttml) ? { ...track, id: source + ':' + track.id, source, sourceUrl: url, ttml } : null;
    })));
    candidates.push(...files.filter((item): item is NonNullable<typeof item> => item !== null));
  } else if (provider === 'paxsenix') {
    const term = [title, artist].filter(Boolean).join(' ');
    const catalog = row(await read(queryUrl('https://itunes.apple.com/search', { term, media: 'music', entity: 'song', limit: '20' }, 'artist'), 'iTunes catalog'));
    const tracks = rows(catalog.results).filter(item => item.trackId).map(item => ({
      id: String(item.trackId), title: str(item.trackName), artist: str(item.artistName),
      duration: item.trackTimeMillis ? duration(Number(item.trackTimeMillis) / 1000) : undefined, source: 'Paxsenix',
    }));
    const files = await Promise.all(catalogOrder(tracks, query).map(async track => {
      const id = encodeURIComponent(track.id);
      const urls = ['https://lyrics.paxsenix.org/apple-music/cache/' + id,
        'https://lyrics.paxsenix.org/apple-music/lyrics?id=' + id + '&ttml=true'];
      for (const url of urls) {
        const body = str(await read(url, 'Paxsenix', 'text'));
        let ttml = body;
        if (body.trimStart().startsWith('{')) {
          try {
            const value = row(JSON.parse(body));
            ttml = str(value.ttmlContent || value.ttml);
          } catch { failures.add('Paxsenix: invalid response'); }
        }
        if (/<p\b/.test(ttml)) return { ...track, id: 'paxsenix:' + track.id, sourceUrl: url, ttml };
      }
      return null;
    }));
    candidates.push(...files.filter((item): item is NonNullable<typeof item> => item !== null));
  }

  parentSignal.throwIfAborted();
  return { candidates, failures: [...failures] };
}
