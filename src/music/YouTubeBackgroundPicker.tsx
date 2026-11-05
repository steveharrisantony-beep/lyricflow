import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {formatViewCount,isLyricalVideo,searchStashCatalog,type SongResult} from './providers';
import {AUTO_VIDEO_ATTEMPT_LIMIT,compareYouTubeVideoViews,evaluateBackgroundVideos,filterYouTubeVideoChoices} from './videoMatching';
import { extractYouTubeVideoId, type TrackInfo } from "../metadata/trackInfo";
import type { YouTubeBackgroundMode } from "../visualization/cinematic/CinematicStage";
import { findYouTubeBackgrounds } from "./backgroundVideos";
import { logVideoSearch,videoSearchLogKey } from "./videoSearchHistory";
import { musicResolverBase } from '../network/backend';

export default function YouTubeBackgroundPicker({
  track,
  activeVideoId,
  preference,
  onChoose,
  captionStatus,
  cachedCandidates,
  cachedCandidateCount,
  playbackRejections,
  automaticSearchPending,
}: {
  track: TrackInfo;
  activeVideoId: string | null;
  preference: "music" | "lyrics";
  onPreferenceChange?: (value: "music" | "lyrics") => void;
  onChoose: (id: string, candidate?: SongResult) => void;
  backgroundMode?: YouTubeBackgroundMode;
  onBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
  captionStatus?: string;
  cachedCandidates?: SongResult[];
  cachedCandidateCount?: number;
  playbackRejections?: Readonly<Record<string,string>>;
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
  const preloaded = showCached
    ? evaluateBackgroundVideos(cachedCandidates ?? results,track.title,preference,playbackRejections)
    : undefined;
  const visibleResults = preloaded
    ? preloaded.map(choice => ({song:choice.song,choice}))
    : (searchOnlineOpen && sort === "views" ? [...results].sort(compareYouTubeVideoViews) : results)
        .map(song => ({song,choice:undefined}));
  const statusMessage = preloaded
    ? automaticSearchPending
      ? "Finding video candidates…"
      : `${cachedCandidateCount ?? preloaded.length} search results · sorted by relevance · autoplay checks up to ${AUTO_VIDEO_ATTEMPT_LIMIT}.`
    : message;
  useEffect(()=>{
    pending.current?.abort();
    setShowCached(false);setResults([]);setMessage('');setBusy(false);
    setSearchOnlineOpen(false);setCustomQuery(track.title);setSort("relevance");
  },[track.title,track.artist,track.album,track.duration]);
  useEffect(() => () => pending.current?.abort(), []);
  const runSearch = async (query?: string) => {
    setShowCached(false);
    setResults([]);
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("Finding YouTube backgrounds…");
    try {
      const base = musicResolverBase();
      const search = query !== undefined
        ? null
        : await findYouTubeBackgrounds(
            track,
            base,
            controller.signal,
            preference,
            'Search online',
          );
      if (controller.signal.aborted) return;
      const searchTerms = (query ?? track.title).trim();
      const found = search?.candidates ?? await logVideoSearch(searchTerms,'Search online',() =>
        searchStashCatalog(searchTerms,'resolver',base,controller.signal,{refresh:true}),controller.signal,videoSearchLogKey(track));
      if (controller.signal.aborted) return;
      const compared = search?.candidateCount ?? found.length;
      const videos = search ? found : filterYouTubeVideoChoices(found);
      setResults(videos);
      if (search) setShowCached(true);
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
        {visibleResults.map(({song,choice},index) => {
          const id = extractYouTubeVideoId(song);
          const viewsLabel = song.viewCount === 0 ? "0 views" : formatViewCount(song.viewCount);
          const thumbUrl =
            song.artwork || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "");
          return (
            <div className="candidate video-candidate" key={`${song.id}-${index}`} aria-current={id && id === activeVideoId ? "true" : undefined}>
              {thumbUrl ? <img
                className="candidate-thumb"
                src={thumbUrl}
                alt={song.title}
                loading="lazy"
                referrerPolicy="no-referrer"
              /> : <span aria-hidden="true" />}
              <div className="candidate-meta">
                <strong>{song.videoTitle || song.title || "Untitled video"}</strong>
                <small>
                  {choice && `#${index+1} · `}{song.uploaderName||song.artist||"Unknown uploader"} ·{" "}
                  {song.duration
                    ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, "0")}`
                    : "Duration unknown"}
                  {viewsLabel ? ` · ${viewsLabel}` : " · Views unavailable"} · {isLyricalVideo(song) ? "Lyrics video" : "Video"}
                  {id && id === activeVideoId ? " · Current" : ""}
                </small>
                {choice && <small>
                  {choice.reasons.length ? `Rejected: ${choice.reasons.join(" · ")}` : "Passed filters"}
                  {!choice.withinLimit && ` · Outside the first ${AUTO_VIDEO_ATTEMPT_LIMIT} results`}
                </small>}
              </div>
              <button
                type="button"
                className="upload-button"
                disabled={!id || choice?.canUse === false}
                onClick={() => {
                  if (!id) return;
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

