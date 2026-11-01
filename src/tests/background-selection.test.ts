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

