import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({checkNotificationAccess:vi.fn(),openAppInfoSettings:vi.fn(),openNotificationSettings:vi.fn(),addListener:vi.fn(),startAudioCapture:vi.fn(),stopAudioCapture:vi.fn(),remove:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},registerPlugin:()=>native}));
import {checkExternalNotificationAccess,getExternalSetupStatus,openExternalAppInfoSettings,setAndroidAppOverrideForTest,startExternalAudioCapture,stopExternalAudioCapture} from '../audio/externalPlayer';
import {getInputSource} from '../audio/audioSignal';
beforeEach(async()=>{
 setAndroidAppOverrideForTest(true);native.stopAudioCapture.mockResolvedValue({stopped:true});await stopExternalAudioCapture();vi.clearAllMocks();
 native.checkNotificationAccess.mockResolvedValue({granted:true,androidSdk:35});native.addListener.mockResolvedValue({remove:native.remove});native.startAudioCapture.mockResolvedValue({started:true,mode:'internal'});
});
afterEach(async()=>{await stopExternalAudioCapture();setAndroidAppOverrideForTest(null);vi.unstubAllGlobals();});
it('uses real permission state and never treats opening App info as a grant',async()=>{
 native.checkNotificationAccess.mockResolvedValue({granted:false,androidSdk:35});native.openAppInfoSettings.mockResolvedValue({opened:true});
 expect(await getExternalSetupStatus()).toEqual({granted:false,androidSdk:35});expect(await openExternalAppInfoSettings()).toBe(true);
 expect(await checkExternalNotificationAccess()).toBe(false);
 expect((await startExternalAudioCapture('internal')).ok).toBe(false);expect(native.startAudioCapture).not.toHaveBeenCalled();
});
it('cancels a pending native permission request and releases its late capture',async()=>{
 let grant!:(value:{started:boolean;mode:string})=>void;
 native.startAudioCapture.mockImplementationOnce(()=>new Promise(resolve=>{grant=resolve;}));
 const pending=startExternalAudioCapture('internal');await vi.waitFor(()=>expect(native.startAudioCapture).toHaveBeenCalledOnce());
 const stopping=stopExternalAudioCapture();grant({started:true,mode:'internal'});
 expect((await pending).ok).toBe(false);await stopping;expect(native.remove).toHaveBeenCalledOnce();expect(getInputSource()).toBe('IDLE');
 expect(native.stopAudioCapture.mock.invocationCallOrder.at(-1)).toBeGreaterThan(native.startAudioCapture.mock.invocationCallOrder[0]);
});
it('cancels before the permission prompt if the user leaves immediately',async()=>{
 const pending=startExternalAudioCapture('internal');const stopping=stopExternalAudioCapture();
 expect((await pending).ok).toBe(false);await stopping;expect(native.startAudioCapture).not.toHaveBeenCalled();
});
it('cleans a denied internal capture and can retry successfully',async()=>{
 native.startAudioCapture.mockRejectedValueOnce(new Error('Permission denied'));
 expect(await startExternalAudioCapture('internal')).toMatchObject({ok:false,message:'Permission denied'});expect(native.remove).toHaveBeenCalledOnce();
 expect((await startExternalAudioCapture('internal')).ok).toBe(true);
});
it('rejects unsupported microphone capture instead of claiming success',async()=>{
 vi.stubGlobal('navigator',{mediaDevices:{}});
 expect(await startExternalAudioCapture('mic')).toMatchObject({ok:false,message:expect.stringContaining('unavailable')});expect(getInputSource()).toBe('IDLE');
});
it('stops microphone tracks when audio-context setup fails',async()=>{
 const stop=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop}]})}});
 vi.stubGlobal('AudioContext',class{constructor(){throw Error('AudioContext unavailable');}});
 expect((await startExternalAudioCapture('mic')).ok).toBe(false);expect(stop).toHaveBeenCalledOnce();
});
it('releases capture if notification access was revoked during the audio prompt',async()=>{
 native.checkNotificationAccess.mockResolvedValueOnce({granted:true,androidSdk:35}).mockResolvedValueOnce({granted:false,androidSdk:35});
 expect((await startExternalAudioCapture('internal')).ok).toBe(false);expect(native.remove).toHaveBeenCalledOnce();
});
it('serializes replacement captures and leaves only the latest requested mode active',async()=>{
 let grant!:(value:{started:boolean})=>void;
 native.startAudioCapture.mockImplementationOnce(()=>new Promise(resolve=>{grant=resolve;}));
 const first=startExternalAudioCapture('internal');await vi.waitFor(()=>expect(native.startAudioCapture).toHaveBeenCalledOnce());
 const next=startExternalAudioCapture('internal');grant({started:true});
 expect((await first).ok).toBe(false);expect((await next).ok).toBe(true);expect(native.startAudioCapture).toHaveBeenCalledTimes(2);
});
