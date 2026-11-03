import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {temporarySongs} from '../data/temporarySongs';
import {localSongData} from '../data/localSongData';
import { db } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import {songMappingResetPending,songMappingResetVersion} from './songMappingReset';
import { correctionKey, fingerprint, upgradeCachedCorrection, validCorrection, chooseCorrection, type Correction, type CorrectionContext, type CorrectionKind, type RecordingIdentity } from './correctionModel';

type Entry = { value: Correction; dirty: boolean; removed?: boolean; imported?:boolean };
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
const flushing=new Map<string,Promise<void>>();
export function flushPersonalCorrection(uid:string,context:CorrectionContext):Promise<void>{
  const lock=uid+':'+correctionKey(context)+':'+songMappingResetVersion(uid),active=flushing.get(lock);
  if(active)return active.then(()=>flushPersonalCorrection(uid,context),()=>flushPersonalCorrection(uid,context));
  const task=flushCorrectionLatest(uid,context).finally(()=>{if(flushing.get(lock)===task)flushing.delete(lock);});
  flushing.set(lock,task);return task;
}
async function flushCorrectionLatest(uid: string, context: CorrectionContext) {
  if (!db || songMappingResetPending(uid)) return;
  const id = correctionKey(context), cacheKey = personalKey(uid), version=songMappingResetVersion(uid);
  const entry = readDevice<Cache>(cacheKey, {})[id];
  if (!entry?.dirty) return;
  if (entry.removed) await deleteDoc(personalRef(uid, id));
  else await setDoc(personalRef(uid, id), { ...entry.value, updatedAt: serverTimestamp() });
  if(version!==songMappingResetVersion(uid))return;
  const current = readDevice<Cache>(cacheKey, {})[id];
  if (JSON.stringify(current) === JSON.stringify(entry)) updateCache(cacheKey, id, entry.removed ? null : { ...entry, dirty: false, imported:false });
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
export function watchCorrection(context:CorrectionContext,uid:string|null,
  next:(result:ReturnType<typeof chooseCorrection>)=>void,_error:(message:string)=>void){
  const id=correctionKey(context),cacheKey=personalKey(uid);
  const emit=()=>{
    const cache=readDevice<Cache>(cacheKey,{}),p=cache[id],a=readDevice<Cache>(PUBLIC_CACHE,{})[id];
    const legacy=!p?Object.values(cache).filter(entry=>!entry.removed).map(entry=>upgradeCachedCorrection(entry.value,context)).find(Boolean):null;
    next(chooseCorrection(p&&!p.removed?validCorrection(p.value,context):legacy||null,a?validCorrection(a.value,context):null));
  };
  emit();window.addEventListener(EVENT,emit);
  return()=>window.removeEventListener(EVENT,emit);
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
  const entries = Object.values(readDevice<Cache>(personalKey(null), {})).filter(entry => !entry.removed);
  if (!entries.length) return;
  const key = personalKey(uid), account = readDevice<Cache>(key, {});
  for (const entry of entries) {
    const value = validCorrection(entry.value, entry.value);
    if (value) account[correctionKey(value)] = { value, dirty: true, imported: true };
  }
  writeDevice(key, account);
  window.dispatchEvent(new Event(EVENT));
  void retryAccountCorrections(uid).catch(() => {});
}
export async function retryAccountCorrections(uid:string,importsOnly=false){
  await Promise.all(Object.values(readDevice<Cache>(personalKey(uid),{})).filter(entry=>entry.dirty&&(!importsOnly||entry.imported)).map(entry=>flushPersonalCorrection(uid,entry.value)));
}

/** A newly chosen source replaces the prior selection and its version-specific timing fixes. */
export function discardSongCorrections(uid:string|null,identity:RecordingIdentity,kinds:readonly CorrectionKind[],keepId=''){
  const track={...identity,provider:undefined,source:'manual' as const,confidence:1};
  const current=localSongData(track,uid).session;
  const cache=readDevice<Cache>(personalKey(uid),{});
  temporarySongs.edit(track,uid,entry=>{
    for(const [id,value] of Object.entries({...Object.fromEntries(Object.entries(cache).map(([id,e])=>[id,e.value])),...current?.corrections})){
      if(id!==keepId&&value&&kinds.includes(value.kind)&&(['title','artist','duration'] as const).every(field=>value.identity[field]===identity[field]))entry.corrections[id]=null;
    }
  });
}
