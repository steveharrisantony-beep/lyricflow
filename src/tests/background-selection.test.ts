import {afterEach,expect,it,vi} from 'vitest';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import type {SongResult} from '../music/providers';
import {hasYouTubeViewCount,matchesVideoPreference} from '../music/videoMatching';

const track={title:'Apna Bana Le - Bhediya',artist:'Sachin-Jigar, Arijit Singh',album:'Bhediya',duration:261};
const video=(youtubeVideoId:string,title:string,viewCount?:number,extra:Partial<SongResult>={}):SongResult=>({
 id:'yt_'+youtubeVideoId,youtubeVideoId,title,artist:'Uploader',album:'',duration:0,provider:'resolver',
 sourceUrl:'https://www.youtube.com/watch?v='+youtubeVideoId,viewCount,...extra,
});
const official=video('ElZfdU54Cp8','Apna Bana Le | Varun Dhawan, Kriti Sanon | Sachin–Jigar, Arijit Singh | Bhediya',628_000_000);
const fan=video('SuPes9qxWLg','Arijit Singh: Apna Bana Le (Lyrics) | Bhediya | Sachin-Jigar',7_100_000);
const missingFilm=video('aaaaaaaaaaa','Apna Bana Le | Sachin-Jigar',900_000_000);
const missingArtist=video('bbbbbbbbbbb','Apna Bana Le - Bhediya | Arijit Singh',900_000_000,{artist:'Sachin-Jigar'});
const bareCard=video('ccccccccccc','Apna Bana Le',undefined,{artist:'Amitabh Bhattacharya'});

afterEach(()=>vi.unstubAllGlobals());

function mockSearch(songs:SongResult[]){
 const fetcher=vi.fn(async(_url:string)=>Response.json({data:songs}));
 vi.stubGlobal('fetch',fetcher);
 return fetcher;
}
it('runs one exact query and chooses the most viewed complete title without rewarding word order',async()=>{
 const fetcher=mockSearch([fan,missingFilm,missingArtist,bareCard,official]);
 const result=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(Object.fromEntries(params)).toEqual({
  q:'Apna Bana Le - Bhediya Sachin-Jigar video',provider:'youtube',
  backgroundTitle:'Apna Bana Le - Bhediya',backgroundArtist:'Sachin-Jigar',
 });
 expect(result.candidateCount).toBe(5);
 expect(result.candidates.map(song=>song.youtubeVideoId)).toEqual(['ElZfdU54Cp8','SuPes9qxWLg']);
});
it('uses the same query in lyrics mode and only ranks titles with a lyric keyword',async()=>{
 const lyrical=video('ddddddddddd','Apna Bana Le Bhediya – Sachin-Jigar (Lyrical)',9_000_000);
 const lyric=video('eeeeeeeeeee','Apna Bana Le Bhediya – Sachin-Jigar (Lyric)',8_000_000);
 const fetcher=mockSearch([official,fan,lyrical,lyric]);
 const result=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('q')).toBe('Apna Bana Le - Bhediya Sachin-Jigar video');
 expect(result.candidates.filter(song=>matchesVideoPreference(song,'lyrics')).map(song=>song.youtubeVideoId))
  .toEqual(['ddddddddddd','eeeeeeeeeee','SuPes9qxWLg']);
});
it('does not automatically fall back to a non-lyric video or one with unknown views',async()=>{
 const fetcher=mockSearch([official,{...fan,viewCount:undefined}]);
 const result=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const lyrics=result.candidates.filter(song=>matchesVideoPreference(song,'lyrics'));
 expect(lyrics.map(song=>song.youtubeVideoId)).toEqual(['SuPes9qxWLg']);
 expect(lyrics.find(hasYouTubeViewCount)).toBeUndefined();
});
it('allows additional title words in either example and uses the full watch title',async()=>{
 mockSearch([missingFilm,{...official,title:'Apna Bana Le',videoTitle:official.title}]);
 const result=await findYouTubeBackgrounds({...track,title:'Apna Bana Le'},'https://resolver.example');
 expect(result.candidates).toHaveLength(2);
 expect(result.candidates[0].youtubeVideoId).toBe('aaaaaaaaaaa');
});
