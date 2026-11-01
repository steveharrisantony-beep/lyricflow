import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Disc3,
  Mic,
  Radio,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { isAdvertisementTrack } from "../metadata/trackInfo";
import type { PlayableSong } from "../music/providers";
import type { YouTubeBackgroundMode } from "../visualization/cinematic/CinematicStage";
import { connectExternalAudio } from "./audioSignal";
import {
  isAndroidApp,
  type ExternalAudioCaptureMode,
  type ExternalMediaState,
} from "./externalPlayer";

export interface AudioSourceHubHandle {
  stop: () => void;
}
export type AudioSourceMode = "local" | "online" | "external";

type Props = {
  open: boolean;
  onClose: () => void;
  activeMode: AudioSourceMode | null;
  onSelectMode: (mode: AudioSourceMode) => void;
  onPickLocal: () => void;
  onPlaySong: (song: PlayableSong) => Promise<void>;
  onAddToQueue?: (song: PlayableSong) => void;
  externalAudioMode?: ExternalAudioCaptureMode;
  onExternalAudioModeChange?: (mode: ExternalAudioCaptureMode) => void;
  externalMedia?: ExternalMediaState | null;
  notificationAccessGranted?: boolean;
  onRequestNotificationAccess?: () => void;
  onRefreshExternalMedia?: () => void;
  externalAudioStatus?: string;
  youtubeBackgroundMode?: YouTubeBackgroundMode;
  onYoutubeBackgroundModeChange?: (mode: YouTubeBackgroundMode) => void;
  preferredVideoType?: "music" | "lyrics";
  onPreferredVideoTypeChange?: (pref: "music" | "lyrics") => void;
};

