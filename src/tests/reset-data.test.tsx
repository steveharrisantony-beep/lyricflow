// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DataTransferSettings from '../data/DataTransferSettings';
import {resetSettings,resetSongMappingData} from '../data/backupData';
import {DEFAULT_USER_PREFERENCES,LEGACY_DELAYS_KEY,loadLocalPreferences,saveLocalPreferences} from '../firebase/firebaseClient';
import {readDevice,scopedKey,writeDevice} from '../firebase/deviceStore';
import {songMappingResetPending} from '../firebase/songMappingReset';
import {DEFAULT_ROMANIZATION_LANGUAGE_CODES} from '../romanization/romanize';

let root:Root,host:HTMLDivElement;
const applied=vi.fn();
beforeEach(()=>{
 localStorage.clear();applied.mockReset();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
const click=async(text:string)=>{
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);
 expect(button).toBeDefined();await act(async()=>button!.click());
};
it('offers two independent resets and requires confirmation; cancel changes nothing',async()=>{
 saveLocalPreferences({...DEFAULT_USER_PREFERENCES,intensity:25},null);
 writeDevice(scopedKey('songMappings',null),{saved:'mapping'});
 await act(async()=>root.render(<DataTransferSettings uid={null} onSettingsImported={applied}/>));
 await click('Reset settings');
 expect(host.textContent).toContain('Reset settings to defaults?');
 expect(loadLocalPreferences(null).intensity).toBe(25);
 await click('Cancel');
 expect(loadLocalPreferences(null).intensity).toBe(25);expect(applied).not.toHaveBeenCalled();
 await click('Reset settings');await click('Confirm reset settings');
 expect(loadLocalPreferences(null).intensity).toBe(100);expect(applied).toHaveBeenCalledOnce();
 expect(readDevice(scopedKey('songMappings',null),{})).toEqual({saved:'mapping'});
 await click('Reset song mapping');await click('Cancel');
 expect(readDevice(scopedKey('songMappings',null),{})).toEqual({saved:'mapping'});
 await click('Reset song mapping');await click('Confirm reset song mapping');
 expect(readDevice(scopedKey('songMappings',null),null)).toEqual({});
 expect(host.querySelector('[role="status"]')?.textContent).toBe('Song mapping data reset.');
 expect(applied).toHaveBeenCalledOnce();
});
it('restores the latest defaults and queues account preferences without touching mappings or credentials',()=>{
 saveLocalPreferences({...DEFAULT_USER_PREFERENCES,speed:80,display:{...DEFAULT_USER_PREFERENCES.display,playerVolume:20}},'A');
 writeDevice('lyricflow.extendedSettings.v1',{themeMode:'light',lyricLayout:{maxWidth:99}});
 writeDevice(scopedKey('songMappings','A'),{saved:true});
 localStorage.setItem('session-fixture','keep');
 const defaults=resetSettings('A');
 expect(defaults.preferences).toEqual(DEFAULT_USER_PREFERENCES);
 expect(defaults.extended).toMatchObject({showFps:true,videoFitMode:'stretch',lyricFontScale:1,themeDurationSeconds:6,enabledThemePlacements:['center'],enabledVideoPlacements:['bottom-left','bottom-right','right','left'],lyricLayout:{horizontalPadding:0,verticalPadding:10,maxWidth:60,maxHeight:50}});
 expect(defaults.romanization).toEqual({enabled:true,languages:DEFAULT_ROMANIZATION_LANGUAGE_CODES});
 expect(readDevice(scopedKey('preferencesPending','A'),null)).toEqual(DEFAULT_USER_PREFERENCES);
 expect(readDevice(scopedKey('songMappings','A'),{})).toEqual({saved:true});
 expect(localStorage.getItem('session-fixture')).toBe('keep');
});
it('clears only the selected mapping scope and notifies active readers; removes guest legacy data',()=>{
 for(const uid of [null,'A','B'])for(const name of ['songMappings','corrections','customLyrics'])writeDevice(scopedKey(name,uid),{saved:true});
 saveLocalPreferences({...DEFAULT_USER_PREFERENCES,intensity:25},'A');
 writeDevice('lyricflow.v4.publishedSongMappings',{community:true});writeDevice(LEGACY_DELAYS_KEY,{legacy:true});
 const notify=vi.fn();window.addEventListener('lyricflow:songMappings',notify);
 try{resetSongMappingData('A');expect(notify).toHaveBeenCalledOnce();}finally{window.removeEventListener('lyricflow:songMappings',notify);}
 for(const name of ['songMappings','corrections','customLyrics']){
  expect(readDevice(scopedKey(name,'A'),null)).toEqual({});
  expect(readDevice(scopedKey(name,'B'),null)).toEqual({saved:true});
  expect(readDevice(scopedKey(name,null),null)).toEqual({saved:true});
 }
 expect(songMappingResetPending('A')).toBe(true);expect(songMappingResetPending('B')).toBe(false);
 expect(loadLocalPreferences('A').intensity).toBe(25);
 expect(readDevice('lyricflow.v4.publishedSongMappings',null)).toEqual({community:true});
 expect(readDevice(LEGACY_DELAYS_KEY,null)).toEqual({legacy:true});
 resetSongMappingData(null);expect(readDevice(LEGACY_DELAYS_KEY,null)).toEqual({});
});
it('rolls back a reset completely when device storage fails',()=>{
 const keys=['songMappings','corrections','customLyrics'].map(name=>scopedKey(name,'A'));
 for(const key of keys)writeDevice(key,{keep:true});
 const before=keys.map(key=>localStorage.getItem(key)),set=Storage.prototype.setItem;let writes=0;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(++writes===2)throw Error('full');set.call(this,key,value);});
 expect(()=>resetSongMappingData('A')).toThrow('storage');
 expect(keys.map(key=>localStorage.getItem(key))).toEqual(before);
 expect(songMappingResetPending('A')).toBe(false);
});
