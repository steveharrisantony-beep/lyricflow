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

it('checks the full lyrics-cleaned song title in the VIDEO TITLE, not the YouTube ID',()=>{
 const songs=[
  video(1,{title:'Roadside Ocean Live Session',viewCount:1200,uploaderName:'Official label'}),
  video(2,{title:'OCEAN ROAD · Official Music Video',viewCount:900,uploaderName:'Official label'}),
 ];
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road (Official Video)','music');
 expect(result.selected).toBe(songs[1]);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
 expect(result.choices[1].reasons).toEqual([]);
});

it('uses the exact lyrics title cleaner with artist context and preserves matching versions',()=>{
 const wrong=video(1,{title:'Ocean Road Remix by Singer',viewCount:300});
 const correct=video(2,{title:'Singer - Ocean Road (Live) | Official Video',viewCount:200});
 const result=selectAutomaticBackgroundVideo(
  [wrong,correct],'Singer - Ocean Road (Live) | Official Music Video','music',{},'Singer'
 );
 expect(result.selected).toBe(correct);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
});

it('chooses the next passing video from the original five, without refilling from a sixth',()=>{
 const songs=[
  video(1,{videoTitle:'Ocean Boulevard Official',viewCount:500}),
  video(2,{uploaderName:'7clouds',viewCount:400}),
  video(3,{videoTitle:'Ocean Road - Official Video',viewCount:300}),
  video(4,{title:'Road Only',viewCount:200}),
  video(5,{title:'Ocean Road',viewCount:100}),
  video(6,{title:'Ocean Road',viewCount:10000}),
 ];
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road','music');
 expect(result.selected).toBe(songs[2]);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
 expect(result.choices[1].reasons).toContain('Blocked channel: 7clouds');
 expect(result.choices[5].reasons).toEqual([]);
 const blockedFirstFive=songs.slice(0,5).map(song=>({...song,uploaderName:'7clouds'}));
 const none=selectAutomaticBackgroundVideo([...blockedFirstFive,songs[5]],'Ocean Road','music');
 expect(none.selected).toBeUndefined();
});

it('supports Hindi and Malayalam title words without substring false positives',()=>{
 const hindi=video(1,{videoTitle:'मेरी दुनिया · Official Music Video'});
 expect(selectAutomaticBackgroundVideo([hindi],'मेरी दुनिया [Official Video]','music').selected).toBe(hindi);
 const malayalam=video(2,{videoTitle:'മഴേ | Official Video'});
 const wrong=video(3,{videoTitle:'മഴ | Official Video'});
 const chosen=selectAutomaticBackgroundVideo([wrong,malayalam],'മഴേ (Official Music Video)','music');
 expect(chosen.selected).toBe(malayalam);
 expect(chosen.choices[0].reasons).toContain('Filtered song title missing from video title');
});
