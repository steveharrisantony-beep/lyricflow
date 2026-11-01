import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
  signOut, onAuthStateChanged, linkWithCredential, EmailAuthProvider, connectAuthEmulator, type User,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  doc, onSnapshot, setDoc, serverTimestamp, connectFirestoreEmulator, type Firestore,
} from 'firebase/firestore';
import { TEMPLATES, type FontPack, type SceneId } from '../visualization/cinematic/catalog';
import { FONT_SHOWCASE } from '../visualization/cinematic/fonts';
import { ALL_PLACEMENT_MODES, LYRIC_MOTIONS, type LyricMotion, type LyricPlacementMode } from '../visualization/cinematic/kineticTypography';
import { CAMERA_VIEWS, type Quality, type CameraMode, type CameraView } from '../visualization/cinematic/CinematicStage';
import { readDevice, writeDevice, scopedKey } from './deviceStore';

const env = import.meta.env || {};
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || '', projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '', authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
};
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
const app = isFirebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
let firestore: Firestore | null = null;
if (app) {
  const databaseId = env.VITE_FIREBASE_DATABASE_ID || '(default)';
  try {
    firestore = initializeFirestore(app, {
      localCache: typeof indexedDB !== 'undefined'
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
    }, databaseId);
  } catch {
    firestore = initializeFirestore(app, { localCache: memoryLocalCache() }, databaseId);
  }
}
export const db = firestore;
// Explicit, demo-project-only switch for automated tests. Production never redirects.
if (env.VITE_FIREBASE_EMULATORS === 'true' && config.projectId.startsWith('demo-') && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export { onAuthStateChanged, type User };
export const isNativeApp = () => Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
export async function signInWithGoogle() {
  if (!auth) throw new Error('Cloud sync is not configured yet. Your device settings still work.');
  if (isNativeApp()) throw new Error('Use email sign-in in the Android app. Native Google sign-in has not been configured.');
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}
export async function emailSignIn(email: string, password: string, create = false) {
  if (!auth) throw new Error('Cloud sync is not configured yet.');
  const result = create ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);
  if (create) await sendEmailVerification(result.user);
  return result.user;
}
export async function addAccountPassword(password: string) {
  const user = auth?.currentUser;
  if (!user?.email) throw new Error('Sign in first.');
  if (password.length < 6) throw new Error('Use a password with at least 6 characters.');
  await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
}
export async function resetPassword(email: string) {
  if (!auth || !email.trim()) throw new Error('Enter your account email first.');
  await sendPasswordResetEmail(auth, email.trim());
}
export async function verifyEmail() { if (auth?.currentUser) await sendEmailVerification(auth.currentUser); }
export async function signOutUser() { if (auth) await signOut(auth); }
export interface DisplayPreferences {
  preferredVideoType: 'music' | 'lyrics';
  scene: SceneId; reducedMotion: boolean; youtubeBackgroundMode: 'video' | 'theme';
  videoOverlayOpacity: number; autoHideYoutubeLyrics: boolean; playerVolume: number; sponsorBlockEnabled: boolean;
  lyricPlacementMode: 'auto' | 'alternating' | 'left' | 'right' | 'bottom-right' | 'bottom-left' | 'top-left' | 'diagonal' | 'center';
  lyricColorMode: 'auto' | 'album' | 'cyan' | 'rose' | 'gold' | 'emerald' | 'violet' | 'coral' | 'white';
  lyricFillPaceMode: 'auto' | 'letter' | 'word'; lyricDisplayMode: 'original' | 'romanized' | 'both';
}
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  preferredVideoType: 'music', scene: 'holographic-tide', reducedMotion: false, youtubeBackgroundMode: 'video', videoOverlayOpacity: .45,
  autoHideYoutubeLyrics: false, playerVolume: 85, sponsorBlockEnabled: true, lyricPlacementMode: 'auto',
  lyricColorMode: 'auto', lyricFillPaceMode: 'auto', lyricDisplayMode: 'both',
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
  themePalettes: Record<string, string>;
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
  intensity: 65,
  speed: 55,
  sensitivity: 50,
  spectrumGain: 35,
  motionBlur: 30,
  quality: 'Balanced',
  autoScenes: true,
  spatialTypography: true,
  narrativeObjects: false,
  cameraMode: 'Front',
  enabledScenes: [...ALL_SCENE_IDS],
  autoKineticMotion: true,
  manualKineticMotion: 'ship',
  enabledKineticMotions: [...ALL_KINETIC_MOTIONS],
  enabledPlacements: [...ALL_PLACEMENT_MODES],
  autoFonts: true,
  manualFont: 'impact',
  enabledFonts: [...ALL_FONT_PACKS],
  enabledCameraViews: ['Front'],
  cameraShakeEnabled: true,
  cameraShakeSensitivity: 50,
  lyricMinFontSize: 26,
  lyricMaxFontSize: 88,
  themePalettes: {},
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
    videoOverlayOpacity: clampNum(r.videoOverlayOpacity, 0, 1, .45),
    autoHideYoutubeLyrics: typeof r.autoHideYoutubeLyrics === 'boolean' ? r.autoHideYoutubeLyrics : false,
    playerVolume: clampNum(r.playerVolume, 0, 100, 85),
    sponsorBlockEnabled: typeof r.sponsorBlockEnabled === 'boolean' ? r.sponsorBlockEnabled : true,
    lyricPlacementMode: oneOf(r.lyricPlacementMode, ['auto','alternating','left','right','bottom-right','bottom-left','top-left','diagonal','center'], 'auto'),
    lyricColorMode: oneOf(r.lyricColorMode, ['auto','album','cyan','rose','gold','emerald','violet','coral','white'], 'auto'),
    lyricFillPaceMode: oneOf(r.lyricFillPaceMode, ['auto','letter','word'], 'auto'),
    lyricDisplayMode: oneOf(r.lyricDisplayMode, ['original','romanized','both'], 'both'),
  };
}
export function sanitizePreferences(raw: Partial<UserPreferencesData> | null | undefined): UserPreferencesData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES };
  const validScenes = Array.isArray(raw.enabledScenes)
    ? raw.enabledScenes.filter((id): id is SceneId => ALL_SCENE_IDS.includes(id as SceneId)).slice(0, ALL_SCENE_IDS.length)
    : [];
  const validMotions = Array.isArray(raw.enabledKineticMotions)
    ? raw.enabledKineticMotions.filter((m): m is LyricMotion => ALL_KINETIC_MOTIONS.includes(m as LyricMotion)).slice(0, ALL_KINETIC_MOTIONS.length)
    : [];
  const validPlacements = Array.isArray(raw.enabledPlacements)
    ? raw.enabledPlacements.filter((p): p is Exclude<LyricPlacementMode, 'auto'> => ALL_PLACEMENT_MODES.includes(p as Exclude<LyricPlacementMode, 'auto'>)).slice(0, ALL_PLACEMENT_MODES.length)
    : [];
  const validFonts = Array.isArray(raw.enabledFonts)
    ? raw.enabledFonts.filter((f): f is FontPack => ALL_FONT_PACKS.includes(f as FontPack)).slice(0, ALL_FONT_PACKS.length)
    : [];
  const manualKineticMotion = raw.manualKineticMotion && ALL_KINETIC_MOTIONS.includes(raw.manualKineticMotion)
    ? raw.manualKineticMotion
    : 'ship';
  const manualFont = raw.manualFont && ALL_FONT_PACKS.includes(raw.manualFont)
    ? raw.manualFont
    : 'impact';
  const quality: Quality = raw.quality === 'High' || raw.quality === 'Balanced' || raw.quality === 'Performance'
    ? raw.quality
    : 'Balanced';
  const cameraMode: CameraMode = 'Front';
  const cleanPalettes: Record<string, string> = {};
  if (raw.themePalettes && typeof raw.themePalettes === 'object') {
    for (const [k, v] of Object.entries(raw.themePalettes)) {
      if (ALL_SCENE_IDS.includes(k as SceneId) && typeof v === 'string' && v.length <= 48) {
        cleanPalettes[k] = v;
      }
    }
  }
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
    autoScenes: typeof raw.autoScenes === 'boolean' ? raw.autoScenes : DEFAULT_USER_PREFERENCES.autoScenes,
    spatialTypography: typeof raw.spatialTypography === 'boolean' ? raw.spatialTypography : DEFAULT_USER_PREFERENCES.spatialTypography,
    narrativeObjects: false,
    cameraMode,
    enabledScenes: validScenes.length > 0 ? validScenes : [...ALL_SCENE_IDS],
    autoKineticMotion: typeof raw.autoKineticMotion === 'boolean' ? raw.autoKineticMotion : true,
    manualKineticMotion,
    enabledKineticMotions: validMotions.length > 0 ? validMotions : [...ALL_KINETIC_MOTIONS],
    enabledPlacements: validPlacements.length > 0 ? validPlacements : [...ALL_PLACEMENT_MODES],
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
  const legacy = uid ? null : readDevice<Partial<UserPreferencesData> | null>(LEGACY_PREFS_KEY, null);
  return sanitizePreferences(readDevice(scopedKey('preferences', uid), legacy));
}
export function saveLocalPreferences(prefs: UserPreferencesData, uid: string | null = null): void {
  writeDevice(scopedKey('preferences', uid), sanitizePreferences(prefs));
}
export async function saveCloudPreferences(user: User, prefs: UserPreferencesData): Promise<void> {
  saveLocalPreferences(prefs, user.uid);
  if (!db) return;
  const clean = sanitizePreferences(prefs);
  const cloudPayload = {
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
  const pendingKey = scopedKey('preferencesPending', user.uid);
  writeDevice(pendingKey, clean);
  await setDoc(doc(db, 'profiles', user.uid), { preferences: cloudPayload, updatedAt: serverTimestamp() });
  if (JSON.stringify(readDevice(pendingKey, null)) === JSON.stringify(clean)) localStorage.removeItem(pendingKey);
}
export function watchCloudPreferences(user: User, next: (prefs: UserPreferencesData) => void, status: (message: string) => void) {
  if (!db) return () => {};
  const pendingKey = scopedKey('preferencesPending', user.uid);
  const pending = readDevice<UserPreferencesData | null>(pendingKey, null);
  if (pending) void saveCloudPreferences(user, pending).catch(() => status('Saved on device · cloud sync needs attention'));
  return onSnapshot(doc(db, 'profiles', user.uid), { includeMetadataChanges: true }, snapshot => {
    if (readDevice(pendingKey, null) && !snapshot.metadata.hasPendingWrites) return;
    if (snapshot.exists()) {
      const prefs = sanitizePreferences(snapshot.data().preferences);
      saveLocalPreferences(prefs, user.uid);
      next(prefs);
    } else if (!snapshot.metadata.fromCache) {
      next(loadLocalPreferences(user.uid));
    }
    status(snapshot.metadata.hasPendingWrites ? 'Saved on device · waiting to sync'
      : snapshot.metadata.fromCache ? 'Offline · using saved settings' : 'Account settings synced');
  }, () => status('Saved on device · cloud sync unavailable'));
}
