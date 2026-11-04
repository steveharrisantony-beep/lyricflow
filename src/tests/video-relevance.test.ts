import {expect,it} from 'vitest';
import type {SongResult} from '../music/providers';
import {relevantYouTubeVideoChoices,selectYouTubeBackgroundCandidate} from '../music/videoMatching';
const track={title:'Ocean Road',artist:'Example Artist',album:'Example Movie',duration:230};
const video=(id:number,extra:Partial<SongResult>={}):SongResult=>({id:'yt_'+String(id).padStart(11,'0'),title:'Example Artist - Ocean Road Official Music Video',artist:'Uploader',album:'',duration:230,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+String(id).padStart(11,'0'),...extra});
it('filters a pool of 150 other songs, same-title different artists, static uploads and variants before view sorting',()=>{
 const others=Array.from({length:150},(_,i)=>video(i,{title:'Other Song Official Video',viewCount:1e9}));
 const relevant=[video(200,{viewCount:1000}),video(201,{title:'OceanRoad Lyrics | Example Artist',viewCount:2000})];
 const wrong=[video(202,{title:'Ocean Road Official Video',artist:'Different Singer',viewCount:1e9}),video(203,{videoType:'ATV'}),video(204,{title:'Example Artist Ocean Road Remix Official Video'}),video(205,{title:'Example Artist Ocean Roadside Official Video'})];
 expect(relevantYouTubeVideoChoices([...others,...wrong,...relevant],track).map(v=>v.id)).toEqual([relevant[1].id,relevant[0].id]);
});
it('prefers a confirmed distributor release with a long intro to an exact-duration billion-view fan copy',()=>{
 const fan=video(1,{title:'Example Artist Ocean Road Lyrics',viewCount:1e9});
 const release=video(2,{title:'Ocean Road Lyrical | Example Movie',artist:'Sony Music South',channelId:'UCn4rEMqKtwBQ6-oEwbd4PcA',duration:380,viewCount:100});
 expect(selectYouTubeBackgroundCandidate([fan,release],track,'lyrics')).toBe('00000000002');
 // Copying a distributor's display name alone supplies no release evidence.
 expect(selectYouTubeBackgroundCandidate([fan,{...fan,id:'yt_00000000003',artist:'Sony Music South',viewCount:10}],track,'lyrics')).toBe('00000000001');
});
it('uses the highest-view relevant preloaded result automatically when credible releases are absent',()=>{
 const wrong=video(1,{title:'Different Song Official Music Video',viewCount:1e12});
 const first=video(2,{viewCount:1000}),top=video(3,{title:'Ocean Road Lyrics | Example Artist',viewCount:2e6,duration:0});
 expect(selectYouTubeBackgroundCandidate([wrong,first,top],track,'music')).toBe('00000000003');
 expect(selectYouTubeBackgroundCandidate([wrong],track,'music')).toBeNull();
});
it('checks the counterpart recording and preserves format preference between credible releases',()=>{
 const linked=video(1,{counterpartOf:'catalogue01',catalogueTitle:'Ocean Road',catalogueArtists:['Example Artist'],catalogueAlbum:'Example Movie',duration:330,viewCount:100});
 const lyric=video(2,{title:'Ocean Road Official Lyrics | Example Artist',artist:'Sony Music India',channelId:'UC56gTxNs4f9xZ7Pa2i5xNzg',viewCount:1e8});
 expect(selectYouTubeBackgroundCandidate([linked,lyric],track,'music')).toBe('00000000001');
 expect(selectYouTubeBackgroundCandidate([linked,lyric],track,'lyrics')).toBe('00000000002');
 expect(selectYouTubeBackgroundCandidate([{...linked,catalogueTitle:'Different Song'},lyric],track,'music')).toBe('00000000002');
 const distributorMusic=video(3,{channelId:'UC56gTxNs4f9xZ7Pa2i5xNzg'});
 const linkedLyric={...lyric,counterpartOf:linked.counterpartOf,catalogueTitle:linked.catalogueTitle,catalogueArtists:linked.catalogueArtists};
 expect(selectYouTubeBackgroundCandidate([linkedLyric,distributorMusic],track,'music')).toBe('00000000003');
});
it('never chooses known embedding failures, static images, or a different recording via the fallback',()=>{
 expect(selectYouTubeBackgroundCandidate([video(1,{embeddable:false}),video(2,{visualContent:'static'}),video(3,{title:'Different Song Official Video'})],track)).toBeNull();
});

it('preserves Malayalam vowel marks when comparing titles',()=>{
 const rain={...track,title:'മഴ'};
 const correct=video(1,{title:'Example Artist - മഴ Official Music Video'});
 const different=video(2,{title:'Example Artist - മഴേ Official Music Video',viewCount:1e9});
 expect(relevantYouTubeVideoChoices([different,correct],rain).map(v=>v.id)).toEqual([correct.id]);
});
