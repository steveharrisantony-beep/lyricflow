import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Upload,
  Disc3,
  X,
  ChevronRight,
  CheckCircle2,
  Smartphone,
  Mic,
  Radio,
  BellRing,
  RefreshCw,
  Video,
  Sparkles,
} from 'lucide-react';
import SongSearch from '../music/SongSearch';
import type { PlayableSong } from '../music/providers';
import { connectExternalAudio } from './audioSignal';
import {
  isAndroidApp,
  type ExternalAudioCaptureMode,
  type ExternalMediaState,
} from './externalPlayer';
import type { YouTubeBackgroundMode } from '../visualization/cinematic/CinematicStage';
import { isAdvertisementTrack } from '../metadata/trackInfo';

export interface AudioSourceHubHandle {
  stop: () => void;
}
export type AudioSourceMode = 'local' | 'online' | 'external';

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
  preferredVideoType?: 'music' | 'lyrics';
  onPreferredVideoTypeChange?: (pref: 'music' | 'lyrics') => void;
};

function AudioSourceHub(
  {
    open,
    onClose,
    activeMode,
    onSelectMode,
    onPickLocal,
    onPlaySong,
    onAddToQueue,
    externalAudioMode = 'internal',
    onExternalAudioModeChange,
    externalMedia = null,
    notificationAccessGranted = false,
    onRequestNotificationAccess,
    onRefreshExternalMedia,
    externalAudioStatus = '',
    youtubeBackgroundMode = 'video',
    onYoutubeBackgroundModeChange,
    preferredVideoType = 'music',
    onPreferredVideoTypeChange,
  }: Props,
  ref: React.Ref<AudioSourceHubHandle>
) {
  const [tab, setTab] = useState<AudioSourceMode>(activeMode || 'online');
  const modalRef = useRef<HTMLDivElement>(null);
  const androidAvailable = isAndroidApp();

  useEffect(() => {
    if (activeMode) setTab(activeMode);
  }, [activeMode]);

  const stop = () => {
    connectExternalAudio(null);
  };

  useImperativeHandle(ref, () => ({ stop }), []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);

  const handleChooseLocal = () => {
    onSelectMode('local');
    onPickLocal();
    onClose();
  };

  const handleChooseOnline = () => {
    setTab('online');
    onSelectMode('online');
  };

  const handleChooseExternal = () => {
    setTab('external');
    if (androidAvailable) {
      onSelectMode('external');
    }
  };

  return (
    <>
      {open && (
        <div
          className="source-backdrop"
          onMouseDown={e => {
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
                <span>AUDIO &amp; VIDEO SOURCE</span>
                <h2>Choose your source</h2>
                <small>
                  Select Local Audio Upload, Built-in Player (JioSaavn &amp; YouTube), or External Player (Android App)
                </small>
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
                className={'source-option-card ' + (tab === 'local' ? 'active' : '')}
                onClick={handleChooseLocal}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Upload size={22} />
                  </span>
                  {activeMode === 'local' && (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  )}
                </div>
                <strong>Local Audio Upload</strong>
                <p>
                  Play MP3, WAV, M4A, FLAC, OGG, or AAC files stored on your device. Automatically fetches synced lyrics by track metadata.
                </p>
                <span className="source-option-cta">
                  Choose local audio file <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={'source-option-card ' + (tab === 'online' ? 'active' : '')}
                onClick={handleChooseOnline}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Disc3 size={22} />
                  </span>
                  {activeMode === 'online' && (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  )}
                </div>
                <strong>Built-in Player (JioSaavn &amp; YouTube)</strong>
                <p>
                  Stream 320kbps AAC songs from JioSaavn with auto-matched YouTube video or built-in themes, or play YouTube videos directly.
                </p>
                <span className="source-option-cta">
                  Search JioSaavn &amp; YouTube <ChevronRight size={16} />
                </span>
              </button>

              <button
                type="button"
                className={
                  'source-option-card ' +
                  (tab === 'external' ? 'active ' : '') +
                  (!androidAvailable ? 'web-disabled-card' : '')
                }
                aria-disabled={!androidAvailable}
                onClick={handleChooseExternal}
              >
                <div className="source-option-top">
                  <span className="audio-source-icon">
                    <Smartphone size={22} />
                  </span>
                  {!androidAvailable ? (
                    <span className="source-unavailable-badge">Not available in web</span>
                  ) : activeMode === 'external' ? (
                    <span className="source-active-label">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  ) : (
                    <span className="audio-source-badge">Android App</span>
                  )}
                </div>
                <strong>External Player</strong>
                <p>
                  {androidAvailable
                    ? 'Reads song details via Android Notification Listening (Spotify, YT Music, Apple Music) with Mic or Internal Audio reactivity.'
                    : 'Not available in web. Only available in the Android app version via Android Notification Listening.'}
                </p>
                <span className="source-option-cta">
                  {androidAvailable ? 'Configure External Player' : 'Not available in web'}{' '}
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>

            {/* Stage Background & Video Type Options Bar (shared by JioSaavn & External Player) */}
            {(tab === 'online' || (tab === 'external' && androidAvailable)) &&
              onYoutubeBackgroundModeChange &&
              onPreferredVideoTypeChange && (
                <div
                  className="source-background-pref-bar"
                  aria-label="JioSaavn and External Player stage background options"
                >
                  <div className="source-pref-group">
                    <span>
                      <Video size={14} /> Stage Background:
                    </span>
                    <div className="source-pref-pills">
                      <button
                        type="button"
                        className={youtubeBackgroundMode === 'video' ? 'active' : ''}
                        onClick={() => onYoutubeBackgroundModeChange('video')}
                      >
                        YouTube Video
                      </button>
                      <button
                        type="button"
                        className={youtubeBackgroundMode === 'theme' ? 'active' : ''}
                        onClick={() => onYoutubeBackgroundModeChange('theme')}
                      >
                        <Sparkles size={12} /> Built-in Themes
                      </button>
                    </div>
                  </div>

                  <div className="source-pref-group">
                    <span>YouTube Video Type (Most Views):</span>
                    <div className="source-pref-pills">
                      <button
                        type="button"
                        className={preferredVideoType === 'music' ? 'active' : ''}
                        onClick={() => onPreferredVideoTypeChange('music')}
                      >
                        Music Video
                      </button>
                      <button
                        type="button"
                        className={preferredVideoType === 'lyrics' ? 'active' : ''}
                        onClick={() => onPreferredVideoTypeChange('lyrics')}
                      >
                        Lyrical Video
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {tab === 'online' && (
              <div className="source-online-stage">
                <SongSearch
                  onPlay={async song => {
                    onSelectMode('online');
                    await onPlaySong(song);
                    onClose();
                  }}
                  onAddToQueue={song => {
                    onSelectMode('online');
                    onAddToQueue?.(song);
                  }}
                />
              </div>
            )}

            {tab === 'external' && (
              <div className="source-online-stage external-player-stage">
                {!androidAvailable ? (
                  <div className="external-web-notice" role="status">
                    <strong>External Player · Not available in web</strong>
                    <p>
                      External Player mode is only available in the <b>Android app version</b> of LyricFlow.
                      In the Android app, LyricFlow uses Android Notification Listening to read live song details (title, artist, album, duration, playback position) from Spotify, YouTube Music, Apple Music, or any media player, lets you choose <b>Mic</b> or <b>Internal Audio</b> for audio reactivity, and automatically matches synced lyrics and the highest-viewed YouTube background video.
                    </p>
                  </div>
                ) : (
                  <div className="external-android-panel">
                    <div className="external-panel-row">
                      <div>
                        <strong>
                          <BellRing size={15} /> 1. Android Notification Listening (Song Details)
                        </strong>
                        <small>
                          {notificationAccessGranted
                            ? 'Notification Listener active — reading track title, artist, album, and playback position from active media notifications.'
                            : 'Grant Notification Listener access so LyricFlow can detect songs playing in Spotify, YouTube Music, or other Android players.'}
                        </small>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                            {externalMedia.appName || 'External Player'} ·{' '}
                            {externalMedia.playing ? 'Playing' : 'Paused'}
                            {externalMedia.isAd || isAdvertisementTrack(externalMedia)
                              ? ' · AD (BUILT-IN THEMES ACTIVE)'
                              : ''}
                          </span>
                          <strong>{externalMedia.title}</strong>
                          <small>
                            {externalMedia.isAd || isAdvertisementTrack(externalMedia)
                              ? 'Advertisement detected — lyrics & background video search paused; showing built-in themes.'
                              : `${externalMedia.artist || 'Unknown artist'}${
                                  externalMedia.album ? ` · ${externalMedia.album}` : ''
                                }${
                                  externalMedia.duration > 0
                                    ? ` · ${Math.floor(externalMedia.duration / 60)}:${String(
                                        Math.floor(externalMedia.duration % 60)
                                      ).padStart(2, '0')}`
                                    : ''
                                }`}
                          </small>
                        </div>
                      ) : (
                        <small>
                          Waiting for an active media notification… Start playing a song in your external Android player.
                        </small>
                      )}
                    </div>

                    <div className="external-panel-row">
                      <div>
                        <strong>2. Audio Source for Visualizer Reactivity</strong>
                        <small>
                          Choose whether LyricFlow analyzes <b>Internal Audio</b> (device media output) or <b>Mic</b> (ambient microphone).
                        </small>
                      </div>
                      <div
                        className="source-pref-pills"
                        role="group"
                        aria-label="External player audio source"
                      >
                        <button
                          type="button"
                          className={externalAudioMode === 'internal' ? 'active' : ''}
                          onClick={() => onExternalAudioModeChange?.('internal')}
                        >
                          <Radio size={14} /> Internal Audio
                        </button>
                        <button
                          type="button"
                          className={externalAudioMode === 'mic' ? 'active' : ''}
                          onClick={() => onExternalAudioModeChange?.('mic')}
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

            <div className="source-modal-foot">
              <span>
                Tip: For JioSaavn, YouTube, and External Player, you can switch between the YouTube video background (Music or Lyrical video with most views) and built-in themes anytime.
              </span>
              <button type="button" className="source-primary" onClick={onClose}>
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default forwardRef(AudioSourceHub);
