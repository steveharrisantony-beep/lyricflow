// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({configure:vi.fn(),addListener:vi.fn(),remove:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'android'},registerPlugin:()=>native}));
import {useNativePlaybackPolicy} from '../audio/nativePlaybackPolicy';
let root:Root,host:HTMLDivElement;
function Harness(){
 const policy=useNativePlaybackPolicy(true);
 return <span data-resumes={policy.resumeVersion} data-allowed={String(policy.allowed)}/>;
}
beforeEach(()=>{
 vi.clearAllMocks();native.configure.mockResolvedValue({safeBackground:true});
 native.addListener.mockResolvedValue({remove:native.remove});
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('reapplies Android muting and announces native resume even before the WebView becomes visible',async()=>{
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
 await act(async()=>root.render(<Harness/>));
 expect(native.configure).toHaveBeenCalledExactlyOnceWith({externalPlayer:true});
 expect(native.addListener).toHaveBeenCalledWith('appResume',expect.any(Function));
 await act(async()=>native.addListener.mock.calls[0][1]());
 expect(native.configure).toHaveBeenCalledTimes(2);
 expect(host.querySelector('span')?.dataset).toMatchObject({resumes:'1',allowed:'true'});
});
it('keeps an unsafe external-player WebView blocked after returning',async()=>{
 native.configure.mockResolvedValue({safeBackground:false});
 await act(async()=>root.render(<Harness/>));
 await act(async()=>native.addListener.mock.calls[0][1]());
 expect(host.querySelector('span')?.dataset).toMatchObject({resumes:'1',allowed:'false'});
});
it('restores the same muted iframe on native resume without a visibility-change event',async()=>{
 vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
 const {default:CinematicStage}=await import('../visualization/cinematic/CinematicStage');
 await act(async()=>root.render(<CinematicStage quality="Performance" intensity={0} speed={1}
  reducedMotion demo={false} paused autoScenes={false} manualScene="holographic-tide"
  spatialTypography={false} motionBlur={0} youtubeVideoId="abcdefghijk" playbackTime={42}
  videoDelaySeconds={2} hasSeparateAudioStream externalPlayer audioPaused={false}/>));
 const frame=host.querySelector('iframe')!,send=vi.spyOn(frame.contentWindow!,'postMessage');
 await act(async()=>native.addListener.mock.calls[0][1]());
 const commands=send.mock.calls.map(args=>JSON.parse(String(args[0])));
 expect(host.querySelector('iframe')).toBe(frame);
 expect(commands).toContainEqual({event:'command',func:'mute',args:[]});
 expect(commands).toContainEqual({event:'command',func:'setVolume',args:[0]});
 expect(commands).toContainEqual({event:'command',func:'seekTo',args:[40,true]});
 expect(commands).toContainEqual({event:'command',func:'playVideo',args:[]});
});
it('removes a native listener whose registration completes after unmount',async()=>{
 let complete!:(handle:{remove:typeof native.remove})=>void;
 native.addListener.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 await act(async()=>root.render(<Harness/>));
 await act(async()=>root.unmount());root=createRoot(host);
 await act(async()=>complete({remove:native.remove}));
 expect(native.remove).toHaveBeenCalledOnce();
});
