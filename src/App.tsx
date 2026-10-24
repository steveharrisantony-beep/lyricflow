import { useEffect, useState, useRef } from 'react';
import CinematicStage, {
  CAMERA_VIEWS,
  type Quality,
  type CameraMode,
  type CameraView,
} from './visualization/cinematic/CinematicStage';
import { TEMPLATES, type SceneId } from './visualization/cinematic/catalog';
import { LYRIC_MOTIONS, type LyricMotion } from './visualization/cinematic/kineticTypography';
import { fontLabel } from './visualization/cinematic/fonts';
import { setAudioSensitivity, getAudioFrequencyBands, setSpectrumSensitivity } from './audio/audioSignal';
import LocalPlayer, { type LocalPlayerHandle } from './audio/LocalPlayer';
import AudioSourceHub, { type AudioSourceHubHandle, type AudioSourceMode } from './audio/AudioSourceHub';
import { clampLyricDelay, formatLyricDelay } from './lyrics/lyricTiming';
import ManualLyrics, { type IncomingLyrics } from './lyrics/ManualLyrics';
import TrackFinder from './metadata/TrackFinder';
import type { TrackInfo } from './metadata/trackInfo';
import { saveTrackCorrection } from './metadata/metadataStore';
import LoginScreen from './auth/LoginScreen';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  getSavedSessionMode,
  setSavedSessionMode,
  loadLocalPreferences,
  saveLocalPreferences,
  fetchCloudPreferences,
  saveCloudPreferences,
  fetchSongDelayPreference,
  saveSongDelayPreference,
  ALL_SCENE_IDS,
  ALL_KINETIC_MOTIONS,
  ALL_CAMERA_VIEWS,
  type User,
} from './firebase/firebaseClient';
import {
  AudioLines,
  Settings2,
  Expand,
  Pause,
  Play,
  Waves,
  SlidersHorizontal,
  Headphones,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  LogOut,
  LogIn,
  Check,
  Sparkles,
} from 'lucide-react';

const choices = TEMPLATES;

const MOTION_DESCRIPTIONS: Record<LyricMotion, string> = {
  dolly: '3D camera Z-axis push & word impulse',
  rise: 'Critically-damped vertical lift & pitch',
  sweep: 'Horizontal tracking glide with shear',
  tilt: 'Alternating diagonal plane rotation',
  elastic: 'Spring-oscillating word stretch',
  ribbon: 'Sinusoidal 3D wave & roll',
  stamp: 'High-impact kinetic slam & shockwave',
  cascade: 'Stepped multi-row diagonal waterfall',
};

const CAMERA_VIEW_DESCRIPTIONS: Record<CameraView, string> = {
  Front: 'Centered concert-stage framing with beat push',
  Orbit: '360° sweeping orbital path around the 3D world',
  Side: 'Wide lateral tracking angle with dynamic roll',
  Top: 'Elevated overhead perspective looking down on geometry',
};

