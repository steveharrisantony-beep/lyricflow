import {
  AudioLines,
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
  openExternalNotificationSettings,
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
import { findYouTubeBackgrounds } from "./music/backgroundVideos";
import type { SongResult } from "./music/providers";
import { useVideoAutoSync } from "./music/useVideoAutoSync";
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
  resolveThemePalette,
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
import {
  ALL_PLACEMENT_MODES,
  LYRIC_PLACEMENT_MODES,
  VOXELVERSE_STYLES,
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
  type LyricsSelection,
} from "./firebase/correctionModel";
import { importGuestCorrections } from "./firebase/correctionStore";
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
import SettingsPanel, {
  RangeSetting,
  SettingGroup,
  SwitchSetting,
  type SettingsPage,
} from "./ui/SettingsPanel";
import AppUpdateControl from "./updates/AppUpdateControl";

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

  const [settingsPage, setSettingsPage] = useState<SettingsPage>("background");
  const [mappingTarget, setMappingTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [mappingSearchOpen, setMappingSearchOpen] = useState(false);
  const [playerOverlayOpen, setPlayerOverlayOpen] = useState(false);
  const [showFps, setShowFps] = useState(
    () => initialExtended.showFps === true,
  );
  const closeSettings = useCallback(() => setCinemaControlsOpen(false), []);

  // Android External Player & Auto-matched YouTube Video state
  const [autoVideoMatch, setAutoVideoMatch] = useState<{
    key: string;
    id: string | null;
    pending: boolean;
    videos: SongResult[];
    candidateCount: number;
  }>({ key: "", id: null, pending: false, videos: [], candidateCount: 0 });
  const [manualVideoSearchKey, setManualVideoSearchKey] = useState("");
  const [externalAudioMode, setExternalAudioMode] =
    useState<ExternalAudioCaptureMode>("internal");
  const [externalMedia, setExternalMedia] = useState<ExternalMediaState | null>(
    null,
  );
  const [notificationAccessGranted, setNotificationAccessGranted] =
    useState<boolean>(false);
  const [externalAudioStatus, setExternalAudioStatus] = useState<string>("");

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
  const [autoScenes, setAutoScenes] = useState(initialPrefs.autoScenes);
  const [spatialTypography, setSpatialTypography] = useState(
    initialPrefs.spatialTypography,
  );
  const [enabledScenes, setEnabledScenes] = useState<SceneId[]>(
    initialPrefs.enabledScenes,
  );
  const [autoKineticMotion, setAutoKineticMotion] = useState<boolean>(
    initialPrefs.autoKineticMotion ?? true,
  );
  const [manualKineticMotion, setManualKineticMotion] = useState<LyricMotion>(
    initialPrefs.manualKineticMotion || "ship",
  );
  const [enabledKineticMotions, setEnabledKineticMotions] = useState<
    LyricMotion[]
  >(initialPrefs.enabledKineticMotions);
  const [enabledPlacements, setEnabledPlacements] = useState<
    Exclude<LyricPlacementMode, "auto">[]
  >(initialPrefs.enabledPlacements || [...ALL_PLACEMENT_MODES]);
  // Two separate placement sets: Video Background (default 'bottom-right' / Right Bottom) vs Built-in Themes (default 'center' / Centre Stage)
  const [videoPlacementMode, setVideoPlacementMode] =
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
    return [...ALL_PLACEMENT_MODES];
  });
  const [themePlacementMode, setThemePlacementMode] =
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
    return [...ALL_PLACEMENT_MODES];
  });
  // Theme Director duration (in lines of lyrics and seconds for songs without lyrics) & auto-randomize colour palettes
  const [themeDurationLines, setThemeDurationLines] = useState<number>(() => {
    const n = Number(initialExtended.themeDurationLines);
    return Number.isFinite(n) && n >= 1 && n <= 16 ? Math.round(n) : 2;
  });
  const [themeDurationSeconds, setThemeDurationSeconds] = useState<number>(
    () => {
      const n = Number(initialExtended.themeDurationSeconds);
      return Number.isFinite(n) && n >= 4 && n <= 60 ? Math.round(n) : 12;
    },
  );
  const [autoRandomizeThemePalettes, setAutoRandomizeThemePalettes] =
    useState<boolean>(() =>
      typeof initialExtended.autoRandomizeThemePalettes === "boolean"
        ? initialExtended.autoRandomizeThemePalettes
        : true,
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
  const [enabledFonts, setEnabledFonts] = useState<FontPack[]>(
    initialPrefs.enabledFonts || [...ALL_FONT_PACKS],
  );
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
  const [lyricFontScale, setLyricFontScale] = useState<number>(() => {
    const saved = Number(initialExtended.lyricFontScale);
    if (Number.isFinite(saved) && saved >= 0.5 && saved <= 1.8) return saved;
    const derived =
      (initialPrefs.lyricMinFontSize / 26 +
        initialPrefs.lyricMaxFontSize / 88) *
      0.5;
    return Math.max(0.5, Math.min(1.8, Math.round(derived * 20) / 20 || 1));
  });
  const [themePalettes, setThemePalettes] = useState<Record<string, string>>(
    initialPrefs.themePalettes,
  );

  // YouTube video background, fit mode, black overlay opacity, SponsorBlock & embedded lyric auto-hide state
  const [preferredVideoType, setPreferredVideoType] = useState(
    initialPrefs.display.preferredVideoType,
  );
  const [youtubeBackgroundMode, setYoutubeBackgroundMode] =
    useState<YouTubeBackgroundMode>(initialPrefs.display.youtubeBackgroundMode);
  const [videoFitMode, setVideoFitMode] = useState<VideoFitMode>(() =>
    initialExtended.videoFitMode === "stretch" ? "stretch" : "default",
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
    useState<AlbumArtLyricPalette | null>(null);

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

  const [liveScene, setLiveScene] = useState("Holographic Tide");
  const [renderStatus, setRenderStatus] = useState("VOXELWALL 2D ENGINE");
  const spectrumCanvas = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LocalPlayerHandle>(null);
  const audioHubRef = useRef<AudioSourceHubHandle>(null);
  const [cinemaControlsOpen, setCinemaControlsOpen] = useState(false);
  const [cinemaHudVisible, setCinemaHudVisible] = useState(true);
  const cinemaHudTimerRef = useRef<number | null>(null);

  // Lyrics & per-song delay state

  const [customEditOpen, setCustomEditOpen] = useState(false);
  const [lyricStatusMessage, setLyricStatusMessage] = useState("");

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
  const [incoming, setIncoming] = useState<IncomingLyrics | null>(null);
  const [activeLyrics, setActiveLyrics] = useState({
    recordingKey: "",
    lyricsKey: "",
    name: "",
    url: "",
    original: "",
    offset: 0,
  });
  const [fileEpoch, setFileEpoch] = useState(0);
  const [performance, setPerformance] = useState(false);

  // Full screen mode: show controls and exit full screen button on tap and hide after 2 seconds (2000ms)
  const scheduleCinemaHudHide = useCallback(() => {
    if (cinemaHudTimerRef.current !== null) {
      window.clearTimeout(cinemaHudTimerRef.current);
      cinemaHudTimerRef.current = null;
    }
    if (
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT
    ) {
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
    if (!cinemaControlsOpen && !playerOverlayOpen && !sourceOpen) {
      scheduleCinemaHudHide();
    } else if (cinemaHudTimerRef.current !== null) {
      window.clearTimeout(cinemaHudTimerRef.current);
      cinemaHudTimerRef.current = null;
    }
    const onWindowBlur = () => {
      // Tapping an embedded YouTube iframe shifts focus from window to iframe; wake the HUD
      revealCinemaHud();
    };
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      if (cinemaHudTimerRef.current !== null) {
        window.clearTimeout(cinemaHudTimerRef.current);
        cinemaHudTimerRef.current = null;
      }
    };
  }, [
    performance,
    cinemaControlsOpen,
    playerOverlayOpen,
    sourceOpen,
    scheduleCinemaHudHide,
    revealCinemaHud,
  ]);

  const songMapping = useSongMapping(localTrack, uid);
  const lyricsFix = useCorrection(localTrack, "lyrics", uid);
  const videoFix = useCorrection(localTrack, "video", uid);
  const recordingKey = lyricsFix.context?.recordingKey || "";
  const lyricsKey =
    activeLyrics.recordingKey === recordingKey ? activeLyrics.lyricsKey : "";
  const onLyricContentChange = useCallback(
    (original: string, sourceUrl: string, sourceName: string, offset = 0) => {
      const nextKey = lyricFingerprint(original, sourceUrl);
      const nextName = sourceName.slice(0, 256);
      setActiveLyrics((prev) =>
        prev.recordingKey === recordingKey &&
        prev.lyricsKey === nextKey &&
        prev.name === nextName &&
        prev.url === sourceUrl &&
        prev.original === original &&
        prev.offset === offset
          ? prev
          : {
              recordingKey,
              original,
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
    ? privateLyrics.text
    : legacyDelay?.customLyricsLrc || "";
  const lyricDelay =
    delayFix.correction?.delaySeconds ??
    (songMapping.lyrics?.sourceFile.revision === lyricsKey
      ? songMapping.lyrics.delaySeconds
      : 0);
  const delaySavedStatus =
    delayFix.error ||
    (delayFix.source === "personal"
      ? `Your ${formatLyricDelay(lyricDelay)} correction · ${user ? "account sync enabled" : "saved on device"}`
      : delayFix.source === "approved"
        ? `Community-approved ${formatLyricDelay(lyricDelay)} correction`
        : "Automatic timing · personal changes save per lyrics version");
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
    !songMapping.approved?.lyrics &&
      !lyricsFix.correction?.selection &&
      songMapping.lyrics?.selection?.engine === "lrclib" &&
      songMapping.lyrics.sourceFile.name.startsWith("LyricFlow Engine"),
  );
  const effectiveLyricsEngine =
    lyricsFix.correction?.selection?.engine ||
    (legacyAutomaticLrc
      ? "lyricflow"
      : songMapping.lyrics?.selection?.engine) ||
    lyricEngineOption;
  const effectiveSubtitleTrackId =
    lyricsFix.correction?.selection?.subtitleTrackId ||
    songMapping.lyrics?.selection?.subtitleTrackId ||
    selectedSubtitleTrackId;

  const applyPreferences = useCallback((prefs: UserPreferencesData) => {
    setIntensity(prefs.intensity);
    setSpeed(prefs.speed);
    setSensitivity(prefs.sensitivity);
    setSpectrumControl(prefs.spectrumGain);
    setMotionBlur(prefs.motionBlur);
    setQuality(prefs.quality);
    setAutoScenes(prefs.autoScenes);
    setSpatialTypography(prefs.spatialTypography);
    setEnabledScenes(prefs.enabledScenes);
    setAutoKineticMotion(prefs.autoKineticMotion ?? true);
    setManualKineticMotion(prefs.manualKineticMotion || "ship");
    setEnabledKineticMotions(prefs.enabledKineticMotions);
    setEnabledPlacements(prefs.enabledPlacements || [...ALL_PLACEMENT_MODES]);
    setAutoFonts(prefs.autoFonts ?? true);
    setManualFont(prefs.manualFont || "impact");
    setEnabledFonts(prefs.enabledFonts || [...ALL_FONT_PACKS]);
    setCameraShakeEnabled(prefs.cameraShakeEnabled);
    setCameraShakeSensitivity(prefs.cameraShakeSensitivity);
    setLyricMinFontSize(prefs.lyricMinFontSize);
    setLyricMaxFontSize(prefs.lyricMaxFontSize);
    const syncedScale = Math.max(
      0.5,
      Math.min(
        1.8,
        Math.round(
          (prefs.lyricMinFontSize / 26 + prefs.lyricMaxFontSize / 88) *
            0.5 *
            20,
        ) / 20,
      ),
    );
    setLyricFontScale(syncedScale);
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
        remotePreferences.current = JSON.stringify(prefs);
        applyPreferences(prefs);
        setCloudReady(true);
      },
      setSyncStatus,
    );
  }, [uid, applyPreferences]);

  // Persist extended settings locally
  useEffect(() => {
    try {
      localStorage.setItem(
        "lyricflow.extendedSettings.v1",
        JSON.stringify({
          themeMode,
          showFps,
          videoFitMode,
          lyricFontScale,
          videoPlacementMode,
          enabledVideoPlacements,
          themePlacementMode,
          enabledThemePlacements,
          themeDurationLines,
          themeDurationSeconds,
          autoRandomizeThemePalettes,
        }),
      );
    } catch {}
  }, [
    themeMode,
    showFps,
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
      spatialTypography,
      narrativeObjects: false,
      cameraMode: "Front",
      enabledScenes,
      autoKineticMotion,
      manualKineticMotion,
      enabledKineticMotions,
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
    if (!user || JSON.stringify(prefs) === remotePreferences.current) return;
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
    privateLyrics.save("");
    lyricsFix.save({ selection });
  };
  const selectEngine = (engine: LyricEngineOption) => {
    if (engine === "youtube" && effectiveLyricsEngine === "youtube")
      setFileEpoch((epoch) => epoch + 1);
    selectLyrics({ engine, lrclibId: null, subtitleTrackId: null });
  };
  const selectSubtitle = (id: string) =>
    selectLyrics({ engine: "youtube", lrclibId: null, subtitleTrackId: id });
  const updateLyricDelay = (value: number) => {
    delayFix.save({ delaySeconds: clampLyricDelay(value) });
  };

  const handleLyricFontScaleChange = (scale: number) => {
    const clampedScale = Math.max(
      0.5,
      Math.min(1.8, Math.round(scale * 20) / 20),
    );
    setLyricFontScale(clampedScale);
    setLyricMinFontSize(
      Math.max(16, Math.min(72, Math.round(26 * clampedScale))),
    );
    setLyricMaxFontSize(
      Math.max(32, Math.min(130, Math.round(88 * clampedScale))),
    );
  };

  const handleMinFontSizeChange = (val: number) => {
    const clamped = Math.max(16, Math.min(72, val));
    setLyricMinFontSize(clamped);
    if (clamped > lyricMaxFontSize) {
      setLyricMaxFontSize(clamped);
    }
    setLyricFontScale(
      Math.max(0.5, Math.min(1.8, Math.round((clamped / 26) * 20) / 20)),
    );
  };

  const handleMaxFontSizeChange = (val: number) => {
    const clamped = Math.max(32, Math.min(130, val));
    setLyricMaxFontSize(clamped);
    if (clamped < lyricMinFontSize) {
      setLyricMinFontSize(Math.max(16, clamped));
    }
    setLyricFontScale(
      Math.max(0.5, Math.min(1.8, Math.round((clamped / 88) * 20) / 20)),
    );
  };

  const handleSaveCustomOverride = (lrc: string) => {
    privateLyrics.save(lrc);
  };
  const incomingRevision = useRef(0);
  const acceptLyrics = (lyrics: Omit<IncomingLyrics, "token">) =>
    setIncoming({ ...lyrics, token: ++incomingRevision.current });

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
      if (!document.fullscreenElement) setPerformance(false);
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
      if (canvas.dataset.sceneLabel)
        setLiveScene((previous) =>
          previous === canvas.dataset.sceneLabel
            ? previous
            : canvas.dataset.sceneLabel || previous,
        );
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
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      return;
    }
    setPerformance(true);
    setCinemaControlsOpen(false);
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
    setEnabledKineticMotions((prev) => {
      if (prev.includes(motion)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== motion);
      }
      return [...prev, motion];
    });
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

  const effectiveKineticMotions: readonly LyricMotion[] = autoKineticMotion
    ? enabledKineticMotions
    : [manualKineticMotion];
  const effectiveFonts: readonly FontPack[] = autoFonts
    ? enabledFonts
    : [manualFont];

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
    ? videoFix.correction?.youtubeVideoId ||
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
  const autoYoutubeVideoId =
    autoVideoMatch.key === videoSearchKey
      ? filteredAutoVideos.length > 0
        ? extractYouTubeVideoId(filteredAutoVideos[0])
        : autoVideoMatch.id && !rejectedBgVideoIds.includes(autoVideoMatch.id)
          ? autoVideoMatch.id
          : null
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
    void findYouTubeBackgrounds(
      localTrack,
      preferredVideoType,
      base,
      controller.signal,
    )
      .then(({ videos, candidateCount }) => {
        if (controller.signal.aborted) return;
        const bestId =
          videos.length > 0 ? extractYouTubeVideoId(videos[0]) : null;
        setAutoVideoMatch({
          key: videoSearchKey,
          id: bestId || null,
          pending: false,
          videos,
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

  // Android External Player: start/stop Mic or Internal Audio reactivity capture
  useEffect(() => {
    if (sourceMode !== "external") {
      void stopExternalAudioCapture();
      setExternalAudioStatus("");
      return;
    }
    let cancelled = false;
    void startExternalAudioCapture(externalAudioMode).then((res) => {
      if (!cancelled) setExternalAudioStatus(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceMode, externalAudioMode]);

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

  const stageYoutubeVideoId = isAdPlaying
    ? null
    : activeYoutubeVideoId ||
      (hasSeparateAudioStream &&
      (localTrack?.provider === "jiosaavn" ||
        localTrack?.provider === "external" ||
        localTrack?.provider === "local")
        ? autoYoutubeVideoId
        : null);

  const effectiveYoutubeBackgroundMode: YouTubeBackgroundMode = isAdPlaying
    ? "theme"
    : youtubeBackgroundMode;

  const isYtVideoBackgroundActive = Boolean(
    stageYoutubeVideoId && effectiveYoutubeBackgroundMode === "video",
  );

  const matchedVideoCandidate =
    autoVideoMatch.videos.find(
      (v) => extractYouTubeVideoId(v) === stageYoutubeVideoId,
    ) || null;
  const isActiveVideoLyrical = Boolean(
    isYtVideoBackgroundActive &&
      ((hasSeparateAudioStream && preferredVideoType === "lyrics") ||
        isLyricVideoTrack(matchedVideoCandidate) ||
        isLyricVideoTrack(localTrack)),
  );
  const shouldHideStageLyrics = Boolean(
    isAdPlaying || (autoHideYoutubeLyrics && isActiveVideoLyrical),
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
      if (!cancelled) setAlbumArtPalette(pal);
    });
    return () => {
      cancelled = true;
    };
  }, [localTrack?.artwork, stageYoutubeVideoId, songSeed]);

  const effectiveAlbumArtPalette = albumArtPalette || defaultSongPalette;

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
    hasSeparateAudioStream && !isAdPlaying,
    activeLyrics.recordingKey === recordingKey
      ? activeLyrics.original
      : incoming?.original || "",
    lyricDelay -
      (activeLyrics.recordingKey === recordingKey ? activeLyrics.offset : 0),
  );
  const autoVideoDelaySeconds = autoVideoSync.delaySeconds,
    autoVideoSyncStatus = autoVideoSync.status,
    bgCaptionStatus = autoVideoSync.captionStatus;

  // A personal automatic-timing choice (null) also overrides a published fixed delay.
  const chosenVideoDelay = videoFix.correction
    ? videoFix.correction.videoDelaySeconds
    : songMapping.video?.delaySeconds;
  const hasManualVideoDelay = chosenVideoDelay != null;
  const videoDelaySeconds = hasSeparateAudioStream
    ? (chosenVideoDelay ?? autoVideoDelaySeconds)
    : 0;

  const videoTimingStatus = hasManualVideoDelay
    ? `Manual video delay: ${videoDelaySeconds > 0 ? "+" : ""}${videoDelaySeconds}s`
    : autoVideoSyncStatus;

  useEffect(() => {
    if (!localTrack || !lyricsKey) return;
    const sourceFile = {
      name: activeLyrics.name,
      url: activeLyrics.url,
      revision: lyricsKey,
    };
    const candidateId = activeLyrics.url.match(
      /lrclib\.net\/api\/get\/(\d+)/,
    )?.[1];
    const selection = lyricsFix.correction?.selection || {
      engine: effectiveLyricsEngine,
      lrclibId:
        effectiveLyricsEngine === "lrclib" && candidateId
          ? Number(candidateId)
          : null,
      subtitleTrackId: effectiveSubtitleTrackId || null,
    };
    songMapping.savePart("lyrics", {
      sourceFile,
      selection,
      delaySeconds: lyricDelay,
    });
  }, [
    recordingKey,
    lyricsKey,
    activeLyrics.name,
    activeLyrics.url,
    effectiveLyricsEngine,
    effectiveSubtitleTrackId,
    lyricDelay,
  ]);
  useEffect(() => {
    if (localTrack && activeYoutubeVideoId && hasManualVideoDelay) {
      songMapping.savePart("video", {
        youtubeVideoId: activeYoutubeVideoId,
        delaySeconds: videoDelaySeconds,
      });
    }
  }, [
    recordingKey,
    activeYoutubeVideoId,
    hasManualVideoDelay,
    videoDelaySeconds,
  ]);
  const saveVideoChoice = (id: string, seconds: number | null) => {
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
          onClick={() => setCinemaControlsOpen(true)}
        >
          <SlidersHorizontal size={17} />
          Settings
        </button>
      </header>
      <main className="workspace">
        <div className="listening-column">
          <section className="visualizer-section" aria-label="Visualizer">
            <div className="section-caption">
              <span>Visualizer</span>
              <span className="live-theme">
                {youtubeBackgroundMode === "video" && stageYoutubeVideoId
                  ? "Video"
                  : liveScene}
              </span>
            </div>
            <div
              className="stage"
              onClick={performance ? revealCinemaHud : undefined}
              onPointerMove={performance ? revealCinemaHud : undefined}
              aria-label="Music visualizer"
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
                lyricPlacementMode={lyricPlacementMode}
                videoOverlayOpacity={videoOverlayOpacity}
                videoFitMode={videoFitMode}
                audioPaused={Boolean(localLoaded && !localPlaying)}
                youtubeVideoId={stageYoutubeVideoId}
                videoDelaySeconds={videoDelaySeconds}
                youtubeBackgroundMode={effectiveYoutubeBackgroundMode}
                hideStageLyrics={shouldHideStageLyrics}
                recordingKey={recordingKey}
                externalPlayer={
                  sourceMode === "external" ||
                  localTrack?.provider === "external"
                }
                advertisementPlaying={isAdPlaying}
                videoSearchPending={videoSearchPending}
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
                  if (!rejectedId) return;
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
                      onClick={() => setCinemaControlsOpen((v) => !v)}
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
            className="player-section"
            onPointerMove={performance ? revealCinemaHud : undefined}
            onClick={performance ? revealCinemaHud : undefined}
          >
            <LocalPlayer
              ref={playerRef}
              sourceMode={sourceMode}
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
              }}
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
                  <span>Current song</span>
                  <strong>{localTrack?.title || "No song selected"}</strong>
                  {localTrack?.artist && <small>{localTrack.artist}</small>}
                </div>
                {!localTrack && (
                  <p className="empty-note">
                    Choose a song in the music player to adjust its mapping.
                  </p>
                )}
                <div
                  ref={setMappingTarget}
                  className="mapping-lyrics-controls"
                />
                <SettingGroup title="Lyrics source">
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
                      {mappingSearchOpen ? "Close search" : "Change lyrics"}
                    </button>
                  </div>
                  {!isAdPlaying && (
                    <>
                      <TrackFinder
                        key={"finder-" + fileEpoch}
                        track={localTrack}
                        preferredSelection={
                          lyricsFix.correction?.selection ||
                          (legacyAutomaticLrc
                            ? null
                            : songMapping.lyrics?.selection) ||
                          null
                        }
                        preferredSourceFile={
                          lyricsFix.source === "personal"
                            ? null
                            : songMapping.approved?.lyrics?.sourceFile ||
                              (effectiveLyricsEngine !== "lyricflow"
                                ? songMapping.lyrics?.sourceFile
                                : null) ||
                              null
                        }
                        onSelectionChange={selectLyrics}
                        savedCustomLrc={savedCustomLrc}
                        customEditOpen={mappingSearchOpen}
                        lyricEngineOption={effectiveLyricsEngine}
                        onLyricEngineOptionChange={setLyricEngineOption}
                        selectedSubtitleTrackId={effectiveSubtitleTrackId}
                        onSelectSubtitleTrackId={selectSubtitle}
                        onAvailableLyricEnginesChange={setAvailableLyricEngines}
                        onSubtitleTracksChange={setYoutubeSubtitleTracks}
                        leadingNonMusicOffsetSec={leadingNonMusicOffsetSec}
                        onMetadataChange={(value) => {
                          setLocalTrack(value);
                          saveTrackCorrection(value);
                        }}
                        onLyricsFound={acceptLyrics}
                        onStatusChange={setLyricStatusMessage}
                      />
                    </>
                  )}
                </SettingGroup>
                <SettingGroup title="Background video">
                  {localTrack && hasSeparateAudioStream && !isAdPlaying ? (
                    <>
                      <YouTubeBackgroundPicker
                        key={"video-picker-" + recordingKey}
                        track={localTrack}
                        activeVideoId={activeYoutubeVideoId}
                        preference={preferredVideoType}
                        cachedCandidates={filteredAutoVideos}
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
                          setManualVideoSearchKey(searching ? recordingKey : "")
                        }
                        onChoose={(id) => {
                          saveVideoChoice(
                            id,
                            id === activeYoutubeVideoId && hasManualVideoDelay
                              ? videoDelaySeconds
                              : null,
                          );
                          setYoutubeBackgroundMode("video");
                        }}
                      />
                    </>
                  ) : (
                    <p className="empty-note">
                      {localTrack
                        ? "YouTube is also your audio source. Choose a separate audio source to change only the background."
                        : "Video matching becomes available when a song is playing."}
                    </p>
                  )}
                  {hasSeparateAudioStream && videoTimingStatus && (
                    <p className="quiet-status" role="status">
                      {videoTimingStatus}
                    </p>
                  )}
                </SettingGroup>
                <CorrectionControls
                  key={"corrections-" + recordingKey}
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
                  canChangeVideo={hasSeparateAudioStream}
                  currentVideoDelay={videoDelaySeconds}
                  currentVideoId={stageYoutubeVideoId}
                  onVideoChange={saveVideoChoice}
                />
                {songMapping.error && <p role="status">{songMapping.error}</p>}
                {privateLyrics.error && (
                  <p role="status">{privateLyrics.error}</p>
                )}
                {localTrack && (
                  <button
                    type="button"
                    className="source-primary save-song-button"
                    onClick={() => {
                      updateLyricDelay(lyricDelay);
                      if (stageYoutubeVideoId && hasSeparateAudioStream)
                        saveVideoChoice(
                          stageYoutubeVideoId,
                          hasManualVideoDelay ? videoDelaySeconds : null,
                        );
                    }}
                  >
                    Save for current song
                  </button>
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
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Background mode"
                  >
                    {(["theme", "video"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={youtubeBackgroundMode === mode}
                        onClick={() => setYoutubeBackgroundMode(mode)}
                      >
                        {mode === "theme" ? "Theme" : "Video"}
                      </button>
                    ))}
                  </div>
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
                  <SwitchSetting
                    label="Hide overlay lyrics on lyrical videos"
                    checked={autoHideYoutubeLyrics}
                    onChange={setAutoHideYoutubeLyrics}
                  />
                  <SwitchSetting
                    label="Skip non-music segments"
                    checked={sponsorBlockEnabled}
                    onChange={setSponsorBlockEnabled}
                  />
                </SettingGroup>
                <SettingGroup title="Themes">
                  <label className="field-row">
                    Theme
                    <select
                      aria-label="Theme selection"
                      value={scene}
                      onChange={(e) => {
                        setScene(e.target.value as SceneId);
                        setAutoScenes(false);
                      }}
                    >
                      {choices.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SwitchSetting
                    label="Randomize enabled themes"
                    checked={autoScenes}
                    onChange={setAutoScenes}
                  />
                  <SwitchSetting
                    label="Auto-randomize colour palette"
                    checked={autoRandomizeThemePalettes}
                    onChange={setAutoRandomizeThemePalettes}
                  />
                  <label className="field-row">
                    Colour palette
                    <select
                      aria-label="Theme colour palette"
                      value={
                        resolveThemePalette(scene, themePalettes[scene]).id
                      }
                      onChange={(e) =>
                        setThemePalettes((prev) => ({
                          ...prev,
                          [scene]: e.target.value,
                        }))
                      }
                    >
                      {byId[scene].palettes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEnabledScenes([...ALL_SCENE_IDS])}
                      >
                        Enable all
                      </button>
                      {choices.map((item) => (
                        <SwitchSetting
                          key={item.id}
                          label={item.label}
                          checked={enabledScenes.includes(item.id)}
                          onChange={() => toggleSceneEnabled(item.id)}
                        />
                      ))}
                    </div>
                  </details>
                </SettingGroup>
              </>
            ),
            lyrics: (
              <>
                <SettingGroup title="Placement">
                  <label className="field-row">
                    On video
                    <select
                      aria-label="Video lyric placement"
                      value={videoPlacementMode}
                      onChange={(e) =>
                        setVideoPlacementMode(
                          e.target.value as LyricPlacementMode,
                        )
                      }
                    >
                      {LYRIC_PLACEMENT_MODES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-row">
                    On themes
                    <select
                      aria-label="Theme lyric placement"
                      value={themePlacementMode}
                      onChange={(e) =>
                        setThemePlacementMode(
                          e.target.value as LyricPlacementMode,
                        )
                      }
                    >
                      {LYRIC_PLACEMENT_MODES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details className="disclosure">
                    <summary>Automatic placements</summary>
                    {(["video", "theme"] as const).map((kind) => (
                      <div className="selection-list" key={kind}>
                        <h4>{kind === "video" ? "On video" : "On themes"}</h4>
                        {LYRIC_PLACEMENT_MODES.filter(
                          (p) => p.id !== "auto",
                        ).map((p) => (
                          <SwitchSetting
                            key={p.id}
                            label={p.label}
                            checked={(kind === "video"
                              ? enabledVideoPlacements
                              : enabledThemePlacements
                            ).includes(
                              p.id as Exclude<LyricPlacementMode, "auto">,
                            )}
                            onChange={() =>
                              kind === "video"
                                ? toggleVideoPlacementEnabled(
                                    p.id as Exclude<LyricPlacementMode, "auto">,
                                  )
                                : toggleThemePlacementEnabled(
                                    p.id as Exclude<LyricPlacementMode, "auto">,
                                  )
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </details>
                </SettingGroup>
                <SettingGroup title="Font & animation">
                  <label className="field-row">
                    Font
                    <select
                      aria-label="Lyric font"
                      value={autoFonts ? "auto" : manualFont}
                      onChange={(e) => {
                        setAutoFonts(e.target.value === "auto");
                        if (e.target.value !== "auto")
                          setManualFont(e.target.value as FontPack);
                      }}
                    >
                      <option value="auto">Rotate enabled fonts</option>
                      {FONT_SHOWCASE.map((f) => (
                        <option key={f} value={f}>
                          {fontLabel(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-row">
                    Animation
                    <select
                      aria-label="Lyric animation"
                      value={autoKineticMotion ? "auto" : manualKineticMotion}
                      onChange={(e) => {
                        setAutoKineticMotion(e.target.value === "auto");
                        if (e.target.value !== "auto")
                          setManualKineticMotion(e.target.value as LyricMotion);
                      }}
                    >
                      <option value="auto">Rotate enabled animations</option>
                      {VOXELVERSE_STYLES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SwitchSetting
                    label="3D lyric choreography"
                    checked={spatialTypography}
                    onChange={setSpatialTypography}
                  />
                  <details className="disclosure">
                    <summary>Enabled fonts & animations</summary>
                    <div className="selection-list">
                      <h4>Fonts</h4>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEnabledFonts([...ALL_FONT_PACKS])}
                      >
                        Enable all fonts
                      </button>
                      {FONT_SHOWCASE.map((f) => (
                        <SwitchSetting
                          key={f}
                          label={fontLabel(f)}
                          checked={enabledFonts.includes(f)}
                          onChange={() => toggleFontEnabled(f)}
                        />
                      ))}
                      <h4>Animations</h4>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setEnabledKineticMotions([...ALL_KINETIC_MOTIONS])
                        }
                      >
                        Enable all animations
                      </button>
                      {VOXELVERSE_STYLES.map((s) => (
                        <SwitchSetting
                          key={s.id}
                          label={s.name}
                          checked={enabledKineticMotions.includes(s.id)}
                          onChange={() => toggleKineticMotionEnabled(s.id)}
                        />
                      ))}
                    </div>
                  </details>
                </SettingGroup>
                <ManualLyrics
                  key={"editor-" + (recordingKey || fileEpoch)}
                  onLyricContentChange={onLyricContentChange}
                  mappingTarget={mappingTarget}
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
              </>
            ),
          }}
        </SettingsPanel>
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
        onRequestNotificationAccess={() =>
          void openExternalNotificationSettings()
        }
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
