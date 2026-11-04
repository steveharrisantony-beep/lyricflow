import {expect,it} from 'vitest';
import type {SongResult} from '../music/providers';
import {relevantYouTubeVideoChoices} from '../music/videoMatching';
const track={title:'Ocean Road',artist:'Example Artist',album:'Example Movie',duration:230};
const video=(id:number,extra:Partial<SongResult>={}):SongResult=>({id:'yt_'+String(id).padStart(11,'0'),title:'Example Artist - Ocean Road Official Music Video',artist:'Uploader',album:'',duration:230,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+String(id).padStart(11,'0'),...extra});
it('filters a pool of 150 other songs, same-title different artists, static uploads and variants before view sorting',()=>{
 const others=Array.from({length:150},(_,i)=>video(i,{title:'Other Song Official Video',viewCount:1e9}));
 const relevant=[video(200,{viewCount:1000}),video(201,{title:'OceanRoad Lyrics | Example Artist',viewCount:2000})];
 const wrong=[video(202,{title:'Ocean Road Official Video',artist:'Different Singer',viewCount:1e9}),video(203,{videoType:'ATV'}),video(204,{title:'Example Artist Ocean Road Remix Official Video'}),video(205,{title:'Example Artist Ocean Roadside Official Video'})];
 expect(relevantYouTubeVideoChoices([...others,...wrong,...relevant],track).map(v=>v.id)).toEqual([relevant[1].id,relevant[0].id]);
});
it('keeps longer official releases in the same view order as other relevant uploads',()=>{
 const fan=video(1,{title:'Example Artist Ocean Road Lyrics',viewCount:1e9});
 const release=video(2,{title:'Ocean Road Lyrical | Example Movie',artist:'Sony Music South',channelId:'UCn4rEMqKtwBQ6-oEwbd4PcA',duration:380,viewCount:100});
 expect(relevantYouTubeVideoChoices([release,fan],track)).toEqual([fan,release]);
});
it('excludes embedding failures, static images, and other recordings from preloaded choices',()=>{
 expect(relevantYouTubeVideoChoices([video(1,{embeddable:false}),video(2,{visualContent:'static'}),video(3,{title:'Different Song Official Video'})],track)).toEqual([]);
});
it('preserves Malayalam vowel marks when comparing titles',()=>{
 const rain={...track,title:'മഴ'};
 const correct=video(1,{title:'Example Artist - മഴ Official Music Video'});
 const different=video(2,{title:'Example Artist - മഴേ Official Music Video',viewCount:1e9});
 expect(relevantYouTubeVideoChoices([different,correct],rain).map(v=>v.id)).toEqual([correct.id]);
});

it('keeps the lesser-known recording ahead of popular songs that share its title', () => {
 const target = {title: 'Saath', artist: 'Ravi Kumar', album: 'Small Film', duration: 200};
 const byAnotherArtist = video(1, {title: 'Amit Kumar - Saath Official Video', artist: 'Amit Kumar', viewCount: 1e9});
 const similarName = video(2, {title: 'Saath | Ravi Kumaran | Official Video', artist: 'Ravi Kumaran', viewCount: 1e8});
 const conflictingCredits = video(3, {
  title: 'Ravi Kumar Saath Official Video', album: 'Small Film', metadataSource: 'ytmusic', artistCredits: ['Amit Kumar'], viewCount: 1e7,
 });
 const distributor = video(4, {title: 'Saath | Small Film | Official Video', artist: 'Movie Distributor', viewCount: 200});
 const correct = video(5, {title: 'Saath | RaviKumar | Official Video', artist: 'Music Channel', viewCount: 300});
 expect(relevantYouTubeVideoChoices([byAnotherArtist, similarName, conflictingCredits, distributor, correct], target))
  .toEqual([correct, distributor]);
});
