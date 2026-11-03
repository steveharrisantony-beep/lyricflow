import {expect,it} from 'vitest';
import {parseSongs,type SongResult} from '../music/providers';
import {isYouTubeBackgroundVideo,rankYouTubeBackgroundCandidates,selectYouTubeBackgroundCandidate} from '../music/videoMatching';
const track={title:'Ocean Road',artist:'Example Artist',duration:200};
const video=(n:number,views:number,extra:Partial<SongResult>={}):SongResult=>{
 const id=String(n).padStart(11,'0');
 return {id:'yt_'+id,youtubeVideoId:id,title:'Example Artist - Ocean Road (Official Music Video)',artist:'Example Artist',album:'',duration:200,provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v='+id,viewCount:views,...extra};
};
it('has the same complete ordering for every permutation, including the former comparator cycle',()=>{
 const candidates=[video(1,18e6,{duration:230}),video(2,1e6,{duration:214}),video(3,79700)];
 const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 const orders=permutations.map(order=>rankYouTubeBackgroundCandidates(order.map(i=>candidates[i]),track).map(v=>v.id));
 for(const order of orders)expect(order).toEqual(orders[0]);
 expect(orders[0][0]).toBe(candidates[0].id);
});
it('does not promote an unverified Records name above a much more popular equivalent video',()=>{
 const small=video(1,79700,{artist:'Echo Records'}),large=video(2,18e6,{artist:'Authentic Label'});
 expect(rankYouTubeBackgroundCandidates([small,large],track)[0].id).toBe(large.id);
});
it('allows a genuine video intro without letting a short clip or distant recording win',()=>{
 const small=video(1,79700),large=video(2,18e6,{duration:230});
 expect(rankYouTubeBackgroundCandidates([small,large,video(3,1e9,{duration:70}),video(4,1e9,{duration:500})],track).map(v=>v.id)).toEqual([large.id,small.id]);
});
it('rejects different artists even when the title says Full Song and the publisher is a known label',()=>{
 expect(rankYouTubeBackgroundCandidates([video(1,18e6,{title:'Ocean Road Full Song | Other Movie',artist:'Sony Music India'})],track)).toEqual([]);
});
it('requires the requested recording version in both directions',()=>{
 expect(rankYouTubeBackgroundCandidates([video(1,18e6)],{...track,title:'Ocean Road (Remix)'})).toEqual([]);
 expect(rankYouTubeBackgroundCandidates([video(1,18e6,{title:'Example Artist - Ocean Road Remix Official Video'})],track)).toEqual([]);
});
it('excludes still images and audio even when they have OMV flags or large view counts',()=>{
 for(const title of ['Ocean Road Album Art','Ocean Road Official Audio','Ocean Road Still Image Video','Ocean Road Photo Background','Ocean Road Visualizer'])expect(isYouTubeBackgroundVideo(video(1,1e9,{title,videoType:'OMV'})),title).toBe(false);
 expect(isYouTubeBackgroundVideo(video(1,1e9,{visualContent:'static'}))).toBe(false);
 expect(isYouTubeBackgroundVideo(video(1,18e6,{title:'Ocean Road',videoType:'OMV',metadataSource:'ytmusic'}))).toBe(true);
 expect(isYouTubeBackgroundVideo(video(1,18e6,{title:'Ocean Road',videoType:'UGC'}))).toBe(false);
});
it('retains low-confidence choices without automatically loading them',()=>{
 const candidates=[video(1,18e6,{artist:'Publisher',title:'Ocean Road Official Video'})];
 const unknownArtist={...track,artist:''};
 expect(rankYouTubeBackgroundCandidates(candidates,unknownArtist)).toHaveLength(1);
 // No partial title should be silently accepted for a known recording.
 expect(selectYouTubeBackgroundCandidate(candidates,track)).toBe(null);
});
it('keeps late candidates and their structured metadata beyond the old 30-result cutoff',()=>{
 const songs=Array.from({length:65},(_,i)=>video(i,i+1,{channelId:'UCchannel',channelVerified:true,artistCredits:['Example Artist'],visualContent:'motion',metadataSource:'ytmusic'}));
 const parsed=parseSongs({data:songs},'resolver');
 expect(parsed).toHaveLength(65);expect(parsed[64]).toMatchObject(songs[64]);
});

it('does not treat an unverified artist display name as an authoritative uploader identity',()=>{
 const impersonator=video(1,79700),release=video(2,18e6,{artist:'Authentic Label'});
 expect(rankYouTubeBackgroundCandidates([impersonator,release],track)[0].id).toBe(release.id);
});
it('does not auto-select a first result when duration and recording evidence are missing',()=>{
 expect(selectYouTubeBackgroundCandidate([video(1,0,{duration:0,viewCount:undefined}),video(2,0,{duration:0,viewCount:undefined})],track)).toBe(null);
});
