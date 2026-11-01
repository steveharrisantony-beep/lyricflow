import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import CinematicStage, {
  type Quality,
  type YouTubeBackgroundMode,
  type VideoFitMode,
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
  type LyricEngineOption,
  type YouTubeSubtitleTrackItem,
} from './lyrics/lyricFlowEngine';
import {useVideoAutoSync} from './music/useVideoAutoSync';
import {
  extractAlbumArtPalette,
  getDeterministicSongPalette,
  type AlbumArtLyricPalette,
} from './visualization/cinematic/contrast';
import { computeBassThreshold } from './visualization/cinematic/cameraRig';
import { FONT_SHOWCASE, fontLabel, preloadLyricFonts } from './visualization/cinematic/fonts';
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
import type {SongResult} from './music/providers';
import { findYouTubeBackgrounds } from './music/backgroundVideos';
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
  isLyricVideoTrack,
  type TrackInfo,
} from './metadata/trackInfo';
import {
  SUPPORTED_ROMANIZATION_LANGUAGES,
  getRomanizationMasterEnabled,
  setRomanizationMasterEnabled,
  getEnabledRomanizationLanguages,
  setEnabledRomanizationLanguages as persistEnabledRomanizationLanguages,
  type RomanizationLanguageCode,
} from './romanization/romanize';
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
  Expand,
  Pause,
  Play,
  Waves,
  SlidersHorizontal,
  Headphones,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  LogOut,
  Check,
  Sparkles,
  Video,
  Sun,
  Moon,
  Monitor,
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

type CinemaDrawerTab = 'all' | 'themes' | 'lyrics' | 'camera' | 'engine';
type ThemeMode = 'system' | 'dark' | 'light';
type SettingsSectionId =
  | 'appearance'
  | 'video-bg'
  | 'lyrics-search'
  | 'lyrics-style'
  | 'placement'
  | 'animations'
  | 'themes'
  | 'audio-engine';

const ALL_SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = [
  'appearance',
  'video-bg',
  'lyrics-search',
  'lyrics-style',
  'placement',
  'animations',
  'themes',
  'audio-engine',
];

