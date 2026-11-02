import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const shots=process.env.LYRIC_QA_DIR||'/tmp/lyricflow-external-setup';await mkdir(shots,{recursive:true});
// Replace only the native transport in this test server; the real app/permission flow remains intact.
const server=await createServer({plugins:[{name:'external-native-transport-fixture',enforce:'pre',transform(code,id){
 if(!id.endsWith('/src/audio/externalPlayer.ts'))return;
 return code.replace("export const ExternalMedia = registerPlugin<ExternalMediaPluginInterface>('ExternalMedia');","export const ExternalMedia = (globalThis as unknown as {__externalNative:ExternalMediaPluginInterface}).__externalNative;")
  .replace('let androidOverrideForTest: boolean | null = null;','let androidOverrideForTest: boolean | null = true;');
}}],server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 localStorage.setItem('lyricflow.lastSourceMode','local');localStorage.setItem('lyricflow.v3.guest.preferences',JSON.stringify({quality:'Performance',intensity:0,autoScenes:false}));
 const listeners=new Map(),state={granted:false,androidSdk:35,info:0,notifications:0,starts:0,stops:0,failInfo:false,failNotifications:false,denyAudio:false};
 window.__externalState=state;
 window.__resume=()=>{for(const callback of listeners.get('notificationAccessChange')||[])callback({granted:state.granted,androidSdk:state.androidSdk});};
 window.__externalNative={
  async checkNotificationAccess(){return {granted:state.granted,androidSdk:state.androidSdk};},
  async openAppInfoSettings(){state.info++;return {opened:!state.failInfo};},
  async openNotificationSettings(){state.notifications++;return {opened:!state.failNotifications};},
  async getCurrentMedia(){return {granted:state.granted,media:null};},
  async startListening(){return {listening:true,granted:state.granted,media:null};},async stopListening(){return {listening:false};},
  async addListener(name,callback){const set=listeners.get(name)||new Set();set.add(callback);listeners.set(name,set);return {async remove(){set.delete(callback);}};},
  async startAudioCapture({mode}){state.starts++;if(state.denyAudio)throw Error('Audio permission denied by Android');return {started:true,mode};},
  async stopAudioCapture(){state.stops++;return {stopped:true};}
 };
});
const chooseExternal=async()=>{
 await page.getByRole('button',{name:/^(Change|Select) source$/}).click();
 await page.getByRole('button',{name:/External player.*Configure External player/s}).click();
};
try{
 await page.route(/^http:\/\/127\.0\.0\.1:\d+\/music\//,route=>route.fulfill({json:{results:[]}}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:'networkidle'});
 await chooseExternal();await page.getByRole('heading',{name:'1. Allow restricted settings',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__externalState.starts),0);
 await page.getByRole('button',{name:'Open App info',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__externalState.info),1);
 await page.getByRole('button',{name:'I enabled it / it wasn’t required',exact:true}).click();
 await page.getByRole('heading',{name:'2. Enable notification listening',exact:true}).waitFor();
 await page.getByRole('button',{name:'Enable notification listening',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Start internal audio',exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>window.__externalState.starts),0);
 await page.evaluate(()=>{window.__externalState.granted=true;window.__resume();});
 await page.getByRole('heading',{name:'3. Choose an audio source',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__externalState.starts),0);
 await page.evaluate(()=>window.__externalState.denyAudio=true);
 await page.getByRole('button',{name:'Start internal audio',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Audio permission denied by Android'}).waitFor();
 await page.evaluate(()=>window.__externalState.denyAudio=false);
 await page.getByRole('button',{name:'Start internal audio',exact:true}).click();
 await page.getByRole('button',{name:'Stop audio capture',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__externalState.starts),2);
 await page.getByRole('button',{name:'Stop audio capture',exact:true}).click();
 await page.getByRole('button',{name:'Start internal audio',exact:true}).waitFor();
 await page.evaluate(()=>{window.__externalState.granted=false;window.__resume();});
 await page.getByRole('heading',{name:'2. Enable notification listening',exact:true}).waitFor();
 await page.getByRole('button',{name:'Restricted settings blocked? Open App info',exact:true}).click();
 await page.getByRole('heading',{name:'1. Allow restricted settings',exact:true}).waitFor();
 for(const theme of ['Dark','Light']){
  await page.getByRole('button',{name:'Close audio sources',exact:true}).click();
  if(!await page.getByRole('tab',{name:'Others',exact:true}).isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('tab',{name:'Others',exact:true}).click();await page.getByRole('button',{name:theme,exact:true}).click();
  const closeSettings=page.getByRole('button',{name:'Close settings',exact:true});if(await closeSettings.isVisible())await closeSettings.click();
  await chooseExternal();
  for(const [width,height] of [[390,844],[800,1280],[1280,800]]){
   await page.setViewportSize({width,height});
   for(const phase of ['restricted','notification','audio']){
    if(phase==='notification'){
     await page.getByRole('button',{name:'Open App info',exact:true}).click();await page.getByRole('button',{name:'I enabled it / it wasn’t required',exact:true}).click();
     await page.getByRole('heading',{name:'2. Enable notification listening',exact:true}).waitFor();
    }else if(phase==='audio'){
     await page.evaluate(()=>{window.__externalState.granted=true;window.__resume();});
     await page.getByRole('heading',{name:'3. Choose an audio source',exact:true}).waitFor();
    }
    await page.locator('.external-setup').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const bounds=await page.locator('.external-setup').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width);
    assert.equal(await page.locator('.external-setup button').evaluateAll(nodes=>nodes.every(node=>{const box=node.getBoundingClientRect();return box.width<=innerWidth&&box.height>=44;})),true);
    await page.screenshot({path:`${shots}/${theme.toLowerCase()}-${width}-${phase}.png`});
   }
   await page.getByRole('button',{name:'Microphone',exact:true}).click();assert.equal(await page.evaluate(()=>window.__externalState.starts),2);
   await page.evaluate(()=>{window.__externalState.granted=false;window.__resume();});
   await page.getByRole('button',{name:'Restricted settings blocked? Open App info',exact:true}).click();
   await page.getByRole('heading',{name:'1. Allow restricted settings',exact:true}).waitFor();
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS browser with native transport fixture: ordered App info → notification access → audio opt-in; denial/retry/stop/revocation; no early audio requests; all three steps at 390/800/1280px in light and dark mode.');
}catch(error){console.error(await page.locator('body').innerText());await page.screenshot({path:`${shots}/failure.png`});throw error;}
finally{await browser.close();await server.close();}
