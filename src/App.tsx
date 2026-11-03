import {isSyncedLyricsSource,lyricProviderName,normalizeLyricSource} from './lyrics/sourceLabels';
import {selectYouTubeBackgroundCandidate} from './music/videoMatching';
import {selectedPaletteIds,togglePaletteSelection,enableAllPaletteSelections,enableAllPalettesForTheme,type ThemePaletteSelections} from './visualization/cinematic/themeSelection';
import {normalizeLyricLayout,type LyricLayoutSettings} from './lyrics/lyricLayout';
import {
  AudioLines,
  Instagram,
  LogOut,
  Monitor,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAudioFrequencyBands,
  setAudioSensitivity,
  setSpectrumSensitivity,
  setVirtualMediaTime,
} from "./audio/audioSignal";
import AudioSourceHub, {
  type AudioSourceHubHandle,
  type AudioSourceMode,
} from "./audio/AudioSourceHub";
import {
  getCurrentExternalMedia,
  startExternalAudioCapture,
  stopExternalAudioCapture,
  subscribeExternalMedia,
  type ExternalAudioCaptureMode,
  type ExternalMediaState,
} from "./audio/externalPlayer";
import LocalPlayer, { type LocalPlayerHandle } from "./audio/LocalPlayer";
import {
  ALL_FONT_PACKS,
  ALL_KINETIC_MOTIONS,
  ALL_SCENE_IDS,
  cloudPreferencesPayload,
  loadLocalPreferences,
  saveCloudPreferences,
  saveLocalPreferences,
  watchCloudPreferences,
  type User,
  type UserPreferencesData,
} from "./firebase/firebaseClient";
import {
  LYRIC_ENGINE_OPTIONS,
  type LyricEngineOption,
  type YouTubeSubtitleTrackItem,
} from "./lyrics/lyricFlowEngine";
import { clampLyricDelay, formatLyricDelay } from "./lyrics/lyricTiming";
import ManualLyrics, {
  LYRIC_COLOR_MAP,
  describeLyricProvider,
  type IncomingLyrics,
  type LyricColorMode,
} from "./lyrics/ManualLyrics";
import { saveTrackCorrection } from "./metadata/metadataStore";
import TrackFinder from "./metadata/TrackFinder";
import {
  extractYouTubeVideoId,
  isAdvertisementTrack,
  isLyricVideoTrack,
  type TrackInfo,
} from "./metadata/trackInfo";
import {prepareSongVideo} from './data/songPreparation';
import {localSongData} from './data/localSongData';
import {saveSongMapping} from './data/saveSongMapping';
import {useSongPreloader} from './data/useSongPreloader';
import {TEMPORARY_SONG_EVENT} from './data/temporarySongs';
import {formatViewCount,type SongResult} from "./music/providers";
import { useVideoAutoSync } from "./music/useVideoAutoSync";
import { useVideoRecovery } from "./music/useVideoRecovery";
import {
  getEnabledRomanizationLanguages,
  getRomanizationMasterEnabled,
  setEnabledRomanizationLanguages as persistEnabledRomanizationLanguages,
  setRomanizationMasterEnabled,
  type RomanizationLanguageCode,
} from "./romanization/romanize";
import {
  TEMPLATES,
  byId,
  type FontPack,
  type SceneId,
  type VoxelWallCategory,
} from "./visualization/cinematic/catalog";
import CinematicStage, {
  type Quality,
  type VideoFitMode,
  type YouTubeBackgroundMode,
} from "./visualization/cinematic/CinematicStage";
import {
  extractAlbumArtPalette,
  getDeterministicSongPalette,
  type AlbumArtLyricPalette,
} from "./visualization/cinematic/contrast";
import {
  FONT_SHOWCASE,
  fontLabel,
  preloadLyricFonts,
} from "./visualization/cinematic/fonts";
import {ALL_CURRENT_WORD_STYLE_IDS,CURRENT_WORD_STYLES,normalizeWordStyle,normalizeWordStylePool,type CurrentWordStyle} from "./visualization/cinematic/currentWordStyles";
import {
  ALL_PLACEMENT_MODES,
  DEFAULT_VIDEO_PLACEMENTS,
  DEFAULT_THEME_PLACEMENTS,
  LYRIC_PLACEMENT_MODES,
  VOXELVERSE_STYLES,
  normalizeMotionPool,
  type LyricFillPaceMode,
  type LyricMotion,
  type LyricPlacementMode,
  type VoxelVerseFamily,
} from "./visualization/cinematic/kineticTypography";

import AccountControls from "./auth/AccountControls";
import YouTubeAccountControl from "./auth/YouTubeAccountControl";
import CorrectionControls from "./firebase/CorrectionControls";
import {
  lyricFingerprint,
  correctionKey,
  type LyricsSelection,
} from "./firebase/correctionModel";
import { discardSongCorrections, importGuestCorrections } from "./firebase/correctionStore";
import { scopedKey, writeDevice } from "./firebase/deviceStore";
import {
  importGuestSongMappings,
  useSongMapping,
} from "./firebase/songMappings";
import { useCorrection } from "./firebase/useCorrection";
import {
  importGuestCustomLyrics,
  legacySongDelay,
  usePrivateLyrics,
} from "./firebase/usePrivateLyrics";
import YouTubeBackgroundPicker from "./music/YouTubeBackgroundPicker";
import {ALL_THEME_TRANSITIONS,THEME_TRANSITIONS} from "./visualization/cinematic/themeTransitions";
import {ALL_CURRENT_WORD_ANIMATION_IDS,CURRENT_WORD_ANIMATIONS,normalizeWordAnimationPool,type CurrentWordAnimation} from "./visualization/cinematic/currentWordAnimations";
import type {Transition} from "./visualization/cinematic/catalog";
import OptionPreview,{PreviewSetting,type OptionPreviewSpec} from "./ui/OptionPreview";
import SettingsPanel, {
  RangeSetting,
  SettingGroup,
  SwitchSetting,
  type SettingsPage,
} from "./ui/SettingsPanel";
import AppUpdateControl from "./updates/AppUpdateControl";
import DataTransferSettings from './data/DataTransferSettings';
import type {SettingsBackupData} from './data/backupData';

const choices = TEMPLATES;

