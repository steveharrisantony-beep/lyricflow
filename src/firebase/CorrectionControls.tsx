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
  preferMappedVideo=false,
  canChangeVideo,
  onVideoChange,
  currentVideoDelay,
  currentVideoId,
  sponsorBlockCutSeconds = 0,
  changeVideoSlot,
  saveRef,
}: {
  user: User | null;
  track: TrackInfo | null;
  delay: Fix;
  lyrics: Fix;
  video: Fix;
  mappedLyrics?: SongLyricsMapping | null;
  mappedVideo?: SongVideoMapping | null;
  preferMappedVideo?:boolean;
  canChangeVideo: boolean;
  onVideoChange: (id: string, delaySeconds: number | null) => void;
  currentVideoDelay?: number;
  currentVideoId?: string | null;
  sponsorBlockCutSeconds?: number;
  changeVideoSlot?: React.ReactNode;
  saveRef?: React.MutableRefObject<(() => boolean) | null>;
}) {
  const [videoInput, setVideoInput] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [videoDelay, setVideoDelay] = useState("0");
  const [videoTapAnchor, setVideoTapAnchor] = useState<{
    kind: "video" | "voice";
    timestampMs: number;
  } | null>(null);
  const editing = useRef(false);
  const savedVideoId =
    (preferMappedVideo?mappedVideo?.youtubeVideoId:null)||
    video.correction?.youtubeVideoId ||
    mappedVideo?.youtubeVideoId ||
    currentVideoId ||
    extractYouTubeVideoId(track) ||
    "";
  const chosenVideoDelay = preferMappedVideo&&mappedVideo?mappedVideo.delaySeconds:video.correction
    ? video.correction.videoDelaySeconds
    : mappedVideo?.delaySeconds;
  const sponsorBlockDefaultDelay =
    sponsorBlockCutSeconds > 0
      ? -Math.round(sponsorBlockCutSeconds * 100) / 100
      : 0;
  const savedVideoDelay =
    chosenVideoDelay ??
    (currentVideoDelay !== undefined && currentVideoDelay !== 0
      ? currentVideoDelay
      : sponsorBlockDefaultDelay);
  useEffect(() => {
    if (editing.current) return;
    setVideoInput(savedVideoId);
    setVideoDelay(String(Math.round(savedVideoDelay * 100) / 100));
  }, [savedVideoId, savedVideoDelay]);
  const parseCurrentDelayInput = (): number => {
    const normalized = videoDelay.trim().replace(/−/g, "-");
    if (normalized === "" || normalized === "-" || normalized === "+") return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const saveVideo = (): boolean => {
    const rawTarget = videoInput.trim() || savedVideoId;
    const id = /^[\w-]{11}$/.test(rawTarget)
      ? rawTarget
      : extractYouTubeVideoId({ sourceUrl: rawTarget });
    if (!id) {
      setMessage("Choose a video or enter a valid YouTube URL.");
      return false;
    }
    const normalized = videoDelay.trim().replace(/−/g, "-");
    const seconds = normalized === "" ? 0 : Number(normalized);
    if (!Number.isFinite(seconds) || Math.abs(seconds) > 300) {
      setMessage("Use a video delay between −300 and +300 seconds.");
      return false;
    }
    editing.current = false;
    setVideoDelay(String(seconds));
    onVideoChange(id, seconds);
    setMessage("Video timing saved for this song.");
    return true;
  };
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => {
      if (!editing.current && chosenVideoDelay == null) return false;
      return saveVideo();
    };
    return () => {
      saveRef.current = null;
    };
  });
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
  const adjustVideoDelay = (delta: number) => {
    const base = parseCurrentDelayInput();
    const next = Math.max(
      -300,
      Math.min(300, Math.round((base + delta) * 100) / 100),
    );
    editing.current = false;
    setVideoDelay(String(next));
    if (savedVideoId) {
      onVideoChange(savedVideoId, next);
      setMessage("Video timing saved for this song.");
    }
  };
  const handleVideoTap = (kind: "video" | "voice") => {
    const now = performance.now();
    if (videoTapAnchor && videoTapAnchor.kind !== kind) {
      const delta =
        Math.round(
          Math.max(0, (now - videoTapAnchor.timestampMs) / 1000) * 100,
        ) / 100;
      // Video seen first -> Voice heard second: video appeared before voice, so add +delta delay.
      // Voice heard first -> Video seen second: voice was heard before video, so subtract delta delay.
      const signedDelta = videoTapAnchor.kind === "video" ? delta : -delta;
      const base = parseCurrentDelayInput();
      const next = Math.max(
        -300,
        Math.min(300, Math.round((base + signedDelta) * 100) / 100),
      );
      editing.current = false;
      setVideoDelay(String(next));
      if (savedVideoId) {
        onVideoChange(savedVideoId, next);
      }
      setVideoTapAnchor(null);
      setMessage(
        `Applied ${signedDelta >= 0 ? "+" : ""}${signedDelta.toFixed(2)}s video delay.`,
      );
      return;
    }
    setVideoTapAnchor({ kind, timestampMs: now });
    setMessage(
      kind === "video"
        ? "Video seen recorded — tap Voice heard when the song is sung."
        : "Voice heard recorded — tap Video seen when the video cue appears.",
    );
  };
  return (
    <div className="correction-controls">
      <section className="setting-group">
        <h3>Video timing</h3>
        <form
          className="video-timing-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveVideo();
          }}
        >
          <div
            className="delay-controls-row"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <button
              type="button"
              className="upload-button"
              aria-label="Decrease video delay 0.5s"
              disabled={!savedVideoId}
              onClick={() => adjustVideoDelay(-0.5)}
            >
              -0.5s
            </button>
            <input
              aria-label="Video delay seconds"
              type="text"
              inputMode="text"
              placeholder="0"
              value={videoDelay}
              disabled={!savedVideoId}
              onChange={(e) => {
                editing.current = true;
                const nextVal = e.target.value.replace(/−/g, "-");
                setVideoDelay(nextVal);
                if (nextVal.trim() === "" && savedVideoId) {
                  onVideoChange(savedVideoId, 0);
                }
              }}
              onBlur={() => {
                if (videoDelay.trim() === "") {
                  editing.current = false;
                  setVideoDelay("0");
                  if (savedVideoId) onVideoChange(savedVideoId, 0);
                }
              }}
              style={{ width: 88, textAlign: "center" }}
            />
            <button
              type="button"
              className="upload-button"
              aria-label="Increase video delay 0.5s"
              disabled={!savedVideoId}
              onClick={() => adjustVideoDelay(0.5)}
            >
              +0.5s
            </button>
            <button type="submit" disabled={!savedVideoId}>
              Save delay
            </button>
          </div>
        </form>
        <div
          className="tap-sync-buttons"
          style={{ display: "flex", gap: 8, marginTop: 8 }}
        >
          <button
            type="button"
            className="upload-button"
            disabled={!savedVideoId}
            aria-pressed={videoTapAnchor?.kind === "video"}
            onClick={() => handleVideoTap("video")}
          >
            Video seen
          </button>
          <button
            type="button"
            className="upload-button"
            disabled={!savedVideoId}
            aria-pressed={videoTapAnchor?.kind === "voice"}
            onClick={() => handleVideoTap("voice")}
          >
            Voice heard
          </button>
        </div>
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
        {changeVideoSlot}
        {canChangeVideo && (
          <div className="paste-video-url-box" style={{ marginTop: 10 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveVideo();
              }}
            >
              <label>
                Paste video URL
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
              <button
                type="submit"
                className="upload-button"
                disabled={!videoInput.trim()}
              >
                Save background video
              </button>
            </form>
          </div>
        )}
      </section>
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

