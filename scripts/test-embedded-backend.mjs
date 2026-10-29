import assert from 'node:assert/strict';

process.env.LYRICFLOW_EMBEDDED = '1';
const originalFetch = globalThis.fetch;
const sample = new Uint8Array([1, 2, 3, 4]);
let rangeForwarded = false;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.hostname === 'www.jiosaavn.com' && url.searchParams.get('__call') === 'search.getResults') {
    return Response.json({results: [{id: 'fixture', title: 'Example Song', more_info: {
      encrypted_media_url: 'fixture-token', duration: 180, album: 'Example Album',
      artistMap: {primary_artists: [{name: 'Example Artist'}]},
    }}]});
  }
  if (url.hostname === 'www.jiosaavn.com' && url.searchParams.get('__call') === 'song.generateAuthToken') {
    return Response.json({auth_url: 'https://aac.saavncdn.com/example_320.mp4'});
  }
  if (url.hostname === 'aac.saavncdn.com') {
    rangeForwarded ||= options?.headers?.Range === 'bytes=0-3';
    return new Response(sample, {status: 206, headers: {
      'Content-Type': 'audio/mp4', 'Content-Length': '4', 'Content-Range': 'bytes 0-3/4', 'Accept-Ranges': 'bytes',
    }});
  }
  if (url.hostname === 'lrclib.net') {
    return Response.json({id: 42, trackName: 'Example Song', artistName: 'Example Artist',
      albumName: 'Example Album', duration: 180, syncedLyrics: '[00:01.00]Example test line'});
  }
  throw new Error('Unexpected external request in isolated backend test: ' + url.hostname);
};

const {startServer} = await import('../dist/nodejs/server.mjs');
const token = 'a'.repeat(64);
const server = await startServer({host: '127.0.0.1', port: 0, apiOnly: true, localToken: token});
const base = `http://127.0.0.1:${server.address().port}`;
const request = (path, headers = {}) => originalFetch(base + path, {headers: {'X-LyricFlow-Token': token, ...headers}});
try {
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal((await originalFetch(base + '/music/health')).status, 403);
  assert.equal((await request('/music/health', {'X-LyricFlow-Token': 'wrong'})).status, 403);
  const health = await (await request('/music/health')).json();
  assert.ok(health.providers.includes('jiosaavn'));
  assert.ok(health.lyricsSources.includes('youtube-subtitles'));
  assert.equal((await request('/')).status, 404);
  assert.equal((await request('/music/yt-subtitles?videoId=invalid')).status, 400);
  assert.equal((await request('/music/lyrics?title=')).status, 400);
  const search = await (await request('/music/search?q=example&provider=jiosaavn')).json();
  assert.equal(search.data[0].id, 'saavn_fixture');
  const resolved = await (await request('/music/resolve/saavn_fixture')).json();
  assert.equal(resolved.format, 'audio');
  const audio = await request('/music' + resolved.streamPath, {Range: 'bytes=0-3'});
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-range'), 'bytes 0-3/4');
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), sample);
  assert.ok(rangeForwarded);
  const lyrics = await (await request('/music/lyrics?title=Example%20Song&artist=Example%20Artist&duration=180&source=lrclib')).json();
  assert.ok(lyrics.lrc.includes('Example test line'));
  console.log('Embedded backend passed: loopback binding, authorization, routes, search, resolution, Range audio streaming, and timed lyrics.');
} finally {
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
