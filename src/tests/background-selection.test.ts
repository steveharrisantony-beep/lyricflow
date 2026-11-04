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

it.each([
 [{title:'Song (feat. Guest One & Guest Two) (From Film)',artist:'Lead One, Lead Two'},
  'Song (From Film) Lead One Guest One video','Lead One','Guest One'],
 [{title:'Song',artist:'Lead One & Lead Two [ft.Guest One; Guest Two]'},
  'Song Lead One Guest One video','Lead One','Guest One'],
 [{title:'Song (feat. Other Guest)',artist:'Lead & Band, Second',primaryArtist:'Lead & Band',featuredArtist:'Guest & Group'},
  'Song Lead & Band Guest & Group video','Lead & Band','Guest & Group'],
] as const)('includes only the first primary and featured artist in the query',async(track,query,primary,featured)=>{
 const fetcher=mockSearch([]);
 await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(params.get('q')).toBe(query);
 expect(params.get('backgroundArtist')).toBe(primary);
 expect(params.get('backgroundFeaturedArtist')).toBe(featured);
});

it.each([
 ['Song | LEAD–ONE','Song | LEAD–ONE Guest One video','', 'Guest One'],
 ['Song | Guest One','Song | Guest One Lead One video','Lead One',null],
 ['Song | Lead One and Guest One (feat. Guest One & Guest Two)',
  'Song | Lead One and Guest One video','',null],
 ['Song | Lead Oneil and Guest with One','Song | Lead Oneil and Guest with One Lead One Guest One video',
  'Lead One','Guest One'],
] as const)('skips artist names already in the query title %s',async(title,query,primary,featured)=>{
 const fetcher=mockSearch([]);
 await findYouTubeBackgrounds({title,artist:'Lead One feat. Guest One'},'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(params.get('q')).toBe(query);
 expect(params.get('backgroundArtist')).toBe(primary);
 expect(params.get('backgroundFeaturedArtist')).toBe(featured);
});
