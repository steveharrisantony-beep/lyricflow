import {expect,it} from 'vitest';
import {parseSongs,type SongResult} from '../music/providers';
import {evaluateBackgroundVideos,filterYouTubeVideoChoices,compareYouTubeVideoViews} from '../music/videoMatching';

const video=(n:number,extra:Partial<SongResult>={}):SongResult=>{
 const id=String(n).padStart(11,'0');
 return {id:'yt_'+id,youtubeVideoId:id,title:'Ocean Road Visualizer',artist:'Uploader',album:'',
  duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+id,...extra};
};

it('keeps filtering in search order without using duration, artist or view counts',()=>{
 const first=video(1,{duration:10});
 const second=video(2,{duration:1500,artist:'Different Artist',viewCount:1e9});
 const result=evaluateBackgroundVideos([first,second],'Ocean Road','music');
 expect(result.map(choice=>choice.song)).toEqual([first,second]);
 expect(result.every(choice=>choice.withinLimit&&!choice.reasons.length)).toBe(true);
});
it('checks the first twenty rows and retains diagnostics for the rest of the page',()=>{
 const songs=Array.from({length:65},(_,i)=>video(i,{title:i<20?'Other song':'Ocean Road'}));
 const parsed=parseSongs({data:songs},'resolver',true);
 expect(parsed).toHaveLength(65);
 const result=evaluateBackgroundVideos(parsed,'Ocean Road','music');
 expect(result.find(choice=>choice.withinLimit&&!choice.reasons.length)).toBeUndefined();
 expect(result[19].reasons).toEqual(['No song-title word in the video title']);
 expect(result[20]).toMatchObject({withinLimit:false,reasons:[]});
});
it('keeps manual relevance and views as independent orders',()=>{
 const first=video(1);
 const second=video(2,{viewCount:1e9});
 const staticVideo=video(3,{visualContent:'static'});
 const relevant=filterYouTubeVideoChoices([first,second,staticVideo]);
 expect(relevant).toEqual([first,second]);
 expect([...relevant].sort(compareYouTubeVideoViews)).toEqual([second,first]);
});
