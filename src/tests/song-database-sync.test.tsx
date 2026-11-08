// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it} from 'vitest';
import {correctionContext,lyricFingerprint} from '../firebase/correctionModel';
import {readDevice,scopedKey,writeDevice} from '../firebase/deviceStore';
import {temporarySongs} from '../data/temporarySongs';
import {useSongMapping} from '../firebase/songMappings';
import {createBackup,restoreBackup,resetSongMappingData} from '../data/backupData';
import {notifySongMappingData} from '../firebase/songMappingReset';

const track={title:'Song',artist:'Artist',album:'',duration:200,provider:'local' as const,source:'manual' as const,confidence:1};
const context=correctionContext(track,'lyrics')!,id=context.recordingKey;
const mapped=(video:string)=>({identity:context.identity,video:{youtubeVideoId:video,delaySeconds:null}});

beforeEach(()=>{
 localStorage.clear();temporarySongs.clear();
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
});

it('reads local song mappings and resets cleanly without network dependencies',async()=>{
 writeDevice(scopedKey('songMappings','A'),{[id]:mapped('bbbbbbbbbbb')});
 const root=createRoot(document.createElement('div'));
 let result:ReturnType<typeof useSongMapping>;
 function Fixture({other=false}:{other?:boolean}){result=useSongMapping(other?{...track,title:'Other'}:track,'A');return null;}
 try{
  await act(async()=>root.render(<Fixture/>));expect(result!.video?.youtubeVideoId).toBe('bbbbbbbbbbb');
  await act(async()=>root.render(<Fixture other/>));expect(result!.video).toBeNull();
 }finally{await act(async()=>root.unmount());}
 resetSongMappingData('A');
 expect(readDevice(scopedKey('songMappings','A'),{})).toEqual({});
 expect(temporarySongs.size).toBe(0);
});

it('restores imported backups into the target scope',()=>{
 writeDevice(scopedKey('songMappings',null),{[id]:mapped('bbbbbbbbbbb')});
 const backup=createBackup('song-mappings',null);
 restoreBackup(backup,'A');
 expect(readDevice<any>(scopedKey('songMappings','A'),{})[id].video.youtubeVideoId).toBe('bbbbbbbbbbb');
});

it('preserves prepared data across music providers but invalidates it for a new saved mapping',async()=>{
 const {localSongData}=await import('../data/localSongData');
 const text='[00:01]Original words',source={name:'LRCLIB',url:'https://lrclib.net/api/get/12',revision:lyricFingerprint(text,'https://lrclib.net/api/get/12')};
 writeDevice(scopedKey('songMappings','A'),{[id]:{...mapped('aaaaaaaaaaa'),lyrics:{sourceFile:source,selection:null,delaySeconds:0}}});
 const first=localSongData(track,'A').session!;
 first.lyrics={key:'test',value:{original:text,romanized:'',source:'LRCLIB',hasWordSync:false,candidates:[]}};
 expect(localSongData({...track,provider:'jiosaavn',sourceTrackId:'different'},'A').session?.lyrics).toBeDefined();
 writeDevice(scopedKey('songMappings','A'),{[id]:mapped('bbbbbbbbbbb')});
 notifySongMappingData();
 expect(localSongData(track,'A').session?.lyrics).toBeUndefined();
});

