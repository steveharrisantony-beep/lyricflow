import {
  DEFAULT_USER_PREFERENCES,
  LEGACY_PREFS_KEY,
  loadLocalPreferences,
  sanitizePreferences,
  saveLocalPreferences,
} from './firebaseClient';
import {readDevice,scopedKey,writeDevice} from './deviceStore';
import {importGuestSongMappings,type SongMapping} from './songMappings';
import {importGuestCorrections} from './correctionStore';
import {importGuestCustomLyrics} from './usePrivateLyrics';

export function syncGuestDataToAccount(uid: string): void {
  const syncKey = scopedKey('guestSynced', uid);
  const last = readDevice<{
    prefs?: string;
    mappings?: Record<string, string>;
    corrections?: Record<string, string>;
    customLyrics?: Record<string, string>;
  }>(syncKey, {});
  const next = {
    prefs: last.prefs,
    mappings: { ...last.mappings },
    corrections: { ...last.corrections },
    customLyrics: { ...last.customLyrics },
  };

  let rawGuestPrefs: string | null = null;
  let hasAccountPrefs = false;
  try {
    rawGuestPrefs = localStorage.getItem(scopedKey('preferences', null)) || localStorage.getItem(LEGACY_PREFS_KEY);
    hasAccountPrefs = localStorage.getItem(scopedKey('preferences', uid)) !== null;
  } catch {
    /* Ignore storage read errors */
  }
  if (rawGuestPrefs && rawGuestPrefs !== last.prefs) {
    const guestPrefs = loadLocalPreferences(null);
    const defaultClean = JSON.stringify(sanitizePreferences(DEFAULT_USER_PREFERENCES));
    const guestClean = JSON.stringify(sanitizePreferences(guestPrefs));
    const isCustomized = guestClean !== defaultClean || last.prefs !== undefined;
    try {
      if (isCustomized) {
        saveLocalPreferences(guestPrefs, uid);
        writeDevice(scopedKey('preferencesPending', uid), guestPrefs);
      } else if (!hasAccountPrefs) {
        saveLocalPreferences(guestPrefs, uid);
      }
      next.prefs = rawGuestPrefs;
    } catch {
      /* Ignore storage write errors */
    }
  }

  const guestMappings = readDevice<Record<string, SongMapping & { removed?: boolean }>>(scopedKey('songMappings', null), {});
  const newMappings = Object.entries(guestMappings).filter(([id, entry]) => !entry.removed && JSON.stringify(entry) !== last.mappings?.[id]);
  if (newMappings.length > 0) {
    importGuestSongMappings(uid);
  }
  next.mappings = Object.fromEntries(Object.entries(guestMappings).map(([id, entry]) => [id, JSON.stringify(entry)]));

  const guestCorrections = readDevice<Record<string, { value: unknown; removed?: boolean }>>(scopedKey('corrections', null), {});
  const newCorrections = Object.entries(guestCorrections).filter(([id, entry]) => !entry.removed && JSON.stringify(entry) !== last.corrections?.[id]);
  if (newCorrections.length > 0) {
    importGuestCorrections(uid);
  }
  next.corrections = Object.fromEntries(Object.entries(guestCorrections).map(([id, entry]) => [id, JSON.stringify(entry)]));

  const guestCustom = readDevice<Record<string, unknown>>(scopedKey('customLyrics', null), {});
  const newCustom = Object.entries(guestCustom).filter(([id, entry]) => JSON.stringify(entry) !== last.customLyrics?.[id]);
  if (newCustom.length > 0) {
    importGuestCustomLyrics(uid);
  }
  next.customLyrics = Object.fromEntries(Object.entries(guestCustom).map(([id, entry]) => [id, JSON.stringify(entry)]));

  try {
    writeDevice(syncKey, next);
  } catch {
    /* Ignore storage write errors */
  }
}

export async function flushAccountSongData(_uid:string){
  return false;
}

export function syncAccountSongData(_uid:string):Promise<boolean>{
  return Promise.resolve(false);
}

export function syncPublishedSongData(){
  return Promise.resolve();
}
