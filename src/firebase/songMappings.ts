import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { scopedKey, readDevice, writeDevice } from './deviceStore';
import { correctionContext, type LyricsSourceReference, type LyricsSelection, type RecordingIdentity } from './correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';

export interface SongLyricsMapping { sourceFile: LyricsSourceReference; selection: LyricsSelection | null; delaySeconds: number; }
export interface SongVideoMapping { youtubeVideoId: string; delaySeconds: number; }
export interface SongMapping { identity: RecordingIdentity; lyrics?: SongLyricsMapping; video?: SongVideoMapping; }
type Entry = SongMapping & { dirty?: ('lyrics' | 'video')[] };
type Cache = Record<string, Entry>;
const PUBLIC = 'lyricflow.v4.publishedSongMappings';
const EVENT = 'lyricflow:songMappings';
export function sameSong(a: RecordingIdentity, b: RecordingIdentity) { return a.title === b.title && a.artist === b.artist && a.duration === b.duration; }
export function validSongMapping(raw: unknown, identity: RecordingIdentity): SongMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SongMapping;
  if (!r.identity || !sameSong(r.identity, identity)) return null;
  const result: SongMapping = { identity };
  if (r.lyrics) {
    const l = r.lyrics, f = l.sourceFile;
    if (!f || typeof f.name !== 'string' || f.name.length > 256 || typeof f.url !== 'string' || f.url.length > 2048 || !/^l3_[a-f0-9]{16}$/.test(f.revision) || !Number.isFinite(l.delaySeconds) || Math.abs(l.delaySeconds) > 30) return null;
    const selection = l.selection;
    if (selection && (!['lyricflow','apple','lrclib','youtube'].includes(selection.engine) ||
      (selection.lrclibId !== null && (!Number.isSafeInteger(selection.lrclibId) || selection.lrclibId <= 0 || selection.engine !== 'lrclib')) ||
      (selection.subtitleTrackId !== null && (typeof selection.subtitleTrackId !== 'string' || selection.subtitleTrackId.length > 256)))) return null;
    result.lyrics = { sourceFile: { ...f }, selection: selection ? { ...selection } : null, delaySeconds: l.delaySeconds };
  }
  if (r.video) {
    if (!/^[\w-]{11}$/.test(r.video.youtubeVideoId) || !Number.isFinite(r.video.delaySeconds) || Math.abs(r.video.delaySeconds) > 300) return null;
    result.video = { ...r.video };
  }
  return result;
}
function notify() { window.dispatchEvent(new Event(EVENT)); }
function cacheWrite(key: string, id: string, entry: Entry | null) {
  const data = readDevice<Cache>(key, {});
  if (entry) data[id] = entry; else delete data[id];
  writeDevice(key, key === PUBLIC ? Object.fromEntries(Object.entries(data).slice(-300)) : data); notify();
}
async function flush(uid: string, id: string) {
  if (!db) return;
  const key = scopedKey('songMappings', uid), entry = readDevice<Cache>(key, {})[id];
  for (const field of entry?.dirty || []) {
    const value = entry[field];
    await setDoc(doc(db, 'profiles', uid, 'songMappings', id), { identity: entry.identity, [field]: value || deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    const latest = readDevice<Cache>(key, {})[id];
    if (latest && JSON.stringify(latest[field]) === JSON.stringify(value)) cacheWrite(key, id, { ...latest, dirty: latest.dirty?.filter(f => f !== field) });
  }
}
export function retrySongMappings(uid: string) {
  for (const [id, entry] of Object.entries(readDevice<Cache>(scopedKey('songMappings', uid), {}))) {
    if (entry.dirty?.length) void flush(uid, id).catch(() => {});
  }
}
export function useSongMapping(track: TrackInfo | null, uid: string | null) {
  const serialized = JSON.stringify(correctionContext(track, 'lyrics'));
  const context = useMemo(() => JSON.parse(serialized) as ReturnType<typeof correctionContext>, [serialized]);
  const id = context?.recordingKey || '', key = scopedKey('songMappings', uid);
  const [state, setState] = useState<{ id: string; personal: SongMapping | null; approved: SongMapping | null }>({ id: '', personal: null, approved: null });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!context) return;
    const emit = () => setState({ id, personal: validSongMapping(readDevice<Cache>(key, {})[id], context.identity), approved: validSongMapping(readDevice<Cache>(PUBLIC, {})[id], context.identity) });
    emit(); window.addEventListener(EVENT, emit);
    const retry = () => { if (uid) void flush(uid, id).catch(() => setError('Song mapping saved on device · waiting for sync')); };
    retry(); window.addEventListener('online', retry);
    const stops: (() => void)[] = [];
    if (db) {
      stops.push(onSnapshot(doc(db, 'songMappings', id), snap => {
        const value = snap.exists() && snap.data().active === true ? validSongMapping(snap.data(), context.identity) : null;
        if (snap.exists() || !snap.metadata.fromCache) cacheWrite(PUBLIC, id, value);
      }, () => setError('Using saved song mappings · shared updates unavailable')));
      if (uid) stops.push(onSnapshot(doc(db, 'profiles', uid, 'songMappings', id), snap => {
        if (readDevice<Cache>(key, {})[id]?.dirty?.length) return;
        const value = snap.exists() ? validSongMapping(snap.data(), context.identity) : null;
        if (snap.exists() || !snap.metadata.fromCache) cacheWrite(key, id, value);
      }, () => setError('Song mappings saved on device · account sync unavailable')));
    }
    return () => { window.removeEventListener(EVENT, emit); window.removeEventListener('online', retry); stops.forEach(fn => fn()); };
  }, [context, id, uid, key]);
  const personal = state.id === id ? state.personal : null, approved = state.id === id ? state.approved : null;
  const savePart = (field: 'lyrics' | 'video', value: SongLyricsMapping | SongVideoMapping | null) => {
    if (!context) return;
    try {
      const entry = readDevice<Cache>(key, {})[id] || { identity: context.identity };
      if (JSON.stringify(entry[field]) === JSON.stringify(value ?? undefined)) return;
      const next = { ...entry, identity: context.identity, [field]: value || undefined, dirty: uid ? [...new Set([...(entry.dirty || []), field])] : [] };
      const checked = validSongMapping(next, context.identity); if (!checked) throw new Error('Invalid song mapping');
      cacheWrite(key, id, { ...checked, dirty: next.dirty });
      if (uid) void flush(uid, id).catch(() => setError('Song mapping saved on device · waiting for sync'));
    } catch { setError('Song mapping could not be saved. Check device storage.'); }
  };
  return { lyrics: approved?.lyrics || personal?.lyrics || null, video: approved?.video || personal?.video || null, personal, approved, savePart, error };
}

export function importGuestSongMappings(uid: string) {
  const guest = readDevice<Cache>(scopedKey('songMappings', null), {});
  const key = scopedKey('songMappings', uid), account = readDevice<Cache>(key, {});
  for (const [id, entry] of Object.entries(guest)) account[id] = { ...entry, dirty: ['lyrics','video'] };
  writeDevice(key, account); notify(); retrySongMappings(uid);
}
