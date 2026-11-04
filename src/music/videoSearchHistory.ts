import type {SongResult} from './providers';

type VideoSearchLog = {
 id: number;
 query: string;
 mode: 'Autoplay' | 'Search online';
 time: number;
 status: string;
};

let entries: VideoSearchLog[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

export function subscribeVideoSearchLogs(listener: () => void) {
 listeners.add(listener);
 return () => { listeners.delete(listener); };
}

export const getVideoSearchLogs = () => entries;

function publish(next: VideoSearchLog[]) {
 entries = next;
 for (const listener of listeners) listener();
}

/** Store search terms in session memory. Never record request URLs or headers. */
export async function logVideoSearch(
 query: string,
 mode: VideoSearchLog['mode'],
 run: () => Promise<SongResult[]>,
 signal?: AbortSignal,
) {
 signal?.throwIfAborted();
 const entry = {id:++nextId, query, mode, time:Date.now(), status:'Searching…'};
 publish([entry,...entries].slice(0,30));
 const finish = (status: string) => {
  if (entries.some(item => item.id === entry.id)) {
   publish(entries.map(item => item.id === entry.id ? {...item,status} : item));
  }
 };
 try {
  const results = await run();
  signal?.throwIfAborted();
  finish(results.length === 1 ? '1 result returned' : `${results.length} results returned`);
  return results;
 } catch (error) {
  finish(signal?.aborted ? 'Cancelled' : 'Search failed');
  throw error;
 }
}
