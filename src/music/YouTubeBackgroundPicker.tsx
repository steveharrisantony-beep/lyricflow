import { useEffect, useRef, useState } from 'react';
import {
  formatViewCount,
  isYouTubeBackgroundVideo,
  isLyricalVideo,
  searchStashCatalog,
  type SongResult,
} from './providers';
import { extractYouTubeVideoId, type TrackInfo } from '../metadata/trackInfo';
import type { YouTubeBackgroundMode } from '../visualization/cinematic/CinematicStage';
import {findYouTubeBackgrounds} from './backgroundVideos';
import YouTubeAccountControl from '../auth/YouTubeAccountControl';

export default function YouTubeBackgroundPicker({
  track,
  activeVideoId,
  preference,
  onPreferenceChange,
  onChoose,
  backgroundMode = 'video',
  onBackgroundModeChange,
  onSearchingChange,
  captionStatus,
  cachedCandidates,
  cachedCandidateCount,
  automaticSearchPending,
}: {
  track: TrackInfo;
  activeVideoId: string | null;
  preference: 'music' | 'lyrics';
  onPreferenceChange: (value: 'music' | 'lyrics') => void;
  onChoose: (id: string) => void;
  backgroundMode?: YouTubeBackgroundMode;
  onBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
  onSearchingChange?: (searching:boolean) => void;
  captionStatus?:string;
  cachedCandidates?:SongResult[];
  cachedCandidateCount?:number;
  automaticSearchPending?:boolean;
}) {
  const [results, setResults] = useState<SongResult[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [customQuery, setCustomQuery] = useState('');
  const pending = useRef<AbortController | null>(null);
  const [showCached,setShowCached]=useState(false);
  useEffect(()=>{
    if(!showCached||!cachedCandidates)return;
    setResults(cachedCandidates.slice(0,15));
    setMessage(automaticSearchPending?'Finding video candidates…':cachedCandidates.length?`Showing candidates already found for this song (${cachedCandidateCount||cachedCandidates.length} compared). Search again to refresh or change the query.`:'No suitable video candidates were found. Search again with a different query.');
  },[showCached,cachedCandidates,cachedCandidateCount,automaticSearchPending]);
  const searchingCallback=useRef(onSearchingChange);
  searchingCallback.current=onSearchingChange;
  useEffect(() => () => {pending.current?.abort();searchingCallback.current?.(false);}, []);
  const runSearch = async (overrideQuery?: string) => {
    setShowCached(false);
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    searchingCallback.current?.(true);
    setMessage('Finding YouTube backgrounds…');
    try {
      const base =
        localStorage.getItem('lyricflow.resolver') || import.meta.env.VITE_MUSIC_RESOLVER || '';
      const defaultQuery = `${track.title} ${track.artist} ${
        preference === 'music' ? 'music video' : 'lyrics video'
      }`;
      const effectiveQuery = overrideQuery && overrideQuery.trim().length >= 2
        ? overrideQuery.trim()
        : defaultQuery;
      const custom=Boolean(overrideQuery&&overrideQuery.trim().length>=2);
      const search=custom?null:await findYouTubeBackgrounds(track,preference,base,controller.signal);
      const ranked=search?.videos||((await searchStashCatalog(effectiveQuery,'resolver',base,controller.signal)).filter(song=>isYouTubeBackgroundVideo(song)&&(preference!=='lyrics'||isLyricalVideo(song))));
      if (controller.signal.aborted) return;
      setResults(ranked);
      setMessage(
        ranked.length
          ? `Compared ${search?.candidateCount||ranked.length} candidates by title, artist, duration and video type.${search?.usedLyricalFallback?' No suitable music video found; showing lyrical videos.':''} Adjust video delay if it has an intro.`
          : 'No videos found. Sign in to YouTube above, retry, or paste a YouTube video link directly.'
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : 'YouTube search unavailable.');
    } finally {
      if (!controller.signal.aborted) {setBusy(false);searchingCallback.current?.(false);}
    }
  };
  return (
    <section className="local-player youtube-background-picker" aria-label="Muted YouTube background">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong>YouTube video background · muted</strong>
        <YouTubeAccountControl compact onSignedIn={() => void runSearch(customQuery)} />
      </div>
      <p>
        {track.provider === 'jiosaavn'
          ? 'JioSaavn keeps playing the audio while the best matching YouTube video plays muted in the background.'
          : 'Your current audio keeps playing.'}{' '}
        Select between YouTube Video or Built-in Themes, and Music Video or Lyrical Video.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', margin: '8px 0' }}>
        {onBackgroundModeChange && (
          <label>
            Stage background mode
            <select
              aria-label="Stage background mode"
              value={backgroundMode}
              onChange={e => onBackgroundModeChange(e.target.value as YouTubeBackgroundMode)}
            >
              <option value="video">YouTube Video</option>
              <option value="theme">Built-in Themes</option>
            </select>
          </label>
        )}
        <label>
          Preferred YouTube background
          <select
            aria-label="Preferred YouTube background"
            value={preference}
            onChange={event => {
              pending.current?.abort();
              setBusy(false);
              searchingCallback.current?.(false);
              setResults([]);
              setMessage('');
              onPreferenceChange(event.target.value as 'music' | 'lyrics');
            }}
          >
            <option value="music">Music video</option>
            <option value="lyrics">Lyrical video</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button type="button" className="upload-button" disabled={busy} onClick={() => {if(cachedCandidates)setShowCached(true);else void runSearch();}}>
          {busy
            ? 'Finding videos…'
            : activeVideoId
              ? 'Change YouTube background'
              : 'Find YouTube video background'}
        </button>
        {activeVideoId && (
          <button type="button" className="upload-button" onClick={() => onChoose(activeVideoId)}>
            Play saved YouTube background
          </button>
        )}
      </div>
      <form
        className="yt-custom-search-row"
        onSubmit={e => {
          e.preventDefault();
          void runSearch(customQuery || undefined);
        }}
      >
        <input
          type="search"
          aria-label="Custom YouTube video search"
          value={customQuery}
          placeholder={`Custom YouTube video search or paste URL (e.g. ${track.title} ${track.artist})`}
          onKeyDown={e => e.stopPropagation()}
          onChange={e => setCustomQuery(e.target.value)}
        />
        <button type="submit" className="upload-button" disabled={busy}>
          {results.length||showCached?'Search again':'Search YouTube'}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {captionStatus && <p role="status">{captionStatus}</p>}
      <div className="track-candidates">
        {results.map(song => {
          const id = extractYouTubeVideoId(song)!;
          const viewsLabel = formatViewCount(song.viewCount);
          const thumbUrl = song.artwork || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
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
                  {song.artist} ·{' '}
                  {song.duration
                    ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, '0')}`
                    : 'Duration unknown'}
                  {viewsLabel ? ` · ${viewsLabel}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  onChoose(id);
                  setShowCached(false);
                  setResults([]);
                  setMessage('Muted background selected and saved. Your audio is unchanged.');
                }}
              >
                Use muted background
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
