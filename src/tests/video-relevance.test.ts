import {expect,it} from 'vitest';
import type {SongResult} from '../music/providers';
import {evaluateBackgroundVideos} from '../music/videoMatching';

const video=(title:string,extra:Partial<SongResult>={}):SongResult=>({
 id:'yt_abcdefghijk',youtubeVideoId:'abcdefghijk',title,artist:'Uploader',album:'',
 duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',...extra,
});
const check=(song:SongResult,title='Ocean Road',preference:'music'|'lyrics'='music')=>
 evaluateBackgroundVideos([song],title,preference)[0].reasons;

it('matches any complete song-title word, ignoring punctuation and case',()=>{
 expect(check(video('ROAD / Unrelated Artist Visualizer'))).toEqual([]);
 expect(check(video('Oceanographer / Roadside'))).toEqual(['No song-title word in the video title']);
 expect(check(video('Siri മഴ | Visualizer'),'മഴ')).toEqual([]);
 expect(check(video('Siri മഴേ | Visualizer'),'മഴ')).toEqual(['No song-title word in the video title']);
});
it('uses only the five requested keywords and allows a keyword in the original title',()=>{
 for(const word of ['jukebox','cover','reaction','karoke','reply']){
  expect(check(video(`Road [${word.toUpperCase()}]`))).toEqual([`Rejected keyword: ${word}`]);
  expect(check(video(`Road [${word}]`),`Road ${word}`)).toEqual([]);
 }
 expect(check(video('Ocean Coverland Replies Remix Live Full Audio Visualizer Shorts'))).toEqual([]);
});
it('reports each structural rejection independently',()=>{
 const cases:[Partial<SongResult>,string][]=[
  [{id:'candidate:0',youtubeVideoId:undefined,sourceUrl:''},'Invalid YouTube ID'],
  [{embeddable:false},'Embedding blocked'],
  [{visualContent:'static'},'Static content'],
  [{videoType:'ATV'},'YouTube Music audio track (ATV)'],
  [{uploaderName:'Example Artist - Topic'},'Topic channel'],
  [{album:'Audio Track'},'Audio Track album'],
 ];
 for(const [fields,reason] of cases)expect(check(video('Ocean Road',fields))).toEqual([reason]);
 expect(check(video('Ocean Road',{album:'Audio Track 2',artist:'Topic Records',duration:10}))).toEqual([]);
});
it('checks lyric words in the actual video title after the other filters',()=>{
 for(const word of ['lyric','lyrics','lyrical'])expect(check(video(`Road (${word})`),'Ocean Road','lyrics')).toEqual([]);
 expect(check(video('Ocean Road Lyrics',{videoTitle:'Road Official Visualizer'}),'Ocean Road','lyrics'))
  .toEqual(['Video title needs lyric, lyrics, or lyrical']);
 expect(check(video('Ocean Lyricist'),'Ocean Road','lyrics')).toEqual(['Video title needs lyric, lyrics, or lyrical']);
});
