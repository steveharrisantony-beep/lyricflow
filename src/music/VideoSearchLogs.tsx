import {useSyncExternalStore} from 'react';
import {getVideoSearchLogs,subscribeVideoSearchLogs} from './videoSearchHistory';

export default function VideoSearchLogs() {
 const entries = useSyncExternalStore(subscribeVideoSearchLogs,getVideoSearchLogs);
 if (!entries.length) return <p className="quiet-status">No video searches or SponsorBlock skips this session.</p>;
 return <div className="track-candidates">
  {entries.map(entry => <article className="candidate" key={entry.id}>
   <div>
    <strong>{entry.mode} · {new Date(entry.time).toLocaleTimeString()}</strong>
    <small>{entry.status}</small>
    {entry.mode==='Playback recovery'?<>
     <small>Video ID {entry.videoId}</small>
    </>:entry.mode==='SponsorBlock'?<>
     <small>{entry.title||entry.videoId}</small>
     <small>{entry.start.toFixed(2)}s → {entry.end.toFixed(2)}s · {(entry.end-entry.start).toFixed(2)}s skipped</small>
     <small>Video ID {entry.videoId}</small>
    </>:<>
     <small>Exact API query</small>
     <code style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{entry.query}</code>
    </>}
   </div>
  </article>)}
 </div>;
}
