import {enableAllPaletteSelections,normalizePaletteSelections,type ThemePaletteSelections} from '../visualization/cinematic/themeSelection';
import { TEMPLATES, type FontPack, type SceneId } from '../visualization/cinematic/catalog';
import { FONT_SHOWCASE } from '../visualization/cinematic/fonts';
import { ALL_PLACEMENT_MODES, LYRIC_MOTIONS, normalizeMotionPool, normalizeLyricMotion, type LyricMotion, type LyricPlacementMode } from '../visualization/cinematic/kineticTypography';
import { CAMERA_VIEWS, type Quality, type CameraMode, type CameraView } from '../visualization/cinematic/CinematicStage';
import { readDevice, writeDevice, scopedKey } from './deviceStore';

export interface User {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
}

export const isNativeApp = () => Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

export interface DisplayPreferences {
  preferredVideoType: 'music' | 'lyrics';
  scene: SceneId; reducedMotion: boolean; youtubeBackgroundMode: 'video' | 'theme';
  videoOverlayOpacity: number; autoHideYoutubeLyrics: boolean; playerVolume: number; sponsorBlockEnabled: boolean;
  lyricPlacementMode: 'auto' | 'left' | 'right' | 'bottom-right' | 'bottom-left' | 'top-left' | 'diagonal' | 'center';
  lyricColorMode: 'auto' | 'album' | 'cyan' | 'rose' | 'gold' | 'emerald' | 'violet' | 'coral' | 'white';
  lyricFillPaceMode: 'auto' | 'letter' | 'word'; lyricDisplayMode: 'original' | 'romanized' | 'both';
}
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  preferredVideoType: 'music', scene: 'holographic-tide', reducedMotion: false, youtubeBackgroundMode: 'video', videoOverlayOpacity: 0,
  autoHideYoutubeLyrics: false, playerVolume: 100, sponsorBlockEnabled: true, lyricPlacementMode: 'auto',
  lyricColorMode: 'auto', lyricFillPaceMode: 'letter', lyricDisplayMode: 'both',
};
export interface UserPreferencesData {
  display: DisplayPreferences;
  intensity: number;
  speed: number;
  sensitivity: number;
  spectrumGain: number;
  motionBlur: number;
  quality: Quality;
  autoScenes: boolean;
  spatialTypography: boolean;
  narrativeObjects: boolean;
  cameraMode: CameraMode;
  enabledScenes: SceneId[];
  autoKineticMotion?: boolean;
  manualKineticMotion?: LyricMotion;
  enabledKineticMotions: LyricMotion[];
  enabledPlacements?: Exclude<LyricPlacementMode, 'auto'>[];
  autoFonts?: boolean;
  manualFont?: FontPack;
  enabledFonts?: FontPack[];
  enabledCameraViews: CameraView[];
  cameraShakeEnabled: boolean;
  cameraShakeSensitivity: number;
  lyricMinFontSize: number;
  lyricMaxFontSize: number;
  themePalettes: ThemePaletteSelections;
}

export interface SongDelayRecord {
  songId: string;
  title: string;
  artist: string;
  duration: number;
  delaySeconds: number;
  customLyricsLrc: string;
}

export const LEGACY_PREFS_KEY = 'lyricflow.userPreferences.v2';
export const LEGACY_DELAYS_KEY = 'lyricflow.songDelays.v2';


export const ALL_SCENE_IDS: SceneId[] = TEMPLATES.map(t => t.id);
export const ALL_KINETIC_MOTIONS: LyricMotion[] = [...LYRIC_MOTIONS];
export const ALL_FONT_PACKS: FontPack[] = [...FONT_SHOWCASE];
export const ALL_CAMERA_VIEWS: CameraView[] = [...CAMERA_VIEWS];

export const DEFAULT_USER_PREFERENCES: UserPreferencesData = {
  display: { ...DEFAULT_DISPLAY_PREFERENCES },
  intensity: 100,
  speed: 30,
  sensitivity: 50,
  spectrumGain: 40,
  motionBlur: 80,
  quality: 'Balanced',
  autoScenes: true,
  spatialTypography: true,
  narrativeObjects: false,
  cameraMode: 'Front',
  enabledScenes: [...ALL_SCENE_IDS],
  autoKineticMotion: true,
  manualKineticMotion: 'ship',
  enabledKineticMotions: [...ALL_KINETIC_MOTIONS],
  enabledPlacements: ['center'],
  autoFonts: true,
  manualFont: 'impact',
  enabledFonts: [...ALL_FONT_PACKS],
  enabledCameraViews: ['Front'],
  cameraShakeEnabled: true,
  cameraShakeSensitivity: 50,
  lyricMinFontSize: 30,
  lyricMaxFontSize: 100,
  themePalettes: enableAllPaletteSelections(),
};

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
};

