// @vitest-environment jsdom
import {act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const bridge=vi.hoisted(()=>({status:vi.fn(),appInfo:vi.fn(),notifications:vi.fn(),watch:vi.fn(),remove:vi.fn()}));
vi.mock('../audio/externalPlayer',()=>({
 getExternalSetupStatus:bridge.status,openExternalAppInfoSettings:bridge.appInfo,openExternalNotificationSettings:bridge.notifications,
 watchExternalNotificationAccess:bridge.watch
}));
import ExternalPlayerSetup from '../audio/ExternalPlayerSetup';
let root:Root,host:HTMLDivElement;
const start=vi.fn(),stop=vi.fn(),changed=vi.fn();
function Harness(){
 const [granted,setGranted]=useState(false),[mode,setMode]=useState<'internal'|'mic'>('internal');
 return <ExternalPlayerSetup notificationAccessGranted={granted} onNotificationAccessChange={value=>{changed(value);setGranted(value);}}
  audioMode={mode} onAudioModeChange={setMode} onStartAudio={start} onStopAudio={stop}/>;
}
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!;
const click=async(name:string)=>{expect(button(name)).toBeDefined();await act(async()=>button(name).click());};
beforeEach(async()=>{
 vi.clearAllMocks();bridge.status.mockResolvedValue({granted:false,androidSdk:35});bridge.appInfo.mockResolvedValue(true);bridge.notifications.mockResolvedValue(true);bridge.watch.mockResolvedValue(bridge.remove);
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('orders App info review, verified notification access and explicit audio start',async()=>{
 await act(async()=>root.render(<Harness/>));
 expect(host.textContent).toContain('1. Allow restricted settings');expect(start).not.toHaveBeenCalled();
 expect(bridge.appInfo).not.toHaveBeenCalled();expect(button('Enable notification listening')).toBeUndefined();
 await click('Open App info');expect(bridge.appInfo).toHaveBeenCalledOnce();
 // Returning without confirmation or permission never jumps ahead.
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(button('Enable notification listening')).toBeUndefined();
 await click('I enabled it / it wasn’t required');
 expect(button('Start internal audio')).toBeUndefined();
 await click('Enable notification listening');expect(bridge.notifications).toHaveBeenCalledOnce();
 expect(button('Start internal audio')).toBeUndefined();
 bridge.status.mockResolvedValue({granted:true,androidSdk:35});
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(button('Start internal audio')).toBeDefined();expect(start).not.toHaveBeenCalled();
 await click('Microphone');expect(start).not.toHaveBeenCalled();
 await click('Start microphone');expect(start).toHaveBeenCalledOnce();
});
it('offers manual recovery when settings screens cannot open',async()=>{
 bridge.appInfo.mockResolvedValue(false);bridge.notifications.mockResolvedValue(false);
 await act(async()=>root.render(<Harness/>));await click('Open App info');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Android Settings → Apps → LyricFlow');
 await click('I checked App info manually');await click('Enable notification listening');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Notification access → LyricFlow');expect(start).not.toHaveBeenCalled();
});
it('skips restricted settings on older Android but still waits for notification approval',async()=>{
 bridge.status.mockResolvedValue({granted:false,androidSdk:32});await act(async()=>root.render(<Harness/>));
 expect(button('Open App info')).toBeUndefined();expect(button('Enable notification listening')).toBeDefined();expect(start).not.toHaveBeenCalled();
});
it('uses existing access, rechecks native resume and hides audio controls after revocation',async()=>{
 bridge.status.mockResolvedValue({granted:true,androidSdk:35});await act(async()=>root.render(<Harness/>));
 expect(button('Start internal audio')).toBeDefined();expect(bridge.notifications).not.toHaveBeenCalled();
 bridge.status.mockResolvedValue({granted:false,androidSdk:35});
 await act(async()=>bridge.watch.mock.calls[0][0]());
 expect(button('Start internal audio')).toBeUndefined();expect(changed).toHaveBeenLastCalledWith(false);
});
it('removes a native resume listener that finishes registering after unmount',async()=>{
 let resolve!:(value:()=>void)=>void;bridge.watch.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 await act(async()=>root.render(<Harness/>));await act(async()=>root.unmount());
 await act(async()=>resolve(bridge.remove));expect(bridge.remove).toHaveBeenCalledOnce();root=createRoot(host);
});