function AudioSourceHub(
  {
    open,
    onClose,
    activeMode,
    onSelectMode,
    onPickLocal,
    externalAudioMode = "internal",
    onExternalAudioModeChange,
    externalMedia = null,
    notificationAccessGranted = false,
    onRequestNotificationAccess,
    onRefreshExternalMedia,
    externalAudioStatus = "",
  }: Props,
  ref: React.Ref<AudioSourceHubHandle>,
) {
  const [tab, setTab] = useState<AudioSourceMode>(activeMode || "online");
  const modalRef = useRef<HTMLDivElement>(null);
  const androidAvailable = isAndroidApp();

  useEffect(() => {
    if (activeMode) setTab(activeMode);
  }, [activeMode]);

  const stop = () => {
    connectExternalAudio(null);
  };

  useImperativeHandle(ref, () => ({ stop }), []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current
      ?.querySelector<HTMLButtonElement>(".source-close")
      ?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
        ) || []),
      ].filter((el) => el.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  const handleChooseLocal = () => {
    onSelectMode("local");
    onPickLocal();
    onClose();
  };

  const handleChooseOnline = () => {
    setTab("online");
    onSelectMode("online");
    onClose();
  };

  const handleChooseExternal = () => {
    setTab("external");
    if (androidAvailable) {
      onSelectMode("external");
    }
  };

  return (
    <>
      {open && (
        <div
          className="source-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            ref={modalRef}
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose audio source"
          >
            <div className="source-modal-head">
              <div>
                <h2>Select source</h2>
              </div>
              <button
                type="button"
                aria-label="Close audio sources"
                className="source-close"
                onClick={onClose}
                title="Close window"
              >
                <X size={20} />
                <span>Close</span>
              </button>
            </div>

            <div className="source-two-card-grid source-three-card-grid">
              <button
                type="button"
                className={
                  "source-option-card " + (tab === "local" ? "active" : "")
                }
                onClick={handleChooseLocal}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Upload size={22} />
                  </span>
                  {activeMode === "local" && (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  )}
                </div>
                <strong>Local file</strong>
                <p>Music stored on your device.</p>
                <span className="source-option-cta">
                  Choose file <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={
                  "source-option-card " + (tab === "online" ? "active" : "")
                }
                onClick={handleChooseOnline}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Disc3 size={22} />
                  </span>
                  {activeMode === "online" && (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  )}
                </div>
                <strong>Online music</strong>
                <p>JioSaavn or YouTube.</p>
                <span className="source-option-cta">
                  Search music <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={
                  "source-option-card " +
                  (tab === "external" ? "active " : "") +
                  (!androidAvailable ? "web-disabled-card" : "")
                }
                aria-disabled={!androidAvailable}
                onClick={handleChooseExternal}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Smartphone size={22} />
                  </span>
                  {!androidAvailable ? (
                    <span className="source-unavailable-badge">
                      Not available in web
                    </span>
                  ) : activeMode === "external" ? (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  ) : (
                    <span className="audio-source-badge">Android App</span>
                  )}
                </div>
                <strong>External player</strong>
                <p>
                  {androidAvailable
                    ? "Use the song playing in another app."
                    : "Available in the Android app."}
                </p>
                <span className="source-option-cta">
                  {androidAvailable
                    ? "Configure External player"
                    : "Not available in web"}{" "}
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>

            {/* Stage Background & Video Type Options Bar (shared by JioSaavn & External player) */}
            {tab === "external" && (
              <div className="source-online-stage external-player-stage">
                {!androidAvailable ? (
                  <div className="external-web-notice" role="status">
                    <strong>External player · Not available in web</strong>
                    <p>
                      Open the Android app to follow music from Spotify, YouTube
                      Music or another player.
                    </p>
                  </div>
                ) : (
                  <div className="external-android-panel">
                    <div className="external-panel-row">
                      <div>
                        <strong>
                          <BellRing size={15} /> 1. Android Notification
                          Listening (Song Details)
                        </strong>
                        <small>
                          {notificationAccessGranted
                            ? "Notification Listener active — reading track title, artist, album, and playback position from active media notifications."
                            : "Grant Notification Listener access so LyricFlow can detect songs playing in Spotify, YouTube Music, or other Android players."}
                        </small>
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {!notificationAccessGranted && (
                          <button
                            type="button"
                            className="source-primary"
                            onClick={onRequestNotificationAccess}
                          >
                            Grant Notification Access
                          </button>
                        )}
                        <button
                          type="button"
                          className="upload-button"
                          onClick={onRefreshExternalMedia}
                        >
                          <RefreshCw size={14} /> Refresh Song
                        </button>
                      </div>
                    </div>

                    <div className="external-detected-song">
                      {externalMedia && externalMedia.title ? (
                        <div>
                          <span className="external-app-pill">
                            {externalMedia.appName || "External player"} ·{" "}
                            {externalMedia.playing ? "Playing" : "Paused"}
                            {externalMedia.isAd ||
                            isAdvertisementTrack(externalMedia)
                              ? " · AD (BUILT-IN THEMES ACTIVE)"
                              : ""}
                          </span>
                          <strong>{externalMedia.title}</strong>
                          <small>
                            {externalMedia.isAd ||
                            isAdvertisementTrack(externalMedia)
                              ? "Advertisement detected — lyrics & background video search paused; showing built-in themes."
                              : `${externalMedia.artist || "Unknown artist"}${
                                  externalMedia.album
                                    ? ` · ${externalMedia.album}`
                                    : ""
                                }${
                                  externalMedia.duration > 0
                                    ? ` · ${Math.floor(externalMedia.duration / 60)}:${String(
                                        Math.floor(externalMedia.duration % 60),
                                      ).padStart(2, "0")}`
                                    : ""
                                }`}
                          </small>
                        </div>
                      ) : (
                        <small>
                          Waiting for an active media notification… Start
                          playing a song in your external Android player.
                        </small>
                      )}
                    </div>

                    <div className="external-panel-row">
                      <div>
                        <strong>
                          2. Audio Source for Visualizer Reactivity
                        </strong>
                        <small>
                          Choose whether LyricFlow analyzes{" "}
                          <b>Internal Audio</b> (device media output) or{" "}
                          <b>Mic</b> (ambient microphone).
                        </small>
                      </div>
                      <div
                        className="source-pref-pills"
                        role="group"
                        aria-label="External player audio source"
                      >
                        <button
                          type="button"
                          className={
                            externalAudioMode === "internal" ? "active" : ""
                          }
                          onClick={() =>
                            onExternalAudioModeChange?.("internal")
                          }
                        >
                          <Radio size={14} /> Internal Audio
                        </button>
                        <button
                          type="button"
                          className={
                            externalAudioMode === "mic" ? "active" : ""
                          }
                          onClick={() => onExternalAudioModeChange?.("mic")}
                        >
                          <Mic size={14} /> Mic
                        </button>
                      </div>
                    </div>

                    {externalAudioStatus && (
                      <p className="external-audio-status" role="status">
                        {externalAudioStatus}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default forwardRef(AudioSourceHub);