export default function App() {
  const initialPrefs = useRef(loadLocalPreferences()).current;

  // Auth & session state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [sessionMode, setSessionMode] = useState<'google' | 'guest' | null>(() => getSavedSessionMode());
  const [authReady, setAuthReady] = useState(false);
  const [syncBadge, setSyncBadge] = useState('Local profile');

  // Audio source selection state
  const [sourceMode, setSourceMode] = useState<AudioSourceMode | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceAutoPromptedRef = useRef(false);

  // Visualizer & theme / kinetic toggle state
  const [sceneFilter, setSceneFilter] = useState<'all' | '2d' | '3d' | 'enabled'>('all');
  const [scene, setScene] = useState<SceneId>('crimson-impact');
  const [intensity, setIntensity] = useState(initialPrefs.intensity);
  const [speed, setSpeed] = useState(initialPrefs.speed);
  const [sensitivity, setSensitivity] = useState(initialPrefs.sensitivity);
  const [spectrumSensitivity, setSpectrumControl] = useState(initialPrefs.spectrumGain);
  const [motionBlur, setMotionBlur] = useState(initialPrefs.motionBlur);
  const [quality, setQuality] = useState<Quality>(initialPrefs.quality);
  const [autoScenes, setAutoScenes] = useState(initialPrefs.autoScenes);
  const [spatialTypography, setSpatialTypography] = useState(initialPrefs.spatialTypography);
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialPrefs.cameraMode);
  const [enabledScenes, setEnabledScenes] = useState<SceneId[]>(initialPrefs.enabledScenes);
  const [enabledKineticMotions, setEnabledKineticMotions] = useState<LyricMotion[]>(initialPrefs.enabledKineticMotions);
  const [enabledCameraViews, setEnabledCameraViews] = useState<CameraView[]>(initialPrefs.enabledCameraViews);

  const [liveScene, setLiveScene] = useState('Crimson Impact');
  const [renderStatus, setRenderStatus] = useState('INITIALIZING VISUALS');
  const spectrumCanvas = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LocalPlayerHandle>(null);
  const audioHubRef = useRef<AudioSourceHubHandle>(null);
  const [cinemaControlsOpen, setCinemaControlsOpen] = useState(false);

  // Lyrics & per-song delay state
  const [lyricDelay, setLyricDelay] = useState(0);
  const [savedCustomLrc, setSavedCustomLrc] = useState('');
  const [delaySavedStatus, setDelaySavedStatus] = useState('Default 0.00s · adjusts per song');
  const [customEditOpen, setCustomEditOpen] = useState(false);
  const [lyricStatusMessage, setLyricStatusMessage] = useState('');

  const [demo, setDemo] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [settings, setSettings] = useState(false);
  const [fps, setFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localTrack, setLocalTrack] = useState<TrackInfo | null>(null);
  const [incoming, setIncoming] = useState<IncomingLyrics | null>(null);
  const [fileEpoch, setFileEpoch] = useState(0);
  const [performance, setPerformance] = useState(false);

  const prefsHydratedRef = useRef(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        setSessionMode('google');
        setSavedSessionMode('google');
        setSyncBadge('Syncing with Google Cloud…');
        try {
          const cloudPrefs = await fetchCloudPreferences(user);
          prefsHydratedRef.current = false;
          setIntensity(cloudPrefs.intensity);
          setSpeed(cloudPrefs.speed);
          setSensitivity(cloudPrefs.sensitivity);
          setSpectrumControl(cloudPrefs.spectrumGain);
          setMotionBlur(cloudPrefs.motionBlur);
          setQuality(cloudPrefs.quality);
          setAutoScenes(cloudPrefs.autoScenes);
          setSpatialTypography(cloudPrefs.spatialTypography);
          setCameraMode(cloudPrefs.cameraMode);
          setEnabledScenes(cloudPrefs.enabledScenes);
          setEnabledKineticMotions(cloudPrefs.enabledKineticMotions);
          setEnabledCameraViews(cloudPrefs.enabledCameraViews);
          prefsHydratedRef.current = true;
          setSyncBadge('Synced to Google Cloud');
        } catch {
          prefsHydratedRef.current = true;
          setSyncBadge('Saved locally (cloud offline)');
        }
      } else {
        prefsHydratedRef.current = true;
        setSyncBadge('Guest session (saved on device)');
      }
    });
    return () => unsub();
  }, []);

  // Prompt for audio source once after login if none chosen yet
  useEffect(() => {
    const isLoggedIn = Boolean(firebaseUser || sessionMode);
    if (isLoggedIn && !sourceMode && !localLoaded && !sourceAutoPromptedRef.current) {
      sourceAutoPromptedRef.current = true;
      setSourceOpen(true);
    }
  }, [firebaseUser, sessionMode, sourceMode, localLoaded]);

  // Persist user preferences (settings + enabled themes + enabled kinetic styles + camera views)
  useEffect(() => {
    const currentPrefs = {
      intensity,
      speed,
      sensitivity,
      spectrumGain: spectrumSensitivity,
      motionBlur,
      quality,
      autoScenes,
      spatialTypography,
      narrativeObjects: false,
      cameraMode,
      enabledScenes,
      enabledKineticMotions,
      enabledCameraViews,
    };
    saveLocalPreferences(currentPrefs);
    if (!prefsHydratedRef.current || !firebaseUser) return;
    const timer = setTimeout(() => {
      void saveCloudPreferences(firebaseUser, currentPrefs)
        .then(() => setSyncBadge('All settings synced'))
        .catch(() => setSyncBadge('Saved locally'));
    }, 600);
    return () => clearTimeout(timer);
  }, [
    intensity,
    speed,
    sensitivity,
    spectrumSensitivity,
    motionBlur,
    quality,
    autoScenes,
    spatialTypography,
    cameraMode,
    enabledScenes,
    enabledKineticMotions,
    enabledCameraViews,
    firebaseUser,
  ]);

  // Load saved per-song lyric delay & custom lyric override when track changes
  const songIdentityKey = localTrack ? `${localTrack.title}|${localTrack.artist}` : '';
  useEffect(() => {
    if (!localTrack) {
      setLyricDelay(0);
      setSavedCustomLrc('');
      setDelaySavedStatus('Default 0.00s · adjusts per song');
      return;
    }
    let cancelled = false;
    void fetchSongDelayPreference(firebaseUser, localTrack)
      .then(record => {
        if (cancelled) return;
        if (record) {
          setLyricDelay(clampLyricDelay(record.delaySeconds));
          setSavedCustomLrc(record.customLyricsLrc || '');
          setDelaySavedStatus(
            firebaseUser
              ? `Restored ${formatLyricDelay(record.delaySeconds)} from your Google account for "${localTrack.title}"`
              : `Restored ${formatLyricDelay(record.delaySeconds)} saved on device for "${localTrack.title}"`
          );
        } else {
          setLyricDelay(0);
          setSavedCustomLrc('');
          setDelaySavedStatus(`0.00s for "${localTrack.title}" · changes save automatically`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyricDelay(0);
          setSavedCustomLrc('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [songIdentityKey, firebaseUser]);

  const updateLyricDelay = (value: number) => {
    const clamped = clampLyricDelay(value);
    setLyricDelay(clamped);
    if (localTrack) {
      setDelaySavedStatus(
        firebaseUser
          ? `Saving ${formatLyricDelay(clamped)} for "${localTrack.title}" to Google Cloud…`
          : `Saved ${formatLyricDelay(clamped)} for "${localTrack.title}" on this device`
      );
      void saveSongDelayPreference(firebaseUser, localTrack, clamped)
        .then(() => {
          if (firebaseUser) {
            setDelaySavedStatus(`Saved ${formatLyricDelay(clamped)} for "${localTrack.title}" to Google Cloud`);
          }
        })
        .catch(() => {
          setDelaySavedStatus(`Saved ${formatLyricDelay(clamped)} on this device`);
        });
    }
  };

  const handleSaveCustomOverride = (lrc: string) => {
    setSavedCustomLrc(lrc);
    if (localTrack) {
      void saveSongDelayPreference(firebaseUser, localTrack, lyricDelay, lrc).catch(() => {});
    }
  };

  const acceptLyrics = (lyrics: Omit<IncomingLyrics, 'token'>) =>
    setIncoming({ ...lyrics, token: Date.now() });

  useEffect(() => {
    setSpectrumSensitivity(spectrumSensitivity / 100);
    try {
      localStorage.setItem('lyricflow.spectrumGain', String(spectrumSensitivity));
    } catch {}
  }, [spectrumSensitivity]);

  useEffect(() => {
    setAudioSensitivity(sensitivity / 100);
  }, [sensitivity]);

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement) setPerformance(false);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const [audioReadout, setAudioReadout] = useState({
    source: 'IDLE',
    level: 0,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: 0,
    bpm: 0,
    tempoConfidence: 0,
    onset: 0,
    downbeat: 0,
    section: 'unknown',
    beatCount: 0,
    flux: 0,
    threshold: 0,
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.visual-canvas');
      if (!canvas) return;
      const numeric = (key: string) => Number(canvas.dataset[key] || 0);
      if (canvas.dataset.sceneLabel)
        setLiveScene(previous =>
          previous === canvas.dataset.sceneLabel ? previous : canvas.dataset.sceneLabel || previous
        );
      if (canvas.dataset.renderer)
        setRenderStatus(previous =>
          previous === canvas.dataset.renderer ? previous : canvas.dataset.renderer || previous
        );
      const meter = spectrumCanvas.current,
        frequency = getAudioFrequencyBands();
      if (meter) {
        const mc = meter.getContext('2d');
        if (mc) {
          const bw = meter.width / 64;
          mc.clearRect(0, 0, meter.width, meter.height);
          mc.fillStyle = '#16232e';
          mc.fillRect(0, meter.height - 1, meter.width, 1);
          for (let i = 0; i < 64; i++) {
            const e = Math.max(0, Math.min(1, frequency[i]));
            mc.fillStyle = i < 15 ? '#ffa38c' : i < 43 ? '#bc7bf0' : '#8fe2e4';
            const height = Math.max(1, e * (meter.height - 4));
            mc.fillRect(i * bw + 1, meter.height - height, Math.max(2, bw - 2), height);
          }
        }
      }
      setAudioReadout({
        source: canvas.dataset.audioSource || 'IDLE',
        level: numeric('audioLevel'),
        bass: numeric('audioBass'),
        mids: numeric('audioMids'),
        treble: numeric('audioTreble'),
        beat: numeric('audioBeat'),
        bpm: numeric('audioBpm'),
        tempoConfidence: numeric('audioTempoConfidence'),
        onset: numeric('audioOnset'),
        downbeat: numeric('audioDownbeat'),
        section: canvas.dataset.audioSection || 'unknown',
        beatCount: numeric('audioBeatCount'),
        flux: numeric('audioFlux'),
        threshold: numeric('audioThreshold'),
      });
    }, 90);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const v = document.querySelector<HTMLCanvasElement>('.visual-canvas')?.dataset.fps;
      if (v) setFps(Number(v));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError('');
    } catch {
      setFullscreenError(
        'Fullscreen is not supported in this browser preview. Try opening the app in its own browser tab.'
      );
    }
  };

  const togglePerformance = async () => {
    if (performance) {
      setPerformance(false);
      setCinemaControlsOpen(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      return;
    }
    setPerformance(true);
    setCinemaControlsOpen(false);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        'Browser fullscreen was blocked. Cinema mode still works; use the dock to access controls.'
      );
    }
  };

  const toggleSceneEnabled = (id: SceneId) => {
    setEnabledScenes(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least 1 theme active
        return prev.filter(item => item !== id);
      }
      return [...prev, id];
    });
  };

  const toggleKineticMotionEnabled = (motion: LyricMotion) => {
    setEnabledKineticMotions(prev => {
      if (prev.includes(motion)) {
        if (prev.length <= 1) return prev; // Keep at least 1 motion active
        return prev.filter(item => item !== motion);
      }
      return [...prev, motion];
    });
  };

  const toggleCameraViewEnabled = (view: CameraView) => {
    setEnabledCameraViews(prev => {
      if (prev.includes(view)) {
        if (prev.length <= 1) return prev; // Keep at least 1 camera view active
        const next = prev.filter(item => item !== view);
        if (cameraMode === view) {
          setCameraMode('Automatic');
        }
        return next;
      }
      return [...prev, view];
    });
  };

  const isAuthenticatedOrGuest = Boolean(firebaseUser || sessionMode);

  // First-time Login Gate
  if (authReady && !isAuthenticatedOrGuest) {
    return (
      <LoginScreen
        onGoogleLogin={async () => {
          await signInWithGoogle();
          setSessionMode('google');
          setSourceOpen(true);
        }}
        onGuestLogin={() => {
          setSavedSessionMode('guest');
          setSessionMode('guest');
          setSourceOpen(true);
        }}
      />
    );
  }

  const enabledChoices = choices.filter(c => enabledScenes.includes(c.id));
  const stepperPool = enabledChoices.length > 0 ? enabledChoices : choices;

  return (
    <div className={'shell ' + (performance ? 'performance-mode' : '')}>
      <header className="header">
        <div className="logo">
          <span className="logo-mark">
            <AudioLines size={21} />
          </span>
          <div>
            <strong>
              lyric<span>flow</span>
            </strong>
            <small>STASH SOUNDSTAGE &amp; KINETIC LYRICS</small>
          </div>
        </div>
        <div className="track">
          <i className="dot" /> {localTrack?.title || 'Untitled session'} <span>·</span>{' '}
          {localLoaded && localTrack
            ? `Audio: ${localTrack.audioSource || (localTrack.source === 'provider' ? 'Stash Online Player' : 'Local File')}`
            : demo
              ? 'Demo mode'
              : 'Idle'}{' '}
          <span>·</span>{' '}
          <small>Lyrics: {incoming?.source || 'Automatic (Apple Music / LRCLIB)'}</small>{' '}
          <span>·</span> <small>{syncBadge}</small>
        </div>
        <div className="header-right">
          {firebaseUser ? (
            <div className="user-pill">
              <span>{firebaseUser.displayName || firebaseUser.email}</span>
              <button
                type="button"
                className="user-action-btn"
                onClick={() => {
                  void signOutUser();
                  setSessionMode(null);
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="user-pill">
              <span>Guest Mode</span>
              <button
                type="button"
                className="user-action-btn"
                onClick={() => void signInWithGoogle()}
              >
                <LogIn size={13} /> Google Sign-In
              </button>
            </div>
          )}
          <button
            className="icon-btn"
            aria-label="Settings"
            onClick={() => setSettings(v => !v)}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      {/* 1. VISUALIZER STAGE */}
      <section
        className="stage"
        onClick={performance ? () => setCinemaControlsOpen(v => !v) : undefined}
        aria-label={performance ? 'Tap canvas to show or hide cinema controls' : 'Music visualizer'}
      >
        <CinematicStage
          manualScene={scene}
          intensity={intensity / 100}
          speed={speed / 50}
          quality={quality}
          demo={demo}
          paused={paused}
          reducedMotion={reducedMotion}
          autoScenes={autoScenes}
          cameraMode={cameraMode}
          spatialTypography={spatialTypography}
          motionBlur={motionBlur}
          enabledScenes={enabledScenes}
          enabledKineticMotions={enabledKineticMotions}
          enabledCameraViews={enabledCameraViews}
        />

        {!performance && (
          <div className="stage-source-bar">
            <button
              type="button"
              className="stage-source-button"
              onClick={() => setSourceOpen(true)}
            >
              <Headphones size={16} />
              <span>
                <small>
                  {localTrack?.audioSource
                    ? `AUDIO · ${localTrack.audioSource.toUpperCase()}`
                    : 'AUDIO SOURCE'}
                </small>
                <b>
                  {sourceMode === 'online'
                    ? localTrack?.title || 'Stash Online Player'
                    : sourceMode === 'local'
                    ? localTrack?.title || 'Local Audio Upload'
                    : 'Choose Audio Source'}
                </b>
              </span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              className="stage-cinema-button"
              onClick={() => void togglePerformance()}
            >
              <Expand size={16} /> Cinema Mode
            </button>
          </div>
        )}

        {performance && (
          <div className="cinema-control-hub" onClick={e => e.stopPropagation()}>
            <div className="cinema-quick-actions">
              <button
                type="button"
                className="cinema-hub-trigger"
                aria-label={cinemaControlsOpen ? 'Hide cinema controls' : 'Show cinema controls'}
                onClick={() => setCinemaControlsOpen(v => !v)}
              >
                {cinemaControlsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}{' '}
                <span>{cinemaControlsOpen ? 'Hide controls' : 'Controls'}</span>
              </button>
              <button
                type="button"
                aria-label="Exit cinema mode"
                onClick={() => void togglePerformance()}
              >
                <LogOut size={18} />
              </button>
            </div>
            {cinemaControlsOpen && (
              <aside className="cinema-drawer" aria-label="Cinema live controls">
                <div className="cinema-drawer-head">
                  <b>LYRICFLOW LIVE</b>
                  <span>
                    {audioReadout.source} · {fps} FPS
                  </span>
                </div>
                <button className="cinema-source-action" onClick={() => setSourceOpen(true)}>
                  <Headphones size={17} /> Choose audio source <ChevronRight size={16} />
                </button>
                {localLoaded && (
                  <div className="cinema-playback">
                    <strong>{localTrack?.title}</strong>
                    <div>
                      <button
                        type="button"
                        aria-label={localPlaying ? 'Cinema pause song' : 'Cinema play song'}
                        onClick={() =>
                          localPlaying ? playerRef.current?.pause() : void playerRef.current?.play()
                        }
                      >
                        {localPlaying ? <Pause size={16} /> : <Play size={16} />}{' '}
                        {localPlaying ? 'Pause song' : 'Play song'}
                      </button>
                      <span>
                        {Math.floor(localTime / 60)}:
                        {String(Math.floor(localTime % 60)).padStart(2, '0')}
                      </span>
                    </div>
                    <input
                      aria-label="Cinema song position"
                      type="range"
                      min="0"
                      max={Math.max(0, localTrack?.duration || 0)}
                      step=".1"
                      value={Math.min(localTime, localTrack?.duration || 0)}
                      onChange={e => playerRef.current?.seek(Number(e.target.value))}
                    />
                  </div>
                )}
                <div className="cinema-scene-steppers">
                  <button
                    aria-label="Previous scene"
                    onClick={() => {
                      const i = Math.max(0, stepperPool.findIndex(c => c.id === scene));
                      setScene(stepperPool[(i - 1 + stepperPool.length) % stepperPool.length].id);
                      setAutoScenes(false);
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <select
                    aria-label="Cinema scene"
                    value={scene}
                    onChange={e => {
                      setScene(e.target.value as SceneId);
                      setAutoScenes(false);
                    }}
                  >
                    {stepperPool.map(c => (
                      <option value={c.id} key={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="Next scene"
                    onClick={() => {
                      const i = Math.max(0, stepperPool.findIndex(c => c.id === scene));
                      setScene(stepperPool[(i + 1) % stepperPool.length].id);
                      setAutoScenes(false);
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <label className="cinema-check">
                  <input
                    type="checkbox"
                    checked={autoScenes}
                    onChange={e => setAutoScenes(e.target.checked)}
                  />{' '}
                  Auto-direct enabled scenes
                </label>
                <label className="cinema-range">
                  <span>
                    Sensitivity <b>{sensitivity}%</b>
                  </span>
                  <input
                    aria-label="Cinema audio sensitivity"
                    type="range"
                    min="0"
                    max="100"
                    value={sensitivity}
                    onChange={e => setSensitivity(Number(e.target.value))}
                  />
                </label>
                <label className="cinema-range">
                  <span>
                    Spectrum gain <b>{spectrumSensitivity}%</b>
                  </span>
                  <input
                    aria-label="Cinema spectrum gain"
                    type="range"
                    min="0"
                    max="100"
                    value={spectrumSensitivity}
                    onChange={e => setSpectrumControl(Number(e.target.value))}
                  />
                </label>
                <label className="cinema-range">
                  <span>
                    Motion blur <b>{reducedMotion ? 0 : motionBlur}%</b>
                  </span>
                  <input
                    aria-label="Cinema motion blur"
                    type="range"
                    min="0"
                    max="80"
                    step="5"
                    disabled={reducedMotion}
                    value={motionBlur}
                    onChange={e => setMotionBlur(Number(e.target.value))}
                  />
                </label>
                <div className="cinema-delay">
                  <span>
                    LYRICS DELAY <b>{formatLyricDelay(lyricDelay)}</b>
                  </span>
                  <div>
                    <button
                      aria-label="Cinema advance lyrics"
                      onClick={() => updateLyricDelay(lyricDelay - 0.25)}
                    >
                      −0.25s
                    </button>
                    <button
                      aria-label="Cinema reset lyric delay"
                      onClick={() => updateLyricDelay(0)}
                    >
                      Reset
                    </button>
                    <button
                      aria-label="Cinema delay lyrics"
                      onClick={() => updateLyricDelay(lyricDelay + 0.25)}
                    >
                      +0.25s
                    </button>
                  </div>
                </div>
                <div className="cinema-drawer-foot">
                  <button onClick={() => setPaused(p => !p)}>
                    {paused ? <Play size={15} /> : <Pause size={15} />}{' '}
                    {paused ? 'Resume' : 'Pause'} visuals
                  </button>
                  <button onClick={() => void togglePerformance()}>Exit Cinema</button>
                </div>
              </aside>
            )}
          </div>
        )}

        <div className="scene-chip cinematic-chip">
          <span className="chip-icon">✦</span>
          <div>
            <b>{liveScene}</b>
            <small>
              {enabledScenes.length}/40 Themes · {enabledKineticMotions.length}/8 Kinetic Styles
            </small>
          </div>
        </div>
        <div className="stage-bottom">
          <span>
            <i className="dot" /> {renderStatus} · PROCEDURAL CINEMA
          </span>
          <span>{fps} FPS</span>
        </div>
        {settings && (
          <aside className="settings-panel">
            <div className="settings-title">
              <SlidersHorizontal size={16} /> VISUAL SETTINGS{' '}
              <button aria-label="Close settings" onClick={() => setSettings(false)}>
                ×
              </button>
            </div>
            <label className="check">
              <span>
                <b>Reduced motion</b>
                <small>Calmer animation</small>
              </span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={e => setReducedMotion(e.target.checked)}
              />
            </label>
            <p>RENDERING QUALITY</p>
            <div className="quality-options">
              {(['High', 'Balanced', 'Performance'] as Quality[]).map(q => (
                <button
                  key={q}
                  className={quality === q ? 'active' : ''}
                  onClick={() => setQuality(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="note">
              Settings, enabled themes, kinetic animation toggles, and per-song lyric delays are
              automatically saved to your profile.
            </p>
          </aside>
        )}
      </section>

      {/* 2. PLAYER DETAILS -> 3. SONG DETAILS -> 4. TIMEBAR */}
      <LocalPlayer
        ref={playerRef}
        sourceMode={sourceMode}
        onOpenSourceSelector={() => setSourceOpen(true)}
        lyricSourceLabel={incoming?.source || (localLoaded ? 'Auto-matching…' : 'Idle')}
        lyricStatusMessage={lyricStatusMessage}
        hasWordSync={Boolean(incoming?.hasWordSync)}
        customEditOpen={customEditOpen}
        onToggleCustomEdit={() => setCustomEditOpen(v => !v)}
        lyricDelay={lyricDelay}
        onLyricDelayChange={updateLyricDelay}
        delaySavedStatus={delaySavedStatus}
        onActiveChange={playing => {
          setLocalPlaying(playing);
          if (playing) audioHubRef.current?.stop();
        }}
        onTimeChange={setLocalTime}
        onFileChange={loaded => {
          setLocalLoaded(loaded);
          setFileEpoch(e => e + 1);
          setIncoming(null);
        }}
        onTrackChange={track => {
          setLocalTrack(track);
          setIncoming(null);
        }}
        onDurationChange={duration =>
          setLocalTrack(p => (p ? { ...p, duration } : p))
        }
      />

      {/* 5. AUTOMATIC APPLE MUSIC / STASH LYRICS & ON-DEMAND CUSTOM EDIT */}
      <TrackFinder
        track={localTrack}
        savedCustomLrc={savedCustomLrc}
        customEditOpen={customEditOpen}
        onMetadataChange={value => {
          setLocalTrack(value);
          saveTrackCorrection(value);
        }}
        onLyricsFound={acceptLyrics}
        onStatusChange={setLyricStatusMessage}
      />

      <ManualLyrics
        key={fileEpoch}
        time={localTime}
        trackLoaded={localLoaded}
        track={localTrack}
        incoming={incoming}
        delay={lyricDelay}
        onDelayChange={updateLyricDelay}
        customEditOpen={customEditOpen}
        onToggleCustomEdit={() => setCustomEditOpen(v => !v)}
        onSaveCustomOverride={handleSaveCustomOverride}
        enabledScenes={enabledScenes}
      />

      {/* 6. THEME & KINETIC ANIMATION CUSTOMIZER */}
      <section className="control-panel" aria-label="Themes and kinetic lyric animation toggles">
        <div className="control-heading">
          <div className="heading-left">
            <span className="heading-icon">
              <Sparkles size={16} />
            </span>
            <div>
              <b>KINETIC LYRIC ANIMATION STYLES ({enabledKineticMotions.length}/8 ACTIVE)</b>
              <small>
                Toggle individual 3D word choreography styles on or off — auto-director uses only
                enabled styles
              </small>
            </div>
          </div>
          <div className="toggle-batch-actions">
            <button
              type="button"
              className="upload-button"
              onClick={() => setEnabledKineticMotions([...ALL_KINETIC_MOTIONS])}
            >
              Enable All 8 Styles
            </button>
          </div>
        </div>

        <div className="kinetic-motion-grid">
          {LYRIC_MOTIONS.map(motion => {
            const isEnabled = enabledKineticMotions.includes(motion);
            return (
              <div
                key={motion}
                className={'kinetic-motion-card ' + (isEnabled ? 'enabled' : 'disabled')}
              >
                <div className="kinetic-motion-top">
                  <strong>{motion.toUpperCase()}</strong>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`Toggle ${motion} kinetic lyric animation`}
                    className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                    onClick={() => toggleKineticMotionEnabled(motion)}
                  >
                    {isEnabled ? (
                      <>
                        <Check size={12} /> ON
                      </>
                    ) : (
                      'OFF'
                    )}
                  </button>
                </div>
                <small>{MOTION_DESCRIPTIONS[motion]}</small>
              </div>
            );
          })}
        </div>

        <div className="control-heading" style={{ marginTop: 28 }}>
          <div className="heading-left">
            <span className="heading-icon">
              <Waves size={16} />
            </span>
            <div>
              <b>CINEMATIC VISUAL THEMES ({enabledScenes.length}/40 ENABLED)</b>
              <small>
                Turn individual themes ON or OFF to curate your visualizer pool, or click a theme
                card to preview
              </small>
            </div>
          </div>
          <div className="toggle-batch-actions">
            <button
              type="button"
              className="upload-button"
              onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
            >
              Enable All 40 Themes
            </button>
            <label className="demo-toggle">
              <div>
                <b>Demo mode</b>
                <small>Simulated energy</small>
              </div>
              <input
                type="checkbox"
                checked={demo}
                onChange={e => setDemo(e.target.checked)}
              />
            </label>
          </div>
        </div>

        <div className="scene-director-controls">
          <label className="auto-scenes">
            <input
              type="checkbox"
              checked={autoScenes}
              onChange={e => setAutoScenes(e.target.checked)}
            />{' '}
            Auto-direct enabled scenes <small>({enabledScenes.length} active in rotation)</small>
          </label>
          <label className="auto-scenes">
            <input
              type="checkbox"
              checked={spatialTypography}
              onChange={e => setSpatialTypography(e.target.checked)}
            />{' '}
            Kinetic lyric choreography{' '}
            <small>({enabledKineticMotions.length} active styles)</small>
          </label>
          <label className="camera-picker">
            Camera view{' '}
            <select
              value={cameraMode}
              onChange={e => setCameraMode(e.target.value as CameraMode)}
            >
              <option value="Automatic">Automatic ({enabledCameraViews.length}/4 active)</option>
              {CAMERA_VIEWS.map(v => (
                <option key={v} value={v} disabled={!enabledCameraViews.includes(v)}>
                  {v} {enabledCameraViews.includes(v) ? '(ON)' : '(OFF)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="camera-views-panel" aria-label="Camera views on off toggles">
          <div className="camera-views-head">
            <div>
              <b>CAMERA VIEWS ({enabledCameraViews.length}/4 ACTIVE)</b>
              <small>
                Toggle individual camera angles ON or OFF — Automatic camera cycles only through enabled views
              </small>
            </div>
            <button
              type="button"
              className="upload-button"
              onClick={() => setEnabledCameraViews([...ALL_CAMERA_VIEWS])}
            >
              Enable All 4 Views
            </button>
          </div>
          <div className="camera-view-grid">
            {CAMERA_VIEWS.map(view => {
              const isEnabled = enabledCameraViews.includes(view);
              const isLockedToView = cameraMode === view;
              return (
                <div
                  key={view}
                  className={
                    'kinetic-motion-card camera-view-card ' +
                    (isEnabled ? 'enabled ' : 'disabled ') +
                    (isLockedToView ? 'camera-locked' : '')
                  }
                >
                  <div className="kinetic-motion-top">
                    <button
                      type="button"
                      className="camera-view-select-btn"
                      onClick={() => {
                        if (!isEnabled) toggleCameraViewEnabled(view);
                        setCameraMode(prev => (prev === view ? 'Automatic' : view));
                      }}
                    >
                      <strong>{view.toUpperCase()}</strong>
                      {isLockedToView && <span className="camera-lock-tag">LOCKED</span>}
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Toggle ${view} camera view`}
                      className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                      onClick={() => toggleCameraViewEnabled(view)}
                    >
                      {isEnabled ? (
                        <>
                          <Check size={12} /> ON
                        </>
                      ) : (
                        'OFF'
                      )}
                    </button>
                  </div>
                  <small>{CAMERA_VIEW_DESCRIPTIONS[view]}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="scene-filter" aria-label="Scene categories">
          {(
            [
              ['all', 'All 40'],
              ['2d', '2D motion · 12'],
              ['3d', '3D worlds · 28'],
              ['enabled', `Enabled (${enabledScenes.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={sceneFilter === value}
              onClick={() => setSceneFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scene-grid cinematic-grid">
          {choices
            .filter(item => {
              if (sceneFilter === 'enabled') return enabledScenes.includes(item.id);
              if (sceneFilter === 'all') return true;
              return (
                (sceneFilter === '2d') ===
                (item.family === '2d' || ['crimson-impact', 'color-riot'].includes(item.id))
              );
            })
            .map((item, i) => {
              const isEnabled = enabledScenes.includes(item.id);
              return (
                <div
                  className={
                    'scene-card cinematic-scene-card ' +
                    (['crimson-impact', 'color-riot', 'glass-architecture'].includes(item.id)
                      ? 'premiere-scene '
                      : '') +
                    (scene === item.id && !autoScenes ? 'selected ' : '') +
                    (!isEnabled ? 'scene-disabled' : '')
                  }
                  key={item.id}
                  onClick={() => {
                    setScene(item.id);
                    setAutoScenes(false);
                  }}
                >
                  <span
                    className="scene-art cinematic-preview"
                    style={{
                      background: `linear-gradient(135deg, ${item.accent}, ${item.background} 75%)`,
                      color: item.foreground,
                      fontFamily: fontLabel(item.font),
                    }}
                  >
                    <span className="scene-preview-initials">
                      {item.label.slice(0, 2).toUpperCase()}
                    </span>
                    {['crimson-impact', 'color-riot', 'glass-architecture'].includes(item.id) && (
                      <span className="premiere-tag">SIGNATURE</span>
                    )}
                  </span>
                  <span className="scene-copy">
                    <b>{item.label}</b>
                    <small>
                      {item.id === 'crimson-impact'
                        ? '64-band spectrum'
                        : item.id === 'color-riot'
                        ? 'Generative poster art'
                        : item.id === 'glass-architecture'
                        ? 'Architectural 3D'
                        : item.family + ' · ' + fontLabel(item.font)}
                    </small>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`Toggle ${item.label} theme`}
                    className={'theme-toggle-pill card-toggle ' + (isEnabled ? 'on' : 'off')}
                    onClick={e => {
                      e.stopPropagation();
                      toggleSceneEnabled(item.id);
                    }}
                  >
                    {isEnabled ? 'ON' : 'OFF'}
                  </button>
                  <small className="scene-number">{String(i + 1).padStart(2, '0')}</small>
                </div>
              );
            })}
        </div>

        <div className="control-bottom">
          <label className="slider">
            <span>
              <span>◎ &nbsp; Motion blur</span>
              <b>{reducedMotion ? 0 : motionBlur}%</b>
            </span>
            <input
              aria-label="Motion blur"
              type="range"
              min="0"
              max="80"
              step="5"
              value={motionBlur}
              disabled={reducedMotion}
              onChange={e => setMotionBlur(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <span>
              <span>◉ &nbsp; Audio sensitivity</span>
              <b>{sensitivity}%</b>
            </span>
            <input
              aria-label="Audio sensitivity"
              type="range"
              min="0"
              max="100"
              value={sensitivity}
              onChange={e => setSensitivity(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <span>
              <span>✧ &nbsp; Visual intensity</span>
              <b>{intensity}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={intensity}
              onChange={e => setIntensity(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <span>
              <span>ϟ &nbsp; Animation speed</span>
              <b>{speed}%</b>
            </span>
            <input
              type="range"
              min="10"
              max="100"
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
            />
          </label>
          <div className="transport">
            <button
              aria-label={paused ? 'Resume' : 'Pause'}
              className="play"
              onClick={() => setPaused(p => !p)}
            >
              {paused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}
            </button>
            <div>
              <b>{paused ? 'Resume visuals' : 'Pause visuals'}</b>
              <small>{paused ? 'Animation is paused' : 'Canvas in motion'}</small>
            </div>
            <button onClick={fullscreen} className="fullscreen">
              <Expand size={16} /> Fullscreen
            </button>
            <button onClick={() => void togglePerformance()} className="fullscreen cinema-button">
              ◈ Cinema Mode
            </button>
          </div>
        </div>
        {fullscreenError && (
          <p className="error" role="alert">
            {fullscreenError}
          </p>
        )}
      </section>

      {/* 7. LIVE AUDIO REACTIVITY DIAGNOSTIC */}
      <section className="signal-panel" aria-label="Live audio analysis">
        <div className="signal-header">
          <strong>LIVE AUDIO REACTIVITY</strong>
          <span className={'signal-mode ' + (audioReadout.source === 'LOCAL AUDIO' ? 'connected' : '')}>
            {audioReadout.source === 'LOCAL AUDIO'
              ? localTrack?.source === 'provider'
                ? '● Stash Online Stream Active'
                : '● Local Audio Active'
              : audioReadout.source === 'DEMO'
              ? '◌ Simulated energy'
              : '○ Idle'}
          </span>
        </div>
        <div className="signal-bars">
          {(
            [
              ['LOUDNESS', audioReadout.level],
              ['BASS', audioReadout.bass],
              ['MID', audioReadout.mids],
              ['TREBLE', audioReadout.treble],
              ['ONSET', audioReadout.onset],
              ['BEAT', audioReadout.beat],
            ] as const
          ).map(([label, value]) => (
            <div className="signal-band" key={label}>
              <span>
                {label}
                <b>{value}%</b>
              </span>
              <div className="signal-track">
                <i style={{ width: value + '%' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="spectrum-diagnostic">
          <span>
            64-BAND FREQUENCY SPECTRUM <small>32 Hz – 14 kHz · log-scaled · smoothed</small>
          </span>
          <canvas
            ref={spectrumCanvas}
            width={640}
            height={58}
            aria-label="Live 64-band musical frequency spectrum"
          />
        </div>
        <label className="spectrum-gain-control">
          <span>
            Spectrum gain <b>{spectrumSensitivity}%</b>
            <small>Controls 64-band height · beat detection stays independent</small>
          </span>
          <input
            aria-label="Spectrum gain"
            type="range"
            min="0"
            max="100"
            value={spectrumSensitivity}
            onChange={e => setSpectrumControl(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="Reset spectrum gain"
            onClick={() => setSpectrumControl(35)}
          >
            Reset
          </button>
        </label>
      </section>

      <AudioSourceHub
        ref={audioHubRef}
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        activeMode={sourceMode}
        onSelectMode={mode => setSourceMode(mode)}
        onPickLocal={() => {
          setSourceMode('local');
          playerRef.current?.chooseFile();
        }}
        onPlaySong={async song => {
          setSourceMode('online');
          await playerRef.current?.loadRemote(song);
        }}
      />

      <footer>
        LYRICFLOW <span>·</span> STASH ONLINE PLAYER &amp; APPLE MUSIC WORD-SYNC <span>·</span>{' '}
        {enabledScenes.length}/40 THEMES ACTIVE <aside>CLOUD-SYNCED SOUNDSTAGE</aside>
      </footer>
    </div>
  );
}