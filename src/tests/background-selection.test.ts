import {afterEach,expect,it,vi} from 'vitest';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import type {SongResult} from '../music/providers';

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
it('sends one query with the title and primary artist and preserves the complete response order',async()=>{
 const fetcher=mockSearch([fan,missingFilm,missingArtist,bareCard,official]);
 const result=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(Object.fromEntries(params)).toEqual({
  q:'Apna Bana Le - Bhediya Sachin-Jigar video',provider:'youtube',
  backgroundTitle:'Apna Bana Le - Bhediya',backgroundArtist:'Sachin-Jigar',
 });
 expect(result.candidateCount).toBe(5);
 expect(result.candidates.map(song=>song.youtubeVideoId)).toEqual([
  'SuPes9qxWLg','aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc','ElZfdU54Cp8',
 ]);
});
it('keeps short and malformed results for diagnostics',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[
  {title:'Apna Visualizer',duration:12},
  {...official,duration:18},
 ]}));
 vi.stubGlobal('fetch',fetcher);
 const {candidates}=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(candidates.map(song=>song.duration)).toEqual([12,18]);
 expect(candidates[0].youtubeVideoId).toBeUndefined();
 expect(fetcher).toHaveBeenCalledTimes(1);
});
