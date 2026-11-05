import {expect,it} from 'vitest';
import type {SongResult} from '../music/providers';
import {selectAutomaticBackgroundVideo} from '../music/videoMatching';

const video=(n:number,extra:Partial<SongResult>={}):SongResult=>{
 const id=String(n).padStart(11,'0');
 return {id:'yt_'+id,youtubeVideoId:id,title:'Ocean Road Official Video',artist:'Music label',
  album:'',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+id,...extra};
};

it.each([
 '7clouds','DopeLyrics','LatinHype','The Vibe Guide','SyrebralVibes','Vibe Music',
 'Shadow Music','Cakes & Eclairs','Unique Vibes','Taj Tracks','Dan Music','WaveMusic',
 'BangersOnly','Royal Music',
])('rejects the entire channel phrase %s inside a longer channel name, ignoring case',name=>{
 const song=video(1,{uploaderName:`New ${name.toUpperCase()} Video`});
 const result=selectAutomaticBackgroundVideo([song],'Ocean Road','music');
 expect(result.selected).toBeUndefined();
 expect(result.choices[0].reasons).toEqual([`Blocked channel: ${name}`]);
});

it.each(['Royal video','Music Vibe','Royal & Music','Cakes and Eclairs','The Guide Vibe',''])
 ('allows channel names without an entire blocked phrase: %s',uploaderName=>{
  const song=video(1,{uploaderName});
  expect(selectAutomaticBackgroundVideo([song],'Ocean Road','music').selected).toBe(song);
 });

it('uses the uploader name before artist metadata and never checks the song title for channel phrases',()=>{
 const song=video(1,{title:'Ocean Road by 7clouds',artist:'Royal Music',uploaderName:'Official label'});
 expect(selectAutomaticBackgroundVideo([song],'Ocean Road','music').selected).toBe(song);
 const fallback=video(2,{artist:'New Dan Music'});
 expect(selectAutomaticBackgroundVideo([fallback],'Ocean Road','music').choices[0].reasons)
  .toEqual(['Blocked channel: Dan Music']);
});

it.each(['music','lyrics'] as const)('checks channels by views within the original shortlist in %s mode',preference=>{
 const songs=[
  video(1,{viewCount:900,uploaderName:'7clouds rocks'}),
  video(2,{viewCount:1000,uploaderName:'Cakes & Eclairs Video'}),
  video(3,{viewCount:600,uploaderName:'Official label'}),
  video(4,{viewCount:300,uploaderName:'New Dan Music'}),
  video(5,{viewCount:100}),
  video(6,{viewCount:1e9,uploaderName:'Another label'}),
 ];
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road',preference);
 expect(result.selected).toBe(songs[2]);
 expect(result.choices.map(choice=>choice.song)).toEqual(songs);
 expect(result.choices.map(choice=>choice.reasons)).toEqual([
  ['Blocked channel: 7clouds'],['Blocked channel: Cakes & Eclairs'],[],[],[],[],
 ]);
 expect(songs.map(song=>song.viewCount)).toEqual([900,1000,600,300,100,1e9]);
});

it('does not refill the shortlist when all five channels fail, leaving later videos available manually',()=>{
 const songs=['7clouds','DopeLyrics','LatinHype','Taj Tracks','Royal Music']
  .map((uploaderName,index)=>video(index,{uploaderName,viewCount:index*100}));
 songs.push(video(6,{viewCount:1e9}));
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road','music');
 expect(result.selected).toBeUndefined();
 expect(result.choices.slice(0,5).every(choice=>choice.reasons.length===1&&choice.canUse)).toBe(true);
 expect(result.choices[5].reasons).toEqual([]);
});

it('forms the shortlist after existing filters and includes no result beyond the twentieth row',()=>{
 const songs=[video(0,{title:'Ocean Cover',viewCount:1e9}),
  ...Array.from({length:5},(_,index)=>video(index+1,{viewCount:index})),
  video(6,{viewCount:1e9})];
 expect(selectAutomaticBackgroundVideo(songs,'Ocean Road','music').selected).toBe(songs[5]);
 const outside=[...Array.from({length:20},(_,index)=>video(index,{title:'Other song'})),video(21)];
 expect(selectAutomaticBackgroundVideo(outside,'Ocean Road','music').selected).toBeUndefined();
});

it('keeps relevance as the views tie-breaker and ranks missing views below zero',()=>{
 const songs=[video(1,{uploaderName:'7clouds'}),video(2),video(3,{viewCount:0}),video(4,{viewCount:0})];
 expect(selectAutomaticBackgroundVideo(songs,'Ocean Road','music').selected).toBe(songs[2]);
 const result=selectAutomaticBackgroundVideo(songs.slice(0,2),'Ocean Road','music');
 expect(result.selected).toBe(songs[1]);
 expect(result.choices[0].reasons).toEqual(['Blocked channel: 7clouds']);
});
