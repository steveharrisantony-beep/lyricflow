import {useSyncExternalStore} from 'react';
import {getVideoSearchLogs,subscribeVideoSearchLogs} from './videoSearchHistory';

export default function VideoSearchLogs() {
 const entries = useSyncExternalStore(subscribeVideoSearchLogs,getVideoSearchLogs);
 if (!entries.length) return <p className="quiet-status">No YouTube video searches this session.</p>;
 return <div className="track-candidates">
  {entries.map(entry => <article className="candidate" key={entry.id}>
   <div>
    <strong>{entry.mode} · {new Date(entry.time).toLocaleTimeString()}</strong>
    <small>{entry.status}</small>
    <small>Exact API query</small>
    <code style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{entry.query}</code>
   </div>
  </article>)}
 </div>;
}
