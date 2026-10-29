import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import { correctionKey, fingerprint, upgradeCachedCorrection, validCorrection, chooseCorrection, type Correction, type CorrectionContext } from './correctionModel';

type Entry = { value: Correction; dirty: boolean; removed?: boolean };
type Cache = Record<string, Entry>;
const EVENT = 'lyricflow:corrections';
const personalKey = (uid: string | null) => scopedKey('corrections', uid);
const PUBLIC_CACHE = 'lyricflow.v3.approvedCorrections';
function updateCache(cacheKey: string, id: string, value: Entry | null) {
  const cache = readDevice<Cache>(cacheKey, {});
  if (value) cache[id] = value; else delete cache[id];
  const entries = Object.entries(cache);
  // Never evict pending personal edits. Bound the shared cache.
  writeDevice(cacheKey, cacheKey === PUBLIC_CACHE ? Object.fromEntries(entries.slice(-300)) : cache);
  window.dispatchEvent(new Event(EVENT));
}
function personalRef(uid: string, id: string) { return doc(db!, 'profiles', uid, 'corrections', id); }
export async function flushPersonalCorrection(uid: string, context: CorrectionContext) {
  if (!db) return;
  const id = correctionKey(context), cacheKey = personalKey(uid);
  const entry = readDevice<Cache>(cacheKey, {})[id];
  if (!entry?.dirty) return;
  if (entry.removed) await deleteDoc(personalRef(uid, id));
  else await setDoc(personalRef(uid, id), { ...entry.value, updatedAt: serverTimestamp() });
  const current = readDevice<Cache>(cacheKey, {})[id];
  if (JSON.stringify(current) === JSON.stringify(entry)) updateCache(cacheKey, id, entry.removed ? null : { ...entry, dirty: false });
}
export function savePersonalCorrection(uid: string | null, correction: Correction) {
  const value = validCorrection(correction, correction);
  if (!value) throw new Error('Invalid correction.');
  updateCache(personalKey(uid), correctionKey(value), { value, dirty: Boolean(uid) });
  return uid ? flushPersonalCorrection(uid, value) : Promise.resolve();
}
export function removePersonalCorrection(uid: string | null, context: CorrectionContext) {
  const value = readDevice<Cache>(personalKey(uid), {})[correctionKey(context)]?.value;
  if (!uid || !value) { updateCache(personalKey(uid), correctionKey(context), null); return Promise.resolve(); }
  updateCache(personalKey(uid), correctionKey(context), { value, dirty: true, removed: true });
  return flushPersonalCorrection(uid, context);
}
export function watchCorrection(context: CorrectionContext, uid: string | null,
  next: (result: ReturnType<typeof chooseCorrection>) => void, error: (message: string) => void) {
  const id = correctionKey(context), cacheKey = personalKey(uid);
  const cache = readDevice<Cache>(cacheKey, {});
  if (!cache[id]) {
    const candidates = Object.values(cache).filter(entry => !entry.removed)
      .map(entry => upgradeCachedCorrection(entry.value, context)).filter((value): value is Correction => Boolean(value));
    if (candidates.length && candidates.every(value => JSON.stringify(value) === JSON.stringify(candidates[0]))) {
      updateCache(cacheKey, id, { value: candidates[0], dirty: Boolean(uid) });
    }
  }
  const emit = () => {
    const p = readDevice<Cache>(cacheKey, {})[id], a = readDevice<Cache>(PUBLIC_CACHE, {})[id];
    next(chooseCorrection(p && !p.removed ? validCorrection(p.value, context) : null, a ? validCorrection(a.value, context) : null));
  };
  emit();
  window.addEventListener(EVENT, emit);
  const retry = () => { if (uid) void flushPersonalCorrection(uid, context).catch(() => error('Saved on device · correction sync unavailable')); };
  retry();
  window.addEventListener('online', retry);
  const unsubscribers: (() => void)[] = [];
  if (db) {
    // Exact document reads only. Guests cannot enumerate submissions or profiles.
    unsubscribers.push(onSnapshot(doc(db, 'approvedCorrections', id), snap => {
      if (snap.exists()) {
        const value = snap.data().active === true ? validCorrection(snap.data(), context) : null;
        updateCache(PUBLIC_CACHE, id, value ? { value, dirty: false } : null);
      } else if (!snap.metadata.fromCache) updateCache(PUBLIC_CACHE, id, null);
    }, () => error('Using saved corrections · community updates unavailable')));
    if (uid) unsubscribers.push(onSnapshot(personalRef(uid, id), { includeMetadataChanges: true }, snap => {
      const local = readDevice<Cache>(cacheKey, {})[id];
      if (local?.dirty) return;
      if (snap.exists()) {
        const value = validCorrection(snap.data(), context);
        if (value) updateCache(cacheKey, id, { value, dirty: false });
      } else if (!snap.metadata.fromCache) updateCache(cacheKey, id, null);
    }, () => error('Saved on device · personal correction sync unavailable')));
  }
  return () => { window.removeEventListener(EVENT, emit); window.removeEventListener('online', retry); unsubscribers.forEach(fn => fn()); };
}
export async function submitCorrection(user: User | null, correction: Correction) {
  if (!user) throw new Error('Sign in to submit a correction. Your personal fix is already saved.');
  if (!user.emailVerified) throw new Error('Verify your account email before submitting.');
  if (!db) throw new Error('Community submissions are not configured yet.');
  if (correction.identity.duration <= 0 || !correction.identity.artist.trim()) throw new Error('Add the artist and wait for the song duration before submitting.');
  const value = validCorrection(correction, correction);
  if (!value) throw new Error('Invalid correction.');
  // Deduplicate identical proposals, while keeping new fixes separate from reviewed proposals.
  const proposalKey = fingerprint(JSON.stringify(value));
  await setDoc(doc(db, 'correctionSubmissions', user.uid, 'items', correctionKey(value) + '_' + proposalKey), {
    ...value, proposalKey, uid: user.uid, status: 'pending', updatedAt: serverTimestamp(),
  });
}
export function importGuestCorrections(uid: string) {
  const entries = Object.values(readDevice<Cache>(personalKey(null), {}));
  for (const entry of entries) if (!entry.removed) void savePersonalCorrection(uid, entry.value).catch(() => {});
}
export function retryAccountCorrections(uid: string) {
  for (const entry of Object.values(readDevice<Cache>(personalKey(uid), {}))) {
    if (entry.dirty) void flushPersonalCorrection(uid, entry.value).catch(() => {});
  }
}