function sanitizeDisplay(raw: Partial<DisplayPreferences> | null | undefined): DisplayPreferences {
  const r = raw || {};
  const oneOf = <T extends string>(value: T | undefined, options: readonly T[], fallback: T) => value && options.includes(value) ? value : fallback;
  return {
    preferredVideoType: oneOf(r.preferredVideoType, ['music','lyrics'], 'music'),
    scene: oneOf(r.scene, ALL_SCENE_IDS, DEFAULT_DISPLAY_PREFERENCES.scene),
    reducedMotion: typeof r.reducedMotion === 'boolean' ? r.reducedMotion : false,
    youtubeBackgroundMode: oneOf(r.youtubeBackgroundMode, ['video', 'theme'], 'video'),
    videoOverlayOpacity: clampNum(r.videoOverlayOpacity, 0, 1, DEFAULT_DISPLAY_PREFERENCES.videoOverlayOpacity),
    autoHideYoutubeLyrics: typeof r.autoHideYoutubeLyrics === 'boolean' ? r.autoHideYoutubeLyrics : DEFAULT_DISPLAY_PREFERENCES.autoHideYoutubeLyrics,
    playerVolume: clampNum(r.playerVolume, 0, 100, DEFAULT_DISPLAY_PREFERENCES.playerVolume),
    sponsorBlockEnabled: typeof r.sponsorBlockEnabled === 'boolean' ? r.sponsorBlockEnabled : true,
    lyricPlacementMode: oneOf(r.lyricPlacementMode, ['auto','left','right','bottom-right','bottom-left','top-left','diagonal','center'], 'auto'),
    lyricColorMode: oneOf(r.lyricColorMode, ['auto','album','cyan','rose','gold','emerald','violet','coral','white'], 'auto'),
    lyricFillPaceMode: oneOf(r.lyricFillPaceMode, ['auto','letter','word'], DEFAULT_DISPLAY_PREFERENCES.lyricFillPaceMode),
    lyricDisplayMode: oneOf(r.lyricDisplayMode, ['original','romanized','both'], 'both'),
  };
}
export function sanitizePreferences(raw: (Partial<Omit<UserPreferencesData,'themePalettes'>> & {themePalettes?:unknown}) | null | undefined): UserPreferencesData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES };
  const validScenes = Array.isArray(raw.enabledScenes)
    ? [...new Set(raw.enabledScenes.filter((id): id is SceneId => ALL_SCENE_IDS.includes(id as SceneId)))].slice(0, ALL_SCENE_IDS.length)
    : [];
  const validMotions=normalizeMotionPool(raw.enabledKineticMotions)||[];
  const validPlacements = Array.isArray(raw.enabledPlacements)
    ? raw.enabledPlacements.filter((p): p is Exclude<LyricPlacementMode, 'auto'> => ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, 'auto'>)).slice(0, ALL_PLACEMENT_MODES.length)
    : [];
  const validFonts = Array.isArray(raw.enabledFonts)
    ? raw.enabledFonts.filter((f): f is FontPack => ALL_FONT_PACKS.includes(f as FontPack)).slice(0, ALL_FONT_PACKS.length)
    : [];
  const manualKineticMotion=normalizeLyricMotion(raw.manualKineticMotion)||'ship';
  const manualFont = raw.manualFont && ALL_FONT_PACKS.includes(raw.manualFont)
    ? raw.manualFont
    : 'impact';
  const quality: Quality = raw.quality === 'High' || raw.quality === 'Balanced' || raw.quality === 'Performance'
    ? raw.quality
    : 'Balanced';
  const cameraMode: CameraMode = 'Front';
  const normalizedPalettes = normalizePaletteSelections(raw.themePalettes);
  const cleanPalettes = Object.keys(normalizedPalettes).length > 0 ? normalizedPalettes : enableAllPaletteSelections();
  const minFont = clampNum(raw.lyricMinFontSize, 16, 72, DEFAULT_USER_PREFERENCES.lyricMinFontSize);
  const maxFont = Math.max(minFont, clampNum(raw.lyricMaxFontSize, 32, 130, DEFAULT_USER_PREFERENCES.lyricMaxFontSize));

  return {
    display: sanitizeDisplay(raw.display),
    intensity: clampNum(raw.intensity, 0, 100, DEFAULT_USER_PREFERENCES.intensity),
    speed: clampNum(raw.speed, 10, 100, DEFAULT_USER_PREFERENCES.speed),
    sensitivity: clampNum(raw.sensitivity, 0, 100, DEFAULT_USER_PREFERENCES.sensitivity),
    spectrumGain: clampNum(raw.spectrumGain, 0, 100, DEFAULT_USER_PREFERENCES.spectrumGain),
    motionBlur: clampNum(raw.motionBlur, 0, 80, DEFAULT_USER_PREFERENCES.motionBlur),
    quality,
    autoScenes: (validScenes.length || ALL_SCENE_IDS.length) > 1,
    spatialTypography: typeof raw.spatialTypography === 'boolean' ? raw.spatialTypography : DEFAULT_USER_PREFERENCES.spatialTypography,
    narrativeObjects: false,
    cameraMode,
    enabledScenes: validScenes.length > 0 ? validScenes : [...ALL_SCENE_IDS],
    autoKineticMotion: typeof raw.autoKineticMotion === 'boolean' ? raw.autoKineticMotion : true,
    manualKineticMotion,
    enabledKineticMotions: validMotions.length > 0 ? validMotions : [...ALL_KINETIC_MOTIONS],
    enabledPlacements: validPlacements.length > 0 ? validPlacements : ['center'],
    autoFonts: typeof raw.autoFonts === 'boolean' ? raw.autoFonts : true,
    manualFont,
    enabledFonts: validFonts.length > 0 ? validFonts : [...ALL_FONT_PACKS],
    enabledCameraViews: ['Front'],
    cameraShakeEnabled: typeof raw.cameraShakeEnabled === 'boolean' ? raw.cameraShakeEnabled : DEFAULT_USER_PREFERENCES.cameraShakeEnabled,
    cameraShakeSensitivity: clampNum(raw.cameraShakeSensitivity, 0, 100, DEFAULT_USER_PREFERENCES.cameraShakeSensitivity),
    lyricMinFontSize: minFont,
    lyricMaxFontSize: maxFont,
    themePalettes: cleanPalettes,
  };
}