export default function App({ user = null }: { user?: User | null }) {
  const uid = user?.uid || null;
  const [initialPrefs] = useState(() => loadLocalPreferences(uid));
  const [syncStatus, setSyncStatus] = useState(user ? 'Connecting account sync…' : 'Guest · saved on this device');
  const [cloudReady, setCloudReady] = useState(!user);
  const remotePreferences = useRef('');

  // Audio source selection state (remember last used source)
  const [sourceMode, setSourceModeState] = useState<AudioSourceMode | null>(() => {
    try {
      const saved = localStorage.getItem('lyricflow.lastSourceMode');
      if (saved === 'online' || saved === 'local' || saved === 'external') return saved;
    } catch {}
    return null;
  });
  const setSourceMode = useCallback((mode: AudioSourceMode | null) => {
    setSourceModeState(mode);
    if (mode) {
      try {
        localStorage.setItem('lyricflow.lastSourceMode', mode);
      } catch {}
    }
  }, []);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Extended settings persisted on device
  const [initialExtended] = useState(() => {
    try {
      const raw = localStorage.getItem('lyricflow.extendedSettings.v1');
      if (raw) return JSON.parse(raw) as Record<string, unknown>;
    } catch {}
    return {};
  });

  // Theme Mode: Dark, Light, or Follow System
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = initialExtended.themeMode;
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system';
  });
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches;
    }
    return false;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
    setSystemPrefersLight(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    return undefined;
  }, []);
  const resolvedTheme: 'dark' | 'light' =
    themeMode === 'system' ? (systemPrefersLight ? 'light' : 'dark') : themeMode;
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    }
  }, [resolvedTheme]);

  // Collapsible Settings Accordion Sections (closed by default, open only when clicked)
  const [openSections, setOpenSections] = useState<SettingsSectionId[]>([]);
  const toggleSettingsSection = useCallback((id: SettingsSectionId) => {
    setOpenSections(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  }, []);
  const settingsSidebarRef = useRef<HTMLElement>(null);

  // Android External Player & Auto-matched YouTube Video state
  const [autoVideoMatch,setAutoVideoMatch]=useState<{key:string;id:string|null;pending:boolean;videos:SongResult[];candidateCount:number}>({key:'',id:null,pending:false,videos:[],candidateCount:0});
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
  // Two separate placement sets: Video Background (default 'bottom-right' / Right Bottom) vs Built-in Themes (default 'center' / Centre Stage)
  const [videoPlacementMode, setVideoPlacementMode] = useState<LyricPlacementMode>(() => {
    const v = initialExtended.videoPlacementMode;
    return typeof v === 'string' && LYRIC_PLACEMENT_MODES.some(pm => pm.id === v)
      ? (v as LyricPlacementMode)
      : 'bottom-right';
  });
  const [enabledVideoPlacements, setEnabledVideoPlacements] = useState<Exclude<LyricPlacementMode, 'auto'>[]>(() => {
    const arr = initialExtended.enabledVideoPlacements;
    if (Array.isArray(arr)) {
      const valid = arr.filter((p): p is Exclude<LyricPlacementMode, 'auto'> =>
        ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, 'auto'>)
      );
      if (valid.length > 0) return valid;
    }
    return [...ALL_PLACEMENT_MODES];
  });
  const [themePlacementMode, setThemePlacementMode] = useState<LyricPlacementMode>(() => {
    const v = initialExtended.themePlacementMode;
    return typeof v === 'string' && LYRIC_PLACEMENT_MODES.some(pm => pm.id === v)
      ? (v as LyricPlacementMode)
      : 'center';
  });
  const [enabledThemePlacements, setEnabledThemePlacements] = useState<Exclude<LyricPlacementMode, 'auto'>[]>(() => {
    const arr = initialExtended.enabledThemePlacements;
    if (Array.isArray(arr)) {
      const valid = arr.filter((p): p is Exclude<LyricPlacementMode, 'auto'> =>
        ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, 'auto'>)
      );
      if (valid.length > 0) return valid;
    }
    return [...ALL_PLACEMENT_MODES];
  });
  // Theme Director duration (in lines of lyrics and seconds for songs without lyrics) & auto-randomize colour palettes
  const [themeDurationLines, setThemeDurationLines] = useState<number>(() => {
    const n = Number(initialExtended.themeDurationLines);
    return Number.isFinite(n) && n >= 1 && n <= 16 ? Math.round(n) : 2;
  });
  const [themeDurationSeconds, setThemeDurationSeconds] = useState<number>(() => {
    const n = Number(initialExtended.themeDurationSeconds);
    return Number.isFinite(n) && n >= 4 && n <= 60 ? Math.round(n) : 12;
  });
  const [autoRandomizeThemePalettes, setAutoRandomizeThemePalettes] = useState<boolean>(() =>
    typeof initialExtended.autoRandomizeThemePalettes === 'boolean'
      ? initialExtended.autoRandomizeThemePalettes
      : true
  );
  // Romanization master toggle & supported languages
  const [romanizationEnabled, setRomanizationEnabledState] = useState<boolean>(() =>
    getRomanizationMasterEnabled()
  );
  const [enabledRomanizationLanguages, setEnabledRomanizationLanguagesState] = useState<RomanizationLanguageCode[]>(
    () => getEnabledRomanizationLanguages()
  );
  const setRomanizationEnabled = useCallback((next: boolean) => {
    setRomanizationMasterEnabled(next);
    setRomanizationEnabledState(next);
  }, []);
  const setEnabledRomanizationLanguages = useCallback((langs: RomanizationLanguageCode[]) => {
    persistEnabledRomanizationLanguages(langs);
    setEnabledRomanizationLanguagesState(langs);
  }, []);

  const [autoFonts, setAutoFonts] = useState<boolean>(initialPrefs.autoFonts ?? true);
  const [manualFont, setManualFont] = useState<FontPack>(initialPrefs.manualFont || 'impact');
  const [enabledFonts, setEnabledFonts] = useState<FontPack[]>(initialPrefs.enabledFonts || [...ALL_FONT_PACKS]);
  const [cameraShakeEnabled, setCameraShakeEnabled] = useState<boolean>(initialPrefs.cameraShakeEnabled);
  const [cameraShakeSensitivity, setCameraShakeSensitivity] = useState<number>(initialPrefs.cameraShakeSensitivity);
  const [lyricMinFontSize, setLyricMinFontSize] = useState<number>(initialPrefs.lyricMinFontSize);
  const [lyricMaxFontSize, setLyricMaxFontSize] = useState<number>(initialPrefs.lyricMaxFontSize);
  const [lyricFontScale, setLyricFontScale] = useState<number>(() => {
    const saved = Number(initialExtended.lyricFontScale);
    if (Number.isFinite(saved) && saved >= 0.5 && saved <= 1.8) return saved;
    const derived = ((initialPrefs.lyricMinFontSize / 26) + (initialPrefs.lyricMaxFontSize / 88)) * 0.5;
    return Math.max(0.5, Math.min(1.8, Math.round(derived * 20) / 20 || 1));
  });
  const [themePalettes, setThemePalettes] = useState<Record<string, string>>(initialPrefs.themePalettes);

  // YouTube video background, fit mode, black overlay opacity, SponsorBlock & embedded lyric auto-hide state
  const [preferredVideoType, setPreferredVideoType] = useState(initialPrefs.display.preferredVideoType);
  const [youtubeBackgroundMode, setYoutubeBackgroundMode] = useState<YouTubeBackgroundMode>(initialPrefs.display.youtubeBackgroundMode);
  const [videoFitMode, setVideoFitMode] = useState<VideoFitMode>(() =>
    initialExtended.videoFitMode === 'stretch' ? 'stretch' : 'default'
  );
  const [videoOverlayOpacity, setVideoOverlayOpacity] = useState<number>(initialPrefs.display.videoOverlayOpacity);
  const [autoHideYoutubeLyrics, setAutoHideYoutubeLyrics] = useState<boolean>(initialPrefs.display.autoHideYoutubeLyrics);
  const [hasSeparateAudioStream, setHasSeparateAudioStream] = useState<boolean>(true);
  const [playerVolume, setPlayerVolume] = useState<number>(initialPrefs.display.playerVolume);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState<boolean>(initialPrefs.display.sponsorBlockEnabled);
  const [leadingNonMusicOffsetSec, setLeadingNonMusicOffsetSec] = useState<number>(0);

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
  const [cinemaHudVisible, setCinemaHudVisible] = useState(true);
  const cinemaHudTimerRef = useRef<number | null>(null);

  // Lyrics & per-song delay state

  const [customEditOpen, setCustomEditOpen] = useState(false);
  const [lyricStatusMessage, setLyricStatusMessage] = useState('');

  const [demo, setDemo] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialPrefs.display.reducedMotion);
  const [fps, setFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localTrack, setLocalTrack] = useState<TrackInfo | null>(null);
  const [incoming, setIncoming] = useState<IncomingLyrics | null>(null);
  const [activeLyrics, setActiveLyrics] = useState({ recordingKey: '', lyricsKey: '', name: '', url: '', original:'',offset:0 });
  const [fileEpoch, setFileEpoch] = useState(0);
  const [performance, setPerformance] = useState(false);

  // Full screen mode: show controls and exit full screen button on tap and hide after 2 seconds (2000ms)
  const scheduleCinemaHudHide = useCallback(() => {
    if (cinemaHudTimerRef.current !== null) {
      window.clearTimeout(cinemaHudTimerRef.current);
      cinemaHudTimerRef.current = null;
    }
    if ((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) {
      return;
    }
    cinemaHudTimerRef.current = window.setTimeout(() => {
      setCinemaHudVisible(false);
    }, 2000);
  }, []);

  const revealCinemaHud = useCallback(() => {
    setCinemaHudVisible(true);
    scheduleCinemaHudHide();
  }, [scheduleCinemaHudHide]);

  useEffect(() => {
    if (!performance) {
      if (cinemaHudTimerRef.current !== null) {
        window.clearTimeout(cinemaHudTimerRef.current);
        cinemaHudTimerRef.current = null;
      }
      setCinemaHudVisible(true);
      return;
    }
    setCinemaHudVisible(true);
    if (!cinemaControlsOpen) {
      scheduleCinemaHudHide();
    } else if (cinemaHudTimerRef.current !== null) {
      window.clearTimeout(cinemaHudTimerRef.current);
      cinemaHudTimerRef.current = null;
    }
    const onWindowBlur = () => {
      // Tapping an embedded YouTube iframe shifts focus from window to iframe; wake the HUD
      revealCinemaHud();
    };
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      if (cinemaHudTimerRef.current !== null) {
        window.clearTimeout(cinemaHudTimerRef.current);
        cinemaHudTimerRef.current = null;
      }
    };
  }, [performance, cinemaControlsOpen, scheduleCinemaHudHide, revealCinemaHud]);

  const songMapping = useSongMapping(localTrack, uid);
  const lyricsFix = useCorrection(localTrack, 'lyrics', uid);
  const videoFix = useCorrection(localTrack, 'video', uid);
  const recordingKey = lyricsFix.context?.recordingKey || '';
  const lyricsKey = activeLyrics.recordingKey === recordingKey ? activeLyrics.lyricsKey : '';
  const onLyricContentChange = useCallback((original: string, sourceUrl: string, sourceName: string,offset=0) => {
    const nextKey = lyricFingerprint(original, sourceUrl);
    const nextName = sourceName.slice(0, 256);
    setActiveLyrics(prev =>
      prev.recordingKey === recordingKey &&
      prev.lyricsKey === nextKey &&
      prev.name === nextName &&
      prev.url === sourceUrl &&
      prev.original === original &&
      prev.offset === offset
        ? prev
        : { recordingKey, original, offset, lyricsKey: nextKey, name: nextName, url: sourceUrl }
    );
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
  const legacyAutomaticLrc=Boolean(!songMapping.approved?.lyrics&&!lyricsFix.correction?.selection&&songMapping.lyrics?.selection?.engine==='lrclib'&&songMapping.lyrics.sourceFile.name.startsWith('LyricFlow Engine'));
  const effectiveLyricsEngine = lyricsFix.correction?.selection?.engine || (legacyAutomaticLrc?'lyricflow':songMapping.lyrics?.selection?.engine) || lyricEngineOption;
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
    const syncedScale = Math.max(0.5, Math.min(1.8, Math.round((((prefs.lyricMinFontSize / 26) + (prefs.lyricMaxFontSize / 88)) * 0.5) * 20) / 20));
    setLyricFontScale(syncedScale);
    setThemePalettes(prefs.themePalettes);
    const d = prefs.display;
    setPreferredVideoType(d.preferredVideoType);
    setScene(d.scene); setReducedMotion(d.reducedMotion); setYoutubeBackgroundMode(d.youtubeBackgroundMode);
    setVideoOverlayOpacity(d.videoOverlayOpacity);
    setAutoHideYoutubeLyrics(d.autoHideYoutubeLyrics);
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

  // Persist extended settings locally
  useEffect(() => {
    try {
      localStorage.setItem(
        'lyricflow.extendedSettings.v1',
        JSON.stringify({
          themeMode,
          videoFitMode,
          lyricFontScale,
          videoPlacementMode,
          enabledVideoPlacements,
          themePlacementMode,
          enabledThemePlacements,
          themeDurationLines,
          themeDurationSeconds,
          autoRandomizeThemePalettes,
        })
      );
    } catch {}
  }, [
    themeMode,
    videoFitMode,
    lyricFontScale,
    videoPlacementMode,
    enabledVideoPlacements,
    themePlacementMode,
    enabledThemePlacements,
    themeDurationLines,
    themeDurationSeconds,
    autoRandomizeThemePalettes,
  ]);

  // Debounce network writes; nothing is sent from the visualizer render loop.
  useEffect(() => {
    const prefs: UserPreferencesData = {
      display: { preferredVideoType, scene, reducedMotion, youtubeBackgroundMode, videoOverlayOpacity, autoHideYoutubeLyrics, playerVolume,
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
    autoHideYoutubeLyrics, playerVolume, sponsorBlockEnabled, lyricPlacementMode, lyricColorMode, lyricFillPaceMode, lyricDisplayMode]);

  const selectLyrics = (selection: LyricsSelection) => { privateLyrics.save(''); lyricsFix.save({ selection }); };
  const selectEngine = (engine: LyricEngineOption) => {
    if(engine==='youtube'&&effectiveLyricsEngine==='youtube')setFileEpoch(epoch=>epoch+1);
    selectLyrics({ engine, lrclibId: null, subtitleTrackId: null });
  };
  const selectSubtitle = (id: string) => selectLyrics({ engine: 'youtube', lrclibId: null, subtitleTrackId: id });
  const updateLyricDelay = (value: number) => { delayFix.save({ delaySeconds: clampLyricDelay(value) }); };

  const handleLyricFontScaleChange = (scale: number) => {
    const clampedScale = Math.max(0.5, Math.min(1.8, Math.round(scale * 20) / 20));
    setLyricFontScale(clampedScale);
    setLyricMinFontSize(Math.max(16, Math.min(72, Math.round(26 * clampedScale))));
    setLyricMaxFontSize(Math.max(32, Math.min(130, Math.round(88 * clampedScale))));
  };

  const handleMinFontSizeChange = (val: number) => {
    const clamped = Math.max(16, Math.min(72, val));
    setLyricMinFontSize(clamped);
    if (clamped > lyricMaxFontSize) {
      setLyricMaxFontSize(clamped);
    }
    setLyricFontScale(Math.max(0.5, Math.min(1.8, Math.round((clamped / 26) * 20) / 20)));
  };

  const handleMaxFontSizeChange = (val: number) => {
    const clamped = Math.max(32, Math.min(130, val));
    setLyricMaxFontSize(clamped);
    if (clamped < lyricMinFontSize) {
      setLyricMinFontSize(Math.max(16, clamped));
    }
    setLyricFontScale(Math.max(0.5, Math.min(1.8, Math.round((clamped / 88) * 20) / 20)));
  };

  const handleSaveCustomOverride = (lrc: string) => { privateLyrics.save(lrc); };
  const incomingRevision=useRef(0);
  const acceptLyrics = (lyrics: Omit<IncomingLyrics, 'token'>) =>
    setIncoming({ ...lyrics, token: ++incomingRevision.current });

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
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setPerformance(false);
      } else {
        setPerformance(true);
        setCinemaControlsOpen(false);
        await document.documentElement.requestFullscreen();
      }
      setFullscreenError('');
    } catch {
      setPerformance(true);
      setCinemaControlsOpen(false);
      setFullscreenError(
        'Fullscreen is not supported in this browser preview. Cinema mode is active.'
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

  const toggleVideoPlacementEnabled = (pm: Exclude<LyricPlacementMode, 'auto'>) => {
    setEnabledVideoPlacements(prev => {
      if (prev.includes(pm)) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== pm);
      }
      return [...prev, pm];
    });
  };

  const toggleThemePlacementEnabled = (pm: Exclude<LyricPlacementMode, 'auto'>) => {
    setEnabledThemePlacements(prev => {
      if (prev.includes(pm)) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item !== pm);
      }
      return [...prev, pm];
    });
  };

  const toggleRomanizationLang = (code: RomanizationLanguageCode) => {
    const exists = enabledRomanizationLanguages.includes(code);
    const next = exists
      ? enabledRomanizationLanguages.filter(c => c !== code)
      : [...enabledRomanizationLanguages, code];
    setEnabledRomanizationLanguages(next);
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

  useEffect(() => {
    void preloadLyricFonts(effectiveFonts);
  }, [effectiveFonts]);

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

  const [rejectedBgVideoIds, setRejectedBgVideoIds] = useState<string[]>([]);

  const mappedYoutubeVideoId = hasSeparateAudioStream
    ? videoFix.correction?.youtubeVideoId || songMapping.video?.youtubeVideoId || null
    : null;
  const activeYoutubeVideoId = isAdPlaying
    ? null
    : hasSeparateAudioStream
      ? mappedYoutubeVideoId && !rejectedBgVideoIds.includes(mappedYoutubeVideoId)
        ? mappedYoutubeVideoId
        : null
      : extractYouTubeVideoId(localTrack);

  const videoSearchKey=localTrack?[localTrack.title,localTrack.artist,localTrack.album||'',Math.round(localTrack.duration),localTrack.provider,preferredVideoType].join('|'):'';
  const filteredAutoVideos=autoVideoMatch.key===videoSearchKey?autoVideoMatch.videos.filter(v=>{const id=extractYouTubeVideoId(v);return Boolean(id&&!rejectedBgVideoIds.includes(id));}):[];
  const autoYoutubeVideoId=autoVideoMatch.key===videoSearchKey?(filteredAutoVideos.length>0?extractYouTubeVideoId(filteredAutoVideos[0]):(autoVideoMatch.id&&!rejectedBgVideoIds.includes(autoVideoMatch.id)?autoVideoMatch.id:null)):null;
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
      setAutoVideoMatch({key:videoSearchKey,id:null,pending:false,videos:[],candidateCount:0});
      return;
    }
    const controller = new AbortController();
    setAutoVideoMatch({key:videoSearchKey,id:null,pending:true,videos:[],candidateCount:0});
    const base = localStorage.getItem('lyricflow.resolver') || import.meta.env.VITE_MUSIC_RESOLVER || '';
    void findYouTubeBackgrounds(localTrack,preferredVideoType,base,controller.signal)
      .then(({videos,candidateCount}) => {
        if (controller.signal.aborted) return;
        const bestId = videos.length > 0 ? extractYouTubeVideoId(videos[0]) : null;
        setAutoVideoMatch({key:videoSearchKey,id:bestId||null,pending:false,videos,candidateCount});
      })
      .catch(() => {if(!controller.signal.aborted)setAutoVideoMatch({key:videoSearchKey,id:null,pending:false,videos:[],candidateCount:0});});
    return () => controller.abort();
  }, [
    localTrack?.title,
    localTrack?.artist,
    localTrack?.album,
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
          setAutoVideoMatch({key:'',id:null,pending:false,videos:[],candidateCount:0});
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
    if (
      sourceMode !== 'external' ||
      !localPlaying ||
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    )
      return;
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

  const matchedVideoCandidate =
    autoVideoMatch.videos.find(v => extractYouTubeVideoId(v) === stageYoutubeVideoId) || null;
  const isActiveVideoLyrical = Boolean(
    isYtVideoBackgroundActive &&
      ((hasSeparateAudioStream && preferredVideoType === 'lyrics') ||
        isLyricVideoTrack(matchedVideoCandidate) ||
        isLyricVideoTrack(localTrack))
  );
  const shouldHideStageLyrics = Boolean(
    isAdPlaying || (autoHideYoutubeLyrics && isActiveVideoLyrical)
  );

  // Extract per-song Album Art colour palette so YouTube video backgrounds (and 'album' colour mode)
  // adapt vibrantly to each song instead of staying the same colour
  const songSeed = `${localTrack?.title || ''}|${localTrack?.artist || ''}|${stageYoutubeVideoId || ''}`;
  const defaultSongPalette = useMemo(() => getDeterministicSongPalette(songSeed), [songSeed]);
  useEffect(() => {
    const artworkUrl =
      localTrack?.artwork ||
      (stageYoutubeVideoId ? `https://i.ytimg.com/vi/${stageYoutubeVideoId}/hqdefault.jpg` : undefined);
    if (!artworkUrl || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''))) {
      setAlbumArtPalette(prev => (prev === null ? prev : null));
      return;
    }
    let cancelled = false;
    void extractAlbumArtPalette(artworkUrl, songSeed).then(pal => {
      if (!cancelled) setAlbumArtPalette(pal);
    });
    return () => {
      cancelled = true;
    };
  }, [localTrack?.artwork, stageYoutubeVideoId, songSeed]);

  const effectiveAlbumArtPalette = albumArtPalette || defaultSongPalette;

  const useAlbumArtColors = Boolean(
    effectiveAlbumArtPalette &&
      (lyricColorMode === 'album' || (lyricColorMode === 'auto' && isYtVideoBackgroundActive))
  );
  const customLyricAccentHex = useAlbumArtColors
    ? effectiveAlbumArtPalette?.sungColor
    : lyricColorMode !== 'auto'
      ? LYRIC_COLOR_MAP[lyricColorMode].main
      : undefined;
  const customLyricBaseHex = useAlbumArtColors ? effectiveAlbumArtPalette?.baseColor : undefined;

  const backgroundSyncKey=recordingKey+'|'+(stageYoutubeVideoId||'');
  const autoVideoSync=useVideoAutoSync(backgroundSyncKey,stageYoutubeVideoId,hasSeparateAudioStream&&!isAdPlaying,
    activeLyrics.recordingKey===recordingKey?activeLyrics.original:incoming?.original||'',
    lyricDelay-(activeLyrics.recordingKey===recordingKey?activeLyrics.offset:0));
  const autoVideoDelaySeconds=autoVideoSync.delaySeconds,autoVideoSyncStatus=autoVideoSync.status,bgCaptionStatus=autoVideoSync.captionStatus;

  // A personal automatic-timing choice (null) also overrides a published fixed delay.
  const chosenVideoDelay=videoFix.correction?videoFix.correction.videoDelaySeconds:songMapping.video?.delaySeconds;
  const hasManualVideoDelay=chosenVideoDelay!=null;
  const videoDelaySeconds=hasSeparateAudioStream?chosenVideoDelay??autoVideoDelaySeconds:0;

  const videoTimingStatus=hasManualVideoDelay?`Manual video delay: ${videoDelaySeconds>0?'+':''}${videoDelaySeconds}s`:autoVideoSyncStatus;
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
    const selection = lyricsFix.correction?.selection || { engine: effectiveLyricsEngine, lrclibId: effectiveLyricsEngine==='lrclib'&&candidateId?Number(candidateId):null, subtitleTrackId: effectiveSubtitleTrackId || null };
    songMapping.savePart('lyrics', { sourceFile, selection, delaySeconds: lyricDelay });
  }, [recordingKey, lyricsKey, activeLyrics.name, activeLyrics.url, effectiveLyricsEngine, effectiveSubtitleTrackId, lyricDelay]);
  useEffect(() => {
    if (localTrack && activeYoutubeVideoId && hasManualVideoDelay) {
      songMapping.savePart('video', { youtubeVideoId: activeYoutubeVideoId, delaySeconds: videoDelaySeconds });
    }
  }, [recordingKey, activeYoutubeVideoId, hasManualVideoDelay, videoDelaySeconds]);
  const saveVideoChoice=(id:string,seconds:number|null)=>{
    videoFix.save({youtubeVideoId:id,videoDelaySeconds:seconds});
    songMapping.savePart('video',{youtubeVideoId:id,delaySeconds:seconds});
  };
  const activeBassThresholdPct = Math.round(computeBassThreshold(cameraShakeSensitivity) * 100);

  return (
    <div
      className={'shell ' + (performance ? 'performance-mode' : '')}
      data-theme={resolvedTheme}
    >
      {/* YOUTUBE-STYLE TWO-COLUMN WORKSPACE:
          Left Column: Visualizer Display + Spotify-Style Music Details Window below
          Right Column: Collapsible Settings Accordion Sections (open only when clicked) */}
      <div className="yt-workspace-grid">
        <div className="yt-primary-column">
          {/* 1. VISUALIZER STAGE (Zero overlaid buttons in normal mode) */}
          <div className="yt-sticky-stage-wrap">
            <section
              className="stage"
              onClick={
                performance
                  ? () => {
                      revealCinemaHud();
                    }
                  : undefined
              }
              onPointerMove={
                performance
                  ? () => {
                      revealCinemaHud();
                    }
                  : undefined
              }
              onTouchStart={
                performance
                  ? () => {
                      revealCinemaHud();
                    }
                  : undefined
              }
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
                videoPlacementMode={videoPlacementMode}
                enabledVideoPlacements={enabledVideoPlacements}
                themePlacementMode={themePlacementMode}
                enabledThemePlacements={enabledThemePlacements}
                themeDurationLines={themeDurationLines}
                themeDurationSeconds={themeDurationSeconds}
                autoRandomizeThemePalettes={autoRandomizeThemePalettes}
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
                lyricFontScale={lyricFontScale}
                lyricPlacementMode={lyricPlacementMode}
                videoOverlayOpacity={videoOverlayOpacity}
                videoFitMode={videoFitMode}
                audioPaused={Boolean(localLoaded && !localPlaying)}
                youtubeVideoId={stageYoutubeVideoId}
                videoDelaySeconds={videoDelaySeconds}
                youtubeBackgroundMode={effectiveYoutubeBackgroundMode}
                hideStageLyrics={shouldHideStageLyrics}
                recordingKey={recordingKey}
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
                onRejectBackgroundVideo={rejectedId => {
                  if (!rejectedId) return;
                  setRejectedBgVideoIds(prev => (prev.includes(rejectedId) ? prev : [...prev, rejectedId]));
                  if (videoFix.correction?.youtubeVideoId === rejectedId) {
                    videoFix.reset();
                  }
                  if (songMapping.video?.youtubeVideoId === rejectedId) {
                    songMapping.savePart('video', null);
                  }
                }}
              />

              {/* Transparent touch/click wake shield in Full Screen when controls are hidden so tapping over the YouTube player always reveals the HUD */}
              {performance && !cinemaHudVisible && !cinemaControlsOpen && (
                <div
                  className="cinema-touch-wake-layer"
                  aria-label="Tap screen to show full screen controls"
                  onClick={e => {
                    e.stopPropagation();
                    revealCinemaHud();
                  }}
                  onTouchStart={e => {
                    e.stopPropagation();
                    revealCinemaHud();
                  }}
                />
              )}

              {/* Full Screen / Cinema Mode HUD: Shows on tap/move and hides after 2 seconds */}
              {performance && (
                <div
                  className={
                    'cinema-control-hub ' +
                    (!cinemaHudVisible && !cinemaControlsOpen ? 'hud-hidden' : 'hud-visible')
                  }
                  onClick={e => {
                    e.stopPropagation();
                    revealCinemaHud();
                  }}
                >
                  <div className="cinema-quick-actions">
                    {stageYoutubeVideoId && youtubeBackgroundMode === 'video' && (
                      <button
                        type="button"
                        className="cinema-hub-trigger"
                        aria-label={
                          videoFitMode === 'stretch'
                            ? 'Switch video to default ratio'
                            : 'Zoom video to fill screen'
                        }
                        onClick={() => {
                          setVideoFitMode(v => (v === 'stretch' ? 'default' : 'stretch'));
                          revealCinemaHud();
                        }}
                      >
                        <Expand size={16} />{' '}
                        <span>{videoFitMode === 'stretch' ? 'Zoomed to Fill' : 'Zoom to Fill'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="cinema-hub-trigger"
                      aria-label={cinemaControlsOpen ? 'Hide cinema controls' : 'Show cinema controls'}
                      onClick={() => {
                        setCinemaControlsOpen(v => !v);
                        revealCinemaHud();
                      }}
                    >
                      {cinemaControlsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}{' '}
                      <span>{cinemaControlsOpen ? 'Hide controls' : 'Controls'}</span>
                    </button>
                    <button
                      type="button"
                      className="cinema-exit-btn"
                      aria-label="Exit cinema mode"
                      onClick={() => void togglePerformance()}
                    >
                      <LogOut size={18} />
                      <span>Exit Full Screen</span>
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

                      <div className="cinema-field" style={{ marginTop: 10 }}>
                        <span>Appearance Theme</span>
                        <div className="cinema-inline-actions">
                          {(['system', 'dark', 'light'] as ThemeMode[]).map(tm => (
                            <button
                              key={tm}
                              type="button"
                              className={themeMode === tm ? 'active' : ''}
                              onClick={() => setThemeMode(tm)}
                            >
                              {tm === 'system' ? 'Follow System' : tm === 'dark' ? 'Dark' : 'Light'}
                            </button>
                          ))}
                        </div>
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
                                className="compact-mode-slider"
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
                            <>
                              <div className="cinema-field">
                                <span>
                                  Background Video Display:{' '}
                                  <b>{videoFitMode === 'stretch' ? 'Zoom to Fill (Keep Ratio)' : 'Default Ratio'}</b>
                                </span>
                                <div className="cinema-inline-actions">
                                  <button
                                    type="button"
                                    className={videoFitMode === 'default' ? 'active' : ''}
                                    onClick={() => setVideoFitMode('default')}
                                  >
                                    Default Ratio
                                  </button>
                                  <button
                                    type="button"
                                    className={videoFitMode === 'stretch' ? 'active' : ''}
                                    onClick={() => setVideoFitMode('stretch')}
                                  >
                                    Zoom to Fill
                                  </button>
                                </div>
                              </div>
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
                              <label className="cinema-check">
                                <input
                                  type="checkbox"
                                  aria-label="Cinema auto-hide lyrics overlay on lyric videos"
                                  checked={autoHideYoutubeLyrics}
                                  onChange={e => setAutoHideYoutubeLyrics(e.target.checked)}
                                />{' '}
                                Auto-hide lyrics overlay if video title contains lyric / lyrics / lyrical
                              </label>
                              <label className="cinema-check">
                                <input
                                  type="checkbox"
                                  aria-label="Cinema SponsorBlock skip non-music segments"
                                  checked={sponsorBlockEnabled}
                                  onChange={e => setSponsorBlockEnabled(e.target.checked)}
                                />{' '}
                                Cut non-music intro segments (SponsorBlock)
                              </label>
                            </>
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
                            Randomize enabled themes ({enabledScenes.length} active · never cuts mid-line)
                          </label>

                          <label className="cinema-check">
                            <input
                              type="checkbox"
                              aria-label="Cinema auto-randomize colour palette themes"
                              checked={autoRandomizeThemePalettes}
                              onChange={e => setAutoRandomizeThemePalettes(e.target.checked)}
                            />{' '}
                            Auto-randomize colour palette themes
                          </label>

                          <label className="cinema-range">
                            <span>
                              Theme Duration (Songs with Lyrics) <b>{themeDurationLines} line(s)</b>
                            </span>
                            <input
                              aria-label="Cinema theme duration in lines of lyrics"
                              type="range"
                              min="1"
                              max="16"
                              step="1"
                              value={themeDurationLines}
                              onChange={e => setThemeDurationLines(Number(e.target.value))}
                            />
                          </label>

                          <label className="cinema-range">
                            <span>
                              Theme Duration (Songs without Lyrics) <b>{themeDurationSeconds}s</b>
                            </span>
                            <input
                              aria-label="Cinema theme duration in seconds"
                              type="range"
                              min="4"
                              max="60"
                              step="2"
                              value={themeDurationSeconds}
                              onChange={e => setThemeDurationSeconds(Number(e.target.value))}
                            />
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
                            <span>Video Background Lyrics Placement (Default: Right Bottom)</span>
                            <select
                              aria-label="Cinema video background lyric placement"
                              value={videoPlacementMode}
                              onChange={e => setVideoPlacementMode(e.target.value as LyricPlacementMode)}
                            >
                              {LYRIC_PLACEMENT_MODES.map(pm => (
                                <option key={pm.id} value={pm.id}>
                                  {pm.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="cinema-field">
                            <span>Built-in Themes Lyrics Placement (Default: Centre Stage)</span>
                            <select
                              aria-label="Cinema theme lyric placement"
                              value={themePlacementMode}
                              onChange={e => setThemePlacementMode(e.target.value as LyricPlacementMode)}
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
                              value={autoKineticMotion ? 'auto' : manualKineticMotion}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'auto') {
                                  setAutoKineticMotion(true);
                                } else {
                                  setManualKineticMotion(val as LyricMotion);
                                  setAutoKineticMotion(false);
                                }
                              }}
                            >
                              <option value="auto">
                                Auto-Rotate Enabled Styles ({enabledKineticMotions.length} active)
                              </option>
                              {VOXELVERSE_STYLES.map(s => (
                                <option key={s.id} value={s.id}>
                                  Single View: {s.name} ({s.family} · {s.detail})
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="cinema-field">
                            <span>Lyric Typography Font</span>
                            <select
                              aria-label="Cinema lyric font"
                              value={autoFonts ? 'auto' : manualFont}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'auto') {
                                  setAutoFonts(true);
                                } else {
                                  setManualFont(val as FontPack);
                                  setAutoFonts(false);
                                }
                              }}
                            >
                              <option value="auto">
                                Auto-Rotate Enabled Fonts ({enabledFonts.length} active)
                              </option>
                              {FONT_SHOWCASE.map(f => (
                                <option key={f} value={f}>
                                  Single Font: {f.toUpperCase()} ({fontLabel(f)})
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

                          <label className="cinema-check">
                            <input
                              type="checkbox"
                              aria-label="Cinema romanization toggle"
                              checked={romanizationEnabled}
                              onChange={e => setRomanizationEnabled(e.target.checked)}
                            />{' '}
                            Phonetic Romanization ({enabledRomanizationLanguages.length}/
                            {SUPPORTED_ROMANIZATION_LANGUAGES.length} languages)
                          </label>

                          <div className="cinema-field">
                            <span>Romanization Supported Languages:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {SUPPORTED_ROMANIZATION_LANGUAGES.map(lang => {
                                const isOn =
                                  romanizationEnabled &&
                                  enabledRomanizationLanguages.includes(lang.code);
                                return (
                                  <button
                                    key={lang.code}
                                    type="button"
                                    onClick={() => toggleRomanizationLang(lang.code)}
                                    style={{
                                      fontSize: 10,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      border: isOn
                                        ? '1px solid #38bdf8'
                                        : '1px solid rgba(255,255,255,0.16)',
                                      background: isOn
                                        ? 'rgba(56,189,248,0.18)'
                                        : 'rgba(255,255,255,0.03)',
                                      color: isOn ? '#e0f2fe' : '#94a3b8',
                                    }}
                                  >
                                    {lang.name.split(' ')[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <label className="cinema-field">
                            <span>Lyric Active Fill Colour</span>
                            <select
                              aria-label="Cinema lyric color mode"
                              value={lyricColorMode}
                              onChange={e => setLyricColorMode(e.target.value as LyricColorMode)}
                            >
                              <option value="auto">Auto (Background / Album Art Adaptive)</option>
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
                              Lyrics Font Size (Proportional){' '}
                              <b>{Math.round(lyricFontScale * 100)}%</b>
                            </span>
                            <input
                              aria-label="Cinema lyric font size scale"
                              type="range"
                              min="50"
                              max="180"
                              step="5"
                              value={Math.round(lyricFontScale * 100)}
                              onChange={e =>
                                handleLyricFontScaleChange(Number(e.target.value) / 100)
                              }
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
                                aria-label="Cinema toggle negative or positive lyric delay"
                                onClick={() =>
                                  updateLyricDelay(lyricDelay === 0 ? -0.25 : -lyricDelay)
                                }
                              >
                                ±
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
            </section>
          </div>

          {/* 2. MUSIC DETAILS WINDOW JUST BELOW VISUALIZER
              (Title, Album Image, Play/Pause, Next, Prev, Timebar, Volume, Source & Full Screen) */}
          <div className="yt-below-stage-details" aria-label="Music details window">
            <LocalPlayer
              ref={playerRef}
              sourceMode={sourceMode}
              onOpenSourceSelector={() => setSourceOpen(true)}
              lyricSourceLabel={incoming?.source || (localLoaded ? 'Auto-matching…' : 'Idle')}
              lyricStatusMessage={lyricStatusMessage}
              hasWordSync={Boolean(incoming?.hasWordSync)}
              customEditOpen={customEditOpen}
              onToggleCustomEdit={() => {
                setCustomEditOpen(v => {
                  const next = !v;
                  if (next) {
                    setOpenSections(prev => {
                      const nextOpen = [...prev];
                      if (!nextOpen.includes('lyrics-search')) nextOpen.unshift('lyrics-search');
                      if (!nextOpen.includes('lyrics-style')) nextOpen.unshift('lyrics-style');
                      return nextOpen;
                    });
                  }
                  return next;
                });
              }}
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

            {/* Stage Source & Full Screen Bar (Placed cleanly in Music Details below visualizer — never overlapping the stage) */}
            {!performance && (
              <div className="yt-stage-meta-strip">
                <div className="stage-source-bar">
                  <button
                    type="button"
                    className="stage-source-button"
                    onClick={() => setSourceOpen(true)}
                  >
                    <Headphones size={16} />
                    <span>
                      <small>
                        {localLoaded && localTrack
                          ? `Source: ${localTrack.audioSource || (localTrack.source === 'provider' ? 'Online Player' : 'Local File')}`
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
                    <Expand size={16} /> Full Screen
                  </button>
                </div>

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
                    <i className="dot" /> {renderStatus} · Lyrics: {incoming?.source || 'LyricFlow Engine'}
                  </span>
                  <span>{fps} FPS</span>
                </div>
              </div>
            )}

            {isAdPlaying && (
              <section className="local-player" role="status" aria-label="Advertisement active">
                <strong>Advertisement playing · Built-in Themes active</strong>
                <p>
                  Lyrics and YouTube background video searches are paused while an advertisement is playing in your external player.
                </p>
              </section>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: ALL SETTINGS ARRANGED INTO RESPECTIVE SECTIONS (OPEN ONLY WHEN CLICKED) */}
        <aside
          ref={settingsSidebarRef}
          className="yt-settings-sidebar"
          aria-label="Settings sections"
        >
          <div className="yt-settings-sidebar-head">
            <div>
              <strong>SETTINGS</strong>
              <small>Click any section to open or close</small>
            </div>
            <button
              type="button"
              className="yt-settings-expand-btn"
              onClick={() =>
                setOpenSections(prev =>
                  prev.length === ALL_SETTINGS_SECTION_IDS.length
                    ? []
                    : [...ALL_SETTINGS_SECTION_IDS]
                )
              }
            >
              {openSections.length === ALL_SETTINGS_SECTION_IDS.length
                ? 'Collapse All'
                : 'Expand All'}
            </button>
          </div>

          {/* SECTION 1: APPEARANCE, ACCOUNT & APP SETTINGS */}
          <div className={'settings-accordion ' + (openSections.includes('appearance') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('appearance')}
              onClick={() => toggleSettingsSection('appearance')}
            >
              <span className="settings-accordion-title">
                <SlidersHorizontal size={16} />
                <span>
                  <b>Appearance, Account &amp; App Updates</b>
                  <small>
                    {themeMode === 'system'
                      ? `Follow System (${resolvedTheme})`
                      : themeMode === 'dark'
                        ? 'Dark Mode'
                        : 'Light Mode'}{' '}
                    · {quality} Quality · Sync &amp; Updates
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('appearance') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('appearance') ? 'is-open' : 'is-collapsed')
              }
            >
              <div className="settings-group-block">
                <span className="settings-field-label">COLOR THEME (DARK / LIGHT / SYSTEM)</span>
                <div className="quality-options" role="group" aria-label="Appearance theme mode">
                  <button
                    type="button"
                    className={themeMode === 'system' ? 'active' : ''}
                    aria-pressed={themeMode === 'system'}
                    onClick={() => setThemeMode('system')}
                  >
                    <Monitor size={13} /> Follow System
                  </button>
                  <button
                    type="button"
                    className={themeMode === 'dark' ? 'active' : ''}
                    aria-pressed={themeMode === 'dark'}
                    onClick={() => setThemeMode('dark')}
                  >
                    <Moon size={13} /> Dark Mode
                  </button>
                  <button
                    type="button"
                    className={themeMode === 'light' ? 'active' : ''}
                    aria-pressed={themeMode === 'light'}
                    onClick={() => setThemeMode('light')}
                  >
                    <Sun size={13} /> Light Mode
                  </button>
                </div>

                <span className="settings-field-label" style={{ marginTop: 14 }}>
                  RENDERING QUALITY
                </span>
                <div className="quality-options">
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

                <label className="check">
                  <span>
                    <b>Reduced motion</b>
                    <small>Calmer animation transitions</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={e => setReducedMotion(e.target.checked)}
                  />
                </label>

                <label className="check">
                  <span>
                    <b>Demo mode</b>
                    <small>Simulated musical energy when idle</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={demo}
                    onChange={e => setDemo(e.target.checked)}
                  />
                </label>

                <span className="settings-field-label" style={{ marginTop: 10 }}>
                  ACCOUNT SYNC, YOUTUBE &amp; APP UPDATES
                </span>
                <div className="relocated-header-controls">
                  <AccountControls
                    user={user}
                    syncStatus={syncStatus}
                    onImportGuest={() => {
                      try {
                        remotePreferences.current = '';
                        applyPreferences(loadLocalPreferences(null));
                        if (uid) {
                          importGuestCorrections(uid);
                          importGuestCustomLyrics(uid);
                          importGuestSongMappings(uid);
                        }
                        setSyncStatus('Guest settings and fixes imported into this account');
                      } catch {
                        setSyncStatus('Import could not finish · device storage is full or blocked');
                      }
                    }}
                  />
                  <YouTubeAccountControl compact />
                  <AppUpdateControl />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: YOUTUBE VIDEO BACKGROUND & VIDEO SYNC */}
          <div className={'settings-accordion ' + (openSections.includes('video-bg') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('video-bg')}
              onClick={() => toggleSettingsSection('video-bg')}
            >
              <span className="settings-accordion-title">
                <Video size={16} />
                <span>
                  <b>YouTube Video Background &amp; Sync</b>
                  <small>
                    {youtubeBackgroundMode === 'video' ? 'YouTube Video Active' : 'Built-in Themes'} ·{' '}
                    {preferredVideoType === 'music' ? 'Official Music Video' : 'Official Lyric Video'}
                    {hasSeparateAudioStream && videoTimingStatus ? ` · ${videoTimingStatus}` : ''}
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('video-bg') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('video-bg') ? 'is-open' : 'is-collapsed')
              }
            >
              <section
                className="local-player youtube-stage-options"
                aria-label="YouTube video background and lyric overlay controls"
              >
                <div className="settings-stack-fields">
                  <label className="settings-inline-row">
                    <span>
                      Background:{' '}
                      <b>
                        {youtubeBackgroundMode === 'video' ? 'YouTube Video' : 'Built-in Themes'}
                      </b>
                    </span>
                    <input
                      aria-label="Use YouTube video or built-in themes as background"
                      className="compact-mode-slider"
                      type="range"
                      min="0"
                      max="1"
                      step="1"
                      value={youtubeBackgroundMode === 'video' ? 0 : 1}
                      onChange={e =>
                        setYoutubeBackgroundMode(Number(e.target.value) === 0 ? 'video' : 'theme')
                      }
                    />
                  </label>

                  {hasSeparateAudioStream && (
                    <label className="settings-inline-row">
                      <span>Preferred Video Type:</span>
                      <select
                        aria-label="Stage preferred YouTube video type"
                        value={preferredVideoType}
                        onChange={e => setPreferredVideoType(e.target.value as 'music' | 'lyrics')}
                      >
                        <option value="music">Music video (Best Match)</option>
                        <option value="lyrics">Lyrical video (Best Match)</option>
                      </select>
                    </label>
                  )}

                  {youtubeBackgroundMode === 'video' && (
                    <>
                      <div className="settings-inline-row" role="group" aria-label="Background video aspect ratio">
                        <span>
                          Video Display Mode:{' '}
                          <b>{videoFitMode === 'stretch' ? 'Zoom to Fill (Keep Ratio)' : 'Default Ratio'}</b>
                        </span>
                        <div className="quality-options" style={{ flex: '0 0 auto' }}>
                          <button
                            type="button"
                            className={videoFitMode === 'default' ? 'active' : ''}
                            aria-pressed={videoFitMode === 'default'}
                            onClick={() => setVideoFitMode('default')}
                          >
                            Default Ratio
                          </button>
                          <button
                            type="button"
                            className={videoFitMode === 'stretch' ? 'active' : ''}
                            aria-pressed={videoFitMode === 'stretch'}
                            onClick={() => setVideoFitMode('stretch')}
                          >
                            Zoom to Fill
                          </button>
                        </div>
                      </div>

                      <label className="settings-inline-row">
                        <span>
                          Black Overlay Opacity: <b>{Math.round(videoOverlayOpacity * 100)}%</b>
                        </span>
                        <input
                          aria-label="Adjust black overlay opacity between lyrics and video"
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={Math.round(videoOverlayOpacity * 100)}
                          onChange={e => setVideoOverlayOpacity(Number(e.target.value) / 100)}
                        />
                      </label>

                      <label className="settings-check-row">
                        <input
                          type="checkbox"
                          aria-label="Auto-hide lyrics overlay if video title contains lyric, lirics, lyrics or lyrical"
                          checked={autoHideYoutubeLyrics}
                          onChange={e => setAutoHideYoutubeLyrics(e.target.checked)}
                        />
                        <span>
                          Auto-hide lyrics overlay if video title contains lyric, lirics, lyrics or lyrical (
                          <b>{autoHideYoutubeLyrics ? 'ON' : 'OFF'}</b>)
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </section>

              {localTrack && hasSeparateAudioStream && !isAdPlaying && (
                <YouTubeBackgroundPicker
                  key={'video-picker-' + recordingKey}
                  track={localTrack}
                  activeVideoId={activeYoutubeVideoId}
                  preference={preferredVideoType}
                  onPreferenceChange={setPreferredVideoType}
                  backgroundMode={youtubeBackgroundMode}
                  onBackgroundModeChange={setYoutubeBackgroundMode}
                  cachedCandidates={filteredAutoVideos}
                  cachedCandidateCount={autoVideoMatch.key===videoSearchKey?autoVideoMatch.candidateCount:0}
                  automaticSearchPending={autoVideoMatch.key!==videoSearchKey||autoVideoMatch.pending}
                  captionStatus={bgCaptionStatus}
                  onSearchingChange={searching=>setManualVideoSearchKey(searching?recordingKey:'')}
                  onChoose={id => {
                    saveVideoChoice(id,id===activeYoutubeVideoId&&hasManualVideoDelay?videoDelaySeconds:null);
                    setYoutubeBackgroundMode('video');
                  }}
                />
              )}

              <CorrectionControls
                key={'corrections-' + recordingKey}
                user={user}
                track={localTrack}
                delay={{ ...delayFix, reset: () => { songMapping.savePart('lyrics', null); delayFix.reset(); } }}
                lyrics={{ ...lyricsFix, reset: () => { songMapping.savePart('lyrics', null); lyricsFix.reset(); } }}
                video={{ ...videoFix, reset: () => { songMapping.savePart('video', null); videoFix.reset(); } }}
                mappedLyrics={songMapping.lyrics}
                mappedVideo={songMapping.video}
                canChangeVideo={hasSeparateAudioStream}
                currentVideoDelay={videoDelaySeconds}
                onVideoChange={saveVideoChoice}
              />
              {songMapping.error && <p role="status">{songMapping.error}</p>}
              {privateLyrics.error && <p role="status">{privateLyrics.error}</p>}
            </div>
          </div>

          {/* SECTION 3: LYRICS SEARCH & MULTI-ENGINE SYNC */}
          <div className={'settings-accordion ' + (openSections.includes('lyrics-search') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('lyrics-search')}
              onClick={() => toggleSettingsSection('lyrics-search')}
            >
              <span className="settings-accordion-title">
                <AudioLines size={16} />
                <span>
                  <b>Lyrics Search &amp; Engine</b>
                  <small>
                    {incoming?.source || 'LyricFlow Hybrid Engine'} · Manual Search &amp; Subtitles
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('lyrics-search') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('lyrics-search') ? 'is-open' : 'is-collapsed')
              }
            >
              {!isAdPlaying && (
                <TrackFinder
                  key={'finder-' + fileEpoch}
                  track={localTrack}
                  preferredSelection={lyricsFix.correction?.selection || (legacyAutomaticLrc?null:songMapping.lyrics?.selection) || null}
                  preferredSourceFile={lyricsFix.source === 'personal' ? null : songMapping.approved?.lyrics?.sourceFile || (effectiveLyricsEngine!=='lyricflow'?songMapping.lyrics?.sourceFile:null) || null}
                  onSelectionChange={selectLyrics}
                  savedCustomLrc={savedCustomLrc}
                  customEditOpen={true}
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
                />
              )}
            </div>
          </div>

          {/* SECTION 4: LYRICS DISPLAY, COLOUR, FONT SIZE, ROMANIZATION & CUSTOM EDITOR */}
          <div className={'settings-accordion ' + (openSections.includes('lyrics-style') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('lyrics-style')}
              onClick={() => toggleSettingsSection('lyrics-style')}
            >
              <span className="settings-accordion-title">
                <Sparkles size={16} />
                <span>
                  <b>Lyrics Display, Colour &amp; Romanization</b>
                  <small>
                    Font Size {Math.round(lyricFontScale * 100)}% · Romanization{' '}
                    {romanizationEnabled ? `ON (${enabledRomanizationLanguages.length} langs)` : 'OFF'}
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('lyrics-style') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('lyrics-style') ? 'is-open' : 'is-collapsed')
              }
            >
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
                albumArtPalette={effectiveAlbumArtPalette}
                isVideoBackground={isYtVideoBackgroundActive}
                lyricFillPaceMode={lyricFillPaceMode}
                onLyricFillPaceModeChange={setLyricFillPaceMode}
                displayMode={lyricDisplayMode}
                onDisplayModeChange={setLyricDisplayMode}
                minFontSize={lyricMinFontSize}
                maxFontSize={lyricMaxFontSize}
                fontScale={lyricFontScale}
                onMinFontSizeChange={handleMinFontSizeChange}
                onMaxFontSizeChange={handleMaxFontSizeChange}
                onFontScaleChange={handleLyricFontScaleChange}
                bpm={audioReadout.bpm}
                romanizationEnabled={romanizationEnabled}
                onRomanizationEnabledChange={setRomanizationEnabled}
                enabledRomanizationLanguages={enabledRomanizationLanguages}
                onEnabledRomanizationLanguagesChange={setEnabledRomanizationLanguages}
              />
            </div>
          </div>

          {/* SECTION 5: LYRICS PLACEMENT (SEPARATE SETS FOR VIDEO BACKGROUND VS THEMES) */}
          <div className={'settings-accordion ' + (openSections.includes('placement') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('placement')}
              onClick={() => toggleSettingsSection('placement')}
            >
              <span className="settings-accordion-title">
                <SlidersHorizontal size={16} />
                <span>
                  <b>Lyrics Placement (Video vs Themes)</b>
                  <small>
                    Video: {videoPlacementMode} · Themes: {themePlacementMode}
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('placement') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('placement') ? 'is-open' : 'is-collapsed')
              }
            >
              <div className="settings-group-block">
                <div className="placement-set-card">
                  <div className="placement-set-head">
                    <div>
                      <b>
                        VIDEO BACKGROUND LYRIC PLACEMENT · DEFAULT RIGHT BOTTOM (
                        {videoPlacementMode === 'auto'
                          ? `AUTO · ${enabledVideoPlacements.length}/${ALL_PLACEMENT_MODES.length}`
                          : `SINGLE · ${videoPlacementMode.toUpperCase()}`}
                        )
                      </b>
                      <small>Used when YouTube Video Background is active.</small>
                    </div>
                    <div className="toggle-batch-actions">
                      <label className="auto-scenes" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={videoPlacementMode === 'auto'}
                          onChange={e =>
                            setVideoPlacementMode(e.target.checked ? 'auto' : 'bottom-right')
                          }
                        />
                        Auto-rotate ({enabledVideoPlacements.length})
                      </label>
                      <button
                        type="button"
                        className="upload-button"
                        onClick={() => setVideoPlacementMode('bottom-right')}
                      >
                        Reset to Right Bottom
                      </button>
                      <button
                        type="button"
                        className="upload-button"
                        onClick={() => {
                          setEnabledVideoPlacements([...ALL_PLACEMENT_MODES]);
                          setVideoPlacementMode('auto');
                        }}
                      >
                        Enable All Video Placements
                      </button>
                    </div>
                  </div>
                  <div className="kinetic-motion-grid">
                    {LYRIC_PLACEMENT_MODES.filter(pm => pm.id !== 'auto').map(pm => {
                      const pid = pm.id as Exclude<LyricPlacementMode, 'auto'>;
                      const isEnabled = enabledVideoPlacements.includes(pid);
                      const isSelectedSingle = videoPlacementMode === pid;
                      return (
                        <div
                          key={'vid-pm-' + pm.id}
                          className={
                            'kinetic-motion-card ' +
                            (isEnabled ? 'enabled ' : 'disabled ') +
                            (isSelectedSingle ? 'selected' : '')
                          }
                          onClick={() => setVideoPlacementMode(pid)}
                        >
                          <div className="kinetic-motion-top">
                            <strong>
                              {pm.label}
                              {pid === 'bottom-right' ? ' (DEFAULT)' : ''}
                              {isSelectedSingle ? ' · ACTIVE' : ''}
                            </strong>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              aria-label={`Toggle ${pm.label} video placement`}
                              className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                              onClick={e => {
                                e.stopPropagation();
                                toggleVideoPlacementEnabled(pid);
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

                <div className="placement-set-card" style={{ marginTop: 14 }}>
                  <div className="placement-set-head">
                    <div>
                      <b>
                        BUILT-IN THEMES LYRIC PLACEMENT · DEFAULT CENTRE STAGE (
                        {themePlacementMode === 'auto'
                          ? `AUTO · ${enabledThemePlacements.length}/${ALL_PLACEMENT_MODES.length}`
                          : `SINGLE · ${themePlacementMode.toUpperCase()}`}
                        )
                      </b>
                      <small>Used when Built-in VoxelWall Themes are active.</small>
                    </div>
                    <div className="toggle-batch-actions">
                      <label className="auto-scenes" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={themePlacementMode === 'auto'}
                          onChange={e =>
                            setThemePlacementMode(e.target.checked ? 'auto' : 'center')
                          }
                        />
                        Auto-rotate ({enabledThemePlacements.length})
                      </label>
                      <button
                        type="button"
                        className="upload-button"
                        onClick={() => setThemePlacementMode('center')}
                      >
                        Reset to Centre Stage
                      </button>
                      <button
                        type="button"
                        className="upload-button"
                        onClick={() => {
                          setEnabledThemePlacements([...ALL_PLACEMENT_MODES]);
                          setThemePlacementMode('auto');
                        }}
                      >
                        Enable All Theme Placements
                      </button>
                    </div>
                  </div>
                  <div className="kinetic-motion-grid">
                    {LYRIC_PLACEMENT_MODES.filter(pm => pm.id !== 'auto').map(pm => {
                      const pid = pm.id as Exclude<LyricPlacementMode, 'auto'>;
                      const isEnabled = enabledThemePlacements.includes(pid);
                      const isSelectedSingle = themePlacementMode === pid;
                      return (
                        <div
                          key={'theme-pm-' + pm.id}
                          className={
                            'kinetic-motion-card ' +
                            (isEnabled ? 'enabled ' : 'disabled ') +
                            (isSelectedSingle ? 'selected' : '')
                          }
                          onClick={() => setThemePlacementMode(pid)}
                        >
                          <div className="kinetic-motion-top">
                            <strong>
                              {pm.label}
                              {pid === 'center' ? ' (DEFAULT)' : ''}
                              {isSelectedSingle ? ' · ACTIVE' : ''}
                            </strong>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              aria-label={`Toggle ${pm.label} theme placement`}
                              className={'theme-toggle-pill ' + (isEnabled ? 'on' : 'off')}
                              onClick={e => {
                                e.stopPropagation();
                                toggleThemePlacementEnabled(pid);
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
              </div>
            </div>
          </div>

          {/* SECTION 6: VOXELVERSE LYRIC ANIMATIONS & TYPOGRAPHY FONTS */}
          <div className={'settings-accordion ' + (openSections.includes('animations') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('animations')}
              onClick={() => toggleSettingsSection('animations')}
            >
              <span className="settings-accordion-title">
                <Sparkles size={16} />
                <span>
                  <b>VoxelVerse Lyric Animations &amp; Fonts</b>
                  <small>
                    {autoKineticMotion
                      ? `Auto (${enabledKineticMotions.length}/${VOXELVERSE_STYLES.length} styles)`
                      : `Single: ${manualKineticMotion.toUpperCase()}`}{' '}
                    · {autoFonts ? `Auto Fonts (${enabledFonts.length})` : manualFont.toUpperCase()}
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('animations') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('animations') ? 'is-open' : 'is-collapsed')
              }
            >
              <div className="settings-group-block">
                <div className="toggle-batch-actions" style={{ marginBottom: 10 }}>
                  <label className="auto-scenes" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={spatialTypography}
                      onChange={e => setSpatialTypography(e.target.checked)}
                    />{' '}
                    VoxelVerse lyric choreography <small>({enabledKineticMotions.length} active styles)</small>
                  </label>
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

                {/* Lyric Typography Fonts */}
                <div className="placement-set-card" style={{ marginTop: 14 }}>
                  <div className="placement-set-head">
                    <div>
                      <b>
                        LYRIC TYPOGRAPHY FONTS (
                        {autoFonts
                          ? `AUTO · ${enabledFonts.length}/${FONT_SHOWCASE.length} ENABLED`
                          : `SINGLE · ${manualFont.toUpperCase()} (${fontLabel(manualFont)})`}
                        )
                      </b>
                      <small>Click any font card to preview or toggle ON/OFF for Auto rotation.</small>
                    </div>
                    <div className="toggle-batch-actions">
                      <label className="auto-scenes" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={autoFonts}
                          onChange={e => setAutoFonts(e.target.checked)}
                        />
                        Auto-rotate fonts ({enabledFonts.length})
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
              </div>
            </div>
          </div>

          {/* SECTION 7: VOXELWALL THEMES & THEME DIRECTOR */}
          <div className={'settings-accordion ' + (openSections.includes('themes') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('themes')}
              onClick={() => toggleSettingsSection('themes')}
            >
              <span className="settings-accordion-title">
                <Waves size={16} />
                <span>
                  <b>VoxelWall Themes &amp; Theme Director</b>
                  <small>
                    {enabledScenes.length}/{choices.length} Themes Enabled · Every {themeDurationLines} lines / {themeDurationSeconds}s
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('themes') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('themes') ? 'is-open' : 'is-collapsed')
              }
            >
              <section className="control-panel" aria-label="VoxelWall themes and VoxelVerse lyric animation toggles">
                <div className="scene-director-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <label className="auto-scenes">
                    <input
                      type="checkbox"
                      checked={autoScenes}
                      onChange={e => setAutoScenes(e.target.checked)}
                    />{' '}
                    Randomize enabled themes <small>({enabledScenes.length} active · never cuts mid-line)</small>
                  </label>
                  <label className="auto-scenes">
                    <input
                      type="checkbox"
                      aria-label="Auto-randomize colour palette themes"
                      checked={autoRandomizeThemePalettes}
                      onChange={e => setAutoRandomizeThemePalettes(e.target.checked)}
                    />{' '}
                    Auto-randomize colour palette themes
                  </label>
                  <label className="auto-scenes">
                    Theme duration (lines of lyrics):{' '}
                    <input
                      aria-label="Theme duration in lines of lyrics"
                      type="number"
                      min="1"
                      max="16"
                      step="1"
                      value={themeDurationLines}
                      onChange={e => setThemeDurationLines(Math.max(1, Math.min(16, Number(e.target.value) || 2)))}
                      style={{ width: 56, marginLeft: 6 }}
                    />
                  </label>
                  <label className="auto-scenes">
                    Theme duration without lyrics (sec):{' '}
                    <input
                      aria-label="Theme duration in seconds for songs without lyrics"
                      type="number"
                      min="4"
                      max="60"
                      step="2"
                      value={themeDurationSeconds}
                      onChange={e => setThemeDurationSeconds(Math.max(4, Math.min(60, Number(e.target.value) || 12)))}
                      style={{ width: 58, marginLeft: 6 }}
                    />
                  </label>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
                  >
                    Enable All {choices.length} Themes
                  </button>
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

                <div className="kinetic-motion-grid">
                  {choices
                    .filter(item => {
                      if (sceneFilter === 'enabled') return enabledScenes.includes(item.id);
                      if (sceneFilter === 'all') return true;
                      return item.family === sceneFilter;
                    })
                    .map(item => {
                      const isEnabled = enabledScenes.includes(item.id);
                      const isSelectedSingle = scene === item.id && !autoScenes;
                      const activePalette = resolveThemePalette(item.id, themePalettes[item.id]);
                      return (
                        <div
                          className={
                            'kinetic-motion-card scene-card ' +
                            (isEnabled ? 'enabled ' : 'disabled scene-disabled ') +
                            (isSelectedSingle ? 'selected' : '')
                          }
                          key={item.id}
                          onClick={() => {
                            setScene(item.id);
                            setAutoScenes(false);
                          }}
                        >
                          <div className="kinetic-motion-top">
                            <strong>
                              {item.label}
                              {isSelectedSingle ? ' · ACTIVE' : ''}
                            </strong>
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
                              {isEnabled ? (
                                <>
                                  <Check size={12} /> ON
                                </>
                              ) : (
                                'OFF'
                              )}
                            </button>
                          </div>
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
                        </div>
                      );
                    })}
                </div>
              </section>
            </div>
          </div>

          {/* SECTION 8: CAMERA SHAKE, AUDIO REACTIVITY & 64-BAND SPECTRUM */}
          <div className={'settings-accordion ' + (openSections.includes('audio-engine') ? 'is-open' : '')}>
            <button
              type="button"
              className="settings-accordion-header"
              aria-expanded={openSections.includes('audio-engine')}
              onClick={() => toggleSettingsSection('audio-engine')}
            >
              <span className="settings-accordion-title">
                <SlidersHorizontal size={16} />
                <span>
                  <b>Camera Shake, Audio Reactivity &amp; Spectrum</b>
                  <small>
                    Shake {cameraShakeEnabled ? 'ON' : 'OFF'} · Intensity {intensity}% · Speed {speed}%
                  </small>
                </span>
              </span>
              <ChevronDown
                size={17}
                className={'settings-accordion-chevron ' + (openSections.includes('audio-engine') ? 'rotated' : '')}
              />
            </button>
            <div
              className={
                'settings-accordion-body ' +
                (openSections.includes('audio-engine') ? 'is-open' : 'is-collapsed')
              }
            >
              <div className="settings-group-block">
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
                            ? `Sensitivity ${cameraShakeSensitivity}% sets bass trigger threshold ≥ ${activeBassThresholdPct}%`
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
              </div>
            </div>
          </div>
        </aside>
      </div>

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