import type {SongResult} from './providers';

type VideoSearchLog = {
 id: number;
 time: number;
 status: string;
} & ({mode:'Autoplay'|'Search online';query:string} | {
 mode:'SponsorBlock';
 query?:never;
 videoId:string;
 title:string;
 start:number;
 end:number;
 category:string;
} | {
 mode:'Playback recovery';
 query?:never;
 videoId:string;
});

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

export function logSponsorBlockSkip({videoId,title,start,end,category}:{
 videoId:string|undefined;
 title:string;
 start:number;
 end:number;
 category:string;
}) {
 if(!videoId||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return;
 const entry:VideoSearchLog={id:++nextId,time:Date.now(),mode:'SponsorBlock',
  status:`Skipped ${category}`,videoId,title,start,end,category};
 publish([entry,...entries].slice(0,30));
}

/** Log bounded reloads and failed playback without leaking account or media URLs. */
export function logVideoPlaybackRecovery(videoId:string,status:string):void {
 if(!videoId||!status)return;
 const entry:VideoSearchLog={id:++nextId,time:Date.now(),mode:'Playback recovery',videoId,status};
 publish([entry,...entries].slice(0,30));
}

/** Store search terms in session memory. Never record request URLs or headers. */
export async function logVideoSearch(
 query: string,
 mode: 'Autoplay' | 'Search online',
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
