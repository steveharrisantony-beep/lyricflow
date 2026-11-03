import {loadLocalPreferences,sanitizePreferences,type UserPreferencesData} from '../firebase/firebaseClient';
import {readDevice,scopedKey} from '../firebase/deviceStore';
import {correctionKey,validCorrection,type Correction,type CorrectionContext,type RecordingIdentity} from '../firebase/correctionModel';
import {SONG_MAPPING_FIELDS,validSongMapping,type SongMapping} from '../firebase/songMappings';
import {ALL_FONT_PACKS} from '../firebase/firebaseClient';
import {normalizeLyricLayout,type LyricLayoutSettings} from '../lyrics/lyricLayout';
import {ALL_ROMANIZATION_LANGUAGE_CODES,getEnabledRomanizationLanguages,getRomanizationMasterEnabled,type RomanizationLanguageCode} from '../romanization/romanize';
import {ALL_CURRENT_WORD_STYLE_IDS,normalizeWordStyle,normalizeWordStylePool} from '../visualization/cinematic/currentWordStyles';
import {ALL_CURRENT_WORD_ANIMATION_IDS,normalizeWordAnimationPool} from '../visualization/cinematic/currentWordAnimations';
import {ALL_PLACEMENT_MODES,DEFAULT_VIDEO_PLACEMENTS,DEFAULT_THEME_PLACEMENTS,LYRIC_PLACEMENT_MODES,normalizeMotionPool} from '../visualization/cinematic/kineticTypography';
import {ALL_THEME_TRANSITIONS} from '../visualization/cinematic/themeTransitions';

export type BackupKind='settings'|'song-mappings';
export const MAX_BACKUP_BYTES=10*1024*1024;
const EXTENDED_KEY='lyricflow.extendedSettings.v1';
const invalid=()=>new Error('This backup contains invalid data. Nothing was imported.');
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
 return value as Record<string,unknown>;
}
function text(value:unknown,max=500):string{
 if(typeof value!=='string'||value.length>max)throw invalid();
 return value;
}
function number(value:unknown,min:number,max:number,fallback:number){
 return typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
}
function choice<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{
 return allowed.includes(value as T)?value as T:fallback;
}
function pool<T extends string>(value:unknown,allowed:readonly T[],fallback:readonly T[]):T[]{
 return Array.isArray(value)?[...new Set(value.filter((v):v is T=>allowed.includes(v)))]:[...fallback];
}
function extendedSettings(value:unknown,prefs:UserPreferencesData){
 const r=record(value);
 return {
  themeMode:choice(r.themeMode,['system','dark','light'] as const,'system'),
  wordStylesEnabled:r.wordStylesEnabled!==false,
  currentWordStyle:normalizeWordStyle(r.currentWordStyle)||'classic-capsule' as const,
  enabledWordStyles:normalizeWordStylePool(r.enabledWordStyles)??[...ALL_CURRENT_WORD_STYLE_IDS],
  enabledThemeTransitions:pool(r.enabledThemeTransitions,ALL_THEME_TRANSITIONS,ALL_THEME_TRANSITIONS),
  wordAnimationsEnabled:r.wordAnimationsEnabled===undefined?r.wordStylesEnabled!==false:r.wordAnimationsEnabled!==false,
  enabledWordAnimations:normalizeWordAnimationPool(r.enabledWordAnimations)??[...ALL_CURRENT_WORD_ANIMATION_IDS],
  enabledKineticMotions:normalizeMotionPool(r.enabledKineticMotions,r.motionCatalogVersion!==2)??prefs.enabledKineticMotions,
  motionCatalogVersion:2,
  enabledFonts:pool(r.enabledFonts,ALL_FONT_PACKS,prefs.enabledFonts||ALL_FONT_PACKS),
  showFps:r.showFps!==false,
  videoFitMode:r.videoFitMode==='default'?'default' as const:'stretch' as const,
  lyricFontScale:number(r.lyricFontScale,.5,1.8,1),
  lyricLayout:normalizeLyricLayout(r.lyricLayout&&typeof r.lyricLayout==='object'?r.lyricLayout as Partial<LyricLayoutSettings>:undefined),
  videoPlacementMode:choice(r.videoPlacementMode,LYRIC_PLACEMENT_MODES.map(p=>p.id),'bottom-right'),
  enabledVideoPlacements:pool(r.enabledVideoPlacements,ALL_PLACEMENT_MODES,DEFAULT_VIDEO_PLACEMENTS),
  themePlacementMode:choice(r.themePlacementMode,LYRIC_PLACEMENT_MODES.map(p=>p.id),'center'),
  enabledThemePlacements:pool(r.enabledThemePlacements,ALL_PLACEMENT_MODES,DEFAULT_THEME_PLACEMENTS),
  themeDurationLines:Math.round(number(r.themeDurationLines,1,16,2)),
  themeDurationSeconds:Math.round(number(r.themeDurationSeconds,4,60,6)),
 };
}
export interface SettingsBackupData {
 preferences:UserPreferencesData;
 extended:ReturnType<typeof extendedSettings>;
 romanization:{enabled:boolean;languages:RomanizationLanguageCode[]};
}
interface CustomLyrics {identity:RecordingIdentity;text:string}
export interface SongMappingsBackupData {
 mappings:Record<string,SongMapping>;
 corrections:Correction[];
 customLyrics:Record<string,CustomLyrics>;
}
type Envelope={format:'lyricflow-backup';version:1;exportedAt:string};
export type Backup=Envelope&({kind:'settings';data:SettingsBackupData}|{kind:'song-mappings';data:SongMappingsBackupData});

