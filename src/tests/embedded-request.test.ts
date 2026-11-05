// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({android:true,prepare:vi.fn(),request:vi.fn()}));
vi.mock('@capacitor/core',()=>({
 Capacitor:{isNativePlatform:()=>native.android,getPlatform:()=>native.android?'android':'web'},
 CapacitorHttp:{request:native.request},registerPlugin:()=>({prepare:native.prepare}),
}));
vi.mock('@capawesome/capacitor-nodejs',()=>({Nodejs:{}}));
import {backendRequest} from '../network/embeddedBackend';

beforeEach(()=>{
 vi.clearAllMocks();native.android=true;
 native.prepare.mockResolvedValue({port:32123,token:'fixture-local-token'});
 native.request.mockResolvedValue({status:200,headers:{'Content-Type':'application/json'},data:{ok:true}});
});
afterEach(()=>vi.unstubAllGlobals());

it('sends JSON writes to the authenticated service on the device',async()=>{
 const response=await backendRequest(location.origin+'/music/romanize',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines:['Hello']}),
 });
 expect(native.request).toHaveBeenCalledWith(expect.objectContaining({
  url:'http://127.0.0.1:32123/music/romanize',method:'POST',
  headers:expect.objectContaining({'x-lyricflow-token':'fixture-local-token'}),
  data:{lines:['Hello']},disableRedirects:true,
 }));
 expect(await response.json()).toEqual({ok:true});
});

it('keeps local authorization away from external URLs',async()=>{
 await expect(backendRequest('https://untrusted.example/music/yt-auth',{method:'POST'})).rejects.toThrow('address');
 expect(native.prepare).not.toHaveBeenCalled();expect(native.request).not.toHaveBeenCalled();
});

it('rejects writes until the service has started',async()=>{
 native.prepare.mockResolvedValue({port:0,token:'fixture-local-token'});
 await expect(backendRequest(location.origin+'/music/yt-auth',{method:'POST'})).rejects.toThrow('not ready');
 expect(native.request).not.toHaveBeenCalled();
});

it('honors cancellation before delivering a native response',async()=>{
 const controller=new AbortController();
 native.request.mockImplementation(async()=>{controller.abort();return {status:200,data:{ok:true},headers:{}};});
 await expect(backendRequest(location.origin+'/music/yt-auth',{method:'POST',signal:controller.signal})).rejects.toThrow();
});

it('uses browser fetch for the website',async()=>{
 native.android=false;
 const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
 const options={method:'POST',body:'{}'};
 await backendRequest('https://web.example/music/yt-auth',options);
 expect(fetcher).toHaveBeenCalledWith('https://web.example/music/yt-auth',options);
 expect(native.request).not.toHaveBeenCalled();
});
