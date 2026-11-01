import { useEffect, useRef, useState } from "react";
import {
  formatViewCount,
  isUnwantedVideoVariant,
  isYouTubeBackgroundVideo,
  isLyricalVideo,
  rankYouTubeBackgroundCandidates,
  searchStashCatalog,
  type SongResult,
} from "./providers";
import { extractYouTubeVideoId, type TrackInfo } from "../metadata/trackInfo";
import type { YouTubeBackgroundMode } from "../visualization/cinematic/CinematicStage";
import { findYouTubeBackgrounds } from "./backgroundVideos";

export default function YouTubeBackgroundPicker({
  track,
  activeVideoId,
  preference,
  onChoose,
  onSearchingChange,
  captionStatus,
  cachedCandidates,
  cachedCandidateCount,
  automaticSearchPending,
}: {
  track: TrackInfo;
  activeVideoId: string | null;
  preference: "music" | "lyrics";
  onPreferenceChange?: (value: "music" | "lyrics") => void;
  onChoose: (id: string) => void;
  backgroundMode?: YouTubeBackgroundMode;
  onBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
  onSearchingChange?: (searching: boolean) => void;
  captionStatus?: string;
  cachedCandidates?: SongResult[];
  cachedCandidateCount?: number;
  automaticSearchPending?: boolean;
}) {
  const [results, setResults] = useState<SongResult[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [customQuery, setCustomQuery] = useState("");
  const pending = useRef<AbortController | null>(null);
  const [showCached, setShowCached] = useState(false);
  useEffect(() => {
    if (!showCached || !cachedCandidates) return;
    setResults(cachedCandidates.slice(0, 15));
    setMessage(
      automaticSearchPending
        ? "Finding video candidates…"
        : cachedCandidates.length
          ? `${cachedCandidateCount || cachedCandidates.length} candidates compared.`
          : "No suitable video candidates were found. Search again with a different query.",
    );
  }, [
    showCached,
    cachedCandidates,
    cachedCandidateCount,
    automaticSearchPending,
  ]);
  const searchingCallback = useRef(onSearchingChange);
  searchingCallback.current = onSearchingChange;
  useEffect(
    () => () => {
      pending.current?.abort();
      searchingCallback.current?.(false);
    },
    [],
  );
  const runSearch = async (overrideQuery?: string) => {
    setShowCached(false);
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    searchingCallback.current?.(true);
    setMessage("Finding YouTube backgrounds…");
    try {
      const base =
        localStorage.getItem("lyricflow.resolver") ||
        import.meta.env.VITE_MUSIC_RESOLVER ||
        "";
      const defaultQuery = `${track.title} ${track.artist} ${
        preference === "music" ? "Official Video" : "Official Lyric Video"
      }`;
      const effectiveQuery =
        overrideQuery && overrideQuery.trim().length >= 2
          ? overrideQuery.trim()
          : defaultQuery;
      const custom = Boolean(overrideQuery && overrideQuery.trim().length >= 2);
      const search = custom
        ? null
        : await findYouTubeBackgrounds(
            track,
            preference,
            base,
            controller.signal,
          );
      let ranked = search?.videos;
      if (!ranked) {
        const rawResults = await searchStashCatalog(
          effectiveQuery,
          "resolver",
          base,
          controller.signal,
        );
        const directId = extractYouTubeVideoId({
          id: effectiveQuery,
          provider: "resolver",
          sourceUrl: effectiveQuery,
        });
        if (directId && rawResults.length === 1) {
          ranked = rawResults;
        } else {
          const strictRanked = rankYouTubeBackgroundCandidates(
            rawResults,
            track,
            preference,
          );
          const strictIds = new Set(
            strictRanked.map((s) => extractYouTubeVideoId(s)).filter(Boolean),
          );
          const customRanked = rankYouTubeBackgroundCandidates(
            rawResults.filter((s) => {
              const id = extractYouTubeVideoId(s);
              return Boolean(id && !strictIds.has(id));
            }),
            {
              title: effectiveQuery,
              artist: "",
              album: track.album,
              duration: 0,
            },
            preference,
          );
          const customIds = new Set(
            customRanked.map((s) => extractYouTubeVideoId(s)).filter(Boolean),
          );
          const queryWords = effectiveQuery
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 1);
          const extra = rawResults
            .filter((song) => {
              const id = extractYouTubeVideoId(song);
              if (!id || strictIds.has(id) || customIds.has(id)) return false;
              if (
                !isYouTubeBackgroundVideo(song) ||
                (preference === "lyrics" && !isLyricalVideo(song))
              )
                return false;
              if (
                isUnwantedVideoVariant(song.title, effectiveQuery, song.artist)
              )
                return false;
              if (queryWords.length > 0) {
                const songWords = new Set(
                  song.title
                    .normalize("NFKC")
                    .toLowerCase()
                    .replace(/[^\p{L}\p{N}]+/gu, " ")
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean),
                );
                const matchRatio =
                  queryWords.filter((w) => songWords.has(w)).length /
                  queryWords.length;
                if (matchRatio < 0.75) return false;
              }
              return true;
            })
            .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
          ranked = [...strictRanked, ...customRanked, ...extra].slice(0, 15);
        }
      }
      if (controller.signal.aborted) return;
      setResults(ranked);
      setMessage(
        ranked.length
          ? `Compared ${search?.candidateCount || ranked.length} candidates by title, artist, views, duration and video type.${search?.usedLyricalFallback ? " No suitable music video found; showing lyrical videos." : ""} Adjust video delay if it has an intro.`
          : "No videos found. Sign in to YouTube above, retry, or paste a YouTube video link directly.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "YouTube search unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        searchingCallback.current?.(false);
      }
    }
  };
  return (
    <section
      className="local-player youtube-background-picker"
      aria-label="Muted YouTube background"
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          className="upload-button"
          disabled={busy}
          onClick={() => {
            if (cachedCandidates) setShowCached(true);
            else void runSearch();
          }}
        >
          {busy
            ? "Finding videos…"
            : activeVideoId
              ? "Change video"
              : "Find video"}
        </button>
      </div>
      <form
        className="yt-custom-search-row"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(customQuery || undefined);
        }}
      >
        <input
          type="search"
          aria-label="Custom YouTube video search"
          value={customQuery}
          placeholder="Search videos or paste a YouTube URL"
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => setCustomQuery(e.target.value)}
        />
        <button type="submit" className="upload-button" disabled={busy}>
          {results.length || showCached ? "Search again" : "Search YouTube"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {captionStatus && <p role="status">{captionStatus}</p>}
      <div className="track-candidates">
        {results.map((song) => {
          const id = extractYouTubeVideoId(song)!;
          const viewsLabel = formatViewCount(song.viewCount);
          const thumbUrl =
            song.artwork || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          return (
            <div className="candidate video-candidate" key={id}>
              <img
                className="candidate-thumb"
                src={thumbUrl}
                alt={song.title}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="candidate-meta">
                <strong>{song.title}</strong>
                <small>
                  {song.artist} ·{" "}
                  {song.duration
                    ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, "0")}`
                    : "Duration unknown"}
                  {viewsLabel ? ` · ${viewsLabel}` : ""}
                </small>
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  onChoose(id);
                  setShowCached(false);
                  setResults([]);
                  setMessage(
                    "Muted background selected and saved. Your audio is unchanged.",
                  );
                }}
              >
                Use video
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
