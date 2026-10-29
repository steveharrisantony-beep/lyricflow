import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, LEGACY_DELAYS_KEY, type SongDelayRecord } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import { correctionContext, type RecordingIdentity } from './correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';

type Custom = { identity: RecordingIdentity; text: string; dirty: boolean };
export function legacySongDelay(track: TrackInfo | null): SongDelayRecord | null {
  if (!track) return null;
  const records = Object.values(readDevice<Record<string, SongDelayRecord>>(LEGACY_DELAYS_KEY, {}));
  return records.find(r => typeof r.title === 'string' && r.title.toLowerCase() === track.title.toLowerCase()
    && typeof r.artist === 'string' && r.artist.toLowerCase() === track.artist.toLowerCase()
    && Math.abs(r.duration - track.duration) <= 1) || null;
}
export function usePrivateLyrics(track: TrackInfo | null, uid: string | null) {
  const context = correctionContext(track, 'lyrics');
  const id = context?.recordingKey || '';
  const cacheKey = scopedKey('customLyrics', uid);
  const [state, setState] = useState({ id: '', text: '', exists: false });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id || !context) return;
    let stopped = false;
    const read = () => readDevice<Record<string, Custom>>(cacheKey, {})[id];
    const emit = () => { if (!stopped) setState({ id, text: read()?.text || '', exists: Boolean(read()) }); };
    const sync = () => {
      const entry = read();
      if (!db || !uid || !entry?.dirty) return;
      void setDoc(doc(db, 'profiles', uid, 'customLyrics', id), { identity: entry.identity, text: entry.text, updatedAt: serverTimestamp() })
        .then(() => {
          const map = readDevice<Record<string, Custom>>(cacheKey, {});
          if (map[id]?.text === entry.text) { map[id] = { ...entry, dirty: false }; writeDevice(cacheKey, map); }
        }).catch(() => { if (!stopped) setError('Custom lyrics saved on device · cloud sync unavailable'); });
    };
    emit(); sync();
    window.addEventListener('online', sync);
    window.addEventListener('lyricflow:customLyrics', emit);
    const unsubscribe = uid && db ? onSnapshot(doc(db, 'profiles', uid, 'customLyrics', id), snap => {
      if (read()?.dirty) return;
      if (snap.exists() && typeof snap.data().text === 'string') {
        const map = readDevice<Record<string, Custom>>(cacheKey, {});
        map[id] = { identity: context.identity, text: snap.data().text.slice(0, 100000), dirty: false };
        writeDevice(cacheKey, map); emit();
      } else if (!snap.exists() && !snap.metadata.fromCache) {
        const map = readDevice<Record<string, Custom>>(cacheKey, {}); delete map[id]; writeDevice(cacheKey, map); emit();
      }
    }, () => { if (!stopped) setError('Custom lyrics saved on device · cloud sync unavailable'); }) : () => {};
    return () => { stopped = true; unsubscribe(); window.removeEventListener('online', sync); window.removeEventListener('lyricflow:customLyrics', emit); };
  // Context identity is entirely represented by the recording key.
  }, [id, uid, cacheKey]);
  const save = (text: string) => {
    if (!context) return;
    try {
      const map = readDevice<Record<string, Custom>>(cacheKey, {});
      const entry = { identity: context.identity, text: text.slice(0, 100000), dirty: Boolean(uid) };
      map[id] = entry; writeDevice(cacheKey, map); setState({ id, text: entry.text, exists: true });
      if (uid && db) void setDoc(doc(db, 'profiles', uid, 'customLyrics', id), { identity: entry.identity, text: entry.text, updatedAt: serverTimestamp() })
        .then(() => {
          const latest = readDevice<Record<string, Custom>>(cacheKey, {});
          if (latest[id]?.text === entry.text) { latest[id].dirty = false; writeDevice(cacheKey, latest); }
        }).catch(() => setError('Custom lyrics saved on device · waiting for cloud sync'));
    } catch { setError('Device storage is full or blocked. Export your lyrics before closing.'); }
  };
  return { text: state.id === id ? state.text : '', hasOverride: state.id === id && state.exists, save, error };
}

export function importGuestCustomLyrics(uid: string) {
  const guest = readDevice<Record<string, Custom>>(scopedKey('customLyrics', null), {});
  const cacheKey = scopedKey('customLyrics', uid);
  const account = readDevice<Record<string, Custom>>(cacheKey, {});
  for (const [id, entry] of Object.entries(guest)) {
    account[id] = { ...entry, dirty: true };
    if (db) void setDoc(doc(db, 'profiles', uid, 'customLyrics', id), { identity: entry.identity, text: entry.text, updatedAt: serverTimestamp() })
      .then(() => {
        const latest = readDevice<Record<string, Custom>>(cacheKey, {});
        if (latest[id]?.text === entry.text) { latest[id].dirty = false; writeDevice(cacheKey, latest); }
      }).catch(() => {});
  }
  writeDevice(cacheKey, account);
  window.dispatchEvent(new Event('lyricflow:customLyrics'));
}
export function retryCustomLyrics(uid: string) {
  const cacheKey = scopedKey('customLyrics', uid);
  for (const [id, entry] of Object.entries(readDevice<Record<string, Custom>>(cacheKey, {}))) {
    if (!entry.dirty || !db) continue;
    void setDoc(doc(db, 'profiles', uid, 'customLyrics', id), { identity: entry.identity, text: entry.text, updatedAt: serverTimestamp() })
      .then(() => {
        const latest = readDevice<Record<string, Custom>>(cacheKey, {});
        if (latest[id]?.text === entry.text) { latest[id].dirty = false; writeDevice(cacheKey, latest); }
      }).catch(() => {});
  }
}
