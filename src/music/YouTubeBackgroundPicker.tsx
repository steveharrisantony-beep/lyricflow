import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {formatViewCount,isLyricalVideo,searchStashCatalog,type SongResult} from './providers';
import {compareYouTubeVideoViews,filterYouTubeVideoChoices} from './videoMatching';
import { extractYouTubeVideoId, type TrackInfo } from "../metadata/trackInfo";
import type { YouTubeBackgroundMode } from "../visualization/cinematic/CinematicStage";
import { findYouTubeBackgrounds } from "./backgroundVideos";

export default function YouTubeBackgroundPicker({
  track,
  activeVideoId,
  preference,
  onChoose,
  onSearchingChange,
  onMatchedSearch,
  captionStatus,
  cachedCandidates,
  cachedCandidateCount,
  automaticSearchPending,
}: {
  track: TrackInfo;
  activeVideoId: string | null;
  preference: "music" | "lyrics";
  onPreferenceChange?: (value: "music" | "lyrics") => void;
  onChoose: (id: string, candidate?: SongResult) => void;
  backgroundMode?: YouTubeBackgroundMode;
  onBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
  onSearchingChange?: (searching: boolean) => void;
  onMatchedSearch?: (candidates: SongResult[], candidateCount: number) => void;
  captionStatus?: string;
  cachedCandidates?: SongResult[];
  cachedCandidateCount?: number;
  automaticSearchPending?: boolean;
}) {
  const [results, setResults] = useState<SongResult[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [customQuery, setCustomQuery] = useState(track.title);
  const pending = useRef<AbortController | null>(null);
  const [showCached, setShowCached] = useState(false);
  const [searchOnlineOpen, setSearchOnlineOpen] = useState(false);
  const [sort, setSort] = useState<"relevance" | "views">("relevance");
  // App supplies the completed order used by playback. Render it directly.
  const preloadedResults = showCached ? cachedCandidates : undefined;
  const visibleResults = preloadedResults ?? (searchOnlineOpen && sort === "views"
    ? [...results].sort(compareYouTubeVideoViews)
    : results);
  const statusMessage = preloadedResults
    ? automaticSearchPending
      ? "Finding video candidates…"
      : `${cachedCandidateCount ?? preloadedResults.length} search results · ${preloadedResults.length} relevant videos · sorted by views.${preloadedResults.length ? "" : " Search again with a different query."}`
    : message;
  useEffect(()=>{
    pending.current?.abort();
    setShowCached(false);setResults([]);setMessage('');setBusy(false);
    setSearchOnlineOpen(false);setCustomQuery(track.title);setSort("relevance");
    searchingCallback.current?.(false);
  },[track.title,track.artist,track.album,track.duration,preference]);
  const searchingCallback = useRef(onSearchingChange);
  searchingCallback.current = onSearchingChange;
  useEffect(
    () => () => {
      pending.current?.abort();
      searchingCallback.current?.(false);
    },
    [],
  );
  const runSearch = async (query?: string) => {
    const online = query !== undefined;
    setShowCached(false);
    setResults([]);
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    searchingCallback.current?.(!online);
    setMessage("Finding YouTube backgrounds…");
    try {
      const base =
        localStorage.getItem("lyricflow.resolver") ||
        import.meta.env.VITE_MUSIC_RESOLVER ||
        "";
      const search = query !== undefined
        ? null
        : await findYouTubeBackgrounds(
            track,
            preference,
            base,
            controller.signal,
          );
      if (controller.signal.aborted) return;
      if (search && onMatchedSearch) {
        onMatchedSearch(search.candidates, search.candidateCount);
        setShowCached(true);
        return;
      }
      const found = search?.candidates ?? await searchStashCatalog(query ?? track.title, 'resolver', base, controller.signal, {refresh: true});
      if (controller.signal.aborted) return;
      const compared = search?.candidateCount ?? found.length;
      const videos = search ? found : filterYouTubeVideoChoices(found);
      setResults(videos);
      setMessage(videos.length
        ?`${compared} search results · ${videos.length} videos available. Choose a video below.`
        :`No videos found. ${compared} search results checked; static images and audio uploads are excluded. Try another query or paste a video link.`);
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
      <h3>Change video</h3>
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
            setSearchOnlineOpen(false);
            if (cachedCandidates) setShowCached(true);
            else void runSearch();
          }}
        >
          {busy ? "Finding videos…" : "Show preloaded videos"}
        </button>
        <button
          type="button"
          className="upload-button"
          aria-expanded={searchOnlineOpen}
          disabled={busy && searchOnlineOpen}
          onClick={() => {
            const query = (searchOnlineOpen ? customQuery : track.title).trim();
            if (!searchOnlineOpen) setCustomQuery(track.title);
            setSearchOnlineOpen(true);
            if (query) void runSearch(query);
          }}
        >
          <Search size={14} aria-hidden="true" />
          Search online
        </button>
      </div>
      {searchOnlineOpen && (
        <form
          className="yt-custom-search-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (customQuery.trim()) void runSearch(customQuery.trim());
          }}
        >
          <div
            className="search-input-with-icon"
          >
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Custom YouTube video search"
              value={customQuery}
              placeholder="Search YouTube videos…"
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => setCustomQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="upload-button" disabled={busy || !customQuery.trim()}>
            <Search size={14} aria-hidden="true" />
            Search YouTube
          </button>
          <label className="yt-search-sort">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value === "views" ? "views" : "relevance")}>
              <option value="relevance">Relevance</option>
              <option value="views">Views</option>
            </select>
          </label>
        </form>
      )}
      {statusMessage && <p role="status">{statusMessage}</p>}
      {captionStatus && <p role="status">{captionStatus}</p>}
      <div className="track-candidates">
        {visibleResults.map((song) => {
          const id = extractYouTubeVideoId(song)!;
          const viewsLabel = formatViewCount(song.viewCount);
          const thumbUrl =
            song.artwork || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          return (
            <div className="candidate video-candidate" key={id} aria-current={id === activeVideoId ? "true" : undefined}>
              <img
                className="candidate-thumb"
                src={thumbUrl}
                alt={song.title}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="candidate-meta">
                <strong>{song.videoTitle || song.title}</strong>
                <small>
                  {song.uploaderName||song.artist} ·{" "}
                  {song.duration
                    ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, "0")}`
                    : "Duration unknown"}
                  {viewsLabel ? ` · ${viewsLabel}` : " · Views unavailable"} · {isLyricalVideo(song) ? "Lyrics video" : "Video"}
                  {id === activeVideoId ? " · Current" : ""}
                </small>
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  onChoose(id,song);
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

