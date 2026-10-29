import {Capacitor, registerPlugin, type PluginListenerHandle} from '@capacitor/core';
import {Nodejs} from '@capawesome/capacitor-nodejs';

const LocalBackend = registerPlugin<{
  prepare(): Promise<{token: string; port: number}>;
  attach(options: {port: number}): Promise<void>;
}>('LocalBackend');

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
