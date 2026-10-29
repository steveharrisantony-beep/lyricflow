import { useEffect, useRef, useState } from 'react';
import { searchStashCatalog, type SongResult } from './providers';
import { extractYouTubeVideoId, type TrackInfo } from '../metadata/trackInfo';

export default function YouTubeBackgroundPicker({ track, activeVideoId, preference, onPreferenceChange, onChoose }: { track: TrackInfo; activeVideoId: string | null; preference: 'music' | 'lyrics'; onPreferenceChange: (value: 'music' | 'lyrics') => void; onChoose: (id: string) => void }) {
  const [results, setResults] = useState<SongResult[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const search = async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('Finding YouTube backgrounds…');
    try {
      const base = localStorage.getItem('lyricflow.resolver') || import.meta.env.VITE_MUSIC_RESOLVER || '';
      const songs = await searchStashCatalog(`${track.title} ${track.artist} ${preference === 'music' ? 'music video' : 'lyrics video'}`, 'resolver', base, controller.signal);
      if (controller.signal.aborted) return;
      const ranked = songs.filter(song => extractYouTubeVideoId(song)).sort((a, b) => Math.abs(a.duration - track.duration) - Math.abs(b.duration - track.duration));
      setResults(ranked); setMessage(ranked.length ? 'Choose the same recording. Check title, artist and duration; adjust video delay if it has an intro.' : 'No videos found. Retry or paste a YouTube URL under Saved fixes & community corrections.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'YouTube search unavailable.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <section className="local-player youtube-background-picker" aria-label="Muted YouTube background">
    <strong>YouTube video background · muted</strong>
    <p>{track.provider === 'jiosaavn' ? 'JioSaavn keeps playing the audio.' : 'Your current audio keeps playing.'} Select a YouTube video for this song’s background.</p>
    <label>Preferred YouTube background<select aria-label="Preferred YouTube background" value={preference} onChange={event => {
      pending.current?.abort(); setBusy(false); setResults([]); setMessage(''); onPreferenceChange(event.target.value as 'music' | 'lyrics');
    }}><option value="music">Music video</option><option value="lyrics">Lyrical video</option></select></label>
    <button type="button" className="upload-button" disabled={busy} onClick={() => void search()}>{busy ? 'Finding videos…' : activeVideoId ? 'Change YouTube background' : 'Find YouTube video background'}</button>
    {activeVideoId && <button type="button" className="upload-button" onClick={() => onChoose(activeVideoId)}>Play saved YouTube background</button>}
    {message && <p role="status">{message}</p>}
    <div className="track-candidates">{results.map(song => {
      const id = extractYouTubeVideoId(song)!;
      return <div className="candidate" key={id}>
        <div><strong>{song.title}</strong><small>{song.artist} · {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, '0')}` : 'Duration unknown'}</small></div>
        <button type="button" className="upload-button" onClick={() => { onChoose(id); setResults([]); setMessage('Muted background selected and saved. Your audio is unchanged.'); }}>Use muted background</button>
      </div>;
    })}</div>
  </section>;
}
