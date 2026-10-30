import { useCallback, useEffect, useState, useRef } from 'react';
import CinematicStage, {
  type Quality,
  type YouTubeBackgroundMode,
} from './visualization/cinematic/CinematicStage';
import {
  TEMPLATES,
  VOXELWALL_CATEGORIES,
  byId,
  resolveThemePalette,
  type FontPack,
  type SceneId,
  type VoxelWallCategory,
} from './visualization/cinematic/catalog';
import {
  ALL_PLACEMENT_MODES,
  VOXELVERSE_STYLES,
  VOXELVERSE_FAMILIES,
  LYRIC_PLACEMENT_MODES,
  type LyricMotion,
  type VoxelVerseFamily,
  type LyricFillPaceMode,
  type LyricPlacementMode,
} from './visualization/cinematic/kineticTypography';
import {
  LYRIC_ENGINE_OPTIONS,
  computeVideoDelayFromSubtitles,
  type LyricEngineOption,
  type YouTubeSubtitleTrackItem,
} from './lyrics/lyricFlowEngine';
import { fetchYouTubeSubtitlesForTrack } from './lyrics/appleLyrics';
import { fetchSponsorBlockSegments, computeLeadingNonMusicOffset } from './music/sponsorBlock';
import {
  extractAlbumArtPalette,
  getDeterministicSongPalette,
  type AlbumArtLyricPalette,
} from './visualization/cinematic/contrast';
import { computeBassThreshold } from './visualization/cinematic/cameraRig';
import { FONT_SHOWCASE, fontLabel } from './visualization/cinematic/fonts';
import {
  setAudioSensitivity,
  getAudioFrequencyBands,
  setSpectrumSensitivity,
  setVirtualMediaTime,
} from './audio/audioSignal';
import LocalPlayer, { type LocalPlayerHandle } from './audio/LocalPlayer';
import AudioSourceHub, { type AudioSourceHubHandle, type AudioSourceMode } from './audio/AudioSourceHub';
import {
  subscribeExternalMedia,
  startExternalAudioCapture,
  stopExternalAudioCapture,
  openExternalNotificationSettings,
  getCurrentExternalMedia,
  type ExternalAudioCaptureMode,
  type ExternalMediaState,
} from './audio/externalPlayer';
import { searchStashCatalog, rankYouTubeBackgroundCandidates } from './music/providers';
import { clampLyricDelay, formatLyricDelay } from './lyrics/lyricTiming';
import ManualLyrics, {
  LYRIC_COLOR_MAP,
  type IncomingLyrics,
  type LyricColorMode,
} from './lyrics/ManualLyrics';
import TrackFinder from './metadata/TrackFinder';
import {
  extractYouTubeVideoId,
  isAdvertisementTrack,
  type TrackInfo,
} from './metadata/trackInfo';
import { saveTrackCorrection } from './metadata/metadataStore';
import {
  loadLocalPreferences,
  saveLocalPreferences,
  watchCloudPreferences,
  saveCloudPreferences,
  type User,
  type UserPreferencesData,
  ALL_SCENE_IDS,
  ALL_KINETIC_MOTIONS,
  ALL_FONT_PACKS,
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
  Check,
  Sparkles,
  Video,
} from 'lucide-react';

import AccountControls from './auth/AccountControls';
import YouTubeAccountControl from './auth/YouTubeAccountControl';
import AppUpdateControl from './updates/AppUpdateControl';
import YouTubeBackgroundPicker from './music/YouTubeBackgroundPicker';
import CorrectionControls from './firebase/CorrectionControls';
import { useSongMapping, importGuestSongMappings } from './firebase/songMappings';
import { useCorrection } from './firebase/useCorrection';
import { usePrivateLyrics, legacySongDelay, importGuestCustomLyrics } from './firebase/usePrivateLyrics';
import { lyricFingerprint, type LyricsSelection } from './firebase/correctionModel';
import { writeDevice, scopedKey } from './firebase/deviceStore';
import { importGuestCorrections } from './firebase/correctionStore';

const choices = TEMPLATES;

const SIGNATURE_VOXELWALL_IDS: readonly SceneId[] = [
  'holographic-tide',
  'chroma-moire-voids',
  'crystal-resonance',
  'celestial-orbit',
  'aurora-field',
  'signal-chamber',
  'chromatic-drive',
];

type CinemaDrawerTab = 'all' | 'themes' | 'lyrics' | 'camera' | 'engine';

