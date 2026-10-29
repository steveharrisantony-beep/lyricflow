// Runs inside the APK's Node.js runtime, not in the WebView.
const { app, channel } = require('bridge');

let port = null;
let failure = null;
const reportStatus = () => {
  if (port) channel.post('backend-ready', port);
  else if (failure) channel.post('backend-error', failure);
};
channel.on('backend-status', reportStatus);
app.on('pause', lock => lock.release());
app.on('resume', reportStatus);

(async () => {
  const token = process.env.LYRICFLOW_LOCAL_TOKEN;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Missing local service authorization.');
  const { startServer } = await import('./server.mjs');
  const server = await startServer({host: '127.0.0.1', port: 0, apiOnly: true, localToken: token});
  port = server.address().port;
  reportStatus();
})().catch(error => {
  failure = 'The on-device music service could not start. Restart LyricFlow to retry.';
  console.error('Embedded backend startup failed:', error.message);
  reportStatus();
});
