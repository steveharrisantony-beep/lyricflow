import {useSyncExternalStore} from 'react';
import {getVideoSearchLogs,subscribeVideoSearchLogs} from './videoSearchHistory';

export default function VideoSearchLogs({recordingKey,title,suspended=false}:{
 recordingKey:string;
 title?:string;
 suspended?:boolean;
}){
 const all=useSyncExternalStore(subscribeVideoSearchLogs,getVideoSearchLogs);
 if(!recordingKey)return <p className="quiet-status">Play a song to see its video search logs.</p>;
 const entries=all.filter(item=>item.recordingKey===recordingKey);
 const search=entries.find(item=>item.mode==='Autoplay'||item.mode==='Search online');
 const filtered=entries.find(item=>item.mode==='Filter');
 const count=search?.resultCount??filtered?.resultCount;
 const passed=search?.passedFilterCount??filtered?.passedFilterCount;
 const query=search?.query;
 return <section className="video-log-current" aria-label="Current song video logs">
  <div className="video-log-summary">
   <strong>{title||'Current song'}</strong>
   <small>Only this song’s video search and playback events are shown.</small>
   <div className="video-log-stats">
    <span>Results received: <strong>{count??'Not searched'}</strong></span>
    <span>Passed filters: <strong>{passed??'Not evaluated'}</strong></span>
   </div>
   {query&&<div>
    <small>Latest video search query</small>
    <code className="video-log-query">{query}</code>
   </div>}
   {suspended&&<p role="status">Automatic video search suspended: Themes mode has remained selected for more than 3 consecutive songs. Switching to Video resumes searching.</p>}
  </div>
  {entries.length===0
   ?<p className="quiet-status">No video search, filtering or playback events recorded for this song.</p>
   :<div className="track-candidates">
    {entries.map(entry=><article className="candidate" key={entry.id}>
     <div>
      <strong>{entry.mode} · {new Date(entry.time).toLocaleTimeString()}</strong>
      <small>{entry.status}</small>
      {(entry.mode==='Autoplay'||entry.mode==='Search online')&&<>
       <small>Exact search query</small>
       <code className="video-log-query">{entry.query||'Unavailable'}</code>
       <small>Results received: {entry.resultCount??'Pending / failed'}</small>
       {entry.passedFilterCount!==undefined&&<small>Candidates passed filtering: {entry.passedFilterCount}</small>}
      </>}
      {entry.mode==='Filter'&&<small>{entry.resultCount??0} results received · {entry.passedFilterCount??0} passed filtering</small>}
      {entry.videoId&&<small>Video ID: {entry.videoId}</small>}
      {entry.mode==='SponsorBlock'&&entry.start!==undefined&&entry.end!==undefined&&<>
       <small>{entry.title||'Video'}</small>
       <small>{entry.start.toFixed(2)}s → {entry.end.toFixed(2)}s · {(entry.end-entry.start).toFixed(2)}s skipped</small>
      </>}
     </div>
    </article>)}
   </div>}
 </section>;
}
