import { useSyncExternalStore } from 'react';
import { getRomanizationLogs, subscribeRomanizationLogs } from './romanizationHistory';

type RomanizationLogsProps = {
  title?: string;
  artist?: string;
};

const songKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** Keep session history intact, but display only the currently playing song. */
export default function RomanizationLogs({ title, artist }: RomanizationLogsProps) {
  const history = useSyncExternalStore(subscribeRomanizationLogs, getRomanizationLogs);
  const currentTitle = songKey(title || '');
  const currentArtist = songKey(artist || '');
  const entries = currentTitle
    ? history.filter(entry => songKey(entry.title) === currentTitle && songKey(entry.artist) === currentArtist)
    : [];

  if (!entries.length) return <p className="quiet-status">No romanization attempts for the current song.</p>;
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
