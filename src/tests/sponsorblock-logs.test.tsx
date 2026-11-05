// @vitest-environment jsdom
import {act,createRef} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../music/sponsorBlock',async original=>({
 ...await original<typeof import('../music/sponsorBlock')>(),fetchSponsorBlockSegments:vi.fn(),
}));
import LocalPlayer,{type LocalPlayerHandle} from '../audio/LocalPlayer';
import {fetchSponsorBlockSegments} from '../music/sponsorBlock';
import VideoSearchLogs from '../music/VideoSearchLogs';
import {getVideoSearchLogs,logVideoSearch} from '../music/videoSearchHistory';

let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 vi.mocked(fetchSponsorBlockSegments).mockResolvedValue([
  {uuid:'sponsor-fixture',segment:[1,8],category:'sponsor',actionType:'skip'},
 ]);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();});

it.each([true,false])('logs a playback cut only when SponsorBlock applies it (enabled %s)',async(enabled)=>{
 const ref=createRef<LocalPlayerHandle>(),timeChanged=vi.fn(),unchanged=vi.fn();
 const before=getVideoSearchLogs()[0]?.id||0;
 const skips=()=>getVideoSearchLogs().filter(entry=>entry.id>before&&entry.mode==='SponsorBlock');
 await act(async()=>root.render(<LocalPlayer ref={ref} sourceMode="online" sponsorBlockEnabled={enabled}
  onActiveChange={unchanged} onTimeChange={timeChanged} onFileChange={unchanged} onTrackChange={unchanged}
  onDurationChange={unchanged} onOpenSourceSelector={unchanged}/>));
 await act(async()=>ref.current!.loadRemote({
  id:'yt_abcdefghijk',youtubeVideoId:'abcdefghijk',title:'Fixture Song',artist:'Singer',album:'',duration:200,
  provider:'resolver',sourceUrl:'https://www.youtube.com/watch?v=abcdefghijk',format:'youtube',
  streamUrl:'https://www.youtube.com/watch?v=abcdefghijk',audioSource:'YouTube',
 }));
 expect(skips()).toHaveLength(0);
 await act(async()=>vi.advanceTimersByTime(100));
 await act(async()=>ref.current!.syncExternalClock(2,200));
 await act(async()=>vi.advanceTimersByTime(400));
 if(!enabled){expect(skips()).toHaveLength(0);return;}
 expect(timeChanged).toHaveBeenCalledWith(8);
 expect(skips()).toHaveLength(1);
 expect(skips()[0]).toMatchObject({mode:'SponsorBlock',title:'Fixture Song',videoId:'abcdefghijk',category:'Sponsor',end:8});
 await act(async()=>vi.advanceTimersByTime(1000));
 expect(skips()).toHaveLength(1);
 await act(async()=>root.render(<VideoSearchLogs/>));
 await act(async()=>logVideoSearch('Fixture Song Singer Music Video','Autoplay',async()=>[]));
 const article=[...host.querySelectorAll('article')].find(row=>row.textContent?.includes('SponsorBlock'))!;
 expect(article.textContent).toContain('Skipped Sponsor');
 expect(article.textContent).toContain('8.00s');expect(article.textContent).toContain('s skipped');
 expect(article.textContent).toContain('abcdefghijk');expect(article.textContent).not.toContain('Exact API query');
 expect(host.querySelector('code')?.textContent).toBe('Fixture Song Singer Music Video');
});