type ThemeMode = "system" | "dark" | "light";
export default function App({ user = null }: { user?: User | null }) {
  const uid = user?.uid || null;
  const [initialPrefs] = useState(() => loadLocalPreferences(uid));
  const [syncStatus, setSyncStatus] = useState(
    user ? "Connecting account sync…" : "Guest · saved on this device",
  );
  const [cloudReady, setCloudReady] = useState(!user);
  const remotePreferences = useRef("");

  // Audio source selection state (remember last used source)
  const [sourceMode, setSourceModeState] = useState<AudioSourceMode | null>(
    () => {
      try {
        const saved = localStorage.getItem("lyricflow.lastSourceMode");
        if (saved === "online" || saved === "local" || saved === "external")
          return saved;
      } catch {}
      return null;
    },
  );
  const setSourceMode = useCallback((mode: AudioSourceMode | null) => {
    setSourceModeState(mode);
    if (mode) {
      try {
        localStorage.setItem("lyricflow.lastSourceMode", mode);
      } catch {}
    }
  }, []);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Extended settings persisted on device
  const [initialExtended] = useState(() => {
    try {
      const raw = localStorage.getItem("lyricflow.extendedSettings.v1");
      if (raw) return JSON.parse(raw) as Record<string, unknown>;
    } catch {}
    return {};
  });

  // Theme Mode: Dark, Light, or Follow System
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = initialExtended.themeMode;
    return saved === "dark" || saved === "light" || saved === "system"
      ? saved
      : "system";
  });
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-color-scheme: light)").matches;
    }
    return false;
  });
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemPrefersLight(e.matches);
    setSystemPrefersLight(mql.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    return undefined;
  }, []);
  const resolvedTheme: "dark" | "light" =
    themeMode === "system"
      ? systemPrefersLight
        ? "light"
        : "dark"
      : themeMode;
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    }
  }, [resolvedTheme]);

  const [settingsPage, setSettingsPage] = useState<SettingsPage>("mapping");
  const [mappingTarget, setMappingTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [mappingSearchOpen, setMappingSearchOpen] = useState(false);
  const [settingsSession,setSettingsSession]=useState(0);
  const [playerOverlayOpen, setPlayerOverlayOpen] = useState(false);
  const [showFps, setShowFps] = useState(
    () => initialExtended.showFps !== false,
  );
  const closeSettings = useCallback(() => setCinemaControlsOpen(false), []);
  const openSettings = useCallback(() => {
    setSettingsPage("mapping");
    setSettingsSession(session=>session+1);
    setMappingSearchOpen(false);
    setCustomEditOpen(false);
    setCinemaControlsOpen(true);
  }, []);

  // Android External Player & Auto-matched YouTube Video state
  const [autoVideoMatch, setAutoVideoMatch] = useState<{
    key: string;
    id: string | null;
    pending: boolean;
    videos: SongResult[];
    candidates?: SongResult[];
    candidateCount: number;
  }>({ key: "", id: null, pending: false, videos: [], candidateCount: 0 });
  const [manualVideoSearchKey, setManualVideoSearchKey] = useState("");
  const [selectedVideoMetadata,setSelectedVideoMetadata]=useState<SongResult|null>(null);
  const [externalAudioMode, setExternalAudioMode] =
    useState<ExternalAudioCaptureMode>("internal");
  const [externalMedia, setExternalMedia] = useState<ExternalMediaState | null>(
    null,
  );
  const [notificationAccessGranted, setNotificationAccessGranted] =
    useState<boolean>(false);
  const [externalAudioStatus, setExternalAudioStatus] = useState<string>("");
  const [externalAudioStarting, setExternalAudioStarting] = useState(false);
  const [externalAudioActive, setExternalAudioActive] = useState(false);
  const externalCaptureRequest=useRef(0);

  // Visualizer & VoxelWall / VoxelVerse filter state
  const [,] = useState<"all" | VoxelWallCategory | "enabled">("all");
  const [,] = useState<"all" | "featured" | VoxelVerseFamily>("all");
  const [scene, setScene] = useState<SceneId>(initialPrefs.display.scene);
  const [intensity, setIntensity] = useState(initialPrefs.intensity);
  const [speed, setSpeed] = useState(initialPrefs.speed);
  const [sensitivity, setSensitivity] = useState(initialPrefs.sensitivity);
  const [spectrumSensitivity, setSpectrumControl] = useState(
    initialPrefs.spectrumGain,
  );
  const [motionBlur, setMotionBlur] = useState(initialPrefs.motionBlur);
  const [quality, setQuality] = useState<Quality>(initialPrefs.quality);
  const [spatialTypography, setSpatialTypography] = useState(
    initialPrefs.spatialTypography,
  );
  const [enabledScenes, setEnabledScenes] = useState<SceneId[]>(
    initialPrefs.enabledScenes,
  );
  const autoScenes=enabledScenes.length>1;
  const [autoKineticMotion, setAutoKineticMotion] = useState<boolean>(
    initialPrefs.autoKineticMotion ?? true,
  );
  const [manualKineticMotion, setManualKineticMotion] = useState<LyricMotion>(
    initialPrefs.manualKineticMotion || "ship",
  );
  const [enabledKineticMotions, setEnabledKineticMotions] = useState<
    LyricMotion[]
  >(() => {
    const saved=initialExtended.enabledKineticMotions;
    return normalizeMotionPool(saved,initialExtended.motionCatalogVersion!==2)??normalizeMotionPool(initialPrefs.enabledKineticMotions,initialExtended.motionCatalogVersion!==2)??[...ALL_KINETIC_MOTIONS];
  });
  const [enabledPlacements, setEnabledPlacements] = useState<
    Exclude<LyricPlacementMode, "auto">[]
  >(initialPrefs.enabledPlacements || [...ALL_PLACEMENT_MODES]);
  const [wordStylesEnabled, setWordStylesEnabled] = useState(initialExtended.wordStylesEnabled !== false);
  const [currentWordStyle,setCurrentWordStyle] = useState<CurrentWordStyle>(() =>
    normalizeWordStyle(initialExtended.currentWordStyle)||"classic-capsule",
  );
  const [enabledWordStyles,setEnabledWordStyles]=useState<CurrentWordStyle[]>(()=>{
    const saved=initialExtended.enabledWordStyles;
    return normalizeWordStylePool(saved)??[...ALL_CURRENT_WORD_STYLE_IDS];
  });
  const [enabledThemeTransitions,setEnabledThemeTransitions]=useState<Transition[]>(()=>{
    const saved=initialExtended.enabledThemeTransitions;
    return Array.isArray(saved)?saved.filter((id):id is Transition=>ALL_THEME_TRANSITIONS.includes(id as Transition)):[...ALL_THEME_TRANSITIONS];
  });
  const [wordAnimationsEnabled,setWordAnimationsEnabled]=useState(initialExtended.wordAnimationsEnabled===undefined?initialExtended.wordStylesEnabled!==false:initialExtended.wordAnimationsEnabled!==false);
  const [enabledWordAnimations,setEnabledWordAnimations]=useState<CurrentWordAnimation[]>(()=>
    normalizeWordAnimationPool(initialExtended.enabledWordAnimations)??[...ALL_CURRENT_WORD_ANIMATION_IDS],
  );
  const [optionPreview,setOptionPreview]=useState<OptionPreviewSpec|null>(null);
  const closeOptionPreview=useCallback(()=>setOptionPreview(null),[]);
  // Two separate placement sets: Video Background (default 'bottom-right' / Right Bottom) vs Built-in Themes (default 'center' / Centre Stage)
  const [videoPlacementMode,setVideoPlacementMode] =
    useState<LyricPlacementMode>(() => {
      const v = initialExtended.videoPlacementMode;
      return typeof v === "string" &&
        LYRIC_PLACEMENT_MODES.some((pm) => pm.id === v)
        ? (v as LyricPlacementMode)
        : "bottom-right";
    });
  const [enabledVideoPlacements, setEnabledVideoPlacements] = useState<
    Exclude<LyricPlacementMode, "auto">[]
  >(() => {
    const arr = initialExtended.enabledVideoPlacements;
    if (Array.isArray(arr)) {
      const valid = arr.filter((p): p is Exclude<LyricPlacementMode, "auto"> =>
        ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, "auto">),
      );
      if (valid.length > 0) return valid;
    }
    return [...DEFAULT_VIDEO_PLACEMENTS];
  });
  const [themePlacementMode,setThemePlacementMode] =
    useState<LyricPlacementMode>(() => {
      const v = initialExtended.themePlacementMode;
      return typeof v === "string" &&
        LYRIC_PLACEMENT_MODES.some((pm) => pm.id === v)
        ? (v as LyricPlacementMode)
        : "center";
    });
  const [enabledThemePlacements, setEnabledThemePlacements] = useState<
    Exclude<LyricPlacementMode, "auto">[]
  >(() => {
    const arr = initialExtended.enabledThemePlacements;
    if (Array.isArray(arr)) {
      const valid = arr.filter((p): p is Exclude<LyricPlacementMode, "auto"> =>
        ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, "auto">),
      );
      if (valid.length > 0) return valid;
    }
    return [...DEFAULT_THEME_PLACEMENTS];
  });
  // Theme rotation duration in lyric lines and seconds without lyrics
  const [themeDurationLines, setThemeDurationLines] = useState<number>(() => {
    const n = Number(initialExtended.themeDurationLines);
    return Number.isFinite(n) && n >= 1 && n <= 16 ? Math.round(n) : 2;
  });
  const [themeDurationSeconds, setThemeDurationSeconds] = useState<number>(
    () => {
      const n = Number(initialExtended.themeDurationSeconds);
      return Number.isFinite(n) && n >= 4 && n <= 60 ? Math.round(n) : 6;
    },
  );
  // Romanization master toggle & supported languages
  const [romanizationEnabled, setRomanizationEnabledState] = useState<boolean>(
    () => getRomanizationMasterEnabled(),
  );
  const [enabledRomanizationLanguages, setEnabledRomanizationLanguagesState] =
    useState<RomanizationLanguageCode[]>(() =>
      getEnabledRomanizationLanguages(),
    );
  const setRomanizationEnabled = useCallback((next: boolean) => {
    setRomanizationMasterEnabled(next);
    setRomanizationEnabledState(next);
  }, []);
  const setEnabledRomanizationLanguages = useCallback(
    (langs: RomanizationLanguageCode[]) => {
      persistEnabledRomanizationLanguages(langs);
      setEnabledRomanizationLanguagesState(langs);
    },
    [],
  );

  const [autoFonts, setAutoFonts] = useState<boolean>(
    initialPrefs.autoFonts ?? true,
  );
  const [manualFont, setManualFont] = useState<FontPack>(
    initialPrefs.manualFont || "impact",
  );
  const [enabledFonts, setEnabledFonts] = useState<FontPack[]>(()=>{
    const saved=initialExtended.enabledFonts;
    const valid=Array.isArray(saved)?saved.filter((id):id is FontPack=>ALL_FONT_PACKS.includes(id as FontPack)):[];
    return valid.length?valid:initialPrefs.enabledFonts||[...ALL_FONT_PACKS];
  });
  const [cameraShakeEnabled, setCameraShakeEnabled] = useState<boolean>(
    initialPrefs.cameraShakeEnabled,
  );
  const [cameraShakeSensitivity, setCameraShakeSensitivity] = useState<number>(
    initialPrefs.cameraShakeSensitivity,
  );
  const [lyricMinFontSize, setLyricMinFontSize] = useState<number>(
    initialPrefs.lyricMinFontSize,
  );
  const [lyricMaxFontSize, setLyricMaxFontSize] = useState<number>(
    initialPrefs.lyricMaxFontSize,
  );
  const [lyricLayout, setLyricLayout] = useState<LyricLayoutSettings>(() =>
    normalizeLyricLayout(initialExtended.lyricLayout as Partial<LyricLayoutSettings>),
  );
  const [lyricFontScale, setLyricFontScale] = useState<number>(() => {
    const saved = Number(initialExtended.lyricFontScale);
    if (Number.isFinite(saved) && saved >= 0.5 && saved <= 1.8) return saved;
    return 1;
  });
  const [themePalettes, setThemePalettes] = useState<ThemePaletteSelections>(
    initialPrefs.themePalettes,
  );

  // YouTube video background, fit mode, black overlay opacity, SponsorBlock & embedded lyric auto-hide state
  const [preferredVideoType, setPreferredVideoType] = useState(
    initialPrefs.display.preferredVideoType,
  );
  const [youtubeBackgroundMode, setYoutubeBackgroundMode] =
    useState<YouTubeBackgroundMode>(initialPrefs.display.youtubeBackgroundMode);
  const [videoFitMode, setVideoFitMode] = useState<VideoFitMode>(() =>
    initialExtended.videoFitMode === "default" ? "default" : "stretch",
  );
  const [videoOverlayOpacity, setVideoOverlayOpacity] = useState<number>(
    initialPrefs.display.videoOverlayOpacity,
  );
  const [autoHideYoutubeLyrics, setAutoHideYoutubeLyrics] = useState<boolean>(
    initialPrefs.display.autoHideYoutubeLyrics,
  );
  const [hasSeparateAudioStream, setHasSeparateAudioStream] =
    useState<boolean>(true);
  const [playerVolume, setPlayerVolume] = useState<number>(
    initialPrefs.display.playerVolume,
  );
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState<boolean>(
    initialPrefs.display.sponsorBlockEnabled,
  );
  const [leadingNonMusicOffsetSec, setLeadingNonMusicOffsetSec] =
    useState<number>(0);

  const [albumArtPalette, setAlbumArtPalette] =
    useState<{key:string;palette:AlbumArtLyricPalette} | null>(null);

  // Shared lyric display, available engine options, subtitle tracks, spatial placement & color controls
  const [lyricEngineOption, setLyricEngineOption] =
    useState<LyricEngineOption>("lyricflow");
  const [availableLyricEngines, setAvailableLyricEngines] = useState<
    LyricEngineOption[]
  >([]);
  const [youtubeSubtitleTracks, setYoutubeSubtitleTracks] = useState<
    YouTubeSubtitleTrackItem[]
  >([]);
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<
    string | undefined
  >(undefined);
  const [lyricPlacementMode, setLyricPlacementMode] =
    useState<LyricPlacementMode>(initialPrefs.display.lyricPlacementMode);
  const [lyricColorMode, setLyricColorMode] = useState<LyricColorMode>(
    initialPrefs.display.lyricColorMode,
  );
  const [lyricFillPaceMode, setLyricFillPaceMode] = useState<LyricFillPaceMode>(
    initialPrefs.display.lyricFillPaceMode,
  );
  const [lyricDisplayMode, setLyricDisplayMode] = useState<
    "original" | "romanized" | "both"
  >(initialPrefs.display.lyricDisplayMode);

  const [renderStatus, setRenderStatus] = useState("VOXELWALL 2D ENGINE");
  const spectrumCanvas = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LocalPlayerHandle>(null);
  const audioHubRef = useRef<AudioSourceHubHandle>(null);
  const [cinemaControlsOpen, setCinemaControlsOpen] = useState(false);
  const [fullscreenPlayerOpen, setFullscreenPlayerOpen] = useState(false);
  const [cinemaHudVisible, setCinemaHudVisible] = useState(true);
  const cinemaHudTimerRef = useRef<number | null>(null);
  const videoCorrectionSaveRef = useRef<(() => boolean) | null>(null);

  // Lyrics & per-song delay state

  const [customEditOpen, setCustomEditOpen] = useState(false);
  const [lyricStatusMessage, setLyricStatusMessage] = useState("");
  const [lyricStatusRecordingKey,setLyricStatusRecordingKey]=useState("");

  const [demo, setDemo] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    initialPrefs.display.reducedMotion,
  );
  const [fps, setFps] = useState(0);
  const [fullscreenError, setFullscreenError] = useState("");
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localTrack, setLocalTrack] = useState<TrackInfo | null>(null);
  const [songQueue,setSongQueue]=useState<TrackInfo[]>([]);
  useSongPreloader(localTrack,songQueue,uid,preferredVideoType);
  const [incoming, setIncoming] = useState<IncomingLyrics | null>(null);
  const [activeLyrics, setActiveLyrics] = useState({
    recordingKey: "",
    lyricsKey: "",
    name: "",
    url: "",
    original: "",
    hasContent: false,
    offset: 0,
  });
  const [fileEpoch, setFileEpoch] = useState(0);
  const [performance, setPerformance] = useState(false);

  // Full screen mode: show controls on tap/click, hide on second tap/click, and auto-hide after 2 seconds (2000ms)
  const clearCinemaHudTimer = useCallback(() => {
    if (cinemaHudTimerRef.current !== null) {
      window.clearTimeout(cinemaHudTimerRef.current);
      cinemaHudTimerRef.current = null;
    }
  }, []);

  const scheduleCinemaHudHide = useCallback(() => {
    clearCinemaHudTimer();
    cinemaHudTimerRef.current = window.setTimeout(() => {
      setCinemaHudVisible(false);
    }, 2000);
  }, [clearCinemaHudTimer]);

  const revealCinemaHud = useCallback(() => {
    setCinemaHudVisible(true);
    scheduleCinemaHudHide();
  }, [scheduleCinemaHudHide]);

  const hideCinemaHud = useCallback(() => {
    clearCinemaHudTimer();
    setCinemaHudVisible(false);
    setFullscreenPlayerOpen(false);
    setCinemaControlsOpen(false);
  }, [clearCinemaHudTimer]);

  const toggleCinemaHud = useCallback(() => {
    if (cinemaHudVisible || fullscreenPlayerOpen || cinemaControlsOpen) {
      hideCinemaHud();
    } else {
      revealCinemaHud();
    }
  }, [
    cinemaHudVisible,
    fullscreenPlayerOpen,
    cinemaControlsOpen,
    hideCinemaHud,
    revealCinemaHud,
  ]);

  useEffect(() => {
    if (!performance) {
      clearCinemaHudTimer();
      setCinemaHudVisible(true);
      setFullscreenPlayerOpen(false);
      return;
    }
    if (
      !cinemaControlsOpen &&
      !fullscreenPlayerOpen &&
      !playerOverlayOpen &&
      !sourceOpen
    ) {
      if (cinemaHudVisible) {
        scheduleCinemaHudHide();
      }
    } else {
      clearCinemaHudTimer();
    }
    return () => {
      clearCinemaHudTimer();
    };
  }, [
    performance,
    cinemaHudVisible,
    cinemaControlsOpen,
    fullscreenPlayerOpen,
    playerOverlayOpen,
    sourceOpen,
    scheduleCinemaHudHide,
    clearCinemaHudTimer,
  ]);

  const songMapping = useSongMapping(localTrack, uid);
  const lyricsFix = useCorrection(localTrack, "lyrics", uid);
  const videoFix = useCorrection(localTrack, "video", uid);
  const recordingKey = lyricsFix.context?.recordingKey || "";
  const [savedMappingKey,setSavedMappingKey]=useState('');
  const [mappingSaveError,setMappingSaveError]=useState('');
  useEffect(()=>{setSavedMappingKey('');setMappingSaveError('');},[recordingKey]);
  useEffect(()=>{
    if(!savedMappingKey)return;
    const timer=window.setTimeout(()=>setSavedMappingKey(''),2000);
    const edited=()=>setSavedMappingKey('');window.addEventListener(TEMPORARY_SONG_EVENT,edited);
    return()=>{window.clearTimeout(timer);window.removeEventListener(TEMPORARY_SONG_EVENT,edited);};
  },[savedMappingKey]);
  const lyricsKey =
    activeLyrics.recordingKey === recordingKey ? activeLyrics.lyricsKey : "";
  const onLyricContentChange = useCallback(
    (original: string, sourceUrl: string, sourceName: string, offset = 0, hasContent = Boolean(original.trim())) => {
      const nextKey = lyricFingerprint(original, sourceUrl);
      const nextName = sourceName.slice(0, 256);
      if(original.trim()&&/^(?:Custom Edited|Custom TTML Override|Local File)/.test(sourceName)){
        const draft=localSongData(localTrack,uid);
        if(draft.text!==original||draft.mapping?.lyrics?.sourceFile.revision!==nextKey)
          saveMappedLyrics({original,romanized:'',source:sourceName,sourceUrl},null);
      }
      setActiveLyrics((prev) =>
        prev.recordingKey === recordingKey &&
        prev.lyricsKey === nextKey &&
        prev.name === nextName &&
        prev.url === sourceUrl &&
        prev.original === original &&
        prev.hasContent === hasContent &&
        prev.offset === offset
          ? prev
          : {
              recordingKey,
              original,
              hasContent,
              offset,
              lyricsKey: nextKey,
              name: nextName,
              url: sourceUrl,
            },
      );
    },
    [recordingKey],
  );
  const delayFix = useCorrection(
    localTrack,
    "delay",
    uid,
    lyricsKey,
    lyricsKey
      ? { name: activeLyrics.name, url: activeLyrics.url, revision: lyricsKey }
      : null,
  );
  const privateLyrics = usePrivateLyrics(localTrack, uid);
  const legacyDelay = !uid ? legacySongDelay(localTrack) : null;
  const savedCustomLrc = privateLyrics.hasOverride
    ? songMapping.personal?.lyrics&&privateLyrics.text&&lyricFingerprint(privateLyrics.text,songMapping.personal.lyrics.sourceFile.url)!==songMapping.personal.lyrics.sourceFile.revision?'':privateLyrics.text
    : legacyDelay?.customLyricsLrc || "";
  const lyricDelay =
    (songMapping.personal?.lyrics?.sourceFile.revision===lyricsKey?songMapping.personal.lyrics.delaySeconds:undefined) ?? delayFix.correction?.delaySeconds ??
    (songMapping.lyrics?.sourceFile.revision === lyricsKey
      ? songMapping.lyrics.delaySeconds
      : 0);
  const delaySavedStatus =
    delayFix.error ||
    (delayFix.source === "personal"
      ? `Your ${formatLyricDelay(lyricDelay)} correction · ${user ? "account sync enabled" : "saved on device"}`
      : delayFix.source === "approved"
        ? `Community-approved ${formatLyricDelay(lyricDelay)} correction`
        : "Automatic timing · press Save mapping for current song to keep changes");
  useEffect(() => {
    if (
      !uid &&
      legacyDelay &&
      delayFix.context &&
      delayFix.source === "automatic"
    ) {
      const marker = scopedKey(
        "legacyDelayMigrated." + delayFix.context.recordingKey,
        null,
      );
      if (!localStorage.getItem(marker)) {
        delayFix.save({
          delaySeconds: clampLyricDelay(legacyDelay.delaySeconds),
        });
        localStorage.setItem(marker, "true");
      }
    }
  }, [uid, recordingKey, lyricsKey, delayFix.source]);
  const legacyAutomaticLrc = Boolean(
    !savedCustomLrc && !songMapping.approved?.lyrics &&
      !lyricsFix.correction?.selection &&
      songMapping.lyrics?.selection?.engine === "lrclib" &&
      songMapping.lyrics.sourceFile.name.startsWith("LyricFlow Engine"),
  );
  const preferredLyricsSelection=!legacyAutomaticLrc&&songMapping.personal?.lyrics
    ?songMapping.personal.lyrics.selection
    :lyricsFix.correction?.selection||(legacyAutomaticLrc?null:songMapping.lyrics?.selection)||null;
  const preferredLyricsSource=(!legacyAutomaticLrc?songMapping.personal?.lyrics?.sourceFile:null)||
    (lyricsFix.source==='personal'?null:songMapping.approved?.lyrics?.sourceFile)||null;
  const effectiveLyricsEngine =
    preferredLyricsSelection?.engine ||
    lyricEngineOption;
  const effectiveSubtitleTrackId =
    preferredLyricsSelection?.subtitleTrackId ||
    selectedSubtitleTrackId;

  const applyPreferences = useCallback((prefs: UserPreferencesData) => {
    setIntensity(prefs.intensity);
    setSpeed(prefs.speed);
    setSensitivity(prefs.sensitivity);
    setSpectrumControl(prefs.spectrumGain);
    setMotionBlur(prefs.motionBlur);
    setQuality(prefs.quality);
    setSpatialTypography(prefs.spatialTypography);
    setEnabledScenes(prefs.enabledScenes);
    setAutoKineticMotion(prefs.autoKineticMotion ?? true);
    setManualKineticMotion(prefs.manualKineticMotion || "ship");
    // Selection windows are stored on this device, including an intentionally empty pool.
    try{
      const saved=JSON.parse(localStorage.getItem("lyricflow.extendedSettings.v1")||"{}");
      setEnabledKineticMotions(normalizeMotionPool(saved.enabledKineticMotions,saved.motionCatalogVersion!==2)??normalizeMotionPool(prefs.enabledKineticMotions,saved.motionCatalogVersion!==2)??[...ALL_KINETIC_MOTIONS]);
      const fonts=Array.isArray(saved.enabledFonts)?saved.enabledFonts.filter((id:unknown):id is FontPack=>ALL_FONT_PACKS.includes(id as FontPack)):[];
      setEnabledFonts(fonts.length?fonts:prefs.enabledFonts||[...ALL_FONT_PACKS]);
    }catch{setEnabledKineticMotions(prefs.enabledKineticMotions);setEnabledFonts(prefs.enabledFonts||[...ALL_FONT_PACKS]);}
    setEnabledPlacements(prefs.enabledPlacements || [...ALL_PLACEMENT_MODES]);
    setAutoFonts(prefs.autoFonts ?? true);
    setManualFont(prefs.manualFont || "impact");
    setCameraShakeEnabled(prefs.cameraShakeEnabled);
    setCameraShakeSensitivity(prefs.cameraShakeSensitivity);
    setLyricMinFontSize(prefs.lyricMinFontSize);
    setLyricMaxFontSize(prefs.lyricMaxFontSize);
    setThemePalettes(prefs.themePalettes);
    const d = prefs.display;
    setPreferredVideoType(d.preferredVideoType);
    setScene(d.scene);
    setReducedMotion(d.reducedMotion);
    setYoutubeBackgroundMode(d.youtubeBackgroundMode);
    setVideoOverlayOpacity(d.videoOverlayOpacity);
    setAutoHideYoutubeLyrics(d.autoHideYoutubeLyrics);
    setPlayerVolume(d.playerVolume);
    setSponsorBlockEnabled(d.sponsorBlockEnabled);
    setLyricPlacementMode(d.lyricPlacementMode);
    setLyricColorMode(d.lyricColorMode);
    setLyricFillPaceMode(d.lyricFillPaceMode);
    setLyricDisplayMode(d.lyricDisplayMode);
  }, []);
  useEffect(() => {
    if (!user) return;
    return watchCloudPreferences(
      user,
      (prefs) => {
        remotePreferences.current = JSON.stringify(cloudPreferencesPayload(prefs));
        applyPreferences(prefs);
        setCloudReady(true);
      },
      setSyncStatus,
    );
  }, [uid, applyPreferences]);

  const applyBackupSettings=useCallback((data:SettingsBackupData)=>{
    remotePreferences.current='';
    applyPreferences(data.preferences);
    const s=data.extended;
    setThemeMode(s.themeMode);setShowFps(s.showFps);setVideoFitMode(s.videoFitMode);
    setWordStylesEnabled(s.wordStylesEnabled);setCurrentWordStyle(s.currentWordStyle);setEnabledWordStyles(s.enabledWordStyles);
    setWordAnimationsEnabled(s.wordAnimationsEnabled);setEnabledWordAnimations(s.enabledWordAnimations);
    setEnabledKineticMotions(s.enabledKineticMotions);setEnabledFonts(s.enabledFonts);setEnabledThemeTransitions(s.enabledThemeTransitions);
    setLyricFontScale(s.lyricFontScale);setLyricLayout(s.lyricLayout);
    setVideoPlacementMode(s.videoPlacementMode);setEnabledVideoPlacements(s.enabledVideoPlacements);
    setThemePlacementMode(s.themePlacementMode);setEnabledThemePlacements(s.enabledThemePlacements);
    setThemeDurationLines(s.themeDurationLines);setThemeDurationSeconds(s.themeDurationSeconds);
    setRomanizationEnabled(data.romanization.enabled);setEnabledRomanizationLanguages(data.romanization.languages);
  },[applyPreferences,setRomanizationEnabled,setEnabledRomanizationLanguages]);

  // Persist extended settings locally
  useEffect(() => {
    try {
      localStorage.setItem(
        "lyricflow.extendedSettings.v1",
        JSON.stringify({
          themeMode,
          wordStylesEnabled,
          currentWordStyle,
          enabledWordStyles,
          enabledThemeTransitions,
          wordAnimationsEnabled,
          enabledWordAnimations,
          enabledKineticMotions,
          motionCatalogVersion:2,
          enabledFonts,
          showFps,
          videoFitMode,
          lyricFontScale,
          lyricLayout,
          videoPlacementMode,
          enabledVideoPlacements,
          themePlacementMode,
          enabledThemePlacements,
          themeDurationLines,
          themeDurationSeconds,
        }),
      );
    } catch {}
  }, [
    themeMode,
    wordStylesEnabled,
    currentWordStyle,
    enabledWordStyles,
    enabledThemeTransitions,
    wordAnimationsEnabled,
    enabledWordAnimations,
    enabledKineticMotions,
    enabledFonts,
    showFps,
    videoFitMode,
    lyricFontScale,
    lyricLayout,
    videoPlacementMode,
    enabledVideoPlacements,
    themePlacementMode,
    enabledThemePlacements,
    themeDurationLines,
    themeDurationSeconds,
  ]);

  // Debounce network writes; nothing is sent from the visualizer render loop.
  useEffect(() => {
    const prefs: UserPreferencesData = {
      display: {
        preferredVideoType,
        scene,
        reducedMotion,
        youtubeBackgroundMode,
        videoOverlayOpacity,
        autoHideYoutubeLyrics,
        playerVolume,
        sponsorBlockEnabled,
        lyricPlacementMode,
        lyricColorMode,
        lyricFillPaceMode,
        lyricDisplayMode,
      },
      intensity,
      speed,
      sensitivity,
      spectrumGain: spectrumSensitivity,
      motionBlur,
      quality,
      autoScenes,
      spatialTypography:spatialTypography && enabledKineticMotions.length>0,
      narrativeObjects: false,
      cameraMode: "Front",
      enabledScenes,
      autoKineticMotion,
      manualKineticMotion,
      enabledKineticMotions:enabledKineticMotions.length?enabledKineticMotions:["ship"],
      enabledPlacements,
      autoFonts,
      manualFont,
      enabledFonts,
      enabledCameraViews: ["Front"],
      cameraShakeEnabled,
      cameraShakeSensitivity,
      lyricMinFontSize,
      lyricMaxFontSize,
      themePalettes,
    };
    try {
      saveLocalPreferences(prefs, uid);
    } catch {
      setSyncStatus(
        "Device storage is full or blocked · settings may not survive restart",
      );
    }
    if (!user || JSON.stringify(cloudPreferencesPayload(prefs)) === remotePreferences.current) return;
    // Protect a real edit made before the first cloud snapshot without uploading untouched defaults.
    if (!cloudReady && JSON.stringify(prefs) === JSON.stringify(initialPrefs))
      return;
    try {
      writeDevice(scopedKey("preferencesPending", uid), prefs);
    } catch {
      /* Existing status reports blocked local storage. */
    }
    const timer = window.setTimeout(() => {
      setSyncStatus("Saved on device · waiting to sync");
      void saveCloudPreferences(user, prefs)
        .then(() => setSyncStatus("Account settings synced"))
        .catch(() => setSyncStatus("Saved on device · cloud sync unavailable"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    intensity,
    speed,
    sensitivity,
    spectrumSensitivity,
    motionBlur,
    quality,
    autoScenes,
    spatialTypography,
    enabledScenes,
    autoKineticMotion,
    manualKineticMotion,
    enabledKineticMotions,
    enabledPlacements,
    autoFonts,
    manualFont,
    enabledFonts,
    cameraShakeEnabled,
    cameraShakeSensitivity,
    lyricMinFontSize,
    lyricMaxFontSize,
    themePalettes,
    uid,
    cloudReady,
    preferredVideoType,
    scene,
    reducedMotion,
    youtubeBackgroundMode,
    videoOverlayOpacity,
    autoHideYoutubeLyrics,
    playerVolume,
    sponsorBlockEnabled,
    lyricPlacementMode,
    lyricColorMode,
    lyricFillPaceMode,
    lyricDisplayMode,
  ]);

  const selectLyrics = (selection: LyricsSelection) => {
    if(lyricsFix.context)discardSongCorrections(uid,lyricsFix.context.identity,['lyrics','delay'],correctionKey(lyricsFix.context));
    songMapping.savePart('lyrics',null);
    privateLyrics.save("");
    lyricsFix.save({ selection });
    pendingLyricsSelection.current=selection.engine==='lyricflow'?null:{key:recordingKey,selection};
  };
  const selectEngine = (engine: LyricEngineOption) => {
    if (engine === "youtube" && effectiveLyricsEngine === "youtube")
      setFileEpoch((epoch) => epoch + 1);
    selectLyrics({ engine, lrclibId: null, subtitleTrackId: null });
  };
  const selectSubtitle = (id: string) =>
    selectLyrics({ engine: "youtube", lrclibId: null, subtitleTrackId: id });
  const updateLyricDelay = (value: number) => {
    saveCurrentLyricsMapping(value);
    delayFix.save({ delaySeconds: clampLyricDelay(value) });
  };

  const handleLyricFontScaleChange = (scale: number) => {
    const clampedScale = Math.max(
      0.5,
      Math.min(1.8, Math.round(scale * 20) / 20),
    );
    setLyricFontScale(clampedScale);
  };

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

  const handleSaveCustomOverride = (lrc: string) => {
    saveMappedLyrics({original:lrc,romanized:'',source:'Saved Custom Override'},null);
  };
  const incomingRevision = useRef(0);
  const pendingLyricsSelection=useRef<{key:string;selection:LyricsSelection}|null>(null);
  function saveMappedLyrics(lyrics:Omit<IncomingLyrics,'token'>,selection:LyricsSelection|null,delay=0){
    const text=lyrics.original||lyrics.plain||'';
    if(!text.trim()||!lyricsFix.context)return;
    lyrics={...lyrics,source:normalizeLyricSource(lyrics.source,lyrics.sourceUrl)};
    pendingLyricsSelection.current=null;
    discardSongCorrections(uid,lyricsFix.context.identity,['lyrics','delay'],selection?correctionKey(lyricsFix.context):'');
    privateLyrics.save(text);
    if(selection)lyricsFix.save({selection});
    songMapping.savePart('lyrics',{sourceFile:{name:lyrics.source.slice(0,256),url:lyrics.sourceUrl||'',revision:lyricFingerprint(text,lyrics.sourceUrl||'')},selection,delaySeconds:clampLyricDelay(delay)});
    setIncoming({...lyrics,token:++incomingRevision.current});
  }
  function saveCurrentLyricsMapping(delay=lyricDelay){
    if(!lyricsKey||activeLyrics.recordingKey!==recordingKey)return;
    const id=activeLyrics.url.match(/lrclib\.net\/api\/get\/(\d+)/)?.[1];
    const selection=id?{engine:'lrclib' as const,lrclibId:Number(id),subtitleTrackId:null}:
      activeLyrics.url?preferredLyricsSelection||{engine:effectiveLyricsEngine,lrclibId:null,subtitleTrackId:effectiveSubtitleTrackId||null}:null;
    saveMappedLyrics({original:activeLyrics.original,romanized:'',source:activeLyrics.name,sourceUrl:activeLyrics.url,title:incoming?.title,artist:incoming?.artist},selection,delay);
  }
  const acceptLyrics = (lyrics: Omit<IncomingLyrics, "token">) => {
    const pending=pendingLyricsSelection.current;
    if(pending?.key===recordingKey){
      const engine=pending.selection.engine,source=lyrics.source+' '+(lyrics.sourceUrl||'');
      if(!(engine==='apple'?isSyncedLyricsSource(lyrics.source,lyrics.sourceUrl):engine==='lrclib'?lyricProviderName(lyrics.source,lyrics.sourceUrl)==='LRCLIB':/youtube|subtitle/i.test(source))){
        if(!pending.selection.lrclibId)setIncoming({...lyrics,token:++incomingRevision.current});
        return;
      }
      if(pending.selection.lrclibId&&lyrics.sourceUrl!==`https://lrclib.net/api/get/${pending.selection.lrclibId}`)return;
      saveMappedLyrics(lyrics,pending.selection);return;
    }
    const local=localSongData(localTrack,uid),mapped=local.mapping?.lyrics;
    const saved=local.text;
    const legacy=mapped?.sourceFile.name.startsWith('LyricFlow Engine')&&!saved;
    if(mapped&&!legacy&&lyricFingerprint(lyrics.original||lyrics.plain||'',lyrics.sourceUrl||'')!==mapped.sourceFile.revision&&lyrics.mappingRevision!==mapped.sourceFile.revision)return;
    setIncoming({ ...lyrics, token: ++incomingRevision.current });
  };

  useEffect(() => {
    setSpectrumSensitivity(spectrumSensitivity / 100);
    try {
      localStorage.setItem(
        "lyricflow.spectrumGain",
        String(spectrumSensitivity),
      );
    } catch {}
  }, [spectrumSensitivity]);

  useEffect(() => {
    setAudioSensitivity(sensitivity / 100);
  }, [sensitivity]);

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        setPerformance(false);
        setFullscreenPlayerOpen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const [audioReadout, setAudioReadout] = useState({
    source: "IDLE",
    level: 0,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: 0,
    bpm: 0,
    tempoConfidence: 0,
    onset: 0,
    downbeat: 0,
    section: "unknown",
    beatCount: 0,
    flux: 0,
    threshold: 0,
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "canvas.visual-canvas",
      );
      if (!canvas) return;
      const numeric = (key: string) => Number(canvas.dataset[key] || 0);
      if (canvas.dataset.renderer)
        setRenderStatus((previous) =>
          previous === canvas.dataset.renderer
            ? previous
            : canvas.dataset.renderer || previous,
        );
      const meter = spectrumCanvas.current,
        frequency = getAudioFrequencyBands();
      if (meter) {
        const mc = meter.getContext("2d");
        if (mc) {
          const bw = meter.width / 64;
          mc.clearRect(0, 0, meter.width, meter.height);
          mc.fillStyle = "#16232e";
          mc.fillRect(0, meter.height - 1, meter.width, 1);
          for (let i = 0; i < 64; i++) {
            const e = Math.max(0, Math.min(1, frequency[i]));
            mc.fillStyle = i < 15 ? "#ffa38c" : i < 43 ? "#bc7bf0" : "#8fe2e4";
            const height = Math.max(1, e * (meter.height - 4));
            mc.fillRect(
              i * bw + 1,
              meter.height - height,
              Math.max(2, bw - 2),
              height,
            );
          }
        }
      }
      setAudioReadout({
        source: canvas.dataset.audioSource || "IDLE",
        level: numeric("audioLevel"),
        bass: numeric("audioBass"),
        mids: numeric("audioMids"),
        treble: numeric("audioTreble"),
        beat: numeric("audioBeat"),
        bpm: numeric("audioBpm"),
        tempoConfidence: numeric("audioTempoConfidence"),
        onset: numeric("audioOnset"),
        downbeat: numeric("audioDownbeat"),
        section: canvas.dataset.audioSection || "unknown",
        beatCount: numeric("audioBeatCount"),
        flux: numeric("audioFlux"),
        threshold: numeric("audioThreshold"),
      });
    }, 260);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const v =
        document.querySelector<HTMLCanvasElement>(".visual-canvas")?.dataset
          .fps;
      if (v) setFps(Number(v));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const togglePerformance = async () => {
    if (performance) {
      setPerformance(false);
      setCinemaControlsOpen(false);
      setFullscreenPlayerOpen(false);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      return;
    }
    setPerformance(true);
    setCinemaControlsOpen(false);
    setFullscreenPlayerOpen(false);
    setCinemaHudVisible(true);
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        "Browser fullscreen was blocked. Cinema mode still works; use the dock to access controls.",
      );
    }
  };

  const toggleSceneEnabled = (id: SceneId) => {
    setEnabledScenes((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  const toggleKineticMotionEnabled = (motion: LyricMotion) => {
    setEnabledKineticMotions(prev=>prev.includes(motion)?prev.filter(item=>item!==motion):[...prev,motion]);
  };
  const toggleWordStyleEnabled = (style:CurrentWordStyle) => {
    setEnabledWordStyles(prev=>prev.includes(style)?prev.filter(item=>item!==style):[...prev,style]);
  };

  const toggleVideoPlacementEnabled = (
    pm: Exclude<LyricPlacementMode, "auto">,
  ) => {
    setEnabledVideoPlacements((prev) => {
      if (prev.includes(pm)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== pm);
      }
      return [...prev, pm];
    });
  };

  const toggleThemePlacementEnabled = (
    pm: Exclude<LyricPlacementMode, "auto">,
  ) => {
    setEnabledThemePlacements((prev) => {
      if (prev.includes(pm)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== pm);
      }
      return [...prev, pm];
    });
  };

  const toggleFontEnabled = (font: FontPack) => {
    setEnabledFonts((prev) => {
      if (prev.includes(font)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== font);
      }
      return [...prev, font];
    });
  };

  const effectiveKineticMotions: readonly LyricMotion[] = enabledKineticMotions;
  const effectiveFonts: readonly FontPack[] = enabledFonts;

  useEffect(() => {
    void preloadLyricFonts(effectiveFonts);
  }, [effectiveFonts]);

  const isAdPlaying = Boolean(
    (sourceMode === "external" &&
      (externalMedia?.isAd || isAdvertisementTrack(externalMedia))) ||
      isAdvertisementTrack(localTrack),
  );

  const [rejectedBgVideoIds, setRejectedBgVideoIds] = useState<string[]>([]);

  const mappedYoutubeVideoId = hasSeparateAudioStream
    ? songMapping.personal?.video?.youtubeVideoId || videoFix.correction?.youtubeVideoId ||
      songMapping.video?.youtubeVideoId ||
      null
    : null;
  const activeYoutubeVideoId = isAdPlaying
    ? null
    : hasSeparateAudioStream
      ? mappedYoutubeVideoId &&
        !rejectedBgVideoIds.includes(mappedYoutubeVideoId)
        ? mappedYoutubeVideoId
        : null
      : extractYouTubeVideoId(localTrack);

  const videoSearchKey = localTrack
    ? [
        localTrack.title,
        localTrack.artist,
        localTrack.album || "",
        Math.round(localTrack.duration),
        localTrack.provider,
        preferredVideoType,
      ].join("|")
    : "";
  const filteredAutoVideos =
    autoVideoMatch.key === videoSearchKey
      ? autoVideoMatch.videos.filter((v) => {
          const id = extractYouTubeVideoId(v);
          return Boolean(id && !rejectedBgVideoIds.includes(id));
        })
      : [];
  const preloadedVideoChoices=useMemo(()=>autoVideoMatch.key===videoSearchKey
    ?(autoVideoMatch.candidates||autoVideoMatch.videos).filter(v=>{const id=extractYouTubeVideoId(v);return id&&!rejectedBgVideoIds.includes(id);})
    :[],[autoVideoMatch,videoSearchKey,rejectedBgVideoIds]);
  const autoYoutubeVideoId = autoVideoMatch.key===videoSearchKey&&localTrack
    ? selectYouTubeBackgroundCandidate(filteredAutoVideos,localTrack,preferredVideoType)
    : null;
  const videoSearchPending =
    Boolean(manualVideoSearchKey === recordingKey && manualVideoSearchKey) ||
    Boolean(
      hasSeparateAudioStream &&
        localTrack &&
        !isAdPlaying &&
        !activeYoutubeVideoId &&
        (autoVideoMatch.key !== videoSearchKey || autoVideoMatch.pending),
    );

  // Find a background for the current recording; stale results never carry into another song.
  useEffect(() => {
    if(songMapping.hideVideo||mappedYoutubeVideoId){
      setAutoVideoMatch(previous=>previous.key===videoSearchKey?{...previous,pending:false}:
        {key:videoSearchKey,id:null,pending:false,videos:[],candidateCount:0});
      return;
    }
    if (
      !localTrack ||
      isAdPlaying ||
      isAdvertisementTrack(localTrack) ||
      !hasSeparateAudioStream ||
      (localTrack.provider !== "jiosaavn" &&
        localTrack.provider !== "external" &&
        localTrack.provider !== "local")
    ) {
      setAutoVideoMatch({
        key: videoSearchKey,
        id: null,
        pending: false,
        videos: [],
        candidateCount: 0,
      });
      return;
    }
    const controller = new AbortController();
    setAutoVideoMatch({
      key: videoSearchKey,
      id: null,
      pending: true,
      videos: [],
      candidateCount: 0,
    });
    const base =
      localStorage.getItem("lyricflow.resolver") ||
      import.meta.env.VITE_MUSIC_RESOLVER ||
      "";
    void prepareSongVideo(
      localTrack,
      uid,
      preferredVideoType,
      base,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if(!result)return;
        const { videos, candidates, candidateCount, automaticVideoId }=result;
        const bestId = automaticVideoId;
        setAutoVideoMatch({
          key: videoSearchKey,
          id: bestId || null,
          pending: false,
          videos,
          candidates,
          candidateCount,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setAutoVideoMatch({
            key: videoSearchKey,
            id: null,
            pending: false,
            videos: [],
            candidateCount: 0,
          });
      });
    return () => controller.abort();
  }, [
    localTrack?.title,
    localTrack?.artist,
    localTrack?.album,
    localTrack?.duration,
    localTrack?.provider,
    localTrack?.isAd,
    isAdPlaying,
    songMapping.hideVideo,
    mappedYoutubeVideoId,
    hasSeparateAudioStream,
    preferredVideoType,
  ]);

  // Android External Player: listen for notification media sessions & sync song metadata + playback position
  useEffect(() => {
    if (sourceMode !== "external") return;
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
        if (
          typeof media.position === "number" &&
          Number.isFinite(media.position)
        ) {
          setLocalTime(media.position);
          setVirtualMediaTime(media.position);
        }
        if (adDetected) {
          setAutoVideoMatch({
            key: "",
            id: null,
            pending: false,
            videos: [],
            candidateCount: 0,
          });
          setIncoming(null);
        }
        setLocalTrack((prev) => {
          const nextTitle = media.title.trim();
          const nextArtist = (media.artist || "").trim();
          const nextAlbum = (media.album || "").trim();
          const nextDur =
            media.duration && media.duration > 0
              ? media.duration
              : (prev?.duration ?? 0);
          const nextAudioSource = media.appName
            ? `External Player (${media.appName})`
            : "External Player (Android)";
          if (
            prev &&
            prev.provider === "external" &&
            prev.title === nextTitle &&
            prev.artist === nextArtist &&
            prev.album === nextAlbum &&
            Boolean(prev.isAd) === adDetected
          ) {
            if (nextDur && prev.duration !== nextDur) {
              return {
                ...prev,
                duration: nextDur,
                audioSource: nextAudioSource,
                isAd: adDetected,
              };
            }
            return prev;
          }
          setFileEpoch((e) => e + 1);
          setIncoming(null);
          setAvailableLyricEngines([]);
          setYoutubeSubtitleTracks([]);
          setSelectedSubtitleTrackId(undefined);
          setLyricEngineOption("lyricflow");
          return {
            title: nextTitle,
            artist: nextArtist,
            album: nextAlbum,
            duration: nextDur,
            source: "provider",
            provider: "external",
            audioSource: nextAudioSource,
            confidence: 1,
            isAd: adDetected,
          };
        });
      }
    }).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [sourceMode]);

  // Selecting External Player never requests audio. Capture follows the explicit setup action.
  useEffect(()=>{
    ++externalCaptureRequest.current;
    setExternalAudioStarting(false);setExternalAudioActive(false);setExternalAudioStatus('');
    void stopExternalAudioCapture();
    return()=>{++externalCaptureRequest.current;void stopExternalAudioCapture();};
  },[sourceMode,externalAudioMode,notificationAccessGranted]);
  const startExternalAudio=async()=>{
    if(sourceMode!=="external"||!notificationAccessGranted||externalAudioStarting)return;
    const request=++externalCaptureRequest.current;
    setExternalAudioStarting(true);setExternalAudioStatus('Waiting for Android audio permission…');
    const result=await startExternalAudioCapture(externalAudioMode);
    if(request!==externalCaptureRequest.current)return;
    setExternalAudioStarting(false);setExternalAudioActive(result.ok);setExternalAudioStatus(result.message);
  };
  const stopExternalAudio=()=>{
    ++externalCaptureRequest.current;setExternalAudioStarting(false);setExternalAudioActive(false);
    setExternalAudioStatus('Audio capture stopped.');void stopExternalAudioCapture();
  };

  // Smoothly advance playback clock between notification ticks when External Player is playing
  useEffect(() => {
    if (
      sourceMode !== "external" ||
      !localPlaying ||
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT
    )
      return;
    let lastTick = window.performance.now();
    const id = window.setInterval(() => {
      const now = window.performance.now();
      const dt = Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      setLocalTime((prev) => {
        const maxDur =
          localTrack?.duration && localTrack.duration > 0
            ? localTrack.duration
            : Infinity;
        const next = Math.min(maxDur, prev + dt);
        setVirtualMediaTime(next);
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [sourceMode, localPlaying, localTrack?.duration]);

  const defaultStageYoutubeVideoId = isAdPlaying
    ? null
    : activeYoutubeVideoId ||
      (hasSeparateAudioStream &&
      (localTrack?.provider === "jiosaavn" ||
        localTrack?.provider === "external" ||
        localTrack?.provider === "local")
        ? autoYoutubeVideoId
        : null);

  const videoRecovery = useVideoRecovery({
    selectionKey: [recordingKey, mappedYoutubeVideoId, extractYouTubeVideoId(localTrack), preferredVideoType, hasSeparateAudioStream, isAdPlaying, songMapping.hideVideo].join('|'),
    track: localTrack,
    candidates: preloadedVideoChoices,
    preference: preferredVideoType,
  });
  const stageYoutubeVideoId = isAdPlaying ? null : videoRecovery.videoId || defaultStageYoutubeVideoId;

  const effectiveYoutubeBackgroundMode: YouTubeBackgroundMode = isAdPlaying||songMapping.hideVideo
    ? "theme"
    : youtubeBackgroundMode;

  const isYtVideoBackgroundActive = Boolean(
    stageYoutubeVideoId && effectiveYoutubeBackgroundMode === "video",
  );

  const matchedVideoCandidate = videoRecovery.candidate ||
    (autoVideoMatch.candidates||autoVideoMatch.videos).find(
      (v) => extractYouTubeVideoId(v) === stageYoutubeVideoId,
    ) || null;
  const isActiveVideoLyrical = Boolean(
    isYtVideoBackgroundActive &&
      ((hasSeparateAudioStream && preferredVideoType === "lyrics") ||
        isLyricVideoTrack(matchedVideoCandidate) ||
        isLyricVideoTrack(localTrack)),
  );
  const shouldHideStageLyrics = Boolean(
    songMapping.hideLyrics || isAdPlaying || (autoHideYoutubeLyrics && isActiveVideoLyrical),
  );

  // Extract per-song Album Art colour palette so YouTube video backgrounds (and 'album' colour mode)
  // adapt vibrantly to each song instead of staying the same colour
  const songSeed = `${localTrack?.title || ""}|${localTrack?.artist || ""}|${stageYoutubeVideoId || ""}`;
  const defaultSongPalette = useMemo(
    () => getDeterministicSongPalette(songSeed),
    [songSeed],
  );
  useEffect(() => {
    const artworkUrl =
      localTrack?.artwork ||
      (stageYoutubeVideoId
        ? `https://i.ytimg.com/vi/${stageYoutubeVideoId}/hqdefault.jpg`
        : undefined);
    if (
      !artworkUrl ||
      (typeof navigator !== "undefined" &&
        /jsdom/i.test(navigator.userAgent || ""))
    ) {
      setAlbumArtPalette((prev) => (prev === null ? prev : null));
      return;
    }
    let cancelled = false;
    void extractAlbumArtPalette(artworkUrl, songSeed).then((pal) => {
      if (!cancelled) setAlbumArtPalette({key:songSeed,palette:pal});
    });
    return () => {
      cancelled = true;
    };
  }, [localTrack?.artwork, stageYoutubeVideoId, songSeed]);

  const effectiveAlbumArtPalette = albumArtPalette?.key === songSeed ? albumArtPalette.palette : defaultSongPalette;

  const useAlbumArtColors = Boolean(
    effectiveAlbumArtPalette &&
      (lyricColorMode === "album" ||
        (lyricColorMode === "auto" && isYtVideoBackgroundActive)),
  );
  const customLyricAccentHex = useAlbumArtColors
    ? effectiveAlbumArtPalette?.sungColor
    : lyricColorMode !== "auto"
      ? LYRIC_COLOR_MAP[lyricColorMode].main
      : undefined;
  const customLyricBaseHex = useAlbumArtColors
    ? effectiveAlbumArtPalette?.baseColor
    : undefined;

  const backgroundSyncKey = recordingKey + "|" + (stageYoutubeVideoId || "");
  const autoVideoSync = useVideoAutoSync(
    backgroundSyncKey,
    stageYoutubeVideoId,
    hasSeparateAudioStream && !isAdPlaying && !songMapping.hideVideo,
    activeLyrics.recordingKey === recordingKey
      ? activeLyrics.original
      : incoming?.original || "",
    lyricDelay -
      (activeLyrics.recordingKey === recordingKey ? activeLyrics.offset : 0),
  );
  const autoVideoDelaySeconds = autoVideoSync.delaySeconds,
    autoVideoSyncStatus = autoVideoSync.status,
    bgCaptionStatus = autoVideoSync.captionStatus;

  const effectiveSponsorBlockCutSec =
    leadingNonMusicOffsetSec > 0
      ? leadingNonMusicOffsetSec
      : localTrack?.sponsorblockOffsetSec &&
          localTrack.sponsorblockOffsetSec > 0
        ? localTrack.sponsorblockOffsetSec
        : 0;
  const effectiveAutoVideoDelay =
    autoVideoDelaySeconds !== 0
      ? autoVideoDelaySeconds
      : effectiveSponsorBlockCutSec > 0
        ? -Math.round(effectiveSponsorBlockCutSec * 100) / 100
        : 0;

  // A personal automatic-timing choice (null) also overrides a published fixed delay.
  const chosenVideoDelay = videoRecovery.videoId ? null : songMapping.personal?.video?songMapping.personal.video.delaySeconds:videoFix.correction
    ? videoFix.correction.videoDelaySeconds
    : songMapping.video?.delaySeconds;
  const hasManualVideoDelay = chosenVideoDelay != null;
  const videoDelaySeconds = hasSeparateAudioStream
    ? (chosenVideoDelay ?? effectiveAutoVideoDelay)
    : (chosenVideoDelay ?? 0);

  const videoTimingStatus = hasManualVideoDelay
    ? `Manual video delay: ${videoDelaySeconds > 0 ? "+" : ""}${videoDelaySeconds}s`
    : autoVideoSyncStatus;

  const hasLoadedLyrics=activeLyrics.recordingKey===recordingKey&&activeLyrics.hasContent;
  const lyricsLoading=Boolean(localTrack&&(
    (localTrack.source!=="manual"&&localTrack.title.trim().length>=2&&lyricStatusRecordingKey!==recordingKey)||
    (lyricStatusRecordingKey===recordingKey&&/searching|loading|resolving|switching|looking/i.test(lyricStatusMessage))
  ));
  const currentLyricsTitle=hasLoadedLyrics
    ?incoming?.title||localTrack?.title||"Untitled lyrics"
    :lyricsLoading?"Loading…":"Not found";
  const currentLyricsLibrary=hasLoadedLyrics
    ?describeLyricProvider(activeLyrics.name,/<\d+:/.test(activeLyrics.original),Boolean(activeLyrics.original.trim()),true,activeLyrics.url).providerName
    :"";
  const currentVideoMetadata=selectedVideoMetadata&&extractYouTubeVideoId(selectedVideoMetadata)===stageYoutubeVideoId
    ?selectedVideoMetadata:matchedVideoCandidate;
  const videoIsAudioTrack=Boolean(stageYoutubeVideoId&&extractYouTubeVideoId(localTrack)===stageYoutubeVideoId);
  const currentVideoTitle=stageYoutubeVideoId
    ?currentVideoMetadata?.title||(videoIsAudioTrack?localTrack?.videoTitle||localTrack?.title:undefined)||`YouTube video (${stageYoutubeVideoId})`
    :"No video selected";
  const currentVideoChannel=currentVideoMetadata?.artist||(videoIsAudioTrack?localTrack?.channelHint||localTrack?.artist:undefined)||"Channel unavailable";
  const currentVideoViewCount=currentVideoMetadata?.viewCount??(videoIsAudioTrack?localTrack?.viewCount:undefined);
  const currentVideoViews=currentVideoViewCount===0?"0 views":formatViewCount(currentVideoViewCount)||"Views unavailable";

  const saveVideoChoice = (id: string, seconds: number | null) => {
    videoRecovery.reset();
    if(videoFix.context)discardSongCorrections(uid,videoFix.context.identity,['video'],correctionKey(videoFix.context));
    setRejectedBgVideoIds(previous=>previous.filter(value=>value!==id));
    videoFix.save({ youtubeVideoId: id, videoDelaySeconds: seconds });
    songMapping.savePart("video", {
      youtubeVideoId: id,
      delaySeconds: seconds,
    });
  };

  return (
    <div
      className={
        "shell " +
        (performance ? "performance-mode " : "") +
        (cinemaHudVisible ||
        cinemaControlsOpen ||
        fullscreenPlayerOpen ||
        playerOverlayOpen ||
        sourceOpen
          ? "hud-visible"
          : "hud-hidden")
      }
      data-theme={resolvedTheme}
    >
      <header className="app-header">
        <div className="app-brand" aria-label="LyricFlow">
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>
          lyricflow<span className="brand-dot">.</span>
        </div>
        <button
          type="button"
          className="settings-trigger"
          aria-controls="app-settings"
          aria-expanded={cinemaControlsOpen}
          onClick={openSettings}
        >
          <SlidersHorizontal size={17} />
          Settings
        </button>
      </header>
      <main className="workspace">
        <div className="listening-column">
          <section className="visualizer-section" aria-label="Visualizer">
            <div
              className="stage"
              onClick={performance ? toggleCinemaHud : undefined}
              aria-label="Music visualizer"
            >
              <CinematicStage
                manualScene={enabledScenes.includes(scene)?scene:enabledScenes[0]||scene}
                intensity={intensity / 100}
                speed={speed / 50}
                quality={quality}
                demo={demo}
                paused={paused || Boolean(optionPreview)}
                reducedMotion={reducedMotion}
                autoScenes={autoScenes}
                cameraMode="Front"
                spatialTypography={spatialTypography && enabledKineticMotions.length>0}
                wordStylesEnabled={wordStylesEnabled}
                currentWordStyle={currentWordStyle}
                enabledWordStyles={enabledWordStyles}
                enabledThemeTransitions={enabledThemeTransitions}
                wordAnimationsEnabled={wordAnimationsEnabled}
                enabledWordAnimations={enabledWordAnimations}
                albumLyricPalette={useAlbumArtColors ? effectiveAlbumArtPalette : undefined}
                motionBlur={motionBlur}
                enabledScenes={enabledScenes}
                enabledKineticMotions={effectiveKineticMotions}
                enabledPlacements={enabledPlacements}
                videoPlacementMode="auto"
                enabledVideoPlacements={enabledVideoPlacements}
                themePlacementMode="auto"
                enabledThemePlacements={enabledThemePlacements}
                themeDurationLines={themeDurationLines}
                themeDurationSeconds={themeDurationSeconds}
                enabledFonts={effectiveFonts}
                enabledCameraViews={["Front"]}
                cameraShakeEnabled={cameraShakeEnabled}
                cameraShakeSensitivity={cameraShakeSensitivity}
                themePalettes={themePalettes}
                customLyricAccentColor={customLyricAccentHex}
                customLyricBaseColor={customLyricBaseHex}
                lyricFillPaceMode={lyricFillPaceMode}
                lyricMinFontSize={lyricMinFontSize}
                lyricMaxFontSize={lyricMaxFontSize}
                lyricFontScale={lyricFontScale}
                lyricLayout={lyricLayout}
                lyricPlacementMode={lyricPlacementMode}
                videoOverlayOpacity={videoOverlayOpacity}
                videoFitMode={videoFitMode}
                audioPaused={Boolean(localLoaded && !localPlaying)}
                youtubeVideoId={stageYoutubeVideoId}
                videoDelaySeconds={videoDelaySeconds}
                youtubeBackgroundMode={effectiveYoutubeBackgroundMode}
                hideVideo={songMapping.hideVideo}
                hideStageLyrics={shouldHideStageLyrics}
                recordingKey={recordingKey}
                externalPlayer={
                  sourceMode === "external" ||
                  localTrack?.provider === "external"
                }
                advertisementPlaying={isAdPlaying}
                videoSearchPending={videoSearchPending || videoRecovery.pending}
                loadingAnotherVideo={videoRecovery.pending}
                videoRecoveryMessage={videoRecovery.message}
                onLoadAnotherVideo={videoRecovery.loadAnotherVideo}
                playbackTime={localTime}
                hasSeparateAudioStream={hasSeparateAudioStream}
                playerVolume={playerVolume}
                onYoutubeTimeUpdate={(ct, dur) =>
                  playerRef.current?.syncExternalClock(ct, dur)
                }
                onYoutubeEnded={() => {
                  playerRef.current?.playNextFromQueue();
                }}
                onRejectBackgroundVideo={(rejectedId) => {
                  if (rejectedId === videoRecovery.videoId) {
                    void videoRecovery.loadAnotherVideo(rejectedId);
                    return;
                  }
                  if (!rejectedId||rejectedId===mappedYoutubeVideoId) return;
                  setRejectedBgVideoIds((prev) =>
                    prev.includes(rejectedId) ? prev : [...prev, rejectedId],
                  );
                  if (videoFix.correction?.youtubeVideoId === rejectedId) {
                    videoFix.reset();
                  }
                  if (songMapping.video?.youtubeVideoId === rejectedId) {
                    songMapping.savePart("video", null);
                  }
                }}
              />
              {showFps && <span className="fps-badge">{fps} FPS</span>}
              {performance && (
                <>
                  {!cinemaHudVisible &&
                    !cinemaControlsOpen &&
                    !fullscreenPlayerOpen &&
                    !playerOverlayOpen && (
                      <button
                        type="button"
                        className="cinema-touch-wake-layer"
                        aria-label="Show fullscreen controls"
                        onClick={(e) => {
                          e.stopPropagation();
                          revealCinemaHud();
                        }}
                      />
                    )}
                  <div
                    className="fullscreen-toolbar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="glass"
                      onClick={() =>
                        setFullscreenPlayerOpen((v) => {
                          const next = !v;
                          if (next) {
                            setCinemaControlsOpen(false);
                            setCinemaHudVisible(true);
                          } else {
                            revealCinemaHud();
                          }
                          return next;
                        })
                      }
                      aria-expanded={fullscreenPlayerOpen}
                      aria-controls="fullscreen-player-window"
                    >
                      <AudioLines size={17} />
                      Player
                    </button>
                    <button
                      type="button"
                      className="glass"
                      onClick={() => {
                        if(cinemaControlsOpen){setCinemaControlsOpen(false);revealCinemaHud();}
                        else {setFullscreenPlayerOpen(false);setCinemaHudVisible(true);openSettings();}
                      }}
                      aria-expanded={cinemaControlsOpen}
                      aria-controls="app-settings"
                    >
                      <SlidersHorizontal size={17} />
                      Settings
                    </button>
                    <button
                      type="button"
                      className="glass"
                      aria-label="Exit fullscreen"
                      onClick={() => void togglePerformance()}
                    >
                      <LogOut size={17} />
                      Exit fullscreen
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
          <div
            id="fullscreen-player-window"
            className={
              "player-section" +
              (fullscreenPlayerOpen ? " player-window-open" : "")
            }
            onClick={performance ? (e) => e.stopPropagation() : undefined}
          >
            <LocalPlayer
              ref={playerRef}
              sourceMode={sourceMode}
              youtubeBackgroundMode={youtubeBackgroundMode}
              onYoutubeBackgroundModeChange={setYoutubeBackgroundMode}
              externalTrack={sourceMode === "external" ? localTrack : null}
              externalTime={localTime}
              externalPlaying={localPlaying}
              onFullscreen={() => void togglePerformance()}
              fullscreen={performance}
              onOverlayChange={setPlayerOverlayOpen}
              onOpenSourceSelector={() => setSourceOpen(true)}
              sponsorBlockEnabled={sponsorBlockEnabled}
              onSponsorBlockOffsetChange={setLeadingNonMusicOffsetSec}
              onAudioStreamModeChange={setHasSeparateAudioStream}
              preferredVolume={playerVolume}
              onVolumeChange={setPlayerVolume}
              onActiveChange={(playing) => {
                setLocalPlaying(playing);
                if (playing) audioHubRef.current?.stop();
              }}
              onTimeChange={setLocalTime}
              onFileChange={(loaded) => {
                setLocalLoaded(loaded);
                setFileEpoch((e) => e + 1);
                setIncoming(null);
                setAvailableLyricEngines([]);
                setYoutubeSubtitleTracks([]);
                setSelectedSubtitleTrackId(undefined);
                setLyricEngineOption("lyricflow");
              }}
              onTrackChange={(track) => {
                if (track)
                  setSourceMode(
                    track.provider === "local" ? "local" : "online",
                  );
                setLocalTrack(track);
                setIncoming(null);
                setAvailableLyricEngines([]);
                setYoutubeSubtitleTracks([]);
                setSelectedSubtitleTrackId(undefined);
                setLyricEngineOption("lyricflow");
              }}
              onQueueChange={setSongQueue}
              onDurationChange={(duration) =>
                setLocalTrack((p) => (p ? { ...p, duration } : p))
              }
            />
            {isAdPlaying && (
              <p className="quiet-status" role="status">
                Advertisement · lyrics resume with your music.
              </p>
            )}
            {fullscreenError && (
              <p className="quiet-status" role="status">
                {fullscreenError}
              </p>
            )}
          </div>
        </div>
        <SettingsPanel
          page={settingsPage}
          onPageChange={setSettingsPage}
          open={cinemaControlsOpen}
          fullscreen={performance}
          onClose={closeSettings}
        >
          {{
            mapping: (
              <>
                <div className="current-song">
                  <span>Current lyrics title{currentLyricsLibrary&&<> · {currentLyricsLibrary}</>}</span>
                  <strong>{currentLyricsTitle}</strong>
                  {hasLoadedLyrics && (incoming?.artist || localTrack?.artist) && (
                    <small>{incoming?.artist || localTrack?.artist}</small>
                  )}
                </div>
                <div className="current-song">
                  <span>Current video title</span>
                  <strong>{currentVideoTitle}</strong>
                  {stageYoutubeVideoId&&<small>{currentVideoChannel} · {currentVideoViews}</small>}
                </div>
                {!localTrack && (
                  <p className="empty-note">
                    Choose a song in the music player to adjust its mapping.
                  </p>
                )}
                {localTrack && (
                  <button
                    type="button"
                    className="source-primary save-song-button"
                    onClick={() => {
                     try{
                      setMappingSaveError('');
                      updateLyricDelay(lyricDelay);
                      const flushedVideo =
                        videoCorrectionSaveRef.current?.() ?? false;
                      if (!flushedVideo && stageYoutubeVideoId) {
                        saveVideoChoice(
                          stageYoutubeVideoId,
                          hasManualVideoDelay ? videoDelaySeconds : null,
                        );
                      }
                      saveSongMapping(localTrack,uid);
                      setSavedMappingKey(recordingKey);
                     }catch(error){setMappingSaveError(error instanceof Error?error.message:'Could not save this song mapping.');}
                    }}
                    aria-live="polite"
                  >
                    {savedMappingKey===recordingKey?'Saved':'Save mapping for current song'}
                  </button>
                )}
                {mappingSaveError&&<p role="alert">{mappingSaveError}</p>}
                <details className="disclosure lyrics-mapping-section">
                  <summary>Lyrics mapping</summary>
                  <SwitchSetting label="Hide lyrics for this song" checked={songMapping.hideLyrics} disabled={!localTrack}
                    onChange={hidden=>songMapping.savePart('hideLyrics',hidden)}/>
                  <div
                    ref={setMappingTarget}
                    className="mapping-lyrics-controls"
                  />
                </details>
                <label className="field-row">
                  Video preference
                  <select
                    aria-label="Preferred YouTube background"
                    value={preferredVideoType}
                    onChange={(e) =>
                      setPreferredVideoType(
                        e.target.value as "music" | "lyrics",
                      )
                    }
                  >
                    <option value="music">Music video</option>
                    <option value="lyrics">Lyrical video</option>
                  </select>
                </label>
                <details className="disclosure video-mapping-section">
                  <summary>Video mapping</summary>
                  <SwitchSetting label="Hide video for this song" checked={songMapping.hideVideo} disabled={!localTrack}
                    onChange={hidden=>songMapping.savePart('hideVideo',hidden)}/>
                  <CorrectionControls
                    key={"corrections-" + recordingKey}
                    saveRef={videoCorrectionSaveRef}
                    user={user}
                    track={localTrack}
                    delay={{
                      ...delayFix,
                      reset: () => {
                        songMapping.savePart("lyrics", null);
                        delayFix.reset();
                      },
                    }}
                    lyrics={{
                      ...lyricsFix,
                      reset: () => {
                        songMapping.savePart("lyrics", null);
                        lyricsFix.reset();
                      },
                    }}
                    video={{
                      ...videoFix,
                      reset: () => {
                        songMapping.savePart("video", null);
                        videoFix.reset();
                      },
                    }}
                    mappedLyrics={songMapping.lyrics}
                    mappedVideo={songMapping.video}
                    preferMappedVideo={Boolean(songMapping.personal?.video)}
                    canChangeVideo={hasSeparateAudioStream}
                    currentVideoDelay={videoDelaySeconds}
                    currentVideoId={stageYoutubeVideoId}
                    sponsorBlockCutSeconds={effectiveSponsorBlockCutSec}
                    onVideoChange={saveVideoChoice}
                    changeVideoSlot={
                      localTrack && hasSeparateAudioStream && !isAdPlaying ? (
                        <YouTubeBackgroundPicker
                          key={"video-picker-" + recordingKey + "-" + settingsSession}
                          track={localTrack}
                          activeVideoId={activeYoutubeVideoId}
                          preference={preferredVideoType}
                          cachedCandidates={preloadedVideoChoices}
                          cachedCandidateCount={
                            autoVideoMatch.key === videoSearchKey
                              ? autoVideoMatch.candidateCount
                              : 0
                          }
                          automaticSearchPending={
                            autoVideoMatch.key !== videoSearchKey ||
                            autoVideoMatch.pending
                          }
                          captionStatus={bgCaptionStatus}
                          onSearchingChange={(searching) =>
                            setManualVideoSearchKey(
                              searching ? recordingKey : "",
                            )
                          }
                          onChoose={(id, candidate) => {
                            setSelectedVideoMetadata(candidate||null);
                            saveVideoChoice(
                              id,
                              id === activeYoutubeVideoId && hasManualVideoDelay
                                ? videoDelaySeconds
                                : null,
                            );
                            setYoutubeBackgroundMode("video");
                          }}
                        />
                      ) : (
                        <p className="empty-note">
                          {localTrack
                            ? "YouTube is also your audio source. Choose a separate audio source to change only the background."
                            : "Video matching becomes available when a song is playing."}
                        </p>
                      )
                    }
                  />
                  {hasSeparateAudioStream && videoTimingStatus && (
                    <p className="quiet-status" role="status">
                      {videoTimingStatus}
                    </p>
                  )}
                </details>
                {songMapping.error && <p role="status">{songMapping.error}</p>}
                {privateLyrics.error && (
                  <p role="status">{privateLyrics.error}</p>
                )}
                {lyricStatusMessage && (
                  <details className="disclosure">
                    <summary>Matching status</summary>
                    <p role="status">{lyricStatusMessage}</p>
                  </details>
                )}
                {localTrack && (
                  <p className="saved-note">
                    {delaySavedStatus ||
                      "Changes save for this song on this device."}
                  </p>
                )}
              </>
            ),
            background: (
              <>
                <SettingGroup title="Background">
                  <RangeSetting
                    label="Video dimming"
                    value={Math.round(videoOverlayOpacity * 100)}
                    max={90}
                    step={5}
                    onChange={(v) => setVideoOverlayOpacity(v / 100)}
                  />
                  <div className="field-row">
                    <span>Video fit</span>
                    <div
                      className="segmented"
                      role="group"
                      aria-label="Video fit"
                    >
                      <button
                        type="button"
                        aria-pressed={videoFitMode === "default"}
                        onClick={() => setVideoFitMode("default")}
                      >
                        Default
                      </button>
                      <button
                        type="button"
                        aria-pressed={videoFitMode === "stretch"}
                        onClick={() => setVideoFitMode("stretch")}
                      >
                        Fill
                      </button>
                    </div>
                  </div>
                </SettingGroup>
                <SettingGroup title="Themes">
                  <RangeSetting
                    label="Theme duration with lyrics"
                    value={themeDurationLines}
                    min={1}
                    max={16}
                    suffix=" lines"
                    onChange={setThemeDurationLines}
                  />
                  <RangeSetting
                    label="Theme duration without lyrics"
                    value={themeDurationSeconds}
                    min={4}
                    max={60}
                    step={2}
                    suffix="s"
                    onChange={setThemeDurationSeconds}
                  />
                  <details className="disclosure">
                    <summary>
                      Enabled themes{" "}
                      <span>
                        {enabledScenes.length} / {choices.length}
                      </span>
                    </summary>
                    <div className="selection-list">
                      <div className="selection-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
                        >
                          Enable all themes
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setThemePalettes(enableAllPaletteSelections())}
                        >
                          Enable all colour palettes
                        </button>
                      </div>
                      {choices.map((item) => (
                        <div className="theme-selection" key={item.id}>
                          <PreviewSetting label={item.label} checked={enabledScenes.includes(item.id)} onChange={()=>toggleSceneEnabled(item.id)}
                            onPreview={()=>setOptionPreview({label:item.label,scene:item.id,paletteId:selectedPaletteIds(item.id,themePalettes)[0]})}/>
                          <details className="palette-options">
                            <summary>Colour palettes</summary>
                            <button
                              className="text-button"
                              type="button"
                              style={{ marginBottom: "6px" }}
                              onClick={() => setThemePalettes((prev) => enableAllPalettesForTheme(item.id, prev))}
                            >
                              Enable all palettes
                            </button>
                            {byId[item.id].palettes.map(palette=>(
                              <PreviewSetting key={palette.id} label={palette.name} accessibleLabel={`${item.label} · ${palette.name}`}
                                checked={selectedPaletteIds(item.id,themePalettes).includes(palette.id)}
                                onChange={()=>setThemePalettes(prev=>togglePaletteSelection(item.id,palette.id,prev))}
                                onPreview={()=>setOptionPreview({label:`${item.label} · ${palette.name}`,scene:item.id,paletteId:palette.id})}>
                                <span className="palette-swatches" aria-hidden="true">{[palette.background,palette.foreground,palette.accent].map((color,i)=><i key={i} style={{background:color}}/>)}</span>
                              </PreviewSetting>
                            ))}
                          </details>
                        </div>
                      ))}
                    </div>
                  </details>
                  <details className="disclosure">
                    <summary>Theme transitions <span>{enabledThemeTransitions.length} / {THEME_TRANSITIONS.length}</span></summary>
                    <div className="selection-list">
                      {THEME_TRANSITIONS.map(transition=><PreviewSetting key={transition.id} label={transition.name} accessibleLabel={`Theme transition · ${transition.name}`}
                        checked={enabledThemeTransitions.includes(transition.id)}
                        onChange={()=>setEnabledThemeTransitions(prev=>prev.includes(transition.id)?prev.filter(id=>id!==transition.id):[...prev,transition.id])}
                        onPreview={()=>setOptionPreview({label:transition.name,themeTransition:transition.id})}/>)}
                    </div>
                  </details>
                </SettingGroup>
              </>
            ),
            lyrics: (
              <>
                <SettingGroup title="Overlay">
                  <SwitchSetting
                    label="Hide overlay lyrics on lyrical videos"
                    checked={autoHideYoutubeLyrics}
                    onChange={setAutoHideYoutubeLyrics}
                  />
                </SettingGroup>
                <SettingGroup title="Placement">
                  {(["video", "theme"] as const).map(kind=>(
                    <details className="disclosure" key={kind}>
                      <summary>{kind==="video"?"On video":"On themes"}</summary>
                      <div className="selection-list">
                        {LYRIC_PLACEMENT_MODES.filter(p=>p.id!=="auto").map(p=>(
                          <PreviewSetting key={p.id} label={p.label} accessibleLabel={`${kind==="video"?"Video":"Theme"} · ${p.label}`}
                            checked={(kind==="video"?enabledVideoPlacements:enabledThemePlacements).includes(p.id as Exclude<LyricPlacementMode,"auto">)}
                            onChange={()=>kind==="video"?toggleVideoPlacementEnabled(p.id as Exclude<LyricPlacementMode,"auto">):toggleThemePlacementEnabled(p.id as Exclude<LyricPlacementMode,"auto">)}
                            onPreview={()=>setOptionPreview({label:p.label,placement:p.id,video:kind==="video"})}/>
                        ))}
                      </div>
                    </details>
                  ))}
                  <RangeSetting label="Horizontal lyrics padding" value={lyricLayout.horizontalPadding} max={25}
                    onChange={value=>setLyricLayout(prev=>({...prev,horizontalPadding:value}))}/>
                  <RangeSetting label="Vertical lyrics padding" value={lyricLayout.verticalPadding} max={25}
                    onChange={value=>setLyricLayout(prev=>({...prev,verticalPadding:value}))}/>
                  <RangeSetting label="Maximum lyrics width" value={lyricLayout.maxWidth} min={20}
                    onChange={value=>setLyricLayout(prev=>({...prev,maxWidth:value}))}/>
                  <RangeSetting label="Maximum lyrics height" value={lyricLayout.maxHeight} min={10}
                    onChange={value=>setLyricLayout(prev=>({...prev,maxHeight:value}))}/>
                  <p className="muted">Percent of the screen. Long lines shrink to fit this area.</p>
                </SettingGroup>
                <SettingGroup title="Fonts & motion">
                  <SwitchSetting label="Lyric animations" checked={spatialTypography} onChange={setSpatialTypography}/>
                  <SwitchSetting label="Current word styles" checked={wordStylesEnabled} onChange={setWordStylesEnabled}/>
                  <SwitchSetting label="Current word animations" checked={wordAnimationsEnabled} onChange={setWordAnimationsEnabled}/>
                  <p className="muted">Word effects require word-synced lyrics.</p>
                  <details className="disclosure">
                    <summary>Fonts <span>{enabledFonts.length} / {FONT_SHOWCASE.length}</span></summary>
                    <div className="selection-list">
                      <button className="text-button" type="button" onClick={()=>setEnabledFonts([...ALL_FONT_PACKS])}>Enable all fonts</button>
                      {FONT_SHOWCASE.map(font=><PreviewSetting key={font} label={fontLabel(font)} checked={enabledFonts.includes(font)} onChange={()=>toggleFontEnabled(font)}
                        onPreview={()=>setOptionPreview({label:fontLabel(font),font})}/>)}
                    </div>
                  </details>
                  <details className="disclosure">
                    <summary>Animations <span>{enabledKineticMotions.length} / {VOXELVERSE_STYLES.length}</span></summary>
                    <div className="selection-list">
                      <button className="text-button" type="button" onClick={()=>setEnabledKineticMotions([...ALL_KINETIC_MOTIONS])}>Enable all animations</button>
                      {VOXELVERSE_STYLES.map(motion=><PreviewSetting key={motion.id} label={motion.name} checked={enabledKineticMotions.includes(motion.id)} onChange={()=>toggleKineticMotionEnabled(motion.id)}
                        onPreview={()=>setOptionPreview({label:motion.name,motion:motion.id})}/>)}
                    </div>
                  </details>
                  <details className="disclosure">
                    <summary>Current word styles <span>{enabledWordStyles.length} / {CURRENT_WORD_STYLES.length}</span></summary>
                    <div className="selection-list">
                      <button className="text-button" type="button" onClick={()=>setEnabledWordStyles([...ALL_CURRENT_WORD_STYLE_IDS])}>Enable all word styles</button>
                      {CURRENT_WORD_STYLES.map(style=><PreviewSetting key={style.id} label={style.name} checked={enabledWordStyles.includes(style.id)} onChange={()=>toggleWordStyleEnabled(style.id)}
                        onPreview={()=>setOptionPreview({label:style.name,wordStyle:style.id})}/>)}
                    </div>
                  </details>
                  <details className="disclosure">
                    <summary>Current word animations <span>{enabledWordAnimations.length} / {CURRENT_WORD_ANIMATIONS.length}</span></summary>
                    <div className="selection-list">
                      {CURRENT_WORD_ANIMATIONS.map(animation=><PreviewSetting key={animation.id} label={animation.name} accessibleLabel={`Word animation · ${animation.name}`}
                        checked={enabledWordAnimations.includes(animation.id)}
                        onChange={()=>setEnabledWordAnimations(prev=>prev.includes(animation.id)?prev.filter(id=>id!==animation.id):[...prev,animation.id])}
                        onPreview={()=>setOptionPreview({label:animation.name,wordAnimation:animation.id})}/>)}
                    </div>
                  </details>
                </SettingGroup>
                <ManualLyrics
                  key={
                    "editor-" +
                    (localTrack
                      ? `${fileEpoch}-${localTrack.provider || ""}-${localTrack.sourceTrackId || localTrack.videoId || localTrack.fileName || localTrack.title}-${localTrack.artist}`
                      : fileEpoch)
                  }
                  onLyricContentChange={onLyricContentChange}
                  mappingTarget={mappingTarget}
                  changeLyricsSlot={
                    <SettingGroup title="Change lyrics">
                      <label className="field-row">
                        Library
                        <select
                          aria-label="Lyrics engine"
                          value={effectiveLyricsEngine}
                          onChange={(e) =>
                            selectEngine(e.target.value as LyricEngineOption)
                          }
                        >
                          {LYRIC_ENGINE_OPTIONS.filter(
                            (o) =>
                              o.id === effectiveLyricsEngine ||
                              o.id === "lyricflow" ||
                              availableLyricEngines.includes(o.id),
                          ).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {youtubeSubtitleTracks.length > 1 && (
                        <label className="field-row">
                          Subtitle track
                          <select
                            aria-label="Subtitle track"
                            value={
                              effectiveSubtitleTrackId ||
                              youtubeSubtitleTracks[0]?.id ||
                              ""
                            }
                            onChange={(e) => selectSubtitle(e.target.value)}
                          >
                            {youtubeSubtitleTracks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="mapping-source">
                        <span>{incoming?.source || "Automatic matching"}</span>
                        <button
                          type="button"
                          className="text-button"
                          aria-expanded={mappingSearchOpen}
                          onClick={() => setMappingSearchOpen((v) => !v)}
                          disabled={!localTrack || isAdPlaying}
                        >
                          <Search size={14} />
                          {mappingSearchOpen
                            ? "Close search"
                            : "Search lyrics online"}
                        </button>
                      </div>
                      {!isAdPlaying && (
                        <TrackFinder
                          key={"finder-" + fileEpoch}
                          track={localTrack}
                          accountId={uid}
                          enabled={!songMapping.hideLyrics}
                          preferredSelection={preferredLyricsSelection}
                          preferredSourceFile={preferredLyricsSource}
                          onLyricsMapped={saveMappedLyrics}
                          onSelectionChange={selectLyrics}
                          savedCustomLrc={savedCustomLrc}
                          customEditOpen={mappingSearchOpen}
                          lyricEngineOption={effectiveLyricsEngine}
                          onLyricEngineOptionChange={setLyricEngineOption}
                          selectedSubtitleTrackId={effectiveSubtitleTrackId}
                          onSelectSubtitleTrackId={selectSubtitle}
                          onAvailableLyricEnginesChange={
                            setAvailableLyricEngines
                          }
                          onSubtitleTracksChange={setYoutubeSubtitleTracks}
                          leadingNonMusicOffsetSec={leadingNonMusicOffsetSec}
                          onMetadataChange={(value) => {
                            saveTrackCorrection(value);
                          }}
                          onLyricsFound={acceptLyrics}
                          onStatusChange={(message)=>{setLyricStatusMessage(message);setLyricStatusRecordingKey(recordingKey);}}
                        />
                      )}
                    </SettingGroup>
                  }
                  time={localTime}
                  trackLoaded={localLoaded}
                  isPlaying={!localLoaded || localPlaying}
                  track={localTrack}
                  incoming={incoming}
                  delay={lyricDelay}
                  onDelayChange={updateLyricDelay}
                  customEditOpen={customEditOpen}
                  onToggleCustomEdit={() => setCustomEditOpen((v) => !v)}
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
                  onEnabledRomanizationLanguagesChange={
                    setEnabledRomanizationLanguages
                  }
                />
              </>
            ),
            engine: (
              <>
                <SettingGroup title="Rendering quality">
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Rendering quality"
                  >
                    {(["High", "Balanced", "Performance"] as Quality[]).map(
                      (q) => (
                        <button
                          key={q}
                          type="button"
                          aria-pressed={quality === q}
                          onClick={() => setQuality(q)}
                        >
                          {q}
                        </button>
                      ),
                    )}
                  </div>
                </SettingGroup>
                <SettingGroup title="Motion & reactivity">
                  <SwitchSetting
                    label="Camera Shake"
                    checked={cameraShakeEnabled}
                    onChange={setCameraShakeEnabled}
                    disabled={reducedMotion}
                  />
                  <RangeSetting
                    label="Bass threshold sensitivity"
                    value={cameraShakeSensitivity}
                    disabled={!cameraShakeEnabled || reducedMotion}
                    onChange={setCameraShakeSensitivity}
                  />
                  <RangeSetting
                    label="Visual intensity"
                    value={intensity}
                    onChange={setIntensity}
                  />
                  <RangeSetting
                    label="Audio sensitivity"
                    value={sensitivity}
                    onChange={setSensitivity}
                  />
                  <RangeSetting
                    label="Motion blur"
                    value={motionBlur}
                    max={80}
                    step={5}
                    disabled={reducedMotion}
                    onChange={setMotionBlur}
                  />
                  <RangeSetting
                    label="Animation speed"
                    value={speed}
                    min={10}
                    onChange={setSpeed}
                  />
                  <SwitchSetting
                    label="Reduced motion"
                    checked={reducedMotion}
                    onChange={setReducedMotion}
                  />
                </SettingGroup>
                <details className="disclosure">
                  <summary>Preview & audio analysis</summary>
                  <p>{renderStatus}</p>
                  <div className="selection-list">
                    <SwitchSetting
                      label="Animate while idle"
                      checked={demo}
                      onChange={setDemo}
                    />
                    <SwitchSetting
                      label="Pause visuals"
                      checked={paused}
                      onChange={setPaused}
                    />
                    <RangeSetting
                      label="Spectrum gain"
                      value={spectrumSensitivity}
                      onChange={setSpectrumControl}
                    />
                    <canvas
                      ref={spectrumCanvas}
                      width={640}
                      height={58}
                      className="spectrum-preview"
                      aria-label="Live audio spectrum"
                    />
                  </div>
                </details>
              </>
            ),
            others: (
              <>
                <SettingGroup title="Import, export & reset data">
                  <DataTransferSettings uid={uid} onSettingsImported={applyBackupSettings}/>
                </SettingGroup>
                <SettingGroup title="Playback">
                  <SwitchSetting
                    label="Skip non-music segments"
                    checked={sponsorBlockEnabled}
                    onChange={setSponsorBlockEnabled}
                  />
                </SettingGroup>
                <SettingGroup title="Appearance">
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Appearance theme mode"
                  >
                    {(
                      [
                        { id: "system", label: "System", Icon: Monitor },
                        { id: "dark", label: "Dark", Icon: Moon },
                        { id: "light", label: "Light", Icon: Sun },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={themeMode === id}
                        onClick={() => setThemeMode(id)}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <SwitchSetting
                    label="Show FPS on visualizer"
                    checked={showFps}
                    onChange={setShowFps}
                  />
                </SettingGroup>
                <SettingGroup title="Accounts">
                  <div className="account-row">
                    <div>
                      <strong>LyricFlow</strong>
                      <small>
                        {user?.email || "Sync settings across devices"}
                      </small>
                    </div>
                    <AccountControls
                      user={user}
                      syncStatus={syncStatus}
                      onImportGuest={() => {
                        try {
                          remotePreferences.current = "";
                          applyPreferences(loadLocalPreferences(null));
                          if (uid) {
                            importGuestCorrections(uid);
                            importGuestCustomLyrics(uid);
                            importGuestSongMappings(uid);
                          }
                          setSyncStatus(
                            "Guest settings and fixes imported into this account",
                          );
                        } catch {
                          setSyncStatus(
                            "Import could not finish · device storage is full or blocked",
                          );
                        }
                      }}
                    />
                  </div>
                  <div className="account-row">
                    <div>
                      <strong>YouTube</strong>
                      <small>Use your YouTube account</small>
                    </div>
                    <YouTubeAccountControl compact />
                  </div>
                </SettingGroup>
                <SettingGroup title="App">
                  <AppUpdateControl />
                </SettingGroup>
                <footer className="developer-credit">
                  <span>Developed by <strong>Steve Harris</strong></span>
                  <a
                    className="developer-instagram"
                    href="https://www.instagram.com/ig.steve_edits"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Steve Harris on Instagram (opens in a new tab)"
                    title="@ig.steve_edits"
                  >
                    <Instagram size={20} aria-hidden="true" />
                  </a>
                </footer>
              </>
            ),
          }}
        </SettingsPanel>
        {optionPreview && <OptionPreview spec={optionPreview} onClose={closeOptionPreview} reducedMotion={reducedMotion} lyricLayout={lyricLayout}/>}
      </main>
      <AudioSourceHub
        ref={audioHubRef}
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        activeMode={sourceMode}
        onSelectMode={(mode) => {
          if (mode === "online") playerRef.current?.openSearch();
          if (mode === "external" && sourceMode !== "external") {
            playerRef.current?.stop();
            setHasSeparateAudioStream(true);
          }
          if (mode === "external" || !localTrack) setSourceMode(mode);
        }}
        onPickLocal={() => playerRef.current?.chooseFile()}
        onPlaySong={async (song) => {
          setSourceMode("online");
          await playerRef.current?.loadRemote(song);
        }}
        onAddToQueue={(song) => {
          setSourceMode("online");
          playerRef.current?.addToQueue(song);
        }}
        externalAudioMode={externalAudioMode}
        onExternalAudioModeChange={setExternalAudioMode}
        externalMedia={externalMedia}
        notificationAccessGranted={notificationAccessGranted}
        onNotificationAccessChange={setNotificationAccessGranted}
        externalAudioStarting={externalAudioStarting}
        externalAudioActive={externalAudioActive}
        onStartExternalAudio={()=>void startExternalAudio()}
        onStopExternalAudio={stopExternalAudio}
        onRefreshExternalMedia={() => {
          void getCurrentExternalMedia().then((res) => {
            setNotificationAccessGranted(res.granted);
            if (res.media) setExternalMedia(res.media);
          });
        }}
        externalAudioStatus={externalAudioStatus}
      />
    </div>
  );
}