export default function App({ user = null }: { user?: User | null }) {
  const uid = user?.uid || null;
  const [initialPrefs] = useState(() => loadLocalPreferences(uid));
  const [syncStatus, setSyncStatus] = useState(user ? 'Connecting account sync…' : 'Guest · saved on this device');
  const [cloudReady, setCloudReady] = useState(!user);
  const remotePreferences = useRef('');

  // Audio source selection state
  const [sourceMode, setSourceMode] = useState<AudioSourceMode | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Android External Player & Auto-matched YouTube Video state
  const [autoVideoMatch,setAutoVideoMatch]=useState<{key:string;id:string|null;pending:boolean}>({key:'',id:null,pending:false});
  const [manualVideoSearchKey,setManualVideoSearchKey]=useState('');
  const [externalAudioMode, setExternalAudioMode] = useState<ExternalAudioCaptureMode>('internal');
  const [externalMedia, setExternalMedia] = useState<ExternalMediaState | null>(null);
  const [notificationAccessGranted, setNotificationAccessGranted] = useState<boolean>(false);
  const [externalAudioStatus, setExternalAudioStatus] = useState<string>('');

  // Visualizer & VoxelWall / VoxelVerse filter state
  const [sceneFilter, setSceneFilter] = useState<'all' | VoxelWallCategory | 'enabled'>('all');
  const [verseFamilyFilter, setVerseFamilyFilter] = useState<'all' | 'featured' | VoxelVerseFamily>('all');
  const [scene, setScene] = useState<SceneId>(initialPrefs.display.scene);
  const [intensity, setIntensity] = useState(initialPrefs.intensity);
  const [speed, setSpeed] = useState(initialPrefs.speed);
  const [sensitivity, setSensitivity] = useState(initialPrefs.sensitivity);
  const [spectrumSensitivity, setSpectrumControl] = useState(initialPrefs.spectrumGain);
  const [motionBlur, setMotionBlur] = useState(initialPrefs.motionBlur);
  const [quality, setQuality] = useState<Quality>(initialPrefs.quality);
  const [autoScenes, setAutoScenes] = useState(initialPrefs.autoScenes);
  const [spatialTypography, setSpatialTypography] = useState(initialPrefs.spatialTypography);
  const [enabledScenes, setEnabledScenes] = useState<SceneId[]>(initialPrefs.enabledScenes);
  const [autoKineticMotion, setAutoKineticMotion] = useState<boolean>(initialPrefs.autoKineticMotion ?? true);
  const [manualKineticMotion, setManualKineticMotion] = useState<LyricMotion>(initialPrefs.manualKineticMotion || 'ship');
  const [enabledKineticMotions, setEnabledKineticMotions] = useState<LyricMotion[]>(initialPrefs.enabledKineticMotions);
  const [enabledPlacements, setEnabledPlacements] = useState<Exclude<LyricPlacementMode, 'auto'>[]>(
    initialPrefs.enabledPlacements || [...ALL_PLACEMENT_MODES]
  );
  const [autoFonts, setAutoFonts] = useState<boolean>(initialPrefs.autoFonts ?? true);
  const [manualFont, setManualFont] = useState<FontPack>(initialPrefs.manualFont || 'impact');
  const [enabledFonts, setEnabledFonts] = useState<FontPack[]>(initialPrefs.enabledFonts || [...ALL_FONT_PACKS]);
  const [cameraShakeEnabled, setCameraShakeEnabled] = useState<boolean>(initialPrefs.cameraShakeEnabled);
  const [cameraShakeSensitivity, setCameraShakeSensitivity] = useState<number>(initialPrefs.cameraShakeSensitivity);
  const [lyricMinFontSize, setLyricMinFontSize] = useState<number>(initialPrefs.lyricMinFontSize);
  const [lyricMaxFontSize, setLyricMaxFontSize] = useState<number>(initialPrefs.lyricMaxFontSize);
  const [themePalettes, setThemePalettes] = useState<Record<string, string>>(initialPrefs.themePalettes);

  // YouTube video background, black overlay opacity, SponsorBlock & embedded lyric auto-hide state
  const [preferredVideoType, setPreferredVideoType] = useState(initialPrefs.display.preferredVideoType);
  const [youtubeBackgroundMode, setYoutubeBackgroundMode] = useState<YouTubeBackgroundMode>(initialPrefs.display.youtubeBackgroundMode);
  const [videoOverlayOpacity, setVideoOverlayOpacity] = useState<number>(initialPrefs.display.videoOverlayOpacity);
  const [hasSeparateAudioStream, setHasSeparateAudioStream] = useState<boolean>(true);
  const [playerVolume, setPlayerVolume] = useState<number>(initialPrefs.display.playerVolume);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState<boolean>(initialPrefs.display.sponsorBlockEnabled);
  const [leadingNonMusicOffsetSec, setLeadingNonMusicOffsetSec] = useState<number>(0);

  // Background video subtitles & SponsorBlock auto-sync state for JioSaavn / External Player
  const [bgVideoSubtitles, setBgVideoSubtitles] = useState<YouTubeSubtitleTrackItem[]>([]);
  const [bgCaptionStatus,setBgCaptionStatus]=useState('');
  const [bgVideoSponsorOffsetSec, setBgVideoSponsorOffsetSec] = useState<number>(0);
  const [autoVideoDelaySeconds, setAutoVideoDelaySeconds] = useState<number>(0);
  const [autoVideoSyncStatus, setAutoVideoSyncStatus] = useState<string>('');
  const [albumArtPalette, setAlbumArtPalette] = useState<AlbumArtLyricPalette | null>(null);

  // Shared lyric display, available engine options, subtitle tracks, spatial placement & color controls
  const [lyricEngineOption, setLyricEngineOption] = useState<LyricEngineOption>('lyricflow');
  const [availableLyricEngines, setAvailableLyricEngines] = useState<LyricEngineOption[]>([]);
  const [youtubeSubtitleTracks, setYoutubeSubtitleTracks] = useState<YouTubeSubtitleTrackItem[]>([]);
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<string | undefined>(undefined);
  const [lyricPlacementMode, setLyricPlacementMode] = useState<LyricPlacementMode>(initialPrefs.display.lyricPlacementMode);
  const [lyricColorMode, setLyricColorMode] = useState<LyricColorMode>(initialPrefs.display.lyricColorMode);
  const [lyricFillPaceMode, setLyricFillPaceMode] = useState<LyricFillPaceMode>(initialPrefs.display.lyricFillPaceMode);
  const [lyricDisplayMode, setLyricDisplayMode] = useState<'original' | 'romanized' | 'both'>(initialPrefs.display.lyricDisplayMode);

  const [liveScene, setLiveScene] = useState('Holographic Tide');
  const [renderStatus, setRenderStatus] = useState('VOXELWALL 2D ENGINE');
  const spectrumCanvas = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LocalPlayerHandle>(null);
  const audioHubRef = useRef<AudioSourceHubHandle>(null);
  const [cinemaControlsOpen, setCinemaControlsOpen] = useState(false);
  const [cinemaTab, setCinemaTab] = useState<CinemaDrawerTab>('all');

  // Lyrics & per-song delay state

  const [customEditOpen, setCustomEditOpen] = useState(false);
  const [lyricStatusMessage, setLyricStatusMessage] = useState('');

  const [demo, setDemo] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialPrefs.display.reducedMotion);
  const [settings, setSettings] = useState(false);
  const [fps, setFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localTrack, setLocalTrack] = useState<TrackInfo | null>(null);
  const [incoming, setIncoming] = useState<IncomingLyrics | null>(null);
  const [activeLyrics, setActiveLyrics] = useState({ recordingKey: '', lyricsKey: '', name: '', url: '' });
  const [fileEpoch, setFileEpoch] = useState(0);
  const [performance, setPerformance] = useState(false);

  const songMapping = useSongMapping(localTrack, uid);
  const lyricsFix = useCorrection(localTrack, 'lyrics', uid);
  const videoFix = useCorrection(localTrack, 'video', uid);
  const recordingKey = lyricsFix.context?.recordingKey || '';
  const lyricsKey = activeLyrics.recordingKey === recordingKey ? activeLyrics.lyricsKey : '';
  const onLyricContentChange = useCallback((original: string, sourceUrl: string, sourceName: string) => {
    setActiveLyrics({ recordingKey, lyricsKey: lyricFingerprint(original, sourceUrl), name: sourceName.slice(0, 256), url: sourceUrl });
  }, [recordingKey]);
  const delayFix = useCorrection(localTrack, 'delay', uid, lyricsKey, lyricsKey ? { name: activeLyrics.name, url: activeLyrics.url, revision: lyricsKey } : null);
  const privateLyrics = usePrivateLyrics(localTrack, uid);
  const legacyDelay = !uid ? legacySongDelay(localTrack) : null;
  const savedCustomLrc = privateLyrics.hasOverride ? privateLyrics.text : legacyDelay?.customLyricsLrc || '';
  const lyricDelay = delayFix.correction?.delaySeconds ?? (songMapping.lyrics?.sourceFile.revision === lyricsKey ? songMapping.lyrics.delaySeconds : 0);
  const delaySavedStatus = delayFix.error || (delayFix.source === 'personal'
    ? `Your ${formatLyricDelay(lyricDelay)} correction · ${user ? 'account sync enabled' : 'saved on device'}`
    : delayFix.source === 'approved' ? `Community-approved ${formatLyricDelay(lyricDelay)} correction`
    : 'Automatic timing · personal changes save per lyrics version');
  useEffect(() => {
    if (!uid && legacyDelay && delayFix.context && delayFix.source === 'automatic') {
      const marker = scopedKey('legacyDelayMigrated.' + delayFix.context.recordingKey, null);
      if (!localStorage.getItem(marker)) {
        delayFix.save({ delaySeconds: clampLyricDelay(legacyDelay.delaySeconds) });
        localStorage.setItem(marker, 'true');
      }
    }
  }, [uid, recordingKey, lyricsKey, delayFix.source]);
  const effectiveLyricsEngine = lyricsFix.correction?.selection?.engine || songMapping.lyrics?.selection?.engine || lyricEngineOption;
  const effectiveSubtitleTrackId = lyricsFix.correction?.selection?.subtitleTrackId || songMapping.lyrics?.selection?.subtitleTrackId || selectedSubtitleTrackId;

  const applyPreferences = useCallback((prefs: UserPreferencesData) => {
    setIntensity(prefs.intensity); setSpeed(prefs.speed); setSensitivity(prefs.sensitivity);
    setSpectrumControl(prefs.spectrumGain); setMotionBlur(prefs.motionBlur); setQuality(prefs.quality);
    setAutoScenes(prefs.autoScenes); setSpatialTypography(prefs.spatialTypography);
    setEnabledScenes(prefs.enabledScenes);
    setAutoKineticMotion(prefs.autoKineticMotion ?? true);
    setManualKineticMotion(prefs.manualKineticMotion || 'ship');
    setEnabledKineticMotions(prefs.enabledKineticMotions);
    setEnabledPlacements(prefs.enabledPlacements || [...ALL_PLACEMENT_MODES]);
    setAutoFonts(prefs.autoFonts ?? true);
    setManualFont(prefs.manualFont || 'impact');
    setEnabledFonts(prefs.enabledFonts || [...ALL_FONT_PACKS]);
    setCameraShakeEnabled(prefs.cameraShakeEnabled); setCameraShakeSensitivity(prefs.cameraShakeSensitivity);
    setLyricMinFontSize(prefs.lyricMinFontSize); setLyricMaxFontSize(prefs.lyricMaxFontSize);
    setThemePalettes(prefs.themePalettes);
    const d = prefs.display;
    setPreferredVideoType(d.preferredVideoType);
    setScene(d.scene); setReducedMotion(d.reducedMotion); setYoutubeBackgroundMode(d.youtubeBackgroundMode);
    setVideoOverlayOpacity(d.videoOverlayOpacity);
    setPlayerVolume(d.playerVolume); setSponsorBlockEnabled(d.sponsorBlockEnabled);
    setLyricPlacementMode(d.lyricPlacementMode); setLyricColorMode(d.lyricColorMode);
    setLyricFillPaceMode(d.lyricFillPaceMode); setLyricDisplayMode(d.lyricDisplayMode);
  }, []);
  useEffect(() => {
    if (!user) return;
    return watchCloudPreferences(user, prefs => {
      remotePreferences.current = JSON.stringify(prefs);
      applyPreferences(prefs); setCloudReady(true);
    }, setSyncStatus);
  }, [uid, applyPreferences]);

  // Debounce network writes; nothing is sent from the visualizer render loop.
  useEffect(() => {
    const prefs: UserPreferencesData = {
      display: { preferredVideoType, scene, reducedMotion, youtubeBackgroundMode, videoOverlayOpacity, autoHideYoutubeLyrics: false, playerVolume,
        sponsorBlockEnabled, lyricPlacementMode, lyricColorMode, lyricFillPaceMode, lyricDisplayMode },
      intensity, speed, sensitivity, spectrumGain: spectrumSensitivity, motionBlur, quality,
      autoScenes, spatialTypography, narrativeObjects: false, cameraMode: 'Front', enabledScenes,
      autoKineticMotion, manualKineticMotion, enabledKineticMotions, enabledPlacements,
      autoFonts, manualFont, enabledFonts,
      enabledCameraViews: ['Front'], cameraShakeEnabled, cameraShakeSensitivity,
      lyricMinFontSize, lyricMaxFontSize, themePalettes,
    };
    try { saveLocalPreferences(prefs, uid); }
    catch { setSyncStatus('Device storage is full or blocked · settings may not survive restart'); }
    if (!user || JSON.stringify(prefs) === remotePreferences.current) return;
    // Protect a real edit made before the first cloud snapshot without uploading untouched defaults.
    if (!cloudReady && JSON.stringify(prefs) === JSON.stringify(initialPrefs)) return;
    try { writeDevice(scopedKey('preferencesPending', uid), prefs); } catch { /* Existing status reports blocked local storage. */ }
    const timer = window.setTimeout(() => {
      setSyncStatus('Saved on device · waiting to sync');
      void saveCloudPreferences(user, prefs).then(() => setSyncStatus('Account settings synced')).catch(() => setSyncStatus('Saved on device · cloud sync unavailable'));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [intensity, speed, sensitivity, spectrumSensitivity, motionBlur, quality, autoScenes, spatialTypography,
    enabledScenes, autoKineticMotion, manualKineticMotion, enabledKineticMotions, enabledPlacements,
    autoFonts, manualFont, enabledFonts, cameraShakeEnabled, cameraShakeSensitivity, lyricMinFontSize,
    lyricMaxFontSize, themePalettes, uid, cloudReady, preferredVideoType, scene, reducedMotion, youtubeBackgroundMode, videoOverlayOpacity,
    playerVolume, sponsorBlockEnabled, lyricPlacementMode, lyricColorMode, lyricFillPaceMode, lyricDisplayMode]);

  const selectLyrics = (selection: LyricsSelection) => { privateLyrics.save(''); lyricsFix.save({ selection }); };
  const selectEngine = (engine: LyricEngineOption) => {
    if(engine==='youtube'&&effectiveLyricsEngine==='youtube')setFileEpoch(epoch=>epoch+1);
    selectLyrics({ engine, lrclibId: null, subtitleTrackId: null });
  };
  const selectSubtitle = (id: string) => selectLyrics({ engine: 'youtube', lrclibId: null, subtitleTrackId: id });
  const updateLyricDelay = (value: number) => { delayFix.save({ delaySeconds: clampLyricDelay(value) }); };

  const handleMinFontSizeChange = (val: number) => {
    const clamped = Math.max(16, Math.min(72, val));
    setLyricMinFontSize(clamped);
    if (clamped > lyricMaxFontSize) {
      setLyricMaxFontSize(clamped);
    }
  };

  const handleMaxFontSizeChange = (val: number) => {
    const clamped = Math.max(32, Math.min(130, val));
    setLyricMaxFontSize(clamped);
    if (clamped < lyricMinFontSize) {
      setLyricMinFontSize(Math.max(16, clamped));
    }
  };

  const handleSaveCustomOverride = (lrc: string) => { privateLyrics.save(lrc); };
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
    }, 260);
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
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== id);
      }
      return [...prev, id];
    });
  };

  const selectThemePalette = (sceneId: SceneId, paletteId: string) => {
    setThemePalettes(prev => ({
      ...prev,
      [sceneId]: paletteId,
    }));
  };

  const toggleKineticMotionEnabled = (motion: LyricMotion) => {
    setEnabledKineticMotions(prev => {
      if (prev.includes(motion)) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== motion);
      }
      return [...prev, motion];
    });
  };

  const togglePlacementEnabled = (pm: Exclude<LyricPlacementMode, 'auto'>) => {
    setEnabledPlacements(prev => {
      if (prev.includes(pm)) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== pm);
      }
      return [...prev, pm];
    });
  };

  const toggleFontEnabled = (font: FontPack) => {
    setEnabledFonts(prev => {
      if (prev.includes(font)) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== font);
      }
      return [...prev, font];
    });
  };

  const effectiveKineticMotions: readonly LyricMotion[] = autoKineticMotion
    ? enabledKineticMotions
    : [manualKineticMotion];
  const effectiveFonts: readonly FontPack[] = autoFonts
    ? enabledFonts
    : [manualFont];

  const enabledChoices = choices.filter(c => enabledScenes.includes(c.id));
  const stepperPool = enabledChoices.length > 0 ? enabledChoices : choices;
  const activeTemplate = byId[scene] || choices[0];
  const activeScenePalette = resolveThemePalette(activeTemplate.id, themePalettes[activeTemplate.id]);

  const filteredVerseStyles = VOXELVERSE_STYLES.filter(style => {
    if (verseFamilyFilter === 'all') return true;
    if (verseFamilyFilter === 'featured') return Boolean(style.featured);
    return style.family === verseFamilyFilter;
  });

  const isAdPlaying = Boolean(
    (sourceMode === 'external' && (externalMedia?.isAd || isAdvertisementTrack(externalMedia))) ||
      isAdvertisementTrack(localTrack)
  );

  const activeYoutubeVideoId = isAdPlaying
    ? null
    : (hasSeparateAudioStream ? videoFix.correction?.youtubeVideoId || songMapping.video?.youtubeVideoId : null) ||
      extractYouTubeVideoId(localTrack);

  const videoSearchKey=localTrack?[localTrack.title,localTrack.artist,Math.round(localTrack.duration),localTrack.provider,preferredVideoType].join('|'):'';
  const autoYoutubeVideoId=autoVideoMatch.key===videoSearchKey?autoVideoMatch.id:null;
  const videoSearchPending=Boolean(manualVideoSearchKey===recordingKey&&manualVideoSearchKey)||Boolean(hasSeparateAudioStream&&localTrack&&!isAdPlaying&&!activeYoutubeVideoId&&(autoVideoMatch.key!==videoSearchKey||autoVideoMatch.pending));

  // Find a background for the current recording; stale results never carry into another song.
  useEffect(() => {
    if (
      !localTrack ||
      isAdPlaying ||
      isAdvertisementTrack(localTrack) ||
      !hasSeparateAudioStream ||
      (localTrack.provider !== 'jiosaavn' && localTrack.provider !== 'external' && localTrack.provider !== 'local')
    ) {
      setAutoVideoMatch({key:videoSearchKey,id:null,pending:false});
      return;
    }
    const controller = new AbortController();
    setAutoVideoMatch({key:videoSearchKey,id:null,pending:true});
    const base = localStorage.getItem('lyricflow.resolver') || import.meta.env.VITE_MUSIC_RESOLVER || '';
    const query = `${localTrack.title} ${localTrack.artist} ${
      preferredVideoType === 'music' ? 'music video' : 'lyrics video'
    }`.trim();
    void searchStashCatalog(query, 'resolver', base, controller.signal)
      .then(songs => {
        if (controller.signal.aborted) return;
        const ranked = rankYouTubeBackgroundCandidates(songs, localTrack, preferredVideoType);
        const bestId = ranked.length > 0 ? extractYouTubeVideoId(ranked[0]) : null;
        setAutoVideoMatch({key:videoSearchKey,id:bestId||null,pending:false});
      })
      .catch(() => {if(!controller.signal.aborted)setAutoVideoMatch({key:videoSearchKey,id:null,pending:false});});
    return () => controller.abort();
  }, [
    localTrack?.title,
    localTrack?.artist,
    localTrack?.duration,
    localTrack?.provider,
    localTrack?.isAd,
    isAdPlaying,
    hasSeparateAudioStream,
    preferredVideoType,
  ]);

  // Android External Player: listen for notification media sessions & sync song metadata + playback position
  useEffect(() => {
    if (sourceMode !== 'external') return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void subscribeExternalMedia((media, granted) => {
      if (disposed) return;
      setNotificationAccessGranted(granted);
      setExternalMedia(media);
      if (media && media.title) {
        const adDetected = Boolean(media.isAd || isAdvertisementTrack(media));
        setLocalLoaded(true);
        setHasSeparateAudioStream(true);
        setLocalPlaying(Boolean(media.playing));
        if (typeof media.position === 'number' && Number.isFinite(media.position)) {
          setLocalTime(media.position);
          setVirtualMediaTime(media.position);
        }
        if (adDetected) {
          setAutoVideoMatch({key:'',id:null,pending:false});
          setIncoming(null);
        }
        setLocalTrack(prev => {
          const nextTitle = media.title.trim();
          const nextArtist = (media.artist || '').trim();
          const nextAlbum = (media.album || '').trim();
          const nextDur =
            media.duration && media.duration > 0 ? media.duration : prev?.duration ?? 0;
          const nextAudioSource = media.appName
            ? `External Player (${media.appName})`
            : 'External Player (Android)';
          if (
            prev &&
            prev.provider === 'external' &&
            prev.title === nextTitle &&
            prev.artist === nextArtist &&
            prev.album === nextAlbum &&
            Boolean(prev.isAd) === adDetected
          ) {
            if (nextDur && prev.duration !== nextDur) {
              return { ...prev, duration: nextDur, audioSource: nextAudioSource, isAd: adDetected };
            }
            return prev;
          }
          setFileEpoch(e => e + 1);
          setIncoming(null);
          setAvailableLyricEngines([]);
          setYoutubeSubtitleTracks([]);
          setSelectedSubtitleTrackId(undefined);
          return {
            title: nextTitle,
            artist: nextArtist,
            album: nextAlbum,
            duration: nextDur,
            source: 'provider',
            provider: 'external',
            audioSource: nextAudioSource,
            confidence: 1,
            isAd: adDetected,
          };
        });
      }
    }).then(fn => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [sourceMode]);

  // Android External Player: start/stop Mic or Internal Audio reactivity capture
  useEffect(() => {
    if (sourceMode !== 'external') {
      void stopExternalAudioCapture();
      setExternalAudioStatus('');
      return;
    }
    let cancelled = false;
    void startExternalAudioCapture(externalAudioMode).then(res => {
      if (!cancelled) setExternalAudioStatus(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceMode, externalAudioMode]);

  // Smoothly advance playback clock between notification ticks when External Player is playing
  useEffect(() => {
    if (sourceMode !== 'external' || !localPlaying) return;
    let lastTick = window.performance.now();
    const id = window.setInterval(() => {
      const now = window.performance.now();
      const dt = Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      setLocalTime(prev => {
        const maxDur = localTrack?.duration && localTrack.duration > 0 ? localTrack.duration : Infinity;
        const next = Math.min(maxDur, prev + dt);
        setVirtualMediaTime(next);
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [sourceMode, localPlaying, localTrack?.duration]);

  const stageYoutubeVideoId = isAdPlaying
    ? null
    : activeYoutubeVideoId ||
      (hasSeparateAudioStream &&
      (localTrack?.provider === 'jiosaavn' || localTrack?.provider === 'external' || localTrack?.provider === 'local')
        ? autoYoutubeVideoId
        : null);

  const effectiveYoutubeBackgroundMode: YouTubeBackgroundMode = isAdPlaying
    ? 'theme'
    : youtubeBackgroundMode;

  const isYtVideoBackgroundActive = Boolean(
    stageYoutubeVideoId && effectiveYoutubeBackgroundMode === 'video'
  );

  // Extract per-song Album Art colour palette so YouTube video backgrounds (and 'album' colour mode)
  // adapt vibrantly to each song instead of staying the same colour
  useEffect(() => {
    const songSeed = `${localTrack?.title || ''}|${localTrack?.artist || ''}|${stageYoutubeVideoId || ''}`;
    const artworkUrl =
      localTrack?.artwork ||
      (stageYoutubeVideoId ? `https://i.ytimg.com/vi/${stageYoutubeVideoId}/hqdefault.jpg` : undefined);
    setAlbumArtPalette(getDeterministicSongPalette(songSeed));
    let cancelled = false;
    void extractAlbumArtPalette(artworkUrl, songSeed).then(pal => {
      if (!cancelled) setAlbumArtPalette(pal);
    });
    return () => {
      cancelled = true;
    };
  }, [localTrack?.title, localTrack?.artist, localTrack?.artwork, stageYoutubeVideoId]);

  const useAlbumArtColors = Boolean(
    albumArtPalette &&
      (lyricColorMode === 'album' || (lyricColorMode === 'auto' && isYtVideoBackgroundActive))
  );
  const customLyricAccentHex = useAlbumArtColors
    ? albumArtPalette?.sungColor
    : lyricColorMode !== 'auto'
      ? LYRIC_COLOR_MAP[lyricColorMode].main
      : undefined;
  const customLyricBaseHex = useAlbumArtColors ? albumArtPalette?.baseColor : undefined;

  // Automatic Background YouTube Video Sync for JioSaavn & External Player:
  // 1. Download creator-uploaded (non-auto-generated) subtitles for stageYoutubeVideoId in background
  //    AND fetch SponsorBlock leading non-music segments.
  useEffect(() => {
    if (!hasSeparateAudioStream || !stageYoutubeVideoId || isAdPlaying) {
      setBgVideoSubtitles([]);
      setBgCaptionStatus('');
      setBgVideoSponsorOffsetSec(0);
      setAutoVideoDelaySeconds(0);
      setAutoVideoSyncStatus('');
      return;
    }
    const controller = new AbortController();
    setBgVideoSubtitles([]);
    setBgVideoSponsorOffsetSec(0);
    setBgCaptionStatus('Checking video subtitles for timing…');
    const captions=fetchYouTubeSubtitlesForTrack(stageYoutubeVideoId,controller.signal).then(result=>{
      if(!controller.signal.aborted)setBgCaptionStatus(result?`Video subtitles available: ${(result.subtitleTracks||[]).map(t=>t.label).join(', ')||result.source}`:'This video has no accessible subtitle track. Manual video delay is available.');
      return result;
    }).catch(error=>{
      if(!controller.signal.aborted)setBgCaptionStatus(error instanceof Error?error.message:'Video subtitles are unavailable. Manual video delay is available.');
      return null;
    });
    void Promise.all([
      captions,
      fetchSponsorBlockSegments(stageYoutubeVideoId, controller.signal).catch(() => []),
    ]).then(([subRes, sbSegments]) => {
      if (controller.signal.aborted) return;
      setBgVideoSubtitles(subRes?.subtitleTracks || []);
      setBgVideoSponsorOffsetSec(computeLeadingNonMusicOffset(Array.isArray(sbSegments) ? sbSegments : []));
    });
    return () => controller.abort();
  }, [hasSeparateAudioStream, stageYoutubeVideoId, isAdPlaying]);

  // 2. Match song's lyrics timestamps with background video's creator subtitles (only when language matches);
  //    otherwise cut leading non-music parts using SponsorBlock so video starts in sync with music!
  useEffect(() => {
    if (!hasSeparateAudioStream || !stageYoutubeVideoId || isAdPlaying) {
      setAutoVideoDelaySeconds(0);
      setAutoVideoSyncStatus('');
      return;
    }
    if (incoming?.original && bgVideoSubtitles.length > 0) {
      const subMatch = computeVideoDelayFromSubtitles(incoming.original, bgVideoSubtitles);
      if (subMatch.matched) {
        setAutoVideoDelaySeconds(subMatch.videoDelaySeconds);
        setAutoVideoSyncStatus(
          `Synced via creator YT subtitles (${subMatch.languageCode || 'same language'} · ${subMatch.anchorCount} anchors · ${subMatch.videoDelaySeconds > 0 ? '+' : ''}${subMatch.videoDelaySeconds}s)`
        );
        return;
      }
    }
    if (bgVideoSponsorOffsetSec > 0.25) {
      // Negative videoDelaySeconds jumps the video past the leading non-music intro at t=0
      const cutDelay = -Number(bgVideoSponsorOffsetSec.toFixed(2));
      setAutoVideoDelaySeconds(cutDelay);
      setAutoVideoSyncStatus(
        `Cut ${bgVideoSponsorOffsetSec.toFixed(1)}s leading non-music intro via SponsorBlock`
      );
    } else {
      setAutoVideoDelaySeconds(0);
      setAutoVideoSyncStatus('Direct start (0s offset · adjust manual video delay if needed)');
    }
  }, [
    hasSeparateAudioStream,
    stageYoutubeVideoId,
    isAdPlaying,
    incoming?.original,
    bgVideoSubtitles,
    bgVideoSponsorOffsetSec,
  ]);

  const hasManualVideoDelay =
    videoFix.correction?.videoDelaySeconds !== undefined ||
    songMapping.video?.delaySeconds !== undefined;
  const videoDelaySeconds = hasSeparateAudioStream
    ? videoFix.correction?.videoDelaySeconds ??
      songMapping.video?.delaySeconds ??
      autoVideoDelaySeconds
    : 0;

  const showStageVideoController = Boolean(
    !isAdPlaying &&
      (stageYoutubeVideoId ||
        (hasSeparateAudioStream &&
          (localTrack?.provider === 'jiosaavn' || localTrack?.provider === 'external' || localTrack?.provider === 'local')))
  );

  useEffect(() => {
    if (!localTrack || !lyricsKey) return;
    const sourceFile = { name: activeLyrics.name, url: activeLyrics.url, revision: lyricsKey };
    const candidateId = activeLyrics.url.match(/lrclib\.net\/api\/get\/(\d+)/)?.[1];
    const selection = lyricsFix.correction?.selection || (candidateId ? { engine: 'lrclib' as const, lrclibId: Number(candidateId), subtitleTrackId: null }
      : { engine: effectiveLyricsEngine, lrclibId: null, subtitleTrackId: effectiveSubtitleTrackId || null });
    songMapping.savePart('lyrics', { sourceFile, selection, delaySeconds: lyricDelay });
  }, [recordingKey, lyricsKey, activeLyrics.name, activeLyrics.url, effectiveLyricsEngine, effectiveSubtitleTrackId, lyricDelay]);
  useEffect(() => {
    if (localTrack && activeYoutubeVideoId && hasManualVideoDelay) {
      songMapping.savePart('video', { youtubeVideoId: activeYoutubeVideoId, delaySeconds: videoDelaySeconds });
    }
  }, [recordingKey, activeYoutubeVideoId, hasManualVideoDelay, videoDelaySeconds]);
  const activeBassThresholdPct = Math.round(computeBassThreshold(cameraShakeSensitivity) * 100);

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
            <small>VOXELWALL SOUNDSTAGE &amp; VOXELVERSE LYRICS</small>
          </div>
        </div>
        <div className="track">
          <i className="dot" /> {localTrack?.title || 'Untitled session'} <span>·</span>{' '}
          {localLoaded && localTrack
            ? `Source: ${localTrack.audioSource || (localTrack.source === 'provider' ? 'Online Player' : 'Local File')}`
            : demo
              ? 'Demo mode'
              : 'Idle'}{' '}
          <span>·</span>{' '}
          <small>Lyrics: {incoming?.source || 'LyricFlow Engine (YT Subtitles + Apple Word-Sync)'}</small>
        </div>
        <div className="header-right">
          <AppUpdateControl />
          <YouTubeAccountControl compact />
          <AccountControls user={user} syncStatus={syncStatus} onImportGuest={() => {
            try {
              remotePreferences.current = '';
              applyPreferences(loadLocalPreferences(null));
              if (uid) { importGuestCorrections(uid); importGuestCustomLyrics(uid); importGuestSongMappings(uid); }
              setSyncStatus('Guest settings and fixes imported into this account');
            } catch { setSyncStatus('Import could not finish · device storage is full or blocked'); }
          }} />
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
          cameraMode="Front"
          spatialTypography={spatialTypography}
          motionBlur={motionBlur}
          enabledScenes={enabledScenes}
          enabledKineticMotions={effectiveKineticMotions}
          enabledPlacements={enabledPlacements}
          enabledFonts={effectiveFonts}
          enabledCameraViews={['Front']}
          cameraShakeEnabled={cameraShakeEnabled}
          cameraShakeSensitivity={cameraShakeSensitivity}
          themePalettes={themePalettes}
          customLyricAccentColor={customLyricAccentHex}
          customLyricBaseColor={customLyricBaseHex}
          lyricFillPaceMode={lyricFillPaceMode}
          lyricMinFontSize={lyricMinFontSize}
          lyricMaxFontSize={lyricMaxFontSize}
          lyricPlacementMode={lyricPlacementMode}
          videoOverlayOpacity={videoOverlayOpacity}
          audioPaused={Boolean(localLoaded && !localPlaying)}
          youtubeVideoId={stageYoutubeVideoId}
          videoDelaySeconds={videoDelaySeconds}
          youtubeBackgroundMode={effectiveYoutubeBackgroundMode}
          hideStageLyrics={isAdPlaying}
          externalPlayer={sourceMode==='external'||localTrack?.provider==='external'}
          advertisementPlaying={isAdPlaying}
          videoSearchPending={videoSearchPending}
          playbackTime={localTime}
          hasSeparateAudioStream={hasSeparateAudioStream}
          playerVolume={playerVolume}
          onYoutubeTimeUpdate={(ct, dur) => playerRef.current?.syncExternalClock(ct, dur)}
          onYoutubeEnded={() => {
            playerRef.current?.playNextFromQueue();
          }}
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
                    ? `SOURCE · ${localTrack.audioSource.toUpperCase()}`
                    : 'AUDIO & VIDEO SOURCE'}
                </small>
                <b>
                  {sourceMode === 'online'
                    ? localTrack?.title || 'JioSaavn & YouTube Player'
                    : sourceMode === 'local'
                      ? localTrack?.title || 'Local Audio Upload'
                      : sourceMode === 'external'
                        ? localTrack?.title || 'External Player (Android)'
                        : 'Choose Source (JioSaavn / YouTube / Local / External)'}
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
                  <b>LYRICFLOW LIVE STUDIO</b>
                  <span>
                    {audioReadout.source} · {fps} FPS
                  </span>
                </div>

                <button className="cinema-source-action" onClick={() => setSourceOpen(true)}>
                  <Headphones size={17} /> Choose source (JioSaavn / YouTube / Local / External) <ChevronRight size={16} />
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

                {/* Section Filter Tabs in Cinema Mode */}
                <div className="cinema-tabs" role="tablist" aria-label="Cinema control sections">
                  {(
                    [
                      ['all', 'All'],
                      ['themes', 'Themes'],
                      ['lyrics', 'Lyrics'],
                      ['camera', 'Camera'],
                      ['engine', 'Engine'],
                    ] as const
                  ).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      type="button"
                      role="tab"
                      aria-selected={cinemaTab === tabId}
                      className={cinemaTab === tabId ? 'active' : ''}
                      onClick={() => setCinemaTab(tabId)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 1. THEMES, YOUTUBE VIDEO BACKGROUND & COLOUR PALETTES SECTION */}
                {(cinemaTab === 'all' || cinemaTab === 'themes') && (
                  <div className="cinema-section">
                    <div className="cinema-section-title">
                      <span>BACKGROUND &amp; COLOUR PALETTES</span>
                      <small>{enabledScenes.length}/{choices.length} ON</small>
                    </div>

                    {showStageVideoController && (
                      <div className="cinema-field">
                        <span>
                          Stage Background Mode:{' '}
                          <b>
                            {youtubeBackgroundMode === 'video'
                              ? 'YouTube Video (Themes Unloaded)'
                              : 'Built-in Themes'}
                          </b>
                        </span>
                        <input
                          aria-label="Cinema YouTube background slider"
                          type="range"
                          min="0"
                          max="1"
                          step="1"
                          value={youtubeBackgroundMode === 'video' ? 0 : 1}
                          onChange={e =>
                            setYoutubeBackgroundMode(
                              Number(e.target.value) === 0 ? 'video' : 'theme'
                            )
                          }
                        />
                        <div className="cinema-inline-actions">
                          <button
                            type="button"
                            className={youtubeBackgroundMode === 'video' ? 'active' : ''}
                            onClick={() => setYoutubeBackgroundMode('video')}
                          >
                            YouTube Video
                          </button>
                          <button
                            type="button"
                            className={youtubeBackgroundMode === 'theme' ? 'active' : ''}
                            onClick={() => setYoutubeBackgroundMode('theme')}
                          >
                            Built-in Themes
                          </button>
                        </div>
                      </div>
                    )}

                    {showStageVideoController && hasSeparateAudioStream && (
                      <div className="cinema-field">
                        <span>
                          YouTube Video Type:{' '}
                          <b>{preferredVideoType === 'music' ? 'Music Video' : 'Lyrical Video'}</b>
                        </span>
                        <div className="cinema-inline-actions">
                          <button
                            type="button"
                            className={preferredVideoType === 'music' ? 'active' : ''}
                            onClick={() => setPreferredVideoType('music')}
                          >
                            Music Video
                          </button>
                          <button
                            type="button"
                            className={preferredVideoType === 'lyrics' ? 'active' : ''}
                            onClick={() => setPreferredVideoType('lyrics')}
                          >
                            Lyrical Video
                          </button>
                        </div>
                      </div>
                    )}

                    {stageYoutubeVideoId && youtubeBackgroundMode === 'video' && (
                      <label className="cinema-range">
                        <span>
                          Video Black Overlay Opacity <b>{Math.round(videoOverlayOpacity * 100)}%</b>
                        </span>
                        <input
                          aria-label="Cinema video black overlay opacity"
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={Math.round(videoOverlayOpacity * 100)}
                          onChange={e => setVideoOverlayOpacity(Number(e.target.value) / 100)}
                        />
                      </label>
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
                        {choices.map(c => (
                          <option value={c.id} key={c.id}>
                            {c.label} ({c.family}) {enabledScenes.includes(c.id) ? '' : '[OFF]'}
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

                    <div className="cinema-field">
                      <span>
                        Colour Palette for <b>{activeTemplate.label}</b>:
                      </span>
                      <div className="cinema-palette-swatches">
                        {activeTemplate.palettes.map(pal => {
                          const isPalActive = activeScenePalette.id === pal.id;
                          return (
                            <button
                              key={pal.id}
                              type="button"
                              className={'cinema-palette-chip ' + (isPalActive ? 'active' : '')}
                              onClick={() => selectThemePalette(activeTemplate.id, pal.id)}
                            >
                              <span
                                className="cinema-palette-dot"
                                style={{
                                  background: `linear-gradient(135deg, ${pal.accent}, ${pal.background})`,
                                }}
                              />
                              {pal.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="cinema-check">
                      <input
                        type="checkbox"
                        checked={autoScenes}
                        onChange={e => setAutoScenes(e.target.checked)}
                      />{' '}
                      Auto-direct enabled scenes ({enabledScenes.length} active)
                    </label>

                    <div className="cinema-inline-actions">
                      <button
                        type="button"
                        onClick={() => toggleSceneEnabled(activeTemplate.id)}
                      >
                        {enabledScenes.includes(activeTemplate.id)
                          ? `Disable "${activeTemplate.label}"`
                          : `Enable "${activeTemplate.label}"`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
                      >
                        Enable All {choices.length}
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. LYRICS, COLOUR, FONT SIZE & VOXELVERSE STYLES SECTION */}
                {(cinemaTab === 'all' || cinemaTab === 'lyrics') && (
                  <div className="cinema-section">
                    <div className="cinema-section-title">
                      <span>LYRICS &amp; VOXELVERSE STYLES</span>
                      <small>{enabledKineticMotions.length}/{VOXELVERSE_STYLES.length} ON</small>
                    </div>

                    {availableLyricEngines.length > 0 && (
                      <label className="cinema-field">
                        <span>Available Lyrics Engine ({availableLyricEngines.length})</span>
                        <select
                          aria-label="Cinema lyrics engine option"
                          value={effectiveLyricsEngine}
                          onChange={e => selectEngine(e.target.value as LyricEngineOption)}
                        >
                          {LYRIC_ENGINE_OPTIONS.filter(opt =>
                            availableLyricEngines.includes(opt.id)
                          ).map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} ({opt.badge})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {youtubeSubtitleTracks.length > 1 && (
                      <label className="cinema-field">
                        <span>Subtitle Track ({youtubeSubtitleTracks.length})</span>
                        <select
                          aria-label="Cinema YouTube subtitle track"
                          value={effectiveSubtitleTrackId || youtubeSubtitleTracks[0]?.id || ''}
                          onChange={e => selectSubtitle(e.target.value)}
                        >
                          {youtubeSubtitleTracks.map(st => (
                            <option key={st.id} value={st.id}>
                              {st.label} ({st.lineCount} lines)
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="cinema-field">
                      <span>Stage Placement &amp; Line Entry Motion</span>
                      <select
                        aria-label="Cinema lyric stage placement"
                        value={lyricPlacementMode}
                        onChange={e => setLyricPlacementMode(e.target.value as LyricPlacementMode)}
                      >
                        {LYRIC_PLACEMENT_MODES.map(pm => (
                          <option key={pm.id} value={pm.id}>
                            {pm.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cinema-check">
                      <input
                        type="checkbox"
                        checked={spatialTypography}
                        onChange={e => setSpatialTypography(e.target.checked)}
                      />{' '}
                      VoxelVerse 3D Lyric Choreography
                    </label>

                    <label className="cinema-field">
                      <span>VoxelVerse Animation Style</span>
                      <select
                        aria-label="Cinema VoxelVerse lyric style"
                        value={
                          enabledKineticMotions.length === 1 ? enabledKineticMotions[0] : 'auto'
                        }
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'auto') {
                            setEnabledKineticMotions([...ALL_KINETIC_MOTIONS]);
                          } else {
                            setEnabledKineticMotions([val as LyricMotion]);
                          }
                        }}
                      >
                        <option value="auto">
                          Auto-Rotate Enabled Styles ({enabledKineticMotions.length} active)
                        </option>
                        {VOXELVERSE_STYLES.map(s => (
                          <option key={s.id} value={s.id}>
                            Lock to: {s.name} ({s.family} · {s.detail})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cinema-field">
                      <span>Lyric Script Display</span>
                      <select
                        aria-label="Cinema lyric display mode"
                        value={lyricDisplayMode}
                        onChange={e =>
                          setLyricDisplayMode(e.target.value as 'original' | 'romanized' | 'both')
                        }
                      >
                        <option value="both">Prefer Romanized + Original</option>
                        <option value="romanized">Romanized Only (Preferred)</option>
                        <option value="original">Original Script Only</option>
                      </select>
                    </label>

                    <label className="cinema-field">
                      <span>Lyric Active Fill Colour</span>
                      <select
                        aria-label="Cinema lyric color mode"
                        value={lyricColorMode}
                        onChange={e => setLyricColorMode(e.target.value as LyricColorMode)}
                      >
                        <option value="auto">Auto (Background Adaptive)</option>
                        {(
                          Object.entries(LYRIC_COLOR_MAP) as [
                            Exclude<LyricColorMode, 'auto'>,
                            { label: string }
                          ][]
                        ).map(([key, val]) => (
                          <option key={key} value={key}>
                            {val.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cinema-field">
                      <span>Word-Sync Fill Pace</span>
                      <select
                        aria-label="Cinema lyric fill pace"
                        value={lyricFillPaceMode}
                        onChange={e => setLyricFillPaceMode(e.target.value as LyricFillPaceMode)}
                      >
                        <option value="auto">Auto (Slow: Letter · Fast: Word)</option>
                        <option value="letter">Slow Mode (Letter by Letter)</option>
                        <option value="word">Fast Mode (Word by Word)</option>
                      </select>
                    </label>

                    <label className="cinema-range">
                      <span>
                        Lyric Min Font Size <b>{lyricMinFontSize}px</b>
                      </span>
                      <input
                        aria-label="Cinema lyric minimum font size"
                        type="range"
                        min="16"
                        max="72"
                        step="2"
                        value={lyricMinFontSize}
                        onChange={e => handleMinFontSizeChange(Number(e.target.value))}
                      />
                    </label>

                    <label className="cinema-range">
                      <span>
                        Lyric Max Font Size <b>{lyricMaxFontSize}px</b>
                      </span>
                      <input
                        aria-label="Cinema lyric maximum font size"
                        type="range"
                        min="32"
                        max="130"
                        step="2"
                        value={lyricMaxFontSize}
                        onChange={e => handleMaxFontSizeChange(Number(e.target.value))}
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
                  </div>
                )}

                {/* 3. CAMERA (FRONT VIEW) & SMOOTH BASS SHAKE SECTION */}
                {(cinemaTab === 'all' || cinemaTab === 'camera') && (
                  <div className="cinema-section">
                    <div className="cinema-section-title">
                      <span>FRONT CAMERA &amp; BASS SHAKE</span>
                      <small>BASS THRESHOLD ≥ {activeBassThresholdPct}%</small>
                    </div>

                    <label className="cinema-check">
                      <input
                        type="checkbox"
                        aria-label="Cinema camera shake toggle"
                        checked={cameraShakeEnabled}
                        onChange={e => setCameraShakeEnabled(e.target.checked)}
                      />{' '}
                      Smooth Bass-Driven Camera Shake ({cameraShakeEnabled ? 'ON' : 'OFF'})
                    </label>

                    <label className="cinema-range">
                      <span>
                        Bass Shake Sensitivity (Threshold ≥ {activeBassThresholdPct}%){' '}
                        <b>{cameraShakeEnabled ? cameraShakeSensitivity : 0}%</b>
                      </span>
                      <input
                        aria-label="Cinema camera shake sensitivity"
                        type="range"
                        min="0"
                        max="100"
                        disabled={!cameraShakeEnabled || reducedMotion}
                        value={cameraShakeSensitivity}
                        onChange={e => setCameraShakeSensitivity(Number(e.target.value))}
                      />
                    </label>
                  </div>
                )}

                {/* 4. VISUAL ENGINE & AUDIO REACTIVITY SECTION */}
                {(cinemaTab === 'all' || cinemaTab === 'engine') && (
                  <div className="cinema-section">
                    <div className="cinema-section-title">
                      <span>AUDIO &amp; VISUAL ENGINE</span>
                      <small>{quality.toUpperCase()}</small>
                    </div>

                    <label className="cinema-range">
                      <span>
                        Visual intensity <b>{intensity}%</b>
                      </span>
                      <input
                        aria-label="Cinema visual intensity"
                        type="range"
                        min="0"
                        max="100"
                        value={intensity}
                        onChange={e => setIntensity(Number(e.target.value))}
                      />
                    </label>

                    <label className="cinema-range">
                      <span>
                        Animation speed <b>{speed}%</b>
                      </span>
                      <input
                        aria-label="Cinema animation speed"
                        type="range"
                        min="10"
                        max="100"
                        value={speed}
                        onChange={e => setSpeed(Number(e.target.value))}
                      />
                    </label>

                    <label className="cinema-range">
                      <span>
                        Audio sensitivity <b>{sensitivity}%</b>
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

                    <div className="cinema-field">
                      <span>Rendering Quality</span>
                      <div className="cinema-inline-actions">
                        {(['High', 'Balanced', 'Performance'] as Quality[]).map(q => (
                          <button
                            key={q}
                            type="button"
                            className={quality === q ? 'active' : ''}
                            onClick={() => setQuality(q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="cinema-check">
                      <input
                        type="checkbox"
                        checked={reducedMotion}
                        onChange={e => setReducedMotion(e.target.checked)}
                      />{' '}
                      Reduced motion
                    </label>

                    <label className="cinema-check">
                      <input
                        type="checkbox"
                        checked={demo}
                        onChange={e => setDemo(e.target.checked)}
                      />{' '}
                      Demo mode (simulated energy when idle)
                    </label>
                  </div>
                )}

                <div className="cinema-drawer-foot">
                  <button onClick={() => setPaused(p => !p)}>
                    {paused ? <Play size={15} /> : <Pause size={15} />}{' '}
                    {paused ? 'Resume' : 'Pause'} visuals
                  </button>
                  <button onClick={fullscreen}>
                    <Expand size={14} /> Fullscreen
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
            <b>
              {stageYoutubeVideoId && youtubeBackgroundMode === 'video'
                ? 'YouTube Video Background'
                : `${liveScene} · ${activeScenePalette.name}`}
            </b>
            <small>
              {stageYoutubeVideoId && youtubeBackgroundMode === 'video'
                ? 'VoxelVerse Lyrics Engine Overlaid on Video'
                : `${enabledScenes.length}/${choices.length} Unique Themes · ${enabledKineticMotions.length}/${VOXELVERSE_STYLES.length} VoxelVerse Styles`}
            </small>
          </div>
        </div>
        <div className="stage-bottom">
          <span>
            <i className="dot" /> {renderStatus} · VOXELWALL &amp; VOXELVERSE
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
              Settings, enabled VoxelWall themes, colour palettes, smooth bass camera shake, lyric font size bounds, VoxelVerse lyric style toggles, and per-song lyric delays are
              automatically saved on your device.
            </p>
          </aside>
        )}
      </section>

      {/* YOUTUBE / JIOSAAVN / EXTERNAL PLAYER BACKGROUND & EMBEDDED LYRIC VIDEO CONTROLS */}
      {showStageVideoController && (
        <section
          className="local-player youtube-stage-options"
          aria-label="YouTube video background and lyric overlay controls"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '14px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 280px' }}>
            <span className="heading-icon">
              <Video size={17} />
            </span>
            <div>
              <b style={{ display: 'block', fontSize: '0.88rem', letterSpacing: '0.04em' }}>
                {localTrack?.provider === 'jiosaavn'
                  ? 'JIOSAAVN SOURCE · STAGE BACKGROUND & YOUTUBE VIDEO CONTROLLER'
                  : localTrack?.provider === 'external'
                    ? 'EXTERNAL PLAYER · STAGE BACKGROUND & YOUTUBE VIDEO CONTROLLER'
                    : 'YOUTUBE SOURCE · STAGE BACKGROUND & BLACK OVERLAY CONTROLLER'}
              </b>
              <small style={{ opacity: 0.8 }}>
                {youtubeBackgroundMode === 'video'
                  ? stageYoutubeVideoId
                    ? `Playing YouTube video background (Most Views · ${preferredVideoType === 'music' ? 'Music Video' : 'Lyrical Video'}) · ${Math.round(videoOverlayOpacity * 100)}% Black Overlay${hasSeparateAudioStream && autoVideoSyncStatus ? ` · ${autoVideoSyncStatus}` : ''}`
                    : 'Finding highest-viewed YouTube background video for this track…'
                  : 'Built-in VoxelWall themes loaded as background with VoxelVerse lyrics engine'}
              </small>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '18px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              <span>
                Background:{' '}
                <b>
                  {youtubeBackgroundMode === 'video' ? 'YouTube Video' : 'Built-in Themes'}
                </b>
              </span>
              <input
                aria-label="Use YouTube video or built-in themes as background"
                type="range"
                min="0"
                max="1"
                step="1"
                value={youtubeBackgroundMode === 'video' ? 0 : 1}
                onChange={e =>
                  setYoutubeBackgroundMode(Number(e.target.value) === 0 ? 'video' : 'theme')
                }
                style={{ width: '74px', accentColor: '#22d3ee', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.74rem', opacity: 0.75 }}>(0: Video · 1: Theme)</span>
            </label>

            {hasSeparateAudioStream && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <span>Video Type:</span>
                <select
                  aria-label="Stage preferred YouTube video type"
                  value={preferredVideoType}
                  onChange={e => setPreferredVideoType(e.target.value as 'music' | 'lyrics')}
                  style={{
                    background: '#121e2c',
                    color: '#eef4ff',
                    border: '1px solid #52647a',
                    borderRadius: 7,
                    padding: '5px 9px',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="music">Music video (Most Views)</option>
                  <option value="lyrics">Lyrical video (Most Views)</option>
                </select>
              </label>
            )}

            {youtubeBackgroundMode === 'video' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <span>
                  Black Overlay Opacity:{' '}
                  <b>{Math.round(videoOverlayOpacity * 100)}%</b>
                </span>
                <input
                  aria-label="Adjust black overlay opacity between lyrics and video"
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={Math.round(videoOverlayOpacity * 100)}
                  onChange={e => setVideoOverlayOpacity(Number(e.target.value) / 100)}
                  style={{ width: '96px', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </label>
            )}


          </div>
        </section>
      )}

      {/* 2. PLAYER DETAILS -> 3. SONG DETAILS -> 3B. QUEUE (Q) -> 4. TIMEBAR */}
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
        lyricEngineOption={effectiveLyricsEngine}
        onLyricEngineOptionChange={selectEngine}
        availableLyricEngines={availableLyricEngines}
        youtubeSubtitleTracks={youtubeSubtitleTracks}
        selectedSubtitleTrackId={effectiveSubtitleTrackId}
        onSelectSubtitleTrackId={selectSubtitle}
        sponsorBlockEnabled={sponsorBlockEnabled}
        onSponsorBlockEnabledChange={setSponsorBlockEnabled}
        onSponsorBlockOffsetChange={setLeadingNonMusicOffsetSec}
        onAudioStreamModeChange={setHasSeparateAudioStream}
        preferredVolume={playerVolume}
        onVolumeChange={setPlayerVolume}
        onActiveChange={playing => {
          setLocalPlaying(playing);
          if (playing) audioHubRef.current?.stop();
        }}
        onTimeChange={setLocalTime}
        onFileChange={loaded => {
          setLocalLoaded(loaded);
          setFileEpoch(e => e + 1);
          setIncoming(null);
          setAvailableLyricEngines([]);
          setYoutubeSubtitleTracks([]);
          setSelectedSubtitleTrackId(undefined);
        }}
        onTrackChange={track => {
          if(track)setSourceMode(track.provider==='local'?'local':'online');
          setLocalTrack(track);
          setIncoming(null);
          setAvailableLyricEngines([]);
          setYoutubeSubtitleTracks([]);
          setSelectedSubtitleTrackId(undefined);
        }}
        onDurationChange={duration =>
          setLocalTrack(p => (p ? { ...p, duration } : p))
        }
      />

      {/* 5. MULTI-ENGINE LYRICS RESOLVER (LYRICFLOW HYBRID / APPLE / LRC / YOUTUBE SUBTITLES) & CUSTOM EDIT */}
      {isAdPlaying && (
        <section className="local-player" role="status" aria-label="Advertisement active">
          <strong>Advertisement playing · Built-in Themes active</strong>
          <p>
            Lyrics and YouTube background video searches are paused while an advertisement is playing in your external player.
          </p>
        </section>
      )}
      {localTrack && hasSeparateAudioStream && !isAdPlaying && (
        <YouTubeBackgroundPicker
          key={'video-picker-' + recordingKey}
          track={localTrack}
          activeVideoId={activeYoutubeVideoId}
          preference={preferredVideoType}
          onPreferenceChange={setPreferredVideoType}
          backgroundMode={youtubeBackgroundMode}
          onBackgroundModeChange={setYoutubeBackgroundMode}
          captionStatus={bgCaptionStatus}
          onSearchingChange={searching=>setManualVideoSearchKey(searching?recordingKey:'')}
          onChoose={id => {
            videoFix.save({
              youtubeVideoId: id,
              videoDelaySeconds: id === activeYoutubeVideoId ? videoDelaySeconds : 0,
            });
            setYoutubeBackgroundMode('video');
          }}
        />
      )}
      <CorrectionControls key={'corrections-' + recordingKey} user={user} track={localTrack} delay={{ ...delayFix, reset: () => { songMapping.savePart('lyrics', null); delayFix.reset(); } }} lyrics={{ ...lyricsFix, reset: () => { songMapping.savePart('lyrics', null); lyricsFix.reset(); } }} video={{ ...videoFix, reset: () => { songMapping.savePart('video', null); videoFix.reset(); } }}
        mappedLyrics={songMapping.lyrics} mappedVideo={songMapping.video} canChangeVideo={hasSeparateAudioStream} onVideoChange={(id, videoDelaySeconds) => videoFix.save({ youtubeVideoId: id, videoDelaySeconds })} />
      {songMapping.error && <p role="status">{songMapping.error}</p>}
      {privateLyrics.error && <p role="status">{privateLyrics.error}</p>}
      {!isAdPlaying&&<TrackFinder
        key={'finder-' + fileEpoch}
        track={localTrack}
        preferredSelection={lyricsFix.correction?.selection || songMapping.lyrics?.selection || null}
        preferredSourceFile={lyricsFix.source === 'personal' ? null : songMapping.lyrics?.sourceFile || null}
        onSelectionChange={selectLyrics}
        savedCustomLrc={savedCustomLrc}
        customEditOpen={customEditOpen}
        lyricEngineOption={effectiveLyricsEngine}
        onLyricEngineOptionChange={setLyricEngineOption}
        selectedSubtitleTrackId={effectiveSubtitleTrackId}
        onSelectSubtitleTrackId={selectSubtitle}
        onAvailableLyricEnginesChange={setAvailableLyricEngines}
        onSubtitleTracksChange={setYoutubeSubtitleTracks}
        leadingNonMusicOffsetSec={leadingNonMusicOffsetSec}
        onMetadataChange={value => {
          setLocalTrack(value);
          saveTrackCorrection(value);
        }}
        onLyricsFound={acceptLyrics}
        onStatusChange={setLyricStatusMessage}
      />}

      <ManualLyrics
        key={'editor-' + (recordingKey || fileEpoch)}
        onLyricContentChange={onLyricContentChange}
        time={localTime}
        trackLoaded={localLoaded}
        isPlaying={!localLoaded || localPlaying}
        track={localTrack}
        incoming={incoming}
        delay={lyricDelay}
        onDelayChange={updateLyricDelay}
        customEditOpen={customEditOpen}
        onToggleCustomEdit={() => setCustomEditOpen(v => !v)}
        onSaveCustomOverride={handleSaveCustomOverride}
        enabledScenes={enabledScenes}
        activeSceneId={scene}
        themePalettes={themePalettes}
        lyricColorMode={lyricColorMode}
        onLyricColorModeChange={setLyricColorMode}
        albumArtPalette={albumArtPalette}
        isVideoBackground={isYtVideoBackgroundActive}
        lyricFillPaceMode={lyricFillPaceMode}
        onLyricFillPaceModeChange={setLyricFillPaceMode}
        displayMode={lyricDisplayMode}
        onDisplayModeChange={setLyricDisplayMode}
        minFontSize={lyricMinFontSize}
        maxFontSize={lyricMaxFontSize}
        onMinFontSizeChange={handleMinFontSizeChange}
        onMaxFontSizeChange={handleMaxFontSizeChange}
        bpm={audioReadout.bpm}
      />

      {/* 6. VOXELVERSE LYRIC STYLES, SPATIAL PLACEMENTS, FONTS & VOXELWALL BACKGROUND CUSTOMIZER */}
      <section className="control-panel" aria-label="VoxelWall themes and VoxelVerse lyric animation toggles">
        <div className="control-heading">
          <div className="heading-left">
            <span className="heading-icon">
              <Sparkles size={16} />
            </span>
            <div>
              <b>
                VOXELVERSE LYRIC ANIMATION STYLES (
                {autoKineticMotion
                  ? `AUTO · ${enabledKineticMotions.length}/${VOXELVERSE_STYLES.length} ENABLED`
                  : `SINGLE · ${manualKineticMotion.toUpperCase()}`}
                )
              </b>
              <small>
                Click any card to preview that single animation style, or toggle ON/OFF to include multiple styles in Auto rotation
              </small>
            </div>
          </div>
          <div className="toggle-batch-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="auto-scenes" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={autoKineticMotion}
                onChange={e => setAutoKineticMotion(e.target.checked)}
              />{' '}
              Auto-rotate enabled styles ({enabledKineticMotions.length})
            </label>
            <button
              type="button"
              className="upload-button"
              onClick={() => {
                setEnabledKineticMotions([...ALL_KINETIC_MOTIONS]);
                setAutoKineticMotion(true);
              }}
            >
              Enable All 19 Styles
            </button>
          </div>
        </div>

        <div className="scene-filter" aria-label="VoxelVerse style families">
          <button
            type="button"
            aria-pressed={verseFamilyFilter === 'all'}
            onClick={() => setVerseFamilyFilter('all')}
          >
            All 19
          </button>
          <button
            type="button"
            aria-pressed={verseFamilyFilter === 'featured'}
            onClick={() => setVerseFamilyFilter('featured')}
          >
            Featured · {VOXELVERSE_STYLES.filter(s => s.featured).length}
          </button>
          {VOXELVERSE_FAMILIES.map(fam => (
            <button
              key={fam.id}
              type="button"
              aria-pressed={verseFamilyFilter === fam.id}
              onClick={() => setVerseFamilyFilter(fam.id)}
            >
              {fam.name} · {fam.count}
            </button>
          ))}
        </div>

        <div className="kinetic-motion-grid">
          {filteredVerseStyles.map(style => {
            const isEnabled = enabledKineticMotions.includes(style.id);
            const isSelectedSingle = !autoKineticMotion && manualKineticMotion === style.id;
            return (
              <div
                key={style.id}
                className={
                  'kinetic-motion-card ' +
                  (isEnabled ? 'enabled ' : 'disabled ') +
                  (isSelectedSingle ? 'selected' : '')
                }
                style={{
                  cursor: 'pointer',
                  outline: isSelectedSingle ? '2px solid #38bdf8' : undefined,
                  background: isSelectedSingle ? 'rgba(56,189,248,0.14)' : undefined,
                }}
                onClick={() => {
                  setManualKineticMotion(style.id);
                  setAutoKineticMotion(false);
                }}
              >
                <div className="kinetic-motion-top">
                  <strong>
                    {style.name.toUpperCase()}
                    {isSelectedSingle ? ' · ACTIVE' : ''}
                  </strong>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`Toggle ${style.name} VoxelVerse lyric animation`}
                    className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                    onClick={e => {
                      e.stopPropagation();
                      toggleKineticMotionEnabled(style.id);
                    }}
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
                <small>{style.family.toUpperCase()} · {style.detail}</small>
              </div>
            );
          })}
        </div>

        {/* Spatial Stage Placement Selector (Single View + Multi-Select Auto) */}
        <div
          style={{
            marginTop: 18,
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#f8fafc' }}>
                LYRIC STAGE PLACEMENT (
                {lyricPlacementMode === 'auto'
                  ? `AUTO · ${enabledPlacements.length}/${ALL_PLACEMENT_MODES.length} ENABLED`
                  : `SINGLE · ${lyricPlacementMode.toUpperCase()}`}
                )
              </div>
              <small style={{ fontSize: 11, color: '#94a3b8' }}>
                Click any placement card to view that single placement, or toggle ON/OFF to include multiple placements in Auto rotation
              </small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={lyricPlacementMode === 'auto'}
                  onChange={e =>
                    setLyricPlacementMode(
                      e.target.checked ? 'auto' : enabledPlacements[0] || 'center'
                    )
                  }
                />
                Auto-rotate enabled placements ({enabledPlacements.length})
              </label>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  setEnabledPlacements([...ALL_PLACEMENT_MODES]);
                  setLyricPlacementMode('auto');
                }}
              >
                Enable All Placements
              </button>
            </div>
          </div>

          <div className="kinetic-motion-grid">
            {LYRIC_PLACEMENT_MODES.filter(pm => pm.id !== 'auto').map(pm => {
              const pid = pm.id as Exclude<LyricPlacementMode, 'auto'>;
              const isEnabled = enabledPlacements.includes(pid);
              const isSelectedSingle = lyricPlacementMode === pid;
              return (
                <div
                  key={pm.id}
                  className={
                    'kinetic-motion-card ' +
                    (isEnabled ? 'enabled ' : 'disabled ') +
                    (isSelectedSingle ? 'selected' : '')
                  }
                  style={{
                    cursor: 'pointer',
                    outline: isSelectedSingle ? '2px solid #38bdf8' : undefined,
                    background: isSelectedSingle ? 'rgba(56,189,248,0.14)' : undefined,
                  }}
                  onClick={() => setLyricPlacementMode(pid)}
                >
                  <div className="kinetic-motion-top">
                    <strong>
                      {pm.label}
                      {isSelectedSingle ? ' · ACTIVE' : ''}
                    </strong>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Toggle ${pm.label} placement`}
                      className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                      onClick={e => {
                        e.stopPropagation();
                        togglePlacementEnabled(pid);
                      }}
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
                  <small>{pm.detail}</small>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lyric Fonts Selector (Single View + Multi-Select Auto) */}
        <div
          style={{
            marginTop: 14,
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#f8fafc' }}>
                LYRIC TYPOGRAPHY FONTS (
                {autoFonts
                  ? `AUTO · ${enabledFonts.length}/${FONT_SHOWCASE.length} ENABLED`
                  : `SINGLE · ${manualFont.toUpperCase()} (${fontLabel(manualFont)})`}
                )
              </div>
              <small style={{ fontSize: 11, color: '#94a3b8' }}>
                Click any font card to preview that single font, or toggle ON/OFF to include multiple fonts in Auto rotation
              </small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoFonts}
                  onChange={e => setAutoFonts(e.target.checked)}
                />
                Auto-rotate enabled fonts ({enabledFonts.length})
              </label>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  setEnabledFonts([...ALL_FONT_PACKS]);
                  setAutoFonts(true);
                }}
              >
                Enable All {FONT_SHOWCASE.length} Fonts
              </button>
            </div>
          </div>

          <div className="kinetic-motion-grid">
            {FONT_SHOWCASE.map(fontId => {
              const isEnabled = enabledFonts.includes(fontId);
              const isSelectedSingle = !autoFonts && manualFont === fontId;
              return (
                <div
                  key={fontId}
                  className={
                    'kinetic-motion-card ' +
                    (isEnabled ? 'enabled ' : 'disabled ') +
                    (isSelectedSingle ? 'selected' : '')
                  }
                  style={{
                    cursor: 'pointer',
                    outline: isSelectedSingle ? '2px solid #38bdf8' : undefined,
                    background: isSelectedSingle ? 'rgba(56,189,248,0.14)' : undefined,
                  }}
                  onClick={() => {
                    setManualFont(fontId);
                    setAutoFonts(false);
                  }}
                >
                  <div className="kinetic-motion-top">
                    <strong style={{ fontFamily: fontLabel(fontId) }}>
                      {fontId.toUpperCase()}
                      {isSelectedSingle ? ' · ACTIVE' : ''}
                    </strong>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Toggle ${fontId} font`}
                      className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                      onClick={e => {
                        e.stopPropagation();
                        toggleFontEnabled(fontId);
                      }}
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
                  <small style={{ fontFamily: fontLabel(fontId) }}>{fontLabel(fontId)}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="control-heading" style={{ marginTop: 28 }}>
          <div className="heading-left">
            <span className="heading-icon">
              <Waves size={16} />
            </span>
            <div>
              <b>VOXELWALL MUSIC-REACTIVE BACKGROUNDS ({enabledScenes.length}/{choices.length} ENABLED)</b>
              <small>
                {choices.length} unique VoxelWall 2D designs across 7 categories — each theme includes multiple selectable colour palettes (no duplicate theme designs)
              </small>
            </div>
          </div>
          <div className="toggle-batch-actions">
            <button
              type="button"
              className="upload-button"
              onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
            >
              Enable All {choices.length} Themes
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
            VoxelVerse lyric choreography{' '}
            <small>({enabledKineticMotions.length} active styles)</small>
          </label>
        </div>

        <div className="camera-views-panel" aria-label="Front camera and smooth bass-reactive camera shake controls">
          <div className="camera-shake-bar" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            <div className="camera-shake-toggle-group">
              <button
                type="button"
                role="switch"
                aria-checked={cameraShakeEnabled}
                aria-label="Toggle camera shake"
                className={'theme-toggle-pill ' + (cameraShakeEnabled ? 'on' : 'off')}
                onClick={() => setCameraShakeEnabled(prev => !prev)}
              >
                {cameraShakeEnabled ? (
                  <>
                    <Check size={12} /> SHAKE ON
                  </>
                ) : (
                  'SHAKE OFF'
                )}
              </button>
              <div>
                <b>FRONT CAMERA · SMOOTH BASS-THRESHOLD CAMERA SHAKE</b>
                <small>
                  {cameraShakeEnabled
                    ? `Sensitivity ${cameraShakeSensitivity}% sets bass trigger threshold ≥ ${activeBassThresholdPct}% — smooth damped shake reacts strictly to bass`
                    : 'Camera shake disabled — steady centered Front stage framing'}
                </small>
              </div>
            </div>
            <label className="camera-shake-slider">
              <span>
                Bass threshold sensitivity <b>{cameraShakeEnabled ? cameraShakeSensitivity : 0}%</b>
              </span>
              <input
                aria-label="Camera shake sensitivity"
                type="range"
                min="0"
                max="100"
                disabled={!cameraShakeEnabled || reducedMotion}
                value={cameraShakeSensitivity}
                onChange={e => setCameraShakeSensitivity(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className="scene-filter" aria-label="VoxelWall scene categories">
          <button
            type="button"
            aria-pressed={sceneFilter === 'all'}
            onClick={() => setSceneFilter('all')}
          >
            All {choices.length}
          </button>
          {VOXELWALL_CATEGORIES.map(cat => {
            const count = choices.filter(c => c.family === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={sceneFilter === cat.id}
                onClick={() => setSceneFilter(cat.id)}
              >
                {cat.label} · {count}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={sceneFilter === 'enabled'}
            onClick={() => setSceneFilter('enabled')}
          >
            Enabled ({enabledScenes.length})
          </button>
        </div>

        <div className="scene-grid cinematic-grid">
          {choices
            .filter(item => {
              if (sceneFilter === 'enabled') return enabledScenes.includes(item.id);
              if (sceneFilter === 'all') return true;
              return item.family === sceneFilter;
            })
            .map((item, i) => {
              const isEnabled = enabledScenes.includes(item.id);
              const isSignature = SIGNATURE_VOXELWALL_IDS.includes(item.id);
              const activePalette = resolveThemePalette(item.id, themePalettes[item.id]);
              return (
                <div
                  className={
                    'scene-card cinematic-scene-card ' +
                    (isSignature ? 'premiere-scene ' : '') +
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
                      background: `linear-gradient(135deg, ${activePalette.accent}, ${activePalette.background} 75%)`,
                      color: activePalette.foreground,
                      fontFamily: fontLabel(item.font),
                    }}
                  >
                    <span className="scene-preview-initials">
                      {item.label.slice(0, 2).toUpperCase()}
                    </span>
                    {isSignature && <span className="premiere-tag">VOXELWALL</span>}
                  </span>
                  <span className="scene-copy">
                    <b>{item.label}</b>
                    <small>
                      {item.id === 'signal-chamber'
                        ? '64-band chamber · ' + fontLabel(item.font)
                        : item.id === 'color-riot'
                          ? 'Kinetic geometry · ' + fontLabel(item.font)
                          : item.family + ' · ' + fontLabel(item.font)}
                    </small>
                    <div
                      className="theme-palette-bar"
                      onClick={e => e.stopPropagation()}
                      role="group"
                      aria-label={`${item.label} colour palettes`}
                    >
                      {item.palettes.map(pal => {
                        const isSelectedPal = activePalette.id === pal.id;
                        return (
                          <button
                            key={pal.id}
                            type="button"
                            title={`${pal.name} palette`}
                            aria-label={`${item.label} ${pal.name} palette`}
                            aria-pressed={isSelectedPal}
                            className={'palette-swatch-btn ' + (isSelectedPal ? 'active' : '')}
                            style={{
                              background: `linear-gradient(135deg, ${pal.accent} 45%, ${pal.background} 55%)`,
                            }}
                            onClick={() => {
                              selectThemePalette(item.id, pal.id);
                              setScene(item.id);
                              setAutoScenes(false);
                            }}
                          />
                        );
                      })}
                      <span className="palette-active-name">{activePalette.name}</span>
                    </div>
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
          <span
            className={
              'signal-mode ' +
              (audioReadout.source === 'LOCAL AUDIO' ||
              audioReadout.source === 'INTERNAL AUDIO' ||
              audioReadout.source === 'MICROPHONE'
                ? 'connected'
                : '')
            }
          >
            {audioReadout.source === 'LOCAL AUDIO'
              ? localTrack?.source === 'provider'
                ? '● Online Stream Active'
                : '● Local Audio Active'
              : audioReadout.source === 'INTERNAL AUDIO'
                ? '● Android Internal Audio Active'
                : audioReadout.source === 'MICROPHONE'
                  ? '● Microphone Reactivity Active'
                  : audioReadout.source === 'YOUTUBE VIDEO'
                    ? '● YouTube Video Active'
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
        onSelectMode={mode => {
          if(mode==='external'&&sourceMode!=='external'){playerRef.current?.stop();setHasSeparateAudioStream(true);}
          if(mode==='external'||!localTrack)setSourceMode(mode);
        }}
        onPickLocal={() => playerRef.current?.chooseFile()}
        onPlaySong={async song => {
          setSourceMode('online');
          await playerRef.current?.loadRemote(song);
        }}
        onAddToQueue={song => {
          setSourceMode('online');
          playerRef.current?.addToQueue(song);
        }}
        youtubeBackgroundMode={youtubeBackgroundMode}
        onYoutubeBackgroundModeChange={setYoutubeBackgroundMode}
        preferredVideoType={preferredVideoType}
        onPreferredVideoTypeChange={setPreferredVideoType}
        externalAudioMode={externalAudioMode}
        onExternalAudioModeChange={setExternalAudioMode}
        externalMedia={externalMedia}
        notificationAccessGranted={notificationAccessGranted}
        onRequestNotificationAccess={() => void openExternalNotificationSettings()}
        onRefreshExternalMedia={() => {
          void getCurrentExternalMedia().then(res => {
            setNotificationAccessGranted(res.granted);
            if (res.media) setExternalMedia(res.media);
          });
        }}
        externalAudioStatus={externalAudioStatus}
      />

      <footer>
        LYRICFLOW <span>·</span> VOXELWALL BACKGROUNDS &amp; VOXELVERSE LYRICS <span>·</span>{' '}
        {enabledScenes.length}/{choices.length} UNIQUE THEMES · {enabledKineticMotions.length}/{VOXELVERSE_STYLES.length} STYLES ACTIVE <aside>JIOSAAVN &amp; YOUTUBE SOUNDSTAGE</aside>
      </footer>
    </div>
  );
}