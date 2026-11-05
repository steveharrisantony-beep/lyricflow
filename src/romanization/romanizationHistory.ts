type RomanizationLog = {
  id: number;
  title: string;
  artist: string;
  language: string;
  status: string;
  events: { time: number; message: string }[];
};

let entries: RomanizationLog[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
export const getRomanizationLogs = () => entries;
export function subscribeRomanizationLogs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: RomanizationLog[]) {
  entries = next;
  for (const listener of listeners) listener();
}

/** Session diagnostics contain track metadata and progress, without lyric text. */
export function startRomanizationLog(title: string, artist: string, language: string) {
  const id = ++nextId;
  publish([{ id, title, artist, language, status: 'Preparing romanization', events: [] }, ...entries].slice(0, 30));
  return (message: string) => publish(entries.map(entry => entry.id === id ? {
    ...entry, status: message,
    events: [...entry.events, { time: Date.now(), message }].slice(-16),
  } : entry));
}
