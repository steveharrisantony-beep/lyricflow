import { backendOrigin } from '../network/backend';
import { hasValidLrcTimestamps } from '../metadata/trackInfo';
import { convertTtmlToEnhancedLrc } from './appleLyrics';
import { lyricsQuality } from './lyricsQuality';
import type { LyricEngineOption } from './lyricFlowEngine';
import {
  compareLyricCandidates, isPreferredWordSync, validateLyricsCandidate, lyricsStageProviders, type LyricsStageProvider,
  type LyricsQuery, type LyricsSearchCandidate, type LyricsSearchPlan,
  type LyricsSearchReport, type LyricsStageReport, type ProviderLyric,
} from './searchPlan';

interface ProviderReply { candidates: ProviderLyric[]; failures: string[] }

async function requestProvider(provider: LyricsStageProvider, query: LyricsQuery, duration: number, signal?: AbortSignal): Promise<ProviderReply> {
  const params = new URLSearchParams({ provider, title: query.title, duration: String(duration || 0) });
  if (query.artist) params.set('artist', query.artist);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.throwIfAborted();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Provider request timed out', 'TimeoutError')), 15000);
  try {
    const response = await fetch(`${backendOrigin()}/music/lyrics-stage?${params}`, {
      signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const reply = await response.json() as ProviderReply;
    if (!Array.isArray(reply.candidates) || !Array.isArray(reply.failures)) throw new Error('Invalid provider response');
    return reply;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

function prepareCandidate(raw: ProviderLyric, plan: LyricsSearchPlan, query: LyricsQuery): LyricsSearchCandidate {
  const { ttml, ...metadata } = raw;
  const decoded = ttml ? convertTtmlToEnhancedLrc(ttml) : undefined;
  const text = decoded?.lrc || raw.lrc || '';
  const lrc = hasValidLrcTimestamps(text) ? text : '';
  const plain = raw.plain || (!lrc && text.trim()) || undefined;
  const quality = lyricsQuality(lrc || plain);
  const match = validateLyricsCandidate(raw, plan, query);
  return {
    ...metadata, lrc, plain, romanized: decoded?.romanizedLrc,
    quality, ...match, rejection: match.rejection || (!quality ? 'No usable lyrics' : undefined),
  };
}

function preferredProviders(engine: LyricEngineOption) {
  if (engine === 'lrclib') return ['lrclib'] as const;
  if (engine === 'apple') return ['isrc', 'paxsenix'] as const;
  return lyricsStageProviders;
}

export async function executeLyricsSearchPlan(
  plan: LyricsSearchPlan,
  engine: LyricEngineOption,
  signal?: AbortSignal,
  onLyrics?: (candidate: LyricsSearchCandidate) => void,
  onReport?: (report: LyricsSearchReport) => void,
): Promise<LyricsSearchCandidate | null> {
  let selected: LyricsSearchCandidate | undefined;
  const finished: LyricsStageReport[] = [];
  let current: LyricsStageReport | undefined;
  const report = (status: LyricsSearchReport['status']) => onReport?.({
    plan, status, stages: current ? [...finished, current] : [...finished],
    selected, timestamp: Date.now(),
  });

  for (const query of plan.stages) {
    signal?.throwIfAborted();
    if (current) {
      // Earlier stages retain diagnostics. Only the last stage needs selectable text.
      finished.push({ ...current, candidates: current.candidates.map(candidate => ({
        ...candidate, lrc: undefined, plain: undefined, romanized: undefined,
      })) });
    }
    const activeProviders = preferredProviders(engine);
    const replies = new Map<LyricsStageProvider, LyricsSearchCandidate[]>();
    const failures: string[] = [];
    const providerCounts: Record<string,number> = {};
    let provisional: LyricsSearchCandidate | undefined;
    current = { query, candidates: [], failures: [], pending: true };
    report('searching');

    await Promise.all(activeProviders.map(async provider => {
      try {
        const result = await requestProvider(provider, query, plan.duration, signal);
        signal?.throwIfAborted();
        const candidates = result.candidates.map(raw => prepareCandidate(raw, plan, query));
        replies.set(provider, candidates);
        failures.push(...result.failures);
        providerCounts[provider]=candidates.length;
        // Show the first validated result while the remaining providers finish.
        if (!selected && !provisional) {
          provisional = candidates.filter(candidate => !candidate.rejection && (candidate.difference !== undefined || plan.duration <= 0)).sort(compareLyricCandidates)[0];
          if (provisional) onLyrics?.(provisional);
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        failures.push(provider + ': ' + (error instanceof Error ? error.message : 'request failed'));
      }
      if (signal?.aborted) return;
      current = { query, candidates: activeProviders.flatMap(provider => replies.get(provider) || []),
        failures: [...failures], providerCounts:{...providerCounts}, pending: true };
      report('searching');
    }));
    signal?.throwIfAborted();
    const candidates = activeProviders.flatMap(provider => replies.get(provider) || []);
    const valid = candidates.filter(candidate => !candidate.rejection).sort(compareLyricCandidates);
    const winner = valid[0];

    if (winner && (!selected || compareLyricCandidates(winner, selected) < 0)) {
      selected = winner;
      if (winner !== provisional) onLyrics?.(winner);
    }
    current = {
      query, candidates, failures: [...failures], providerCounts:{...providerCounts}, pending: false, selectedId: winner?.id,
      selectionReason: winner ? [
        winner.quality === 3 ? 'Word timing' : winner.quality === 2 ? 'Line timing' : 'Plain lyrics',
        winner.difference === undefined ? 'recording duration unavailable' : Math.abs(winner.difference).toFixed(1) + 's from playback duration',
        winner.quality === 3 && !isPreferredWordSync(winner) ? 'outside the preferred word timing window' : '',
        winner === selected ? 'used for playback' : 'earlier match retained',
      ].filter(Boolean).join(' · ') : undefined,
    };
    report('searching');
    if (selected && isPreferredWordSync(selected)) break;
  }

  signal?.throwIfAborted();
  report(selected ? 'found' : [...finished, current].some(stage => stage?.failures.length) ? 'failed' : 'empty');
  return selected || null;
}
