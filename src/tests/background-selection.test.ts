import {afterEach,expect,it,vi} from 'vitest';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import type {SongResult} from '../music/providers';
import {getVideoSearchLogs} from '../music/videoSearchHistory';

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
  q:'Apna Bana Le - Bhediya Sachin-Jigar Music Video',provider:'youtube',
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
 ['Song Remix (feat. Guest)','Song Remix (feat. Guest) Lead Singer Lyric Video'],
 ['Lead - Song Remix (feat. Guest)','Lead - Song Remix (feat. Guest) Lyric Video'],
])('uses the lyrical query while preserving the title %s',async(title,query)=>{
 const fetcher=mockSearch([official]);
 await findYouTubeBackgrounds({title,artist:'Lead Singer, Second Artist',featuredArtist:'Extra Guest'},'https://resolver.example',undefined,'lyrics');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(params.get('q')).toBe(query);
 expect(params.get('backgroundTitle')).toBe(title);
 expect(params.get('backgroundArtist')).toBe('Lead Singer');
 expect(params.get('backgroundPreference')).toBe('lyrics');
 expect(params.has('backgroundFeaturedArtist')).toBe(false);
 expect(getVideoSearchLogs()[0].query).toBe(query);
});

it.each([
 [{title:'Song (feat. Guest One & Guest Two) (From Film)',artist:'Lead One, Lead Two'},
  'Song (feat. Guest One & Guest Two) (From Film) Music Video','Lead One'],
 [{title:'Song',artist:'Lead One & Lead Two [ft.Guest One; Guest Two]'},
  'Song Lead One Music Video','Lead One'],
 [{title:'Song (feat. Other Guest)',artist:'Lead & Band, Second',primaryArtist:'Lead & Band',featuredArtist:'Guest & Group'},
  'Song (feat. Other Guest) Lead & Band Music Video','Lead & Band'],
 [{title:'Anirudh - Ala bolelo Remix',artist:'Anirudh Ravichandar, Sreyas'},
  'Anirudh - Ala bolelo Remix Music Video','Anirudh Ravichandar'],
 [{title:'Passenger - Let Her Go (Feat. Ed Sheeran - Anniversary Edition)',artist:'Passenger, Ed Sheeran'},
  'Passenger - Let Her Go (Feat. Ed Sheeran - Anniversary Edition) Music Video','Passenger'],
 [{title:'KALYANI (with Shreya Ghoshal) - Remix',artist:'ARJN, fifty4, Shreya Ghoshal'},
  'KALYANI (with Shreya Ghoshal) - Remix ARJN Music Video','ARJN'],
] as const)('preserves the source title and adds only the first primary artist when needed',async(track,query,primary)=>{
 const fetcher=mockSearch([official]);
 await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(params.get('q')).toBe(query);
 expect(params.get('backgroundArtist')).toBe(primary);
 expect(params.get('backgroundTitle')).toBe(track.title);
 expect(params.has('backgroundFeaturedArtist')).toBe(false);
});

it.each([
 ['Song | LEAD–ONE','Song | LEAD–ONE Music Video'],
 ['Song | Guest One','Song | Guest One Music Video'],
 ['Song | Lead One and Guest One (feat. Guest One & Guest Two)',
  'Song | Lead One and Guest One (feat. Guest One & Guest Two) Music Video'],
 ['Song | Lead Oneil and Guest with One','Song | Lead Oneil and Guest with One Music Video'],
 ['Song | Lead Oneil','Song | Lead Oneil Music Video'],
 ['Song | Leadville','Song | Leadville Lead One Music Video'],
] as const)('skips the primary artist when any complete word is in the title %s',async(title,query)=>{
 const fetcher=mockSearch([official]);
 await findYouTubeBackgrounds({title,artist:'Lead One feat. Guest One'},'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 const params=new URL(fetcher.mock.calls[0][0]).searchParams;
 expect(params.get('q')).toBe(query);
 expect(params.get('backgroundArtist')).toBe('Lead One');
 expect(params.has('backgroundFeaturedArtist')).toBe(false);
});

it('keeps only the first ten YouTube relevance hits without sorting or replacing them with later popular videos',async()=>{
 const rows=Array.from({length:18},(_,index)=>video(String(index).padStart(11,'0'),
  'Apna Bana Le Official Video',index===17?1e9:index));
 const fetcher=mockSearch(rows);
 const result=await findYouTubeBackgrounds(track,'https://resolver.example');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(result.candidateCount).toBe(10);
 expect(result.candidates.map(item=>item.youtubeVideoId)).toEqual(rows.slice(0,10).map(item=>item.youtubeVideoId));
 expect(result.candidates.some(item=>item.youtubeVideoId===rows[17].youtubeVideoId)).toBe(false);
});
