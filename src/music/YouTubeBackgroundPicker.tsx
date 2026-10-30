import { useEffect, useRef, useState } from 'react';
import {
  formatViewCount,
  rankYouTubeBackgroundCandidates,
  searchStashCatalog,
  type SongResult,
} from './providers';
import { extractYouTubeVideoId, type TrackInfo } from '../metadata/trackInfo';
import type { YouTubeBackgroundMode } from '../visualization/cinematic/CinematicStage';

export default function YouTubeBackgroundPicker({
  track,
  activeVideoId,
  preference,
  onPreferenceChange,
  onChoose,
  backgroundMode = 'video',
  onBackgroundModeChange,
}: {
  track: TrackInfo;
  activeVideoId: string | null;
  preference: 'music' | 'lyrics';
  onPreferenceChange: (value: 'music' | 'lyrics') => void;
  onChoose: (id: string) => void;
  backgroundMode?: YouTubeBackgroundMode;
  onBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
}) {
  const [results, setResults] = useState<SongResult[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const search = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('Finding YouTube backgrounds…');
    try {
      const base =
        localStorage.getItem('lyricflow.resolver') || import.meta.env.VITE_MUSIC_RESOLVER || '';
      const songs = await searchStashCatalog(
        `${track.title} ${track.artist} ${preference === 'music' ? 'music video' : 'lyrics video'}`,
        'resolver',
        base,
        controller.signal
      );
      if (controller.signal.aborted) return;
      const ranked = rankYouTubeBackgroundCandidates(songs, track, preference);
      setResults(ranked);
      setMessage(
        ranked.length
          ? 'Sorted by most views first. Choose the same recording; adjust video delay if it has an intro.'
          : 'No videos found. Retry or paste a YouTube URL under Saved fixes & community corrections.'
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : 'YouTube search unavailable.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="local-player youtube-background-picker" aria-label="Muted YouTube background">
      <strong>YouTube video background · muted</strong>
      <p>
        {track.provider === 'jiosaavn'
          ? 'JioSaavn keeps playing the audio while the highest-viewed matching YouTube video plays muted in the background.'
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="upload-button" disabled={busy} onClick={() => void search()}>
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
      {message && <p role="status">{message}</p>}
      <div className="track-candidates">
        {results.map(song => {
          const id = extractYouTubeVideoId(song)!;
          const viewsLabel = formatViewCount(song.viewCount);
          return (
            <div className="candidate" key={id}>
              <div>
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
