import {prepareSongLyrics,peekPreparedLyrics,preparedLyricsNeedWordSync} from '../data/songPreparation';
import {hasWordTiming,lyricsQuality} from '../lyrics/lyricsQuality';
import {buildLyricsSearchPlan,type LyricsSearchContext} from '../lyrics/searchPlan';
import {lyricProviderName,normalizeLyricSource} from '../lyrics/sourceLabels';
import { useEffect, useMemo, useRef, useState } from "react";
import type {IncomingLyrics} from '../lyrics/ManualLyrics';
export type FoundLyrics=Omit<IncomingLyrics,'token'>;
import type {
  LyricsSelection,
  LyricsSourceReference,
} from "../firebase/correctionModel";
import {
  fetchAppleMusicCandidates,
  fetchAppleMusicWordSyncedLyrics,
} from "../lyrics/appleLyrics";
import {
  LYRIC_ENGINE_OPTIONS,
  type LyricEngineOption,
  type YouTubeSubtitleTrackItem,
} from "../lyrics/lyricFlowEngine";
import { createLyricHandoff } from "../lyrics/lyricHandoff";
import {
  lrclibProvider,
  retrievePermittedLyrics,
  type StashResolvedLyrics,
} from "../lyrics/providers";
import { findUserLyrics, type LibraryEntry } from "../lyrics/userLibrary";
import {
  hasValidLrcTimestamps,
  isAdvertisementTrack,
  type TrackCandidate,
  type TrackInfo,
} from "../metadata/trackInfo";

