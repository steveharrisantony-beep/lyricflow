import {afterEach,expect,it,vi} from 'vitest';
import {hydrateVideoMetadata,mergeVideoMetadata,parseMusicVideoSearch,searchMusicVideos,VideoSearchCache,youtubeViews,type UnofficialVideo} from './youtubeSearch';
afterEach(()=>vi.unstubAllGlobals());
const entry=(id='abcdefghijk',type='MUSIC_VIDEO_TYPE_OMV')=>({musicResponsiveListItemRenderer:{
 flexColumns:[{musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:'Ocean Road',navigationEndpoint:{watchEndpoint:{videoId:id,watchEndpointMusicSupportedConfigs:{watchEndpointMusicConfig:{musicVideoType:type}}}}}]}}},
 {musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:'Example Artist',navigationEndpoint:{browseEndpoint:{browseId:'UCartist'}}},{text:' • '},{text:'18M views'},{text:' • '},{text:'3:50'}]}}}]
}});
const video=(extra:Partial<UnofficialVideo>={}):UnofficialVideo=>({id:'yt_abcdefghijk',rawId:'abcdefghijk',provider:'youtube',title:'Ocean Road',artist:'Example Artist',album:'',duration:0,sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',...extra});
it('parses real music-video identity, credits, views and duration without inventing an OMV label',()=>{
 const videos=parseMusicVideoSearch({contents:[entry(),entry('topic123456','MUSIC_VIDEO_TYPE_ATV')]});
 expect(videos[0]).toMatchObject({title:'Ocean Road',artist:'Example Artist',channelId:'UCartist',artistCredits:['Example Artist'],videoType:'OMV',duration:230,viewCount:18e6,metadataSource:'ytmusic'});
 expect(videos[1]).toMatchObject({videoType:'ATV',visualContent:'static'});
 expect(parseMusicVideoSearch({contents:[entry('unknown1234','MUSIC_VIDEO_TYPE_UGC')]})[0].videoType).toBe('UGC');
});
it('searches the unofficial video catalogue with region and video filter, including authenticated requests',async()=>{
 const fetcher=vi.fn(async()=>Response.json({contents:[entry()]}));vi.stubGlobal('fetch',fetcher);
 expect(await searchMusicVideos('Ocean Road',{'Authorization':'Bearer fixture'},'IN')).toHaveLength(1);
 const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toContain('music.youtube.com/youtubei/v1/search');expect(url).not.toContain('googleapis');
 const body=JSON.parse(String(options.body));expect(body.context.client.gl).toBe('IN');expect(body.params).toBe('EgWKAQIQAWoMEA4QChADEAQQCRAF');
});
it('fills missing statistics through unofficial player metadata',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({playabilityStatus:{status:'OK'},videoDetails:{videoId:'abcdefghijk',channelId:'UCartist',lengthSeconds:'230',viewCount:'18000000'}})));
 const result=await hydrateVideoMetadata([video()],{},'hydrate-fixture');
 expect(result[0]).toMatchObject({duration:230,viewCount:18e6,channelId:'UCartist'});
});
it('merges all query pools before ranking, retaining late explicit matches and richer metadata',()=>{
 const base=Array.from({length:40},(_,i)=>video({id:'yt_'+i,rawId:String(i).padStart(11,'0')}));
 const late=video({duration:230,viewCount:18e6,videoType:'OMV',artistCredits:['Example Artist'],metadataSource:'ytmusic'});
 const merged=mergeVideoMetadata([base,[late], [video({artist:'YouTube'})]]);
 expect(merged).toHaveLength(41);expect(merged.find(v=>v.rawId==='abcdefghijk')).toMatchObject(late);
 const staticMerged=mergeVideoMetadata([[late],[video({videoType:'ATV',visualContent:'static'})]]);
 expect(staticMerged[0]).toMatchObject({videoType:'ATV',visualContent:'static'});
});
it('deduplicates in-flight searches, isolates accounts, and retries empty/error responses',async()=>{
 const cache=new VideoSearchCache<number[]>();const load=vi.fn(async()=>[1]);
 await Promise.all([cache.get('account-a|query',load),cache.get('account-a|query',load)]);expect(load).toHaveBeenCalledTimes(1);
 await cache.get('account-b|query',load);expect(load).toHaveBeenCalledTimes(2);
 const empty=vi.fn(async()=>[] as number[]);await cache.get('empty',empty);await cache.get('empty',empty);expect(empty).toHaveBeenCalledTimes(2);
 await expect(cache.get('error',async()=>{throw Error('transient');})).rejects.toThrow('transient');
 expect(await cache.get('error',load)).toEqual([1]);
});
it('parses K/M counts and full numeric player statistics',()=>{
 expect(youtubeViews('79.7K views')).toBe(79700);expect(youtubeViews('18M views')).toBe(18e6);expect(youtubeViews('18000000')).toBe(18e6);expect(youtubeViews('1.8 crore views')).toBe(18e6);
});
