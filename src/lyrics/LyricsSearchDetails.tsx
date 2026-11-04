import { useSyncExternalStore } from 'react';
import { LYRICS_SEARCH_EVENT, TEMPORARY_SONG_EVENT, temporarySongs } from '../data/temporarySongs';
import type { TrackInfo } from '../metadata/trackInfo';
import { lyricProviderName } from './sourceLabels';
import { buildLyricsSearchPlan, compareLyricCandidates, type LyricsSearchCandidate,
  type LyricsSearchContext, type LyricsSearchReport } from './searchPlan';

function subscribe(notify: () => void) {
  window.addEventListener(LYRICS_SEARCH_EVENT, notify);
  window.addEventListener(TEMPORARY_SONG_EVENT, notify);
  return () => {
    window.removeEventListener(LYRICS_SEARCH_EVENT, notify);
    window.removeEventListener(TEMPORARY_SONG_EVENT, notify);
  };
}

export function useLyricsSearchReport(track: TrackInfo | null, uid: string | null, context: LyricsSearchContext) {
  const expected = track && buildLyricsSearchPlan(track, context).key;
  return useSyncExternalStore(subscribe, () => {
    const report = temporarySongs.get(track, uid)?.lyricSearch?.value;
    if (report?.plan.key === expected) return report;
    // A player can supply the real duration after a lookup has already started.
    // Only the same provider track ID may reuse that in-flight recording report.
    if (!track?.sourceTrackId) return undefined;
    return temporarySongs.entries().find(entry => entry.scope === uid &&
      entry.lyricSearch?.value.plan.key === expected)?.lyricSearch?.value;
  }, () => undefined);
}

const qualityName = (value: number) => ['No usable lyrics', 'Plain text', 'Line-synced', 'Word-synced'][value];
const timeLabel = (seconds: number) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
function statusText(report?: LyricsSearchReport) {
  if (report?.status === 'searching') return 'Automatic search in progress';
  if (report?.status === 'cancelled') return 'Automatic search cancelled';
  if (report?.status === 'failed') return 'Search failed · some providers could not be reached';
  return 'No candidates found';
}

export function PreloadedLyrics({ report, loaded, onChoose }: {
  report?: LyricsSearchReport;
  loaded?: { title?: string; sourceUrl?: string; source: string } | null;
  onChoose: (candidate: LyricsSearchCandidate) => void;
}) {
  const stage = report?.stages.at(-1);
  const candidates = [...(stage?.candidates || [])].sort((a, b) => b.quality - a.quality || compareLyricCandidates(a, b));
  return <section className="track-candidates" aria-label="Preloaded lyrics">
    {stage && <p className="quiet-status">Stage {stage.query.number} · {stage.query.label}</p>}
    {candidates.length === 0 && <p role="status" className="quiet-status">{statusText(report)}</p>}
    {candidates.map((candidate, index) => {
      const active = loaded?.title === candidate.title && (candidate.sourceUrl
        ? loaded?.sourceUrl === candidate.sourceUrl : loaded?.source === candidate.source);
      return <div className="candidate" key={candidate.id + ':' + index}>
        <div>
          <strong>{candidate.title || 'Title unavailable'}</strong>
          <small>{candidate.artist || 'Artist unavailable'} · {lyricProviderName(candidate.source, candidate.sourceUrl) || candidate.source}</small>
          <small>{qualityName(candidate.quality)} · {candidate.duration ? timeLabel(candidate.duration) : 'Duration unavailable'}
            {candidate.difference !== undefined && <> · {candidate.difference > 0 ? '+' : ''}{candidate.difference.toFixed(1)}s</>}
            {' · Stage '}{stage?.query.number}
          </small>
          <small>{candidate.rejection || Math.round(candidate.confidence * 100) + '% match'}
            {active && ' · Currently loaded'}
            {candidate.sourceUrl && /^https:\/\//i.test(candidate.sourceUrl) && <>
              {' · '}<a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
            </>}
          </small>
        </div>
        <button type="button" className="upload-button" disabled={Boolean(candidate.rejection) || active}
          onClick={() => onChoose(candidate)}>Use this version</button>
      </div>;
    })}
  </section>;
}

export function LyricsSearchLogs({ report }: { report?: LyricsSearchReport }) {
  if (!report) return <p className="quiet-status">No automatic lyrics search for this recording yet.</p>;
  return <>
    <p className="quiet-status">Strategy {report.plan.strategy} · {report.plan.reason}</p>
    {report.stages.map(stage => <details className="disclosure" key={stage.query.number}>
      <summary>Stage {stage.query.number} · {stage.query.label}</summary>
      <p className="quiet-status">{stage.query.title} · {stage.query.artist || 'Title only'}</p>
      <p className="quiet-status">{stage.pending ? 'Waiting for providers · ' : ''}
        {stage.candidates.length} candidates · {stage.candidates.filter(candidate => !candidate.rejection).length} valid</p>
      {Object.entries(stage.providerCounts || {}).map(([name,count]) => <p key={name} className="quiet-status">
        {({isrc:'lrc.red / Binimum',paxsenix:'Paxsenix',lrclib:'LRCLIB',musixmatch:'MusixMatch',kugou:'KuGou',boidu:'Boidu'} as Record<string,string>)[name]||name}
        {' · '}{count ? count + ' candidates' : 'No candidates'}
      </p>)}
      {stage.selectionReason && <p className="quiet-status">{stage.selectionReason}</p>}
      {[...stage.failures, ...(stage.notes || [])].map((message, index) => <p key={index} className="quiet-status">{message}</p>)}
      {stage.candidates.map((candidate, index) => <p key={candidate.id + ':' + index} className="quiet-status">
        {candidate.source} · {candidate.title || 'Title unavailable'} · {candidate.rejection ||
          (candidate.id === stage.selectedId ? 'Stage winner' : 'Valid alternative')}
      </p>)}
    </details>)}
    <p className="quiet-status">{report.selected ? 'Selected · ' + report.selected.source : statusText(report)}</p>
  </>;
}