function identity(value:unknown):RecordingIdentity{
 const r=record(value);
 if(typeof r.duration!=='number'||!Number.isFinite(r.duration)||r.duration<0||r.duration>86400)throw invalid();
 const result={provider:text(r.provider),providerId:text(r.providerId),title:text(r.title),artist:text(r.artist),album:text(r.album),duration:r.duration};
 if(!result.title.trim())throw invalid();
 return result;
}
function sourceReference(value:unknown){
 const r=record(value),url=text(r.url,2048),revision=text(r.revision,19);
 if((url&&!/^https?:\/\//i.test(url))||!/^l3_[a-f0-9]{16}$/.test(revision))throw invalid();
 return {name:text(r.name,256),url,revision};
}
function selection(value:unknown){
 if(value===null)return null;
 const r=record(value);
 if(!['lyricflow','apple','lrclib','youtube'].includes(r.engine as string)||
  (r.lrclibId!==null&&(!Number.isSafeInteger(r.lrclibId)||(r.lrclibId as number)<=0||r.engine!=='lrclib'))||
  (r.subtitleTrackId!==null&&(typeof r.subtitleTrackId!=='string'||r.subtitleTrackId.length>256)))throw invalid();
 return {engine:r.engine as 'lyricflow'|'apple'|'lrclib'|'youtube',lrclibId:r.lrclibId as number|null,subtitleTrackId:r.subtitleTrackId as string|null};
}
function recordingId(value:string){if(!/^r[34]_[a-f0-9]{16}$/.test(value))throw invalid();return value;}
function parseMappings(value:unknown):SongMappingsBackupData{
 const r=record(value),mappings:Record<string,SongMapping>={},customLyrics:Record<string,CustomLyrics>={};
 const entries=Object.entries(record(r.mappings)),custom=Object.entries(record(r.customLyrics));
 if(!Array.isArray(r.corrections)||entries.length>10000||custom.length>10000||r.corrections.length>30000)throw invalid();
 for(const [id,value] of entries){
  recordingId(id);
  const v=record(value),i=identity(v.identity),candidate:Record<string,unknown>={identity:i};
  for(const field of ['hideLyrics','hideVideo'] as const)if(v[field]!==undefined)candidate[field]=v[field];
  if(v.lyrics!==undefined){const l=record(v.lyrics);candidate.lyrics={sourceFile:sourceReference(l.sourceFile),selection:selection(l.selection),delaySeconds:l.delaySeconds};}
  if(v.video!==undefined){const video=record(v.video);candidate.video={youtubeVideoId:video.youtubeVideoId,delaySeconds:video.delaySeconds};}
  const checked=validSongMapping(candidate,i);if(!checked)throw invalid();
  mappings[id]=checked;
 }
 const corrections=r.corrections.map(value=>{
  const v=record(value),i=identity(v.identity);
  if(!['delay','lyrics','video'].includes(v.kind as string))throw invalid();
  const kind=v.kind as CorrectionContext['kind'],lyricsKey=text(v.lyricsKey,19);
  if((kind==='delay'&&!/^l3_[a-f0-9]{16}$/.test(lyricsKey))||(kind!=='delay'&&lyricsKey!==''))throw invalid();
  const context:CorrectionContext={recordingKey:recordingId(text(v.recordingKey,19)),identity:i,kind,lyricsKey,lyricsSource:kind==='delay'?sourceReference(v.lyricsSource):null};
  const checked=validCorrection({...context,delaySeconds:v.delaySeconds,selection:kind==='lyrics'?selection(v.selection):null,youtubeVideoId:v.youtubeVideoId,videoDelaySeconds:v.videoDelaySeconds},context);
  if(!checked)throw invalid();return checked;
 });
 for(const [id,value] of custom){recordingId(id);const v=record(value);customLyrics[id]={identity:identity(v.identity),text:text(v.text,100000)};}
 return {mappings,corrections,customLyrics};
}
function parseSettings(value:unknown):SettingsBackupData{
 const r=record(value),rawPrefs=record(r.preferences),roman=record(r.romanization);
 record(rawPrefs.display);
 if(typeof roman.enabled!=='boolean'||!Array.isArray(roman.languages))throw invalid();
 const preferences=sanitizePreferences(rawPrefs);
 return {preferences,extended:extendedSettings(r.extended,preferences),romanization:{enabled:roman.enabled,languages:pool(roman.languages,ALL_ROMANIZATION_LANGUAGE_CODES,[])}};
}
export function parseBackup(json:string,expectedKind:BackupKind):Backup{
 let input:unknown;
 try{input=JSON.parse(json);}catch{throw new Error('Choose a valid LyricFlow JSON backup.');}
 const r=record(input);
 if(r.format!=='lyricflow-backup'||r.version!==1)throw new Error('This file is not a supported LyricFlow backup.');
 if(r.kind!==expectedKind)throw new Error(`Choose a ${expectedKind==='settings'?'settings':'song mapping'} backup for this option.`);
 const envelope={format:'lyricflow-backup' as const,version:1 as const,exportedAt:text(r.exportedAt,50)};
 return expectedKind==='settings'?{...envelope,kind:'settings',data:parseSettings(r.data)}:{...envelope,kind:'song-mappings',data:parseMappings(r.data)};
}
export function createBackup(kind:BackupKind,uid:string|null):Backup{
 const envelope={format:'lyricflow-backup' as const,version:1 as const,exportedAt:new Date().toISOString()};
 if(kind==='settings')return {...envelope,kind,data:parseSettings({preferences:loadLocalPreferences(uid),extended:readDevice(EXTENDED_KEY,{}),romanization:{enabled:getRomanizationMasterEnabled(),languages:getEnabledRomanizationLanguages()}})};
 const cache=readDevice<Record<string,{value:Correction;removed?:boolean}>>(scopedKey('corrections',uid),{});
 return {...envelope,kind,data:parseMappings({mappings:readDevice(scopedKey('songMappings',uid),{}),corrections:Object.values(cache).filter(entry=>!entry.removed).map(entry=>entry.value),customLyrics:readDevice(scopedKey('customLyrics',uid),{})})};
}
/** Validate before writing, and roll back every key if storage fills partway through. */
function writeBatch(values:Record<string,unknown>){
 const before=new Map(Object.keys(values).map(key=>[key,localStorage.getItem(key)]));
 try{for(const [key,value] of Object.entries(values))localStorage.setItem(key,JSON.stringify(value));}
 catch{
  for(const [key,value] of before)try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{/* Storage can remain blocked. */}
  throw new Error('Could not save imported data. Check available device storage.');
 }
}
export function restoreBackup(backup:Backup,uid:string|null){
 if(backup.kind==='settings'){
  const {preferences,extended,romanization}=backup.data;
  writeBatch({[scopedKey('preferences',uid)]:preferences,[EXTENDED_KEY]:extended,
   'lyricflow.romanizationEnabled':romanization.enabled,'lyricflow.enabledRomanizationLanguages':romanization.languages,
   ...(uid?{[scopedKey('preferencesPending',uid)]:preferences}:{})});
  return;
 }
 const mappingKey=scopedKey('songMappings',uid),correctionsKey=scopedKey('corrections',uid),customKey=scopedKey('customLyrics',uid);
 const mappings=readDevice<Record<string,SongMapping&{dirty?:string[]}>>(mappingKey,{});
 const corrections=readDevice<Record<string,{value:Correction;dirty:boolean;removed?:boolean}>>(correctionsKey,{});
 const custom=readDevice<Record<string,CustomLyrics&{dirty:boolean}>>(customKey,{});
 for(const [id,value] of Object.entries(backup.data.mappings)){
  const fields=SONG_MAPPING_FIELDS.filter(field=>value[field]!==undefined);
  mappings[id]={...mappings[id],...value,dirty:uid?[...new Set([...(mappings[id]?.dirty||[]),...fields])]:[]};
 }
 for(const value of backup.data.corrections)corrections[correctionKey(value)]={value,dirty:Boolean(uid)};
 for(const [id,value] of Object.entries(backup.data.customLyrics))custom[id]={...value,dirty:Boolean(uid)};
 writeBatch({[mappingKey]:mappings,[correctionsKey]:corrections,[customKey]:custom});
 for(const event of ['lyricflow:songMappings','lyricflow:corrections','lyricflow:customLyrics'])window.dispatchEvent(new Event(event));
}
