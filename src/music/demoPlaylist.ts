import { searchSongs, resolveSong, type SongResult } from './providers';

export const DEMO_TRACKS = [
  { title: 'Big Dawgs', artists: ['Hanumankind', 'Kalmi'] },
  { title: 'Blinding Lights', artists: ['The Weeknd'] },
  { title: 'STAY', artists: ['The Kid Laroi', 'Justin Bieber'] },
] as const;

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function matchScore(song: SongResult, track: typeof DEMO_TRACKS[number]): number {
  const title = song.title.replace(/\s*\((?:with|feat\.?|ft\.?)\s+[^)]*\)/gi, '');
  const credits = ' ' + normalize([song.artist, song.primaryArtist, song.featuredArtist].filter(Boolean).join(' ')) + ' ';
  if (song.provider !== 'jiosaavn' || normalize(title) !== normalize(track.title) ||
    !credits.includes(' ' + normalize(track.artists[0]) + ' ')) return -1;
  return track.artists.filter(artist => credits.includes(' ' + normalize(artist) + ' ')).length;
}

/** Resolve all three tracks before changing the active song or queue. */
export async function prepareDemoPlaylist(base: string, signal: AbortSignal) {
  const controller = new AbortController();
  const requestSignal = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(45000)]);
  try {
    return await Promise.all(DEMO_TRACKS.map(async track => {
      const songs = await searchSongs(track.title + ' ' + track.artists.join(' '), 'jiosaavn', base, requestSignal);
      const best = songs.map(song => ({ song, score: matchScore(song, track) }))
        .filter(item => item.score >= 0).sort((a, b) => b.score - a.score)[0]?.song;
      if (!best) throw new Error(`Could not find ${track.title} on JioSaavn. Please try again.`);
      const playable = await resolveSong(best, base, requestSignal);
      if (matchScore(playable, track) < 0 || playable.format === 'youtube') {
        throw new Error(`The JioSaavn recording of ${track.title} is unavailable. Please try again.`);
      }
      requestSignal.throwIfAborted();
      return playable;
    }));
  } catch (failure) {
    if (signal.aborted) throw signal.reason;
    if (requestSignal.aborted) throw new Error('JioSaavn took too long to respond. Please try again.');
    throw failure;
  } finally {
    controller.abort();
  }
}
