// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../music/backgroundVideos',()=>({findYouTubeBackgrounds:vi.fn()}));
import {findYouTubeBackgrounds} from '../music/backgroundVideos';
import {useVideoRecovery} from '../music/useVideoRecovery';
import type {SongResult} from '../music/providers';
const track={title:'Original rain',artist:'Test Artist',album:'',duration:200,source:'manual' as const,confidence:1};
const video=(id:string):SongResult=>({id:'yt_'+id,youtubeVideoId:id,sourceUrl:'https://www.youtube.com/watch?v='+id,title:'Original rain Test Artist Official Music Video',artist:'Test Artist',album:'',duration:200,viewCount:100,provider:'resolver'});
const a=video('aaaaaaaaaaa'),b=video('bbbbbbbbbbb'),c=video('ccccccccccc');
let root:Root,result:ReturnType<typeof useVideoRecovery>;
function Fixture({selectionKey='song-a',candidates=[a,b]}:{selectionKey?:string;candidates?:SongResult[]}){
 result=useVideoRecovery({selectionKey,track,candidates,preference:'music'});return null;
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.mocked(findYouTubeBackgrounds).mockReset();
 localStorage.clear();root=createRoot(document.createElement('div'));
});
afterEach(async()=>{await act(async()=>root.unmount());});
it('loads a different cached match, then excludes every failed ID from fresh results',async()=>{
 await act(async()=>root.render(<Fixture/>));
 await act(async()=>result.loadAnotherVideo('aaaaaaaaaaa'));
 expect(result.videoId).toBe('bbbbbbbbbbb');expect(findYouTubeBackgrounds).not.toHaveBeenCalled();
 vi.mocked(findYouTubeBackgrounds).mockResolvedValue({candidates:[a,b,c],automaticVideoId:'aaaaaaaaaaa',candidateCount:3});
 await act(async()=>result.loadAnotherVideo('bbbbbbbbbbb'));
 expect(result.videoId).toBe('ccccccccccc');
 await act(async()=>result.loadAnotherVideo('ccccccccccc'));
 expect(result.videoId).toBe('ccccccccccc');
 expect(result.message).toContain('No other matching video found');expect(result.pending).toBe(false);
 expect(localStorage.length).toBe(0);
});
it('deduplicates clicks and aborts a pending replacement when the song changes',async()=>{
 let finish!:(value:Awaited<ReturnType<typeof findYouTubeBackgrounds>>)=>void;
 vi.mocked(findYouTubeBackgrounds).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>root.render(<Fixture candidates={[a]}/>));
 let request!:Promise<void>;
 await act(async()=>{request=result.loadAnotherVideo('aaaaaaaaaaa');});
 expect(result.pending).toBe(true);
 await act(async()=>result.loadAnotherVideo('aaaaaaaaaaa'));
 expect(findYouTubeBackgrounds).toHaveBeenCalledTimes(1);
 const signal=vi.mocked(findYouTubeBackgrounds).mock.calls[0][3]!;
 await act(async()=>root.render(<Fixture selectionKey="song-b"/>));
 expect(signal.aborted).toBe(true);expect(result.pending).toBe(false);
 await act(async()=>{finish({candidates:[c],automaticVideoId:'ccccccccccc',candidateCount:1});await request;});
 expect(result.videoId).toBeNull();
});
it('allows retry after search failure and resets a temporary choice for manual selection',async()=>{
 vi.mocked(findYouTubeBackgrounds).mockRejectedValue(new Error('Offline'));
 await act(async()=>root.render(<Fixture candidates={[a]}/>));
 await act(async()=>result.loadAnotherVideo('aaaaaaaaaaa'));
 expect(result.pending).toBe(false);expect(result.message).toContain('Could not find another video');
 vi.mocked(findYouTubeBackgrounds).mockResolvedValue({candidates:[b],automaticVideoId:'bbbbbbbbbbb',candidateCount:1});
 await act(async()=>result.loadAnotherVideo('aaaaaaaaaaa'));
 expect(result.videoId).toBe('bbbbbbbbbbb');expect(result.message).toBe('');
 await act(async()=>result.reset());expect(result.videoId).toBeNull();
});

