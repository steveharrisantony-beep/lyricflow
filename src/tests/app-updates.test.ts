import {afterEach,expect,it,vi} from 'vitest';
import {checkForAppUpdate,parseAppUpdate,RELEASES_URL} from '../updates/appUpdates';
const apk={name:'LyricFlow-Android.apk',browser_download_url:RELEASES_URL+'/download/android-1002/LyricFlow-Android.apk',digest:'sha256:'+'a'.repeat(64)};
const release={tag_name:'android-1002',name:'LyricFlow 1.1.2',draft:false,prerelease:false,assets:[apk]};
afterEach(()=>vi.unstubAllGlobals());
it('offers only a newer stable Android release with an APK and checksum',()=>{
 expect(parseAppUpdate(release,1001)).toMatchObject({versionCode:1002,sha256:'a'.repeat(64)});
 expect(parseAppUpdate(release,1002)).toBeNull();
 expect(parseAppUpdate({...release,prerelease:true},1)).toBeNull();
 expect(parseAppUpdate({...release,draft:true},1)).toBeNull();
});
it('rejects downloads from a different repository or without integrity metadata',()=>{
 expect(()=>parseAppUpdate({...release,assets:[{...apk,browser_download_url:'https://evil.example/update.apk'}]},1)).toThrow('address');
 expect(()=>parseAppUpdate({...release,assets:[{...apk,digest:null}]},1)).toThrow('checksum');
 expect(()=>parseAppUpdate({...release,assets:[]},1)).toThrow('APK');
});
it('treats no published releases as no update and explains rate limits',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:404,ok:false}));
 expect(await checkForAppUpdate(1)).toBeNull();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:403,ok:false}));
 await expect(checkForAppUpdate(1)).rejects.toThrow('limiting');
});
it('forwards cancellation without embedding a GitHub access token',async()=>{
 const signal=new AbortController().signal;
 const request=vi.fn().mockResolvedValue({status:200,ok:true,json:async()=>release});
 vi.stubGlobal('fetch',request);
 expect((await checkForAppUpdate(1,signal))?.versionCode).toBe(1002);
 expect(request.mock.calls[0][1].signal).toBe(signal);
 expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();
});