export function loadLocalPreferences(uid: string | null = null): UserPreferencesData {
  const legacy = readDevice<Partial<UserPreferencesData> | null>(LEGACY_PREFS_KEY, null);
  const fallback = uid ? readDevice<Partial<UserPreferencesData> | null>(scopedKey('preferences', null), legacy) : legacy;
  return sanitizePreferences(readDevice(scopedKey('preferences', uid), fallback));
}
export function saveLocalPreferences(prefs: UserPreferencesData, uid: string | null = null): void {
  writeDevice(scopedKey('preferences', uid), sanitizePreferences(prefs));
}
/** Compare and write the same deployed schema; local selection pools must not cause sync loops. */
export function cloudPreferencesPayload(prefs:UserPreferencesData){
  const clean = sanitizePreferences(prefs);
  return {
    display: {
      ...clean.display,
      lyricColorMode: clean.display.lyricColorMode === 'album' ? 'auto' : clean.display.lyricColorMode,
    },
    intensity: clean.intensity,
    speed: clean.speed,
    sensitivity: clean.sensitivity,
    spectrumGain: clean.spectrumGain,
    motionBlur: clean.motionBlur,
    quality: clean.quality,
    autoScenes: clean.autoScenes,
    spatialTypography: clean.spatialTypography,
    narrativeObjects: false,
    cameraMode: 'Front' as const,
    enabledScenes: clean.enabledScenes,
    enabledKineticMotions: clean.enabledKineticMotions,
    enabledCameraViews: ['Front' as const],
    cameraShakeEnabled: clean.cameraShakeEnabled,
    cameraShakeSensitivity: clean.cameraShakeSensitivity,
    lyricMinFontSize: clean.lyricMinFontSize,
    lyricMaxFontSize: clean.lyricMaxFontSize,
    themePalettes: clean.themePalettes,
  };
}
export async function saveCloudPreferences(user: User, prefs: UserPreferencesData): Promise<void> {
  saveLocalPreferences(prefs, user.uid);
}
export function watchCloudPreferences(_user: User, _next: (prefs: UserPreferencesData) => void, _status: (message: string) => void) {
  return () => {};
}


