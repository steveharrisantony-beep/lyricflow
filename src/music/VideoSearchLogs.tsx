import {useSyncExternalStore} from 'react';
import {messytitlefixer} from '../lyrics/messytitlefixer';
import {getVideoSearchLogs,subscribeVideoSearchLogs} from './videoSearchHistory';

export default function VideoSearchLogs({recordingKey,title,artist,suspended=false}:{
 recordingKey:string;
 title?:string;
 artist?:string;
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
 const cleanedTitle=messytitlefixer(title||'',artist||'');
 return <section className="video-log-current" aria-label="Current song video logs">
  <div className="video-log-summary">
   <strong>{title||'Current song'}</strong>
   <small>Filtered title: <strong>{cleanedTitle||'Unavailable'}</strong></small>
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
    {entries.map(entry=>{
     const isSearch=entry.mode==='Autoplay'||entry.mode==='Search online';
     const latestSearch=isSearch&&entry.id===search?.id;
     const isCompletedSearch=isSearch&&entry.resultCount!==undefined;
     // Summary already shows the latest query and its result/filter counts.
     // Keep individual retries and older searches identifiable, without
     // printing the same information twice for the latest search.
     const status=isCompletedSearch
      ?entry.resultCount===0?'No results returned':'Search completed'
      :entry.mode==='Filter'?'Filtering completed':entry.status;
     return <article className="candidate" key={entry.id}>
      <div>
       <strong>{entry.mode} · {new Date(entry.time).toLocaleTimeString()}</strong>
       {entry.attempt!==undefined&&<small>
        Search attempt {entry.attempt} of {entry.maxAttempts}
        {entry.attempt>1&&(entry.retryDelayMs?` · Retry after ${entry.retryDelayMs/1000}s`:' · Immediate retry')}
       </small>}
       <small>{status}</small>
       {isSearch&&!latestSearch&&<>
        {entry.query!==query&&entry.query&&<>
         <small>Exact search query</small>
         <code className="video-log-query">{entry.query}</code>
        </>}
        <small>{entry.resultCount!==undefined?`${entry.resultCount} results`:'Pending / failed'}
         {entry.passedFilterCount!==undefined&&` · ${entry.passedFilterCount} passed filters`}
        </small>
       </>}
       {entry.videoId&&<small>Video ID: {entry.videoId}</small>}
       {entry.mode==='SponsorBlock'&&entry.start!==undefined&&entry.end!==undefined&&<>
        <small>{entry.title||'Video'}</small>
        <small>{entry.start.toFixed(2)}s → {entry.end.toFixed(2)}s · {(entry.end-entry.start).toFixed(2)}s skipped</small>
       </>}
      </div>
     </article>;
    })}
   </div>}
 </section>;
}
