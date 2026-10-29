import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type Auth,
  type User,
  type NextOrObserver,
  type Unsubscribe,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { TEMPLATES, type SceneId } from '../visualization/cinematic/catalog';
import { LYRIC_MOTIONS, type LyricMotion } from '../visualization/cinematic/kineticTypography';
import { CAMERA_VIEWS, type Quality, type CameraMode, type CameraView } from '../visualization/cinematic/CinematicStage';
import type { TrackInfo } from '../metadata/trackInfo';
import { normalizeTrack } from '../metadata/trackInfo';

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};

const resolvedFirebaseConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
  projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  appId: (env.VITE_FIREBASE_APP_ID || '').trim(),
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  firestoreDatabaseId: (env.VITE_FIREBASE_DATABASE_ID || '').trim(),
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
};

export const isFirebaseConfigured = Boolean(resolvedFirebaseConfig.apiKey && resolvedFirebaseConfig.projectId);

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = initializeApp(resolvedFirebaseConfig);
    dbInstance = resolvedFirebaseConfig.firestoreDatabaseId
      ? getFirestore(appInstance, resolvedFirebaseConfig.firestoreDatabaseId)
      : getFirestore(appInstance);
    authInstance = getAuth(appInstance);
  } catch (err) {
    console.warn('Firebase initialization skipped; running in local storage mode.', err);
    appInstance = null;
    dbInstance = null;
    authInstance = null;
  }
}

export const db = dbInstance;
export const auth = authInstance;

export function onAuthStateChanged(
  authObj: Auth | null,
  nextOrObserver: NextOrObserver<User>
): Unsubscribe {
  if (!authObj) {
    if (typeof nextOrObserver === 'function') {
      nextOrObserver(null);
    } else if (nextOrObserver && typeof nextOrObserver.next === 'function') {
      nextOrObserver.next(null);
    }
    return () => {};
  }
  return firebaseOnAuthStateChanged(authObj, nextOrObserver);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface UserPreferencesData {
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
  enabledKineticMotions: LyricMotion[];
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

const LOCAL_PREFS_KEY = 'lyricflow.userPreferences.v2';
const LOCAL_DELAYS_KEY = 'lyricflow.songDelays.v2';
const LOCAL_SESSION_KEY = 'lyricflow.sessionMode.v2';

export const ALL_SCENE_IDS: SceneId[] = TEMPLATES.map(t => t.id);
export const ALL_KINETIC_MOTIONS: LyricMotion[] = [...LYRIC_MOTIONS];
export const ALL_CAMERA_VIEWS: CameraView[] = [...CAMERA_VIEWS];

export const DEFAULT_USER_PREFERENCES: UserPreferencesData = {
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
  enabledKineticMotions: [...ALL_KINETIC_MOTIONS],
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

export function sanitizePreferences(raw: Partial<UserPreferencesData> | null | undefined): UserPreferencesData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES };
  const validScenes = Array.isArray(raw.enabledScenes)
    ? raw.enabledScenes.filter((id): id is SceneId => ALL_SCENE_IDS.includes(id as SceneId)).slice(0, ALL_SCENE_IDS.length)
    : [];
  const validMotions = Array.isArray(raw.enabledKineticMotions)
    ? raw.enabledKineticMotions.filter((m): m is LyricMotion => ALL_KINETIC_MOTIONS.includes(m as LyricMotion)).slice(0, ALL_KINETIC_MOTIONS.length)
    : [];
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
    enabledKineticMotions: validMotions.length > 0 ? validMotions : [...ALL_KINETIC_MOTIONS],
    enabledCameraViews: ['Front'],
    cameraShakeEnabled: typeof raw.cameraShakeEnabled === 'boolean' ? raw.cameraShakeEnabled : DEFAULT_USER_PREFERENCES.cameraShakeEnabled,
    cameraShakeSensitivity: clampNum(raw.cameraShakeSensitivity, 0, 100, DEFAULT_USER_PREFERENCES.cameraShakeSensitivity),
    lyricMinFontSize: minFont,
    lyricMaxFontSize: maxFont,
    themePalettes: cleanPalettes,
  };
}

export function loadLocalPreferences(): UserPreferencesData {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFERENCES };
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function saveLocalPreferences(prefs: UserPreferencesData): void {
  try {
    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(sanitizePreferences(prefs)));
  } catch {
    // Ignore storage quota errors
  }
}

