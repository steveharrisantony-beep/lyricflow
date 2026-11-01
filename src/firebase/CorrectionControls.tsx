import { useEffect, useRef, useState } from "react";
import type { User } from "./firebaseClient";
import type { useCorrection } from "./useCorrection";
import { submitCorrection } from "./correctionStore";
import type { SongLyricsMapping, SongVideoMapping } from "./songMappings";
import type { Correction } from "./correctionModel";
import { extractYouTubeVideoId, type TrackInfo } from "../metadata/trackInfo";

type Fix = ReturnType<typeof useCorrection>;
export default function CorrectionControls({
  user,
  track,
  delay,
  lyrics,
  video,
  mappedLyrics,
  mappedVideo,
  canChangeVideo,
  onVideoChange,
  currentVideoDelay,
  currentVideoId,
}: {
  user: User | null;
  track: TrackInfo | null;
  delay: Fix;
  lyrics: Fix;
  video: Fix;
  mappedLyrics?: SongLyricsMapping | null;
  mappedVideo?: SongVideoMapping | null;
  canChangeVideo: boolean;
  onVideoChange: (id: string, delaySeconds: number | null) => void;
  currentVideoDelay?: number;
  currentVideoId?: string | null;
}) {
  const [videoInput, setVideoInput] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [videoDelay, setVideoDelay] = useState("0");
  const editing = useRef(false);
  const savedVideoId =
    video.correction?.youtubeVideoId ||
    mappedVideo?.youtubeVideoId ||
    currentVideoId ||
    extractYouTubeVideoId(track) ||
    "";
  const chosenVideoDelay = video.correction
    ? video.correction.videoDelaySeconds
    : mappedVideo?.delaySeconds;
  const savedVideoDelay = chosenVideoDelay ?? currentVideoDelay ?? 0;
  useEffect(() => {
    if (editing.current) return;
    setVideoInput(savedVideoId);
    setVideoDelay(String(Math.round(savedVideoDelay * 100) / 100));
  }, [savedVideoId, savedVideoDelay]);
  if (!track) return null;
  const submit = async (correction: Correction | null) => {
    if (!correction) return;
    setBusy(true);
    setMessage("Sending for review…");
    try {
      await submitCorrection(user, correction);
      setMessage(
        "Sent for developer review. Your fix remains personal until approved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Submission failed. Your personal fix is still saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveVideo = () => {
    const id = /^[\w-]{11}$/.test(videoInput.trim())
      ? videoInput.trim()
      : extractYouTubeVideoId({ sourceUrl: videoInput.trim() });
    if (!id) {
      setMessage("Choose a video or enter a valid YouTube URL.");
      return;
    }
    const normalized = videoDelay.trim().replace(/−/g, "-");
    const seconds = Number(normalized);
    if (!normalized || !Number.isFinite(seconds) || Math.abs(seconds) > 300) {
      setMessage("Use a video delay between −300 and +300 seconds.");
      return;
    }
    editing.current = false;
    onVideoChange(id, seconds);
    setMessage("Video timing saved for this song.");
  };
  return (
    <div className="correction-controls">
      {canChangeVideo && (
        <section className="setting-group">
          <h3>Video timing</h3>
          <form
            className="video-timing-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveVideo();
            }}
          >
            <label>
              Video delay (seconds)
              <input
                aria-label="Video delay seconds"
                type="text"
                inputMode="decimal"
                value={videoDelay}
                disabled={!savedVideoId}
                onChange={(e) => {
                  editing.current = true;
                  setVideoDelay(e.target.value.replace(/−/g, "-"));
                }}
              />
            </label>
            <button type="submit" disabled={!savedVideoId}>
              Save delay
            </button>
          </form>
          <p>Positive delays video; negative advances it.</p>
          {savedVideoId && (
            <div className="correction-actions">
              <small>
                {chosenVideoDelay != null
                  ? "Manual video delay active"
                  : "Automatic video sync active"}
              </small>
              <button
                type="button"
                className="text-button"
                disabled={chosenVideoDelay == null}
                onClick={() => {
                  editing.current = false;
                  onVideoChange(savedVideoId, null);
                  setMessage("Automatic video sync enabled.");
                }}
              >
                Use automatic video sync
              </button>
            </div>
          )}
          <details className="disclosure">
            <summary>Paste a video URL</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveVideo();
              }}
            >
              <label>
                Background video
                <input
                  aria-label="Background video URL"
                  value={videoInput}
                  onChange={(e) => {
                    editing.current = true;
                    setVideoInput(e.target.value);
                  }}
                  placeholder="YouTube URL or video ID"
                />
              </label>
              <button type="submit" disabled={!videoInput.trim()}>
                Save background video
              </button>
            </form>
          </details>
        </section>
      )}
      <details className="disclosure community-corrections">
        <summary>Share or reset song fixes</summary>
        <p>Send a fix for developer approval before it applies to everyone.</p>
        <div className="correction-actions">
          <span>Lyrics timing: {delay.source}</span>
          <button
            type="button"
            disabled={!delay.correction || delay.source !== "personal" || busy}
            onClick={() => void submit(delay.correction)}
          >
            Submit timing fix
          </button>
          <button
            type="button"
            disabled={delay.source !== "personal"}
            onClick={delay.reset}
          >
            Use default timing
          </button>
        </div>
        <div className="correction-actions">
          <span>Lyrics selection: {lyrics.source}</span>
          <button
            type="button"
            disabled={
              !lyrics.correction || lyrics.source !== "personal" || busy
            }
            onClick={() => void submit(lyrics.correction)}
          >
            Submit lyrics selection
          </button>
          <button
            type="button"
            disabled={lyrics.source !== "personal"}
            onClick={lyrics.reset}
          >
            Use default lyrics selection
          </button>
        </div>
        <div className="correction-actions">
          <button
            type="button"
            disabled={!video.correction || video.source !== "personal" || busy}
            onClick={() => void submit(video.correction)}
          >
            Submit video selection
          </button>
          <button
            type="button"
            disabled={video.source !== "personal"}
            onClick={video.reset}
          >
            Use default video
          </button>
        </div>
        {mappedLyrics && <p>Lyrics file: {mappedLyrics.sourceFile.name}</p>}
        <p>
          A verified account is required to submit. Custom lyrics text is kept
          private.
        </p>
      </details>
      {(delay.error || lyrics.error || video.error) && (
        <p role="status">{delay.error || lyrics.error || video.error}</p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
