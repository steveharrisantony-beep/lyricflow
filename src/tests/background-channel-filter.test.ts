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

it.each(['music','lyrics'] as const)('filters blocked channels before taking first three eligible videos in %s mode',preference=>{
 const songs=[
  video(1,{viewCount:900,uploaderName:'7clouds rocks'}),
  video(2,{viewCount:1000,uploaderName:'Cakes & Eclairs Video'}),
  video(3,{viewCount:600,uploaderName:'Official label'}),
  video(4,{viewCount:300,uploaderName:'New Dan Music'}),
  video(5,{viewCount:100}),
  video(6,{viewCount:1e9,uploaderName:'Another label'}),
 ];
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road',preference);
 expect(result.selected).toBe(songs[5]);
 expect(result.choices.map(choice=>choice.song)).toEqual(songs);
 expect(result.choices.map(choice=>choice.reasons)).toEqual([
  ['Blocked channel: 7clouds'],['Blocked channel: Cakes & Eclairs'],[],[],[],[],
 ]);
 expect(songs.map(song=>song.viewCount)).toEqual([900,1000,600,300,100,1e9]);
});

it('never checks the eleventh result even when all first ten are blocked',()=>{
 const names=['7clouds','DopeLyrics','LatinHype','Taj Tracks','Royal Music'];
 const songs=Array.from({length:10},(_,index)=>video(index,{
  uploaderName:names[index%names.length],viewCount:index*100,
 }));
 songs.push(video(10,{viewCount:1e9}));
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road','music');
 expect(result.selected).toBeUndefined();
 expect(result.choices.slice(0,10).every(choice=>choice.reasons.length===1&&choice.canUse)).toBe(true);
 expect(result.choices[10]).toMatchObject({withinLimit:false,reasons:[]});
});

it('forms the shortlist after initial filters and ignores results beyond the tenth row',()=>{
 const songs=[video(0,{title:'Ocean Cover',viewCount:1e9}),
  ...Array.from({length:5},(_,index)=>video(index+1,{viewCount:index})),
  video(6,{viewCount:1e9})];
 expect(selectAutomaticBackgroundVideo(songs,'Ocean Road','music').selected).toBe(songs[3]);
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

it('matches the core title after discarding bracketed version labels',()=>{
 const wrong=video(1,{title:'Ocean Boulevard Remix by Singer',viewCount:300});
 const correct=video(2,{title:'Singer - Ocean Road (Live) | Official Video',viewCount:200});
 const result=selectAutomaticBackgroundVideo(
  [wrong,correct],'Singer - Ocean Road (Live) | Official Music Video','music',{},'Singer'
 );
 expect(result.selected).toBe(correct);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
});

it('chooses from the first three passing videos and never refills after title rejection',()=>{
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
 const blockedFirstTen=Array.from({length:10},(_,index)=>video(index,{uploaderName:'7clouds'}));
 const none=selectAutomaticBackgroundVideo([...blockedFirstTen,video(11,{viewCount:1e9})],'Ocean Road','music');
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


it('rejects a misleading soundtrack candidate after cleaning Popular',()=>{
 const songs=[
  video(1,{title:'From The Idol Vol. 1 - Madonna Official Video',viewCount:5000}),
  video(2,{title:'The Weeknd - Popular (Official Music Video)',viewCount:4000}),
 ];
 const raw='Popular (with Playboi Carti & Madonna) - From The Idol Vol. 1 (Music from the HBO Original Series)';
 const result=selectAutomaticBackgroundVideo(songs,raw,'music',{},'The Weeknd, Playboi Carti, Madonna');
 expect(result.selected).toBe(songs[1]);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
});

it('matches stripped title without version or credited artists',()=>{
 const track='Vizhi Veekura Abhyankar (Music Video)| Saanve Megghana| Sai Smrit';
 const videos=[video(1,{title:'Saanve Megghana Song Lyrics',viewCount:400}),
  video(2,{title:'Vizhi Veekura Official Music Video',viewCount:100})];
 const result=selectAutomaticBackgroundVideo(videos,track,'music',{},'Abhyankar');
 expect(result.selected).toBe(videos[1]);
 expect(result.choices[0].reasons).toContain('Filtered song title missing from video title');
 expect(selectAutomaticBackgroundVideo([video(3,{title:'Rathinamo Music Video'})],'Rathinamo - Female Version','lyrics').selected).toBeDefined();
});

it('picks the first three initially eligible in relevance order, then ranks only those by views',()=>{
 const songs=[
  video(0,{title:'Ocean Cover',viewCount:1e9}),
  video(1,{uploaderName:'7clouds',viewCount:1e9}),
  video(2,{embeddable:false,viewCount:1e9}),
  video(3,{viewCount:10}),
  video(4,{viewCount:100}),
  video(5,{viewCount:50}),
  video(6,{viewCount:1e9}),
 ];
 const selected=selectAutomaticBackgroundVideo(songs,'Ocean Road','music');
 expect(selected.selected).toBe(songs[4]);
 expect(selected.choices[1].reasons).toEqual(['Blocked channel: 7clouds']);
 const rejected=selectAutomaticBackgroundVideo(songs,'Ocean Road','music',{
  [songs[4].youtubeVideoId!]:'Playback error',
 });
 expect(rejected.selected).toBe(songs[5]);
 expect(rejected.choices[4].reasons).toContain('Playback error');
 const allRejected=selectAutomaticBackgroundVideo(songs,'Ocean Road','music',{
  [songs[3].youtubeVideoId!]:'Playback error',
  [songs[4].youtubeVideoId!]:'Playback error',
  [songs[5].youtubeVideoId!]:'Playback error',
 });
 expect(allRejected.selected).toBeUndefined();
 expect(allRejected.choices[6].reasons).toEqual([]);
});

it('does not backfill the initial three when all fail final full-title validation',()=>{
 const songs=[
  video(1,{title:'Ocean Side Path',viewCount:100}),
  video(2,{title:'Road Alone',viewCount:80}),
  video(3,{title:'Ocean Mist',viewCount:60}),
  video(4,{title:'Ocean Road Music Video',viewCount:1e9}),
 ];
 const result=selectAutomaticBackgroundVideo(songs,'Ocean Road','music');
 expect(result.selected).toBeUndefined();
 expect(result.choices.slice(0,3).every(choice=>choice.reasons.includes('Filtered song title missing from video title'))).toBe(true);
 expect(result.choices[3].reasons).toEqual([]);
});
