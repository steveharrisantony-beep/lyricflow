import {Capacitor, CapacitorHttp, registerPlugin, type PluginListenerHandle} from '@capacitor/core';
import {Nodejs} from '@capawesome/capacitor-nodejs';

const LocalBackend = registerPlugin<{
  prepare(): Promise<{token: string; port: number}>;
  attach(options: {port: number}): Promise<void>;
}>('LocalBackend');

/** The WebView proxy handles streams, while native HTTP carries JSON request bodies. */
export async function backendRequest(address:string,options:RequestInit):Promise<Response>{
  if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')return fetch(address,options);
  const url=new URL(address,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/music/'))throw new Error('Invalid on-device service address.');
  options.signal?.throwIfAborted();
  const {token,port}=await LocalBackend.prepare();
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('The on-device music service is not ready.');
  options.signal?.throwIfAborted();
  const headers=new Headers(options.headers);
  headers.set('X-LyricFlow-Token',token);
  const reply=await CapacitorHttp.request({
    url:`http://127.0.0.1:${port}${url.pathname}${url.search}`,
    method:options.method||'POST',
    headers:Object.fromEntries(headers),
    data:typeof options.body==='string'?JSON.parse(options.body):undefined,
    responseType:'json',connectTimeout:5000,readTimeout:15000,disableRedirects:true,
  });
  options.signal?.throwIfAborted();
  return new Response(reply.status===204?null:JSON.stringify(reply.data),{status:reply.status,headers:reply.headers});
}

/** Start once per process, recover the existing runtime after a WebView reload. */
export async function initializeEmbeddedBackend(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const {token, port: existingPort} = await LocalBackend.prepare();
  if (existingPort > 0) return;
  let listener: PluginListenerHandle | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('The on-device music service did not start. Restart LyricFlow to retry.')), 30000);
      void (async () => {
        listener = await Nodejs.addListener('message', event => {
          if (event.eventName === 'backend-error') {
            reject(new Error(String(event.args?.[0] || 'On-device music service unavailable.')));
          } else if (event.eventName === 'backend-ready') {
            const port = event.args?.[0];
            if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
              reject(new Error('The on-device music service returned an invalid address.'));
              return;
            }
            void LocalBackend.attach({port}).then(resolve, reject);
          }
        });
        if ((await Nodejs.isReady()).ready) {
          await Nodejs.send({eventName: 'backend-status'});
        } else {
          await Nodejs.start({env: {NODE_ENV: 'production', LYRICFLOW_EMBEDDED: '1', LYRICFLOW_LOCAL_TOKEN: token}});
        }
      })().catch(reject);
    });
  } finally {
    clearTimeout(timeout);
    await listener?.remove();
  }
}
