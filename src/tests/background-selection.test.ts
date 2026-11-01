import {afterEach,expect,it,vi} from 'vitest';
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import {isYouTubeBackgroundVideo,rankYouTubeBackgroundCandidates,type SongResult} from '../music/providers';
const track={title:'Original rain',artist:'Test Artist',duration:200};
function video(index:number,title='Original rain Official Music Video',extra:Partial<SongResult>={}):SongResult{
 const id=String(index).padStart(11,'0');
 return {id:'yt_'+id,title,artist:'Test Artist',album:'',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+id,youtubeVideoId:id,...extra};
}
afterEach(()=>vi.unstubAllGlobals());
it('rejects Topic, ATV, static audio, visualizers and unlabelled uploads',()=>{
 for(const item of [video(1,'Original rain Official Audio'),video(2,'Original rain Official Music Video',{videoType:'ATV'}),video(3,undefined,{artist:'Test Artist - Topic'}),video(4,'Original rain Album Image'),video(5,'Original rain Visualizer'),video(6,'Original rain')])expect(isYouTubeBackgroundVideo(item)).toBe(false);
 expect(isYouTubeBackgroundVideo(video(7,'Original rain',{videoType:'OMV'}))).toBe(true);
});
it('requires lyric, lyrical or lyrics in the title for lyrical preference',()=>{
 const results=rankYouTubeBackgroundCandidates([video(1),video(2,'Original rain Lyric Video'),video(3,'Original rain Lyrical'),video(4,'Original rain Lyrics'),video(5,'Original rain Text Video')],track,'lyrics');
 expect(results.map(s=>s.id)).toEqual(['yt_00000000002','yt_00000000003','yt_00000000004']);
});
it('compares a broad candidate pool and falls back from missing music video to lyrical video',async()=>{
 const requests:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  requests.push(input);
  const lyrical=new URL(input).searchParams.get('q')?.includes('lyrics');
  const songs=Array.from({length:15},(_,index)=>video(index+1,'Original rain Official Audio'));
  if(lyrical)songs.push(video(99,'Original rain Official Lyrics Video'));
  return new Response(JSON.stringify({data:songs}));
 }));
 const result=await findYouTubeBackgrounds(track,'music','https://resolver.example');
 expect(requests).toHaveLength(2);
 expect(result.candidateCount).toBe(16);
 expect(result.usedLyricalFallback).toBe(true);
 expect(result.videos.map(s=>s.id)).toEqual(['yt_00000000099']);
});
it('chooses the right recording over a popular wrong title, cover or distant duration',()=>{
 const results=rankYouTubeBackgroundCandidates([
  video(1,'Wrong Song Official Music Video',{viewCount:1e9}),
  video(2,'Original rain Cover Official Video',{viewCount:1e9}),
  video(3,undefined,{duration:400,viewCount:1e9}),
  video(4,undefined,{artist:'Unrelated Artist',duration:230,viewCount:1e9}),
  video(5,undefined,{viewCount:100}),
 ],track);
 expect(results[0].id).toBe('yt_00000000005');
 expect(results).toHaveLength(1);
});
it('prefers the explicit Official Music Video over Topic or bare-titled tracks for JioSaavn songs like Run It Up',()=>{
 const saavnTrack={title:'Run It Up',artist:'Hanumankind',duration:174};
 const candidates:SongResult[]=[
  video(10,'Run It Up',{artist:'Hanumankind - Topic',album:'Audio Track',duration:174,videoType:'ATV',viewCount:25_000_000}),
  video(11,'Run It Up',{artist:'Hanumankind',duration:174,videoType:'UGC',viewCount:15_000_000}),
  video(12,'Hanumankind - Run It Up ( Prod. By Kalmi ) | (Official Music Video)',{artist:'Hanumankind',duration:193,videoType:'OMV',viewCount:42_000_000}),
 ];
 const ranked=rankYouTubeBackgroundCandidates(candidates,saavnTrack,'music');
 expect(ranked.map(s=>s.id)).toEqual(['yt_00000000012']);
});
it('ranks official artist video (Maroon 5 - Maps) #1 and official lyric video #2 ahead of low-view third-party reuploads',()=>{
 const mapsTrack={title:'Maps',artist:'Maroon 5',duration:190};
 const candidates:SongResult[]=[
  video(20,'Maroon 5 - Maps [Official Video HD]',{artist:'Odin Production',duration:196,videoType:'UGC',viewCount:22_500}),
  video(21,'Maroon 5 - Maps Music Video',{artist:'Mary York',duration:191,videoType:'UGC',viewCount:4_400}),
  video(22,'Maroon 5 - Maps (Official Video)',{artist:'Music Love',duration:200,videoType:'UGC',viewCount:2_000}),
  video(23,'Maroon 5 - Maps (Lyric Video)',{artist:'Maroon 5',duration:189,videoType:'UGC',viewCount:515_200_000}),
  video(24,'Maroon 5 - Maps (Audio)',{artist:'Maroon 5',duration:190,videoType:'ATV',viewCount:140_000_000}),
  video(25,'Maroon 5 - Maps',{artist:'Maroon 5',duration:209,videoType:'UGC',viewCount:540_000_000}),
 ];
 const ranked=rankYouTubeBackgroundCandidates(candidates,mapsTrack,'music');
 expect(ranked[0].id).toBe('yt_00000000025');
 expect(ranked[1].id).toBe('yt_00000000023');
 expect(ranked.some(s=>s.id==='yt_00000000024')).toBe(false);
});
it('ranks official movie song uploads (MC Music 12M & Muzik247 3M) #1 and #2 for Thumbi Penne while excluding dance choreography, spaced slowed+reverb, live futsal events, and unrelated songs',()=>{
 const thumbiTrack={title:'Thumbi Penne',artist:'Siddharth Menon',album:'Bangalore Days',duration:299};
 const candidates:SongResult[]=[
  video(30,'Siddharth Menon Sings Thumbi Penne, Bangalore Days | Futsal 2016 | Manorama Online Events',{artist:'Manorama Online Events',duration:193,videoType:'UGC',viewCount:56_600}),
  video(31,'Siddharth Menon | Thumbi Penne (Lyrics) | Bangalore Days',{artist:'KoffeeBee',duration:293,videoType:'UGC',viewCount:28_700}),
  video(32,'THUMBI PENNE | DSOULS DANCE COMPANY | DEEN JOHNS DANCE CHOREOGRAPHY',{artist:'DSOULS DANCE COMPANY',duration:81,videoType:'UGC',viewCount:923_600}),
  video(33,'thumbi penne ( s l o w e d + r e v e r b ) | lilvibe',{artist:'lilvibe -',duration:352,videoType:'UGC',viewCount:322_900}),
  video(34,'Thumbippenne Vava Lyrical Video Song | Dhruvam | Mammootty | Gouthami | Jayaram | Yesudas',{artist:'Movie World Cinema Pattukal',duration:304,videoType:'UGC',viewCount:239_100}),
  video(35,'Thumbi Penne | Bangalore Days Songs | NivinPauly | DulquarSalman | Nazriya | Isha Talwar',{artist:'MC Music',duration:170,videoType:'UGC',viewCount:12_000_000}),
  video(36,'Thumbi Penne- Bangalore Days | Dulquer Salman| Nivin Pauly| Nazriya Nazim | Full song',{artist:'Muzik247',duration:299,videoType:'UGC',viewCount:3_000_000}),
 ];
 const ranked=rankYouTubeBackgroundCandidates(candidates,thumbiTrack,'music');
 expect(ranked.map(s=>s.id)).toEqual(['yt_00000000035','yt_00000000036','yt_00000000031']);
});
it('ranks Think Music India 109.1M views official music video #1 for Radhimaa over 379.7K Echo Haven reupload despite @SaiAbhyankkar camelCase handle and longer video duration',()=>{
 const radhimaaTrack={title:'Radhimaa',artist:'Sai Abhyankkar',album:'Radhimaa',duration:272};
 const candidates:SongResult[]=[
  video(40,'Radhimaa (Music Video) | Sai Abhyankkar | Bhagyashri Borse | Vivek | Thejo Bharathwaj',{artist:'Echo Haven',duration:272,videoType:'UGC',viewCount:379_700}),
  video(41,'@SaiAbhyankkar - Radhimaa (Music Video) | Bhagyashri Borse | Vivek | Thejo Bharathwaj | Think Indie',{artist:'Think Music India',duration:348,videoType:'UGC',viewCount:109_100_000}),
  video(42,'@SaiAbhyankkar Radhimaa Music Video Bhagyashri Borse Vivek Thejo Bharathwaj The G',{artist:'gamer kaka',duration:348,videoType:'UGC',viewCount:296_500}),
  video(43,'Radhimaa official (Music video) | Sai abhyankkar | Bhagyashri borse | Thejo bharathwaj | Think music',{artist:'CAC MELODY',duration:348,videoType:'UGC',viewCount:209}),
 ];
 const ranked=rankYouTubeBackgroundCandidates(candidates,radhimaaTrack,'music');
 expect(ranked[0].id).toBe('yt_00000000041');
});