export function computeSongKey(track: TrackInfo | null): string {
  if (!track || !track.title.trim()) return '';
  const normTitle = normalizeTrack(track.title) || track.title.toLowerCase().trim();
  const normArtist = normalizeTrack(track.artist || '') || 'unknown';
  const raw = `${normTitle}|${normArtist}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 2246822519) >>> 0;
  }
  const slug = normTitle.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'track';
  return `song_${slug}_${h1.toString(16)}_${h2.toString(16)}`.slice(0, 96);
}

function readLocalDelaysMap(): Record<string, SongDelayRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_DELAYS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLocalSongDelay(track: TrackInfo | null): SongDelayRecord | null {
  const key = computeSongKey(track);
  if (!key) return null;
  const map = readLocalDelaysMap();
  return map[key] || null;
}

export function saveLocalSongDelay(record: SongDelayRecord): void {
  try {
    const map = readLocalDelaysMap();
    map[record.songId] = record;
    localStorage.setItem(LOCAL_DELAYS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getSavedSessionMode(): 'google' | 'guest' | null {
  try {
    const mode = localStorage.getItem(LOCAL_SESSION_KEY);
    return mode === 'google' || mode === 'guest' ? mode : null;
  } catch {
    return null;
  }
}

export function setSavedSessionMode(mode: 'google' | 'guest' | null): void {
  try {
    if (!mode) localStorage.removeItem(LOCAL_SESSION_KEY);
    else localStorage.setItem(LOCAL_SESSION_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) {
    throw new Error(
      'Google Cloud Sign-In requires VITE_FIREBASE_API_KEY in your local .env file. Please continue as Guest or set VITE_FIREBASE_API_KEY.'
    );
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  setSavedSessionMode('google');
  return result.user;
}

export async function signOutUser(): Promise<void> {
  setSavedSessionMode(null);
  if (auth?.currentUser) {
    await firebaseSignOut(auth);
  }
}

export { type User };

export async function fetchCloudPreferences(user: User): Promise<UserPreferencesData> {
  if (!db) return loadLocalPreferences();
  const path = `userPreferences/${user.uid}`;
  const ref = doc(db, 'userPreferences', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const sanitized = sanitizePreferences(snap.data() as Partial<UserPreferencesData>);
      saveLocalPreferences(sanitized);
      return sanitized;
    }
    const initial = loadLocalPreferences();
    await saveCloudPreferences(user, initial, true);
    return initial;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCloudPreferences(
  user: User,
  prefs: UserPreferencesData,
  isCreate = false
): Promise<void> {
  const clean = sanitizePreferences(prefs);
  saveLocalPreferences(clean);
  if (!db || !user.emailVerified) return;
  const path = `userPreferences/${user.uid}`;
  const ref = doc(db, 'userPreferences', user.uid);
  const displayName = (user.displayName || user.email || 'LyricFlow User').slice(0, 120);

  try {
    if (!isCreate) {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, {
          displayName,
          intensity: clean.intensity,
          speed: clean.speed,
          sensitivity: clean.sensitivity,
          spectrumGain: clean.spectrumGain,
          motionBlur: clean.motionBlur,
          quality: clean.quality,
          autoScenes: clean.autoScenes,
          spatialTypography: clean.spatialTypography,
          narrativeObjects: clean.narrativeObjects,
          cameraMode: clean.cameraMode,
          enabledScenes: clean.enabledScenes,
          enabledKineticMotions: clean.enabledKineticMotions,
          updatedAt: serverTimestamp(),
        });
        return;
      }
    }
    await setDoc(ref, {
      uid: user.uid,
      displayName,
      intensity: clean.intensity,
      speed: clean.speed,
      sensitivity: clean.sensitivity,
      spectrumGain: clean.spectrumGain,
      motionBlur: clean.motionBlur,
      quality: clean.quality,
      autoScenes: clean.autoScenes,
      spatialTypography: clean.spatialTypography,
      narrativeObjects: clean.narrativeObjects,
      cameraMode: clean.cameraMode,
      enabledScenes: clean.enabledScenes,
      enabledKineticMotions: clean.enabledKineticMotions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, isCreate ? OperationType.CREATE : OperationType.WRITE, path);
  }
}

export async function fetchSongDelayPreference(
  user: User | null,
  track: TrackInfo | null
): Promise<SongDelayRecord | null> {
  const local = loadLocalSongDelay(track);
  const songId = computeSongKey(track);
  if (!db || !songId || !user || !user.emailVerified) return local;

  const path = `userPreferences/${user.uid}/songDelays/${songId}`;
  const ref = doc(db, 'userPreferences', user.uid, 'songDelays', songId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return local;
    const data = snap.data();
    const record: SongDelayRecord = {
      songId,
      title: typeof data.title === 'string' ? data.title : track?.title || 'Untitled',
      artist: typeof data.artist === 'string' ? data.artist : track?.artist || '',
      duration: typeof data.duration === 'number' ? data.duration : track?.duration || 0,
      delaySeconds: clampNum(data.delaySeconds, -30, 30, 0),
      customLyricsLrc: typeof data.customLyricsLrc === 'string' ? data.customLyricsLrc : '',
    };
    saveLocalSongDelay(record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveSongDelayPreference(
  user: User | null,
  track: TrackInfo | null,
  delaySeconds: number,
  customLyricsLrc?: string
): Promise<SongDelayRecord | null> {
  const songId = computeSongKey(track);
  if (!track || !songId) return null;
  const previous = loadLocalSongDelay(track);
  const record: SongDelayRecord = {
    songId,
    title: (track.title.trim() || 'Untitled').slice(0, 200),
    artist: (track.artist || '').trim().slice(0, 200),
    duration: clampNum(Math.round(track.duration || 0), 0, 36000, 0),
    delaySeconds: clampNum(Number(delaySeconds.toFixed(2)), -30, 30, 0),
    customLyricsLrc: (customLyricsLrc !== undefined ? customLyricsLrc : previous?.customLyricsLrc || '').slice(0, 100000),
  };
  saveLocalSongDelay(record);

  if (!db || !user || !user.emailVerified) return record;

  // Ensure parent userPreferences document exists before writing subcollection
  const parentRef = doc(db, 'userPreferences', user.uid);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    await saveCloudPreferences(user, loadLocalPreferences(), true);
  }

  const path = `userPreferences/${user.uid}/songDelays/${songId}`;
  const ref = doc(db, 'userPreferences', user.uid, 'songDelays', songId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        title: record.title,
        artist: record.artist,
        duration: record.duration,
        delaySeconds: record.delaySeconds,
        customLyricsLrc: record.customLyricsLrc,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: user.uid,
        songId: record.songId,
        title: record.title,
        artist: record.artist,
        duration: record.duration,
        delaySeconds: record.delaySeconds,
        customLyricsLrc: record.customLyricsLrc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
