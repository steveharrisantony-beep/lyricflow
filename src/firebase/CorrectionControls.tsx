import { useState } from 'react';
import type { User } from './firebaseClient';
import type { useCorrection } from './useCorrection';
import { submitCorrection } from './correctionStore';
import type { Correction } from './correctionModel';
import { extractYouTubeVideoId, type TrackInfo } from '../metadata/trackInfo';

type Fix = ReturnType<typeof useCorrection>;
export default function CorrectionControls({ user, track, delay, lyrics, video, canChangeVideo, onVideoChange }: {
  user: User | null; track: TrackInfo | null; delay: Fix; lyrics: Fix; video: Fix; canChangeVideo: boolean; onVideoChange: (id: string) => void;
}) {
  const [videoInput, setVideoInput] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  if (!track) return null;
  const submit = async (correction: Correction | null) => {
    if (!correction) return;
    setBusy(true); setMessage('Submitting for review · waiting for connection…');
    try { await submitCorrection(user, correction); setMessage('Sent for developer review. It stays personal until approved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Submission failed. Your personal fix is still saved.'); }
    finally { setBusy(false); }
  };
  return <details className="local-player correction-controls">
    <summary>Saved fixes &amp; community corrections</summary>
    <p>Your fixes take priority over community-approved fixes. Changes apply only to this recording and lyrics version.</p>
    <div className="correction-actions">
      <span>Lyrics timing: {delay.source}</span>
      <button type="button" disabled={!delay.correction || delay.source !== 'personal' || busy} onClick={() => void submit(delay.correction)}>Submit timing fix</button>
      <button type="button" disabled={delay.source !== 'personal'} onClick={delay.reset}>Use default timing</button>
    </div>
    <div className="correction-actions">
      <span>Lyrics selection: {lyrics.source}</span>
      <button type="button" disabled={!lyrics.correction || lyrics.source !== 'personal' || busy} onClick={() => void submit(lyrics.correction)}>Submit lyrics selection</button>
      <button type="button" disabled={lyrics.source !== 'personal'} onClick={lyrics.reset}>Use default lyrics selection</button>
    </div>
    <form onSubmit={event => {
      event.preventDefault();
      const id = /^[\w-]{11}$/.test(videoInput.trim()) ? videoInput.trim() : extractYouTubeVideoId({ sourceUrl: videoInput.trim() });
      if (!id) { setMessage('Enter a valid YouTube watch/share URL or video ID.'); return; }
      onVideoChange(id); setMessage('Background video saved for you. Your audio source is unchanged.');
    }}>
      <label>Correct background video<input value={videoInput} onChange={e => setVideoInput(e.target.value)} placeholder="YouTube URL or video ID" disabled={!canChangeVideo} /></label>
      <button type="submit" disabled={!canChangeVideo || !videoInput.trim()}>Save background video</button>
    </form>
    {!canChangeVideo && <p>This player uses YouTube for audio too. Background-only replacement is available with a separate audio stream.</p>}
    {video.correction?.youtubeVideoId && <p>Saved video: <a href={`https://www.youtube.com/watch?v=${video.correction.youtubeVideoId}`} target="_blank" rel="noreferrer">{video.correction.youtubeVideoId}</a> · {video.source}</p>}
    <div className="correction-actions">
      <button type="button" disabled={!video.correction || video.source !== 'personal' || busy} onClick={() => void submit(video.correction)}>Submit video selection</button>
      <button type="button" disabled={video.source !== 'personal'} onClick={video.reset}>Use default video</button>
    </div>
    <p>Submitting requires a verified account. Song metadata and this correction are sent for review; your custom lyrics text is not submitted.</p>
    {(delay.error || lyrics.error || video.error) && <p role="status">{delay.error || lyrics.error || video.error}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
