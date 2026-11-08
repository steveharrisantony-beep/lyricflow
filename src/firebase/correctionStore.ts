import {temporarySongs} from '../data/temporarySongs';
import {localSongData} from '../data/localSongData';
import type { User } from './firebaseClient';
import { readDevice, writeDevice, scopedKey } from './deviceStore';
import { correctionKey, upgradeCachedCorrection, validCorrection, chooseCorrection, type Correction, type CorrectionContext, type CorrectionKind, type RecordingIdentity } from './correctionModel';

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
export function flushPersonalCorrection(_uid:string,_context:CorrectionContext):Promise<void>{
  return Promise.resolve();
}
export function savePersonalCorrection(uid: string | null, correction: Correction) {
  const value = validCorrection(correction, correction);
  if (!value) throw new Error('Invalid correction.');
  updateCache(personalKey(uid), correctionKey(value), { value, dirty: Boolean(uid) });
  return Promise.resolve();
}
export function removePersonalCorrection(uid: string | null, context: CorrectionContext) {
  const value = readDevice<Cache>(personalKey(uid), {})[correctionKey(context)]?.value;
  if (!uid || !value) { updateCache(personalKey(uid), correctionKey(context), null); return Promise.resolve(); }
  updateCache(personalKey(uid), correctionKey(context), { value, dirty: true, removed: true });
  return Promise.resolve();
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

export async function submitCorrection(_user: User | null, _correction: Correction) {
  throw new Error('Community submissions are not configured. Your personal fix is already saved on this device.');
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
}
export async function retryAccountCorrections(_uid:string,_importsOnly=false){
  return;
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
