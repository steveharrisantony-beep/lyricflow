import { useSyncExternalStore } from 'react';
import { getRomanizationLogs, subscribeRomanizationLogs } from './romanizationHistory';

export default function RomanizationLogs() {
  const entries = useSyncExternalStore(subscribeRomanizationLogs, getRomanizationLogs);
  if (!entries.length) return <p className="quiet-status">No romanization attempts this session.</p>;
  return <div className="track-candidates">{entries.map(entry => <article className="candidate" key={entry.id}>
    <div>
      <strong>{entry.title} · {entry.language}</strong>
      {entry.artist && <small>{entry.artist}</small>}
      <small>{entry.status}</small>
      <ol>{entry.events.map((event, index) => <li key={index} className="quiet-status">
        {new Date(event.time).toLocaleTimeString()} · {event.message}
      </li>)}</ol>
    </div>
  </article>)}</div>;
}
