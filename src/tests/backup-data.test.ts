// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createBackup,parseBackup,restoreBackup,type Backup} from '../data/backupData';
import {DEFAULT_USER_PREFERENCES,loadLocalPreferences,saveLocalPreferences} from '../firebase/firebaseClient';
import {scopedKey,setDeviceScope,writeDevice} from '../firebase/deviceStore';
import {correctionContext,correctionKey,lyricFingerprint,makeCorrection} from '../firebase/correctionModel';
import {setEnabledRomanizationLanguages,setRomanizationMasterEnabled} from '../romanization/romanize';
import {TEMPLATES} from '../visualization/cinematic/catalog';

const track={title:'Original rain',artist:'Test artist',album:'Studio',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const ctx=correctionContext(track,'delay',lyricFingerprint('[00:01]Original test words'))!;
const mapping={identity:ctx.identity,lyrics:{sourceFile:ctx.lyricsSource!,selection:{engine:'lrclib',lrclibId:12,subtitleTrackId:null},delaySeconds:0},video:{youtubeVideoId:'abcdefghijk',delaySeconds:0}};
function seed(uid:string|null){
 writeDevice(scopedKey('songMappings',uid),{[ctx.recordingKey]:{...mapping,dirty:['lyrics','video']}});
 writeDevice(scopedKey('corrections',uid),{[correctionKey(ctx)]:{value:makeCorrection(ctx,{delaySeconds:0}),dirty:true},deleted:{value:makeCorrection(ctx,{delaySeconds:2}),removed:true}});
 writeDevice(scopedKey('customLyrics',uid),{[ctx.recordingKey]:{identity:ctx.identity,text:'[00:01]മഴ വരുന്നു',dirty:true}});
}
beforeEach(()=>{localStorage.clear();setDeviceScope();setRomanizationMasterEnabled(false);setEnabledRomanizationLanguages(['ml','ta']);});
afterEach(()=>vi.restoreAllMocks());

describe('separate data backups',()=>{
 it('round-trips preferences, multiple palettes, empty effect pools and Romanization without account credentials',()=>{
  const theme=TEMPLATES[0];
  saveLocalPreferences({...DEFAULT_USER_PREFERENCES,intensity:42,themePalettes:{[theme.id]:theme.palettes.slice(0,2).map(p=>p.id)}},'accountA');
  writeDevice('lyricflow.extendedSettings.v1',{themeMode:'light',motionCatalogVersion:2,enabledWordStyles:[],enabledWordAnimations:[],enabledKineticMotions:[],lyricLayout:{horizontalPadding:4,verticalPadding:12,maxWidth:70,maxHeight:40},themeDurationSeconds:8,unrelatedToken:'must-not-export'});
  localStorage.setItem('firebase:authUser:secret','private-session');
  seed('accountA');
  const backup=createBackup('settings','accountA'),json=JSON.stringify(backup);
  expect(json).not.toContain('private-session');expect(json).not.toContain('must-not-export');expect(json).not.toContain('accountA');
  expect(json).not.toContain(ctx.recordingKey);
  const imported=parseBackup(json,'settings');
  restoreBackup(imported,'accountB');
  expect(loadLocalPreferences('accountB').intensity).toBe(42);
  expect(loadLocalPreferences('accountB').themePalettes[theme.id]).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem('lyricflow.extendedSettings.v1')!)).toMatchObject({themeMode:'light',enabledWordStyles:[],enabledWordAnimations:[],enabledKineticMotions:[],themeDurationSeconds:8});
  expect(localStorage.getItem('lyricflow.romanizationEnabled')).toBe('false');
  expect(JSON.parse(localStorage.getItem('lyricflow.enabledRomanizationLanguages')!)).toEqual(['ml','ta']);
  expect(JSON.parse(localStorage.getItem(scopedKey('preferencesPending','accountB'))!).intensity).toBe(42);
  expect(localStorage.getItem(scopedKey('songMappings','accountA'))).toContain(ctx.recordingKey);
 });

 it('exports only the selected personal scope and restores mappings, exact zero delays and custom lyrics',()=>{
  seed('accountA');seed(null);
  writeDevice(scopedKey('songMappings','accountB'),{r4_0000000000000000:{identity:ctx.identity,video:{youtubeVideoId:'zzzzzzzzzzz',delaySeconds:7}}});
  writeDevice('lyricflow.v4.publishedSongMappings',{sharedOnly:'must-not-export'});
  const backup=createBackup('song-mappings','accountA');
  const json=JSON.stringify(backup);
  expect(json).not.toContain('dirty');expect(json).not.toContain('removed');expect(json).not.toContain('must-not-export');expect(json).not.toContain('zzzzzzzzzzz');
  const imported=parseBackup(json,'song-mappings');
  const notify=vi.fn();window.addEventListener('lyricflow:songMappings',notify);
  try{restoreBackup(imported,'accountB');}finally{window.removeEventListener('lyricflow:songMappings',notify);}
  const saved=JSON.parse(localStorage.getItem(scopedKey('songMappings','accountB'))!);
  expect(saved[ctx.recordingKey]).toMatchObject({lyrics:{delaySeconds:0},video:{delaySeconds:0},dirty:['lyrics','video']});
  expect(saved.r4_0000000000000000.video.youtubeVideoId).toBe('zzzzzzzzzzz');
  expect(JSON.parse(localStorage.getItem(scopedKey('corrections','accountB'))!)[correctionKey(ctx)]).toMatchObject({value:{delaySeconds:0},dirty:true});
  expect(JSON.parse(localStorage.getItem(scopedKey('customLyrics','accountB'))!)[ctx.recordingKey]).toMatchObject({text:'[00:01]മഴ വരുന്നു',dirty:true});
  expect(notify).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem(scopedKey('songMappings',null))!)[ctx.recordingKey].dirty).toEqual(['lyrics','video']);
 });

 it('merges partial song mappings without deleting existing lyrics or unrelated settings',()=>{
  seed(null);saveLocalPreferences({...DEFAULT_USER_PREFERENCES,speed:61});
  const backup=createBackup('song-mappings',null);
  if(backup.kind!=='song-mappings')throw Error('Wrong fixture');
  backup.data.mappings[ctx.recordingKey]={identity:ctx.identity,video:{youtubeVideoId:'zzzzzzzzzzz',delaySeconds:null}};
  restoreBackup(parseBackup(JSON.stringify(backup),'song-mappings'),null);
  const saved=JSON.parse(localStorage.getItem(scopedKey('songMappings',null))!)[ctx.recordingKey];
  expect(saved.lyrics).toEqual(mapping.lyrics);expect(saved.video).toEqual({youtubeVideoId:'zzzzzzzzzzz',delaySeconds:null});
  expect(saved.dirty).toEqual([]);expect(loadLocalPreferences().speed).toBe(61);
 });

 it('rejects wrong file types, versions and malformed mappings before changing storage',()=>{
  seed(null);
  const before=localStorage.getItem(scopedKey('songMappings',null));
  expect(()=>parseBackup('not json','settings')).toThrow('JSON');
  expect(()=>parseBackup(JSON.stringify(createBackup('settings',null)),'song-mappings')).toThrow('song mapping');
  const backup=createBackup('song-mappings',null);
  for(const change of [
   (b:any)=>{b.version=2;},
   (b:any)=>{b.data.mappings[ctx.recordingKey].video.youtubeVideoId='bad';},
   (b:any)=>{b.data.corrections[0].delaySeconds=31;},
   (b:any)=>{b.data.customLyrics[ctx.recordingKey].identity.duration=-1;},
   (b:any)=>{b.data.mappings[ctx.recordingKey].lyrics.sourceFile.url='javascript:alert(1)';},
   (b:any)=>{b.data.mappings.constructor=b.data.mappings[ctx.recordingKey];},
  ]){
   const bad=JSON.parse(JSON.stringify(backup));change(bad);
   expect(()=>parseBackup(JSON.stringify(bad),'song-mappings')).toThrow();
   expect(localStorage.getItem(scopedKey('songMappings',null))).toBe(before);
  }
 });

 it('rolls back the entire import if storage fills after the first write',()=>{
  seed(null);
  const backup=createBackup('song-mappings',null);
  if(backup.kind!=='song-mappings')throw Error('Wrong fixture');
  backup.data.mappings[ctx.recordingKey].video!.delaySeconds=15;
  const keys=['songMappings','corrections','customLyrics'].map(key=>scopedKey(key,null));
  const before=keys.map(key=>localStorage.getItem(key));
  const set=Storage.prototype.setItem;let writes=0;
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(++writes===2)throw new DOMException('Full','QuotaExceededError');set.call(this,key,value);});
  expect(()=>restoreBackup(backup as Backup,null)).toThrow('storage');
  expect(keys.map(key=>localStorage.getItem(key))).toEqual(before);
 });
});