export default function TrackFinder({
  track,
  searchContext,
  accountId=null,
  enabled=true,
  preferredSelection,
  preferredSourceFile,
  onSelectionChange,
  savedCustomLrc,
  customEditOpen = true,
  lyricEngineOption = "lyricflow",
  onLyricEngineOptionChange,
  selectedSubtitleTrackId,
  onAvailableLyricEnginesChange,
  onSubtitleTracksChange,
  leadingNonMusicOffsetSec = 0,
  onMetadataChange,
  onLyricsFound,
  onLyricsMapped,
  onStatusChange,
}: {
  track: TrackInfo | null;
  searchContext?: LyricsSearchContext;
  accountId?:string|null;
  enabled?:boolean;
  preferredSelection?: LyricsSelection | null;
  preferredSourceFile?: LyricsSourceReference | null;
  onSelectionChange?: (selection: LyricsSelection) => void;
  savedCustomLrc?: string;
  customEditOpen?: boolean;
  lyricEngineOption?: LyricEngineOption;
  onLyricEngineOptionChange?: (next: LyricEngineOption) => void;
  selectedSubtitleTrackId?: string;
  onSelectSubtitleTrackId?: (id: string) => void;
  onAvailableLyricEnginesChange?: (engines: LyricEngineOption[]) => void;
  onSubtitleTracksChange?: (tracks: YouTubeSubtitleTrackItem[]) => void;
  leadingNonMusicOffsetSec?: number;
  onMetadataChange: (next: TrackInfo) => void;
  onLyricsFound: (source: {
    original: string;
    romanized: string;
    source: string;
    sourceUrl?: string;
    plain?: string;
    hasWordSync?: boolean;
    mappingRevision?:string;
    title?: string;
    artist?: string;
  }) => void;
  onStatusChange?: (status: string) => void;
  onLyricsMapped?:(lyrics:FoundLyrics,selection:LyricsSelection|null)=>void;
}) {
  const [candidates, setCandidates] = useState<TrackCandidate[]>([]);
  const [, setAvailableEngines] = useState<LyricEngineOption[]>([]);
  const [, setSubtitleTracks] = useState<YouTubeSubtitleTrackItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manualTitle, setManualTitle] = useState(() => track?.title || "");
  const [manualArtist, setManualArtist] = useState(() => track?.artist || "");
  const [overrideBracketFilter, setOverrideBracketFilter] = useState(true);

  const latestLyrics = useRef(onLyricsFound);
  latestLyrics.current = onLyricsFound;
  const latestStatus = useRef(onStatusChange);
  latestStatus.current = onStatusChange;
  const latestAvailableEngines = useRef(onAvailableLyricEnginesChange);
  latestAvailableEngines.current = onAvailableLyricEnginesChange;
  const latestSubtitleTracks = useRef(onSubtitleTracksChange);
  latestSubtitleTracks.current = onSubtitleTracksChange;
  const latestEngineChange = useRef(onLyricEngineOptionChange);
  latestEngineChange.current = onLyricEngineOptionChange;
  const [matches, setMatches] = useState<LibraryEntry[]>([]);
  const pending = useRef<AbortController | null>(null);
  const automaticRequest = useRef<AbortController | null>(null);
  const publishManual=(lyrics:FoundLyrics,selection:LyricsSelection|null)=>{
    automaticRequest.current?.abort();
    if(onLyricsMapped)onLyricsMapped(lyrics,selection);
    else{onLyricsFound(lyrics);if(selection)onSelectionChange?.(selection);}
  };

  const updateStatus = (msg: string) => {
    setMessage(msg);
    latestStatus.current?.(msg);
  };

  useEffect(
    () => () => {
      pending.current?.abort();
      automaticRequest.current?.abort();
    },
    [],
  );

  // Stable song identity for automatic search so typing in Manual Search inputs or mid-load duration/SponsorBlock updates do not abort in-flight auto-search
  const autoTrackKey = track
    ? track.source === "manual"
      ? ""
      : [
          track.provider || "",
          track.title,
          track.artist,
          track.videoId || "",
          track.sourceTrackId || "",
          track.fileName || "",
          track.isAd ? "ad" : "",
        ].join("|")
    : "";

  const latestLeadingOffset = useRef(leadingNonMusicOffsetSec);
  latestLeadingOffset.current = leadingNonMusicOffsetSec;
  const captionVideoId=lyricEngineOption==='youtube'?searchContext?.backgroundVideoId:undefined;
  const searchKey=track?buildLyricsSearchPlan(track).key:'';
  const requestKey=useMemo(()=>JSON.stringify([autoTrackKey,searchKey,captionVideoId,enabled,accountId,savedCustomLrc,lyricEngineOption,selectedSubtitleTrackId,
    preferredSelection?.engine,preferredSelection?.lrclibId,preferredSourceFile?.url,preferredSourceFile?.revision]),
    [autoTrackKey,searchKey,captionVideoId,enabled,accountId,savedCustomLrc,lyricEngineOption,selectedSubtitleTrackId,preferredSelection?.engine,preferredSelection?.lrclibId,preferredSourceFile?.url,preferredSourceFile?.revision]);
  const latestRequestKey=useRef(requestKey);latestRequestKey.current=requestKey;
  const lastAutomaticLyrics=useRef<{trackKey:string;signature:string}|undefined>(undefined);

  // Manual search starts with the source metadata and has its own filter control.
  useEffect(() => {
    if (!track || track.source === "manual") return;
    setManualTitle(track.title);
    setManualArtist(track.artist);
  }, [autoTrackKey]);

  // Automatic lyrics lookup across the 4 selectable Lyrics Engine options
  useEffect(() => {
    pending.current?.abort();automaticRequest.current?.abort();
    if (!enabled || !track || track.title.trim().length < 2)
      return;
    if (isAdvertisementTrack(track)) {
      automaticRequest.current?.abort();
      pending.current?.abort();
      setCandidates([]);
      setAvailableEngines([]);
      setSubtitleTracks([]);
      latestAvailableEngines.current?.([]);
      latestSubtitleTracks.current?.([]);
      updateStatus(
        "Advertisement playing — showing built-in themes (lyrics & video search paused).",
      );
      return;
    }
    if (savedCustomLrc && savedCustomLrc.trim()) {
      const hasTimed = hasValidLrcTimestamps(savedCustomLrc);
      const wordTimed=hasWordTiming(savedCustomLrc);
      latestLyrics.current({
        original: hasTimed ? savedCustomLrc : "",
        plain: hasTimed ? undefined : savedCustomLrc,
        romanized: "",
        source: normalizeLyricSource(preferredSourceFile?.name || "Saved Custom Override",preferredSourceFile?.url,hasTimed?wordTimed:undefined),
        sourceUrl:preferredSourceFile?.url||undefined,
        hasWordSync: wordTimed,
        title: track.title,
        artist: track.artist,
      });
      updateStatus("Loaded your saved custom lyrics for this track.");
      return;
    }
    if(track.source==='manual')return;

    const saved = findUserLyrics(track).filter(
      (entry) =>
        entry.original &&
        entry.title.toLowerCase() === track.title.toLowerCase(),
    );
    if (saved.length >= 1 && !preferredSelection) {
      const hasTimed = hasValidLrcTimestamps(saved[0].original);
      latestLyrics.current({
        original: hasTimed ? saved[0].original : "",
        plain: hasTimed ? undefined : saved[0].original,
        romanized: saved[0].romanized,
        source: "Saved Library",
        hasWordSync: hasTimed && hasWordTiming(saved[0].original),
        title: saved[0].title || track.title,
        artist: saved[0].artist || track.artist,
      });
      updateStatus("Synchronized from your saved lyrics library.");
      return;
    }

    const controller = new AbortController();
    automaticRequest.current?.abort();
    automaticRequest.current = controller;

    const engineLabel =
      LYRIC_ENGINE_OPTIONS.find((o) => o.id === lyricEngineOption)?.label ||
      "LyricFlow Engine";
    const handoff = createLyricHandoff(controller.signal,lastAutomaticLyrics.current?.trackKey===autoTrackKey
      ?lastAutomaticLyrics.current.signature:undefined);
    const applyResolved = (resolved: StashResolvedLyrics | null) => {
      if (controller.signal.aborted||latestRequestKey.current!==requestKey) return;
      if (resolved) {
        const nextEngines = resolved.availableEngines || ["lyricflow"];
        const nextSubTracks = resolved.subtitleTracks || [];
        setAvailableEngines(nextEngines);
        setSubtitleTracks(nextSubTracks);
        latestAvailableEngines.current?.(nextEngines);
        latestSubtitleTracks.current?.(nextSubTracks);
        if (
          nextEngines.length > 0 &&
          !nextEngines.includes(lyricEngineOption) &&
          // Keep an Apple preference while LRCLIB supplies temporary lyrics.
          // Changing engines here would cancel the in-flight Apple retries.
          lyricEngineOption !== "apple"
        ) {
          latestEngineChange.current?.(nextEngines[0]);
        }
        const hasTimedLines = hasValidLrcTimestamps(resolved.original);
        const wordTimed=hasWordTiming(resolved.original);
        const payload = {
          mappingRevision:resolved.mappingRevision,
          original: hasTimedLines ? resolved.original : "",
          romanized: hasTimedLines ? resolved.romanized : "",
          plain:
            resolved.plain ||
            (!hasTimedLines && resolved.original
              ? resolved.original
              : undefined),
          source: normalizeLyricSource(resolved.source,resolved.sourceUrl,hasTimedLines?wordTimed:undefined),
          sourceUrl: resolved.sourceUrl,
          hasWordSync: wordTimed,
          title: resolved.title || track.title,
          artist: resolved.artist || track.artist,
        };
        const signature=JSON.stringify(payload);
        const commit = () => {
          if (controller.signal.aborted||latestRequestKey.current!==requestKey) return;
          lastAutomaticLyrics.current={trackKey:autoTrackKey,signature};
          latestLyrics.current(payload);
          updateStatus(
            wordTimed
              ? `${payload.source} — word-by-word sync active.`
              : hasTimedLines
                ? `${payload.source} — line-by-line sync active.`
                : `${payload.source} — plain lyrics loaded (no line timestamps available).`,
          );
        };
        const disposition = handoff.publish(
          signature,
          commit,
          true,
        );
        if (disposition === "pending") {
          updateStatus("Preferred lyrics ready · switching after the current line finishes…");
        }
      } else if (!handoff.hasApplied) {
        setAvailableEngines([]);
        setSubtitleTracks([]);
        latestAvailableEngines.current?.([]);
        latestSubtitleTracks.current?.([]);
        updateStatus(
          `No automatic lyrics found via ${engineLabel}. Click "Search lyrics online" or "Edit or import lyrics" to choose lyrics.`,
        );
      }
    };

    const cached=peekPreparedLyrics(track,accountId,{engine:lyricEngineOption,selection:preferredSelection||null,
      source:preferredSourceFile||null,leadingOffset:latestLeadingOffset.current,subtitleId:selectedSubtitleTrackId,context:searchContext});
    if(cached){
      applyResolved(cached);
      if(!preparedLyricsNeedWordSync(cached,{engine:lyricEngineOption,selection:preferredSelection,source:preferredSourceFile}))return()=>{handoff.cancel();controller.abort();};
    }

    const timer = setTimeout(() => {
      updateStatus(`[${engineLabel}] Searching lyrics for "${track.title}"…`);
      const resolvePreferred=()=>prepareSongLyrics(track,accountId,{
        engine:lyricEngineOption,selection:preferredSelection||null,source:preferredSourceFile||null,
        leadingOffset:latestLeadingOffset.current,subtitleId:selectedSubtitleTrackId,context:searchContext,
      },controller.signal,applyResolved);
      void resolvePreferred()
        .then(applyResolved)
        .catch((error) => {
          if (!controller.signal.aborted) {
            updateStatus(
              error instanceof Error
                ? error.message
                : "Automatic lyrics lookup unavailable.",
            );
          }
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      handoff.cancel();
      controller.abort();
    };
  }, [requestKey]);

  const canSearch = Boolean(track && manualTitle.trim().length >= 2);

  useEffect(() => {
    if (!autoTrackKey) return;
    pending.current?.abort();
    setBusy(false);
    setMatches(track ? findUserLyrics(track) : []);
  }, [autoTrackKey]);

  async function search() {
    if (!track || !canSearch) return;
    const searchTrack: TrackInfo = {
      ...track,
      title: manualTitle.trim(),
      videoTitle: manualTitle.trim(),
      artist: manualArtist.trim(),
      album: "",
      source: "manual",
      confidence: 1,
    };
    onMetadataChange(searchTrack);
    setBusy(true);
    updateStatus(
      overrideBracketFilter
        ? `Searching lrc.red / Binimum / Paxsenix & LRCLIB with exact query "${searchTrack.title}" (bracket filter overridden)…`
        : `Searching lrc.red / Binimum / Paxsenix & LRCLIB for "${searchTrack.title}"…`,
    );
    setCandidates([]);
    automaticRequest.current?.abort();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const handoff = createLyricHandoff(controller.signal);
    type LyricPayload = Parameters<typeof onLyricsFound>[0];
    let appleDirect: Awaited<ReturnType<typeof fetchAppleMusicWordSyncedLyrics>> = null;
    let appleCands: TrackCandidate[] = [], lrcCands: TrackCandidate[] = [];
    const publishLyrics = (payload: LyricPayload, status: string) => {
      if (controller.signal.aborted) return;
      const disposition = handoff.publish(JSON.stringify(payload), () => {
        latestLyrics.current(payload);
        updateStatus(status);
      });
      if (disposition === "pending") {
        updateStatus("Preferred lyrics ready · switching after the current line finishes…");
      }
    };
    const publishAvailable = (finished = false) => {
      if (controller.signal.aborted) return;
      const combinedCandidates = [...appleCands, ...lrcCands].sort((a,b)=>
        lyricsQuality(b.syncedLyrics||b.plainLyrics)-lyricsQuality(a.syncedLyrics||a.plainLyrics)||b.confidence-a.confidence);
      const bestCandidate=combinedCandidates.find(c=>!c.instrumental&&(c.syncedLyrics||c.plainLyrics));
      setCandidates(combinedCandidates);
      if (appleDirect && (appleDirect.lrc || appleDirect.plain) &&
        lyricsQuality(appleDirect.lrc||appleDirect.plain)>=lyricsQuality(bestCandidate?.syncedLyrics||bestCandidate?.plainLyrics)) {
        const hasTimed = hasValidLrcTimestamps(appleDirect.lrc);
        publishLyrics({
          original: hasTimed ? appleDirect.lrc : "",
          plain:
            appleDirect.plain ||
            (!hasTimed && appleDirect.lrc ? appleDirect.lrc : undefined),
          romanized: hasTimed ? appleDirect.romanizedLrc || "" : "",
          source: appleDirect.source,
          sourceUrl: appleDirect.sourceUrl,
          hasWordSync: hasTimed && hasWordTiming(appleDirect.lrc),
          title: appleDirect.title || appleCands[0]?.title || searchTrack.title,
          artist: appleDirect.artist || appleCands[0]?.artist || searchTrack.artist,
        },
          `Loaded ${appleDirect.source} (${hasTimed ? (hasWordTiming(appleDirect.lrc) ? "Word timestamps" : "Line timestamps") : "Plain lyrics"}). ${combinedCandidates.length} lrc.red / Binimum / Paxsenix & LRCLIB candidate(s) listed below.`,
        );
      } else if (bestCandidate) {
        const top=bestCandidate,hasTimed=hasValidLrcTimestamps(top.syncedLyrics);
        publishLyrics({original:hasTimed?top.syncedLyrics!:"",plain:top.plainLyrics||(!hasTimed?top.syncedLyrics:undefined),romanized:"",
          source:normalizeLyricSource(top.sourceLabel||(top.hasWordSync?"LRCLIB · Word-Synced":"LRCLIB · Synced"),top.url),
          sourceUrl:top.url,hasWordSync:lyricsQuality(top.syncedLyrics)===3,title:top.title||searchTrack.title,artist:top.artist||searchTrack.artist},
          `Loaded ${lyricProviderName(top.sourceLabel||'',top.url)||'synced'} lyrics for "${top.title}". ${combinedCandidates.length} candidate(s) listed below.`);
      } else if (finished) {
        updateStatus(
          combinedCandidates.length
            ? `${combinedCandidates.length} candidate(s) found across lrc.red / Binimum / Paxsenix & LRCLIB. Select a version below.`
            : "No matching candidates found; paste custom LRC in the editor below.",
        );
      }
    };
    try {
      await Promise.all([
        fetchAppleMusicWordSyncedLyrics(searchTrack, controller.signal, "apple", overrideBracketFilter)
          .catch(() => null).then(result => { appleDirect = result; publishAvailable(); }),
        fetchAppleMusicCandidates(searchTrack, controller.signal, overrideBracketFilter)
          .catch(() => []).then(result => { appleCands = result; publishAvailable(); }),
        lrclibProvider.search(searchTrack, controller.signal, overrideBracketFilter)
          .catch(() => []).then(result => { lrcCands = result; publishAvailable(); }),
      ]);
      publishAvailable(true);
    } catch (e) {
      if (!controller.signal.aborted)
        updateStatus(e instanceof Error ? e.message : "Lyrics search failed.");
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  }

  async function selectCandidate(c: TrackCandidate) {
    automaticRequest.current?.abort();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    updateStatus("Loading selected lyrics version…");
    try {
      const lyric = await retrievePermittedLyrics(c, controller.signal);
      if (controller.signal.aborted) return;
      if (!lyric.synced && !lyric.plain) {
        updateStatus("The selected candidate has no lyric text.");
        return;
      }
      const hasTimed = hasValidLrcTimestamps(lyric.synced);
      publishManual({
        original: hasTimed ? lyric.synced : "",
        romanized: "",
        plain:
          lyric.plain || (!hasTimed && lyric.synced ? lyric.synced : undefined),
        source: lyric.source,
        sourceUrl: lyric.sourceUrl,
        hasWordSync: hasTimed && hasWordTiming(lyric.synced),
        title: lyric.title || c.title,
        artist: lyric.artist || c.artist,
      },{
        engine: c.provider === "apple" ? "apple" : "lrclib",
        lrclibId: c.provider === "apple" ? null : c.id,
        subtitleTrackId: null,
      });
      updateStatus(
        hasTimed
          ? `Loaded ${lyric.source} (${hasWordTiming(lyric.synced) ? "Word timestamps" : "Line timestamps"}).`
          : 'Plain lyrics loaded (no line timestamps available) — click "Create approximate timestamps" below.',
      );
    } catch (e) {
      if (!controller.signal.aborted)
        updateStatus(e instanceof Error ? e.message : "Unable to load lyrics.");
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  }

  if (!customEditOpen) return null;

  return (
    <section
      className="local-player track-finder"
      aria-label="Track identification and lyrics override"
    >
      <div className="player-heading">
        <div className="heading-left">
          <span className="heading-icon">⌕</span>
          <div>
            <b>Search lyrics online</b>
          </div>
        </div>
      </div>
      {!track ? (
        <p className="player-footnote">
          Load a local audio file or play a song from the Built-in Online Player
          first.
        </p>
      ) : (
        <>
          <div className="track-form">
            <label>
              Title
              <input
                aria-label="Title"
                type="text"
                inputMode="text"
                autoComplete="off"
                value={manualTitle}
                placeholder="Enter song title"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") void search();
                }}
                onChange={(e) => setManualTitle(e.target.value)}
              />
            </label>
            <label>
              Artist name
              <input
                aria-label="Artist name"
                type="text"
                inputMode="text"
                autoComplete="off"
                value={manualArtist}
                placeholder="Enter artist name"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") void search();
                }}
                onChange={(e) => setManualArtist(e.target.value)}
              />
            </label>
          </div>
          <p className="player-footnote">
            Searches use song title and artist name (album names are excluded).
          </p>
          <div
            style={{
              margin: "6px 0 10px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#cbd5e1",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={overrideBracketFilter}
                onChange={(e) => setOverrideBracketFilter(e.target.checked)}
              />
              Override bracket/tag filter in manual search (keep brackets &amp;
              exact text)
            </label>
          </div>
          <div className="track-search-row">
            <span>
              Metadata source: {track.source} ·{" "}
              {track.duration ? Math.round(track.duration) + "s" : ""}
            </span>
            <button
              type="button"
              className="upload-button"
              disabled={busy || !canSearch}
              onClick={() => void search()}
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </div>
          {matches.length > 0 && (
            <div className="library-match">
              <strong>Saved in your library</strong>
              {matches.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    automaticRequest.current?.abort();
                    pending.current?.abort();
                    const hasTimed = hasValidLrcTimestamps(e.original);
                    publishManual({
                      original: hasTimed ? e.original : "",
                      plain: hasTimed ? undefined : e.original,
                      romanized: e.romanized,
                      source: "My library",
                      hasWordSync: hasTimed && hasWordTiming(e.original),
                    },null);
                    updateStatus("Loaded saved library lyrics.");
                  }}
                >
                  {e.title} — {e.artist || "Unknown artist"}
                </button>
              ))}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="track-candidates">
              <div className="candidate-heading">
                Alternative recordings ({candidates.length}){" "}
                <small>
                  Synced lyric sources and LRCLIB results — choose if the auto-loaded
                  lyrics do not match
                </small>
              </div>
              {candidates.map((c) => (
                <div
                  className="candidate"
                  key={`${c.provider || "lrclib"}-${c.id}`}
                >
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.artist} {c.album ? "· " + c.album : ""} ·{" "}
                      {Math.round(c.duration)}s ·{" "}
                      {Math.round(c.confidence * 100)}% match
                    </small>
                    <small>
                      {`[${lyricProviderName(c.sourceLabel||'',c.url)||(c.provider==='apple'?'Synced lyrics':'LRCLIB')}] `}
                      {c.instrumental
                        ? "Instrumental"
                        : c.hasWordSync
                          ? "Word timestamps"
                          : c.hasSynced
                            ? "Line timestamps"
                            : "Plain lyrics (no timestamps)"}
                      {c.url ? (
                        <>
                          {" "}
                          ·{" "}
                          <a href={c.url} target="_blank" rel="noreferrer">
                            Source ↗
                          </a>
                        </>
                      ) : null}
                    </small>
                  </div>
                  <button
                    className="upload-button"
                    disabled={busy || c.instrumental}
                    onClick={() => void selectCandidate(c)}
                  >
                    Use this version
                  </button>
                </div>
              ))}
            </div>
          )}
          {message && (
            <p className="player-footnote" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
