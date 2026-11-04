import assert from 'node:assert/strict';

process.env.LYRICFLOW_EMBEDDED = '1';
const originalFetch = globalThis.fetch;
const sample = new Uint8Array([1, 2, 3, 4]);
let rangeForwarded = false;
let captionRequests=0;
let youtubeSearchRequests=0;
const backgroundTitle='Apna Bana Le - Bhediya';
const backgroundArtist='Sachin-Jigar';
const backgroundFeaturedArtist='Guest One';
const backgroundQuery=`${backgroundTitle} ${backgroundArtist} ${backgroundFeaturedArtist} video`;
const backgroundIds=['ElZfdU54Cp8',...Array.from({length:21},(_,i)=>`bg${String(i).padStart(9,'0')}`)];
const lookedUpBackgroundIds=[];
let wordLyricsAvailable=false,wordLookupCount=0;
let completeAccountCheck;
const verifiedAccount = {actions:[{openPopupAction:{popup:{multiPageMenuRenderer:{header:{
  activeAccountHeaderRenderer:{accountName:{runs:[{text:'Fixture account'}]}}
}}}}}]};
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if(url.hostname==='lrc.red'&&url.pathname==='/search.json'){
    wordLookupCount++;
    return Response.json({hits:wordLyricsAvailable?[{isrc:'TEST00000001'}]:[]});
  }
  if(url.hostname==='lrc.red'&&url.pathname==='/s/TEST00000001.json'){
    return Response.json({isrc:'TEST00000001',title:'Example Song',artist:'Example Artist',duration:180,sync:'word'});
  }
  if(url.hostname==='lrc.red'&&url.pathname.endsWith('.ttml')){
    return new Response('<tt><body><p begin="1s" end="3s"><span begin="1s" end="2s">Example </span><span begin="2s" end="3s">words</span></p></body></tt>');
  }
  if(url.hostname==='lyrics-storage.binimum.org')return new Response('',{status:404});
  if(url.hostname==='musicbrainz.org')return Response.json({recordings:[]});
  if(url.hostname==='itunes.apple.com')return Response.json({results:[{trackId:123,trackName:'Example Song',artistName:'Example Artist',trackTimeMillis:180000}]});
  if(url.hostname==='lyrics.paxsenix.org')return new Response('<tt><body><p begin="1s" end="3s">Example line lyrics</p></body></tt>');
  if (url.hostname === 'www.jiosaavn.com' && url.searchParams.get('__call') === 'search.getResults') {
    return Response.json({results: [{id: 'fixture', title: 'Example Song', more_info: {
      encrypted_media_url: 'fixture-token', duration: 180, album: 'Example Album',
      artistMap: {
        primary_artists: [{name: 'Example Artist'},{name: 'Second Artist'}],
        featured_artists: [{name: 'Guest One'},{name: 'Guest Two'}],
      },
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
  if(url.hostname==='music.youtube.com'&&url.pathname==='/youtubei/v1/search'){
    return Response.json({contents:[]});
  }
  if(url.hostname==='music.youtube.com'&&url.pathname==='/youtubei/v1/account/account_menu'){
    const cookie=options?.headers?.Cookie||'';
    if(cookie==='SAPISID=slow-fixture') return new Promise(resolve=>{completeAccountCheck=()=>resolve(Response.json(verifiedAccount));});
    if(cookie==='SAPISID=outage-fixture') throw new Error('Fixture network outage');
    return Response.json(cookie==='SAPISID=valid-fixture'?verifiedAccount:{actions:[]});
  }
  if(url.hostname==='www.youtube.com'&&url.pathname==='/watch'){
    if(url.searchParams.get('v')==='blocked1234')return new Response('',{status:403});
    return new Response('"INNERTUBE_API_KEY":"fixture-key"; var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:url.searchParams.get('v')},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v='+url.searchParams.get('v')+'&fmt=srv3',vssId:'.en',languageCode:'en',name:{runs:[{text:'English [CC]'}]}}]}}})+';');
  }
  if(url.hostname==='www.youtube.com'&&url.pathname==='/youtubei/v1/player'){
    const {videoId}=JSON.parse(options.body);
    if(backgroundIds.includes(videoId)){
      lookedUpBackgroundIds.push(videoId);
      return Response.json({playabilityStatus:{status:'OK',playableInEmbed:true},videoDetails:{
        videoId, title:'Apna Bana Le | Sachin-Jigar | Bhediya', author:'Music label', channelId:'UCbackground',
        lengthSeconds:'30', viewCount:videoId==='ElZfdU54Cp8'?'629000000':'1000',
      }});
    }
    return Response.json({videoDetails:{videoId},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v='+videoId+'&fmt=srv3',vssId:'.en',languageCode:'en',name:{runs:[{text:'English [CC]'}]}}]}}});
  }
  if(url.hostname==='www.youtube.com'&&url.pathname==='/api/timedtext'){
    captionRequests++;
    const cookie=options?.headers?.Cookie||'';
    return new Response('<transcript><text start="1">Original fixture '+(cookie==='session=fixture'?'first':'second')+'</text><text start="3">Another test line</text></transcript>');
  }
  if(url.hostname==='www.youtube.com'&&url.pathname==='/youtubei/v1/search'){
    youtubeSearchRequests++;
    const {query}=JSON.parse(options.body);
    if(query===backgroundQuery){
      return Response.json({contents:['invalid',...backgroundIds].map(videoId=>({videoRenderer:{
        videoId,
        title:{simpleText:videoId==='invalid'?'Apna malformed result':'Apna Bana Le Official Audio Visualizer'},
        lengthText:{simpleText:'0:30'},
      }}))});
    }
    return Response.json({
      contents:{
        twoColumnSearchResultsRenderer:{
          primaryContents:{
            sectionListRenderer:{
              contents:[{
                itemSectionRenderer:{
                  contents:[
                    {
                      videoRenderer:{
                        videoId:'topicVid123',
                        title:{runs:[{text:'Run It Up'}]},
                        ownerText:{runs:[{text:'Hanumankind'}]},
                        ownerBadges:[{metadataBadgeRenderer:{style:'BADGE_STYLE_TYPE_VERIFIED_ARTIST'}}],
                        lengthText:{simpleText:'2:54'},
                        detailedMetadataSnippets:[{snippetText:{runs:[{text:'Provided to YouTube by Universal Music Group · Run It Up · Hanumankind · Auto-generated by YouTube.'}]}}]
                      }
                    },
                    {
                      videoRenderer:{
                        videoId:'realOmv1234',
                        title:{runs:[{text:'Hanumankind - Run It Up ( Prod. By Kalmi ) | (Official Music Video)'}]},
                        ownerText:{runs:[{text:'Hanumankind'}]},
                        ownerBadges:[{metadataBadgeRenderer:{style:'BADGE_STYLE_TYPE_VERIFIED_ARTIST'}}],
                        lengthText:{simpleText:'3:13'}
                      }
                    }
                  ]
                }
              }]
            }
          }
        }
      }
    });
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
  assert.equal((await request('/music/lyrics-stage?provider=invalid&title=Example')).status,400);
  for (const source of ['musixmatch', 'kugou', 'boidu']) {
    assert.equal((await request('/music/lyrics-stage?provider=' + source + '&title=Example')).status, 400);
    assert.equal((await request('/music/lyrics?source=' + source + '&title=Example')).status, 400);
  }
  assert.equal((await originalFetch(base+'/music/lyrics-stage?provider=lrclib&title=Example')).status,403);
  wordLyricsAvailable=true;
  const stage = await request('/music/lyrics-stage?provider=isrc&title=Example+Song&duration=180');
  assert.equal(stage.status,200);
  assert.equal(stage.headers.get('cache-control'),'no-store');
  const stageResult=await stage.json();
  assert.equal(stageResult.candidates[0].title,'Example Song');
  assert.equal(stageResult.candidates[0].duration,180);
  assert.ok(stageResult.candidates[0].ttml.includes('Example'));
  assert.deepEqual(stageResult.failures,[]);
  const manualLyrics = await request('/music/apple-candidates?title=example+song&artist=Example+Artist&duration=181');
  assert.equal(manualLyrics.status,200);
  const manualIsrc = (await manualLyrics.json()).candidates.find(candidate => candidate.id === -1001);
  assert.equal(manualIsrc.title,'Example Song');
  assert.equal(manualIsrc.duration,180);
  wordLyricsAvailable=false;

  const setYouTubeAuth = (credentials) => originalFetch(base+'/music/yt-auth', {
    method:'POST',headers:{'X-LyricFlow-Token':token,'Content-Type':'application/json'},body:JSON.stringify(credentials),
  });
  const guestAuth = await setYouTubeAuth({cookie:'VISITOR_INFO1_LIVE=guest-fixture'});
  assert.equal(guestAuth.status,401);
  assert.equal((await guestAuth.json()).authenticated,false);
  const connected = await setYouTubeAuth({cookie:'SAPISID=valid-fixture'});
  assert.equal(connected.status,200);
  const connection = await connected.json();
  assert.equal(connection.verified,true);
  assert.equal(connection.accountLabel,'Fixture account');
  assert.equal('cookie' in connection,false,'Never echo session credentials');
  assert.equal(connected.headers.get('cache-control'),'no-store');
  assert.equal((await setYouTubeAuth({cookie:'SAPISID=expired-fixture'})).status,401);
  assert.equal((await (await request('/music/yt-auth')).json()).authenticated,false,'Invalid credentials clear an earlier connection');
  assert.equal((await setYouTubeAuth({cookie:'SAPISID=outage-fixture'})).status,502);
  const slowCheck = setYouTubeAuth({cookie:'SAPISID=slow-fixture'});
  for(let i=0;i<100&&!completeAccountCheck;i++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(completeAccountCheck,'Verification must start');
  assert.equal((await (await setYouTubeAuth({cookie:'',accessToken:''})).json()).authenticated,false);
  completeAccountCheck();
  assert.equal((await slowCheck).status,409,'Late validation cannot undo a disconnect');
  assert.equal((await (await request('/music/yt-auth')).json()).authenticated,false);
  const search = await (await request('/music/search?q=example&provider=jiosaavn')).json();
  assert.equal(search.data[0].id, 'saavn_fixture');
  assert.equal(search.data[0].primaryArtist,'Example Artist');
  assert.equal(search.data[0].featuredArtist,'Guest One');
  const ytSearch = await (await request('/music/search?q=Run+It+Up+Hanumankind+Official+Video&provider=youtube')).json();
  const topicItem = ytSearch.data.find(d => d.youtubeVideoId === 'topicVid123');
  const omvItem = ytSearch.data.find(d => d.youtubeVideoId === 'realOmv1234');
  assert.equal(topicItem.videoType, 'ATV');
  assert.equal(topicItem.artist, 'Hanumankind - Topic');
  assert.equal(topicItem.album, 'Audio Track');
  assert.equal(omvItem.videoType, 'UGC'); // Title inference cannot establish the actual video type.
  const videoQuery = '/music/search?q=Run+It+Up&provider=youtube';
  assert.ok((await (await request(videoQuery)).json()).data.length);
  const afterPreload = youtubeSearchRequests;
  await request(videoQuery);
  assert.equal(youtubeSearchRequests, afterPreload, 'Ordinary searches reuse cached results');
  for (let attempt = 1; attempt <= 2; attempt++) {
    const online = await request(videoQuery + '&refresh=1');
    assert.equal(online.headers.get('cache-control'), 'no-store');
    assert.ok((await online.json()).data.length);
    assert.equal(youtubeSearchRequests, afterPreload + attempt, 'Each online search must query YouTube again');
  }
  const beforeBackgroundSearch = youtubeSearchRequests;
  const backgroundParams = new URLSearchParams({
    q:backgroundQuery,provider:'youtube',backgroundTitle,backgroundArtist,backgroundFeaturedArtist,
  });
  const backgrounds = await (await request('/music/search?'+backgroundParams)).json();
  assert.equal(youtubeSearchRequests,beforeBackgroundSearch+1,'Automatic matching uses one query with both artist credits');
  assert.deepEqual([...lookedUpBackgroundIds].sort(),backgroundIds.slice(0,19).sort(),'The first twenty ranks include malformed rows and later rows are not probed');
  assert.equal(backgrounds.data[0].title,'Apna malformed result');
  assert.equal(backgrounds.data[0].youtubeVideoId,undefined);
  assert.deepEqual(backgrounds.data.slice(1).map(video=>video.youtubeVideoId),backgroundIds);
  assert.equal(backgrounds.data[1].viewCount,629000000);
  assert.equal(backgrounds.data.at(-1).duration,30);
  assert.equal(backgrounds.data.at(-1).videoType,'UGC','Title words must not invent an audio-only classification');
  const resolved = await (await request('/music/resolve/saavn_fixture')).json();
  assert.equal(resolved.format, 'audio');
  assert.equal(resolved.track.primaryArtist,'Example Artist');
  assert.equal(resolved.track.featuredArtist,'Guest One');
  const audio = await request('/music' + resolved.streamPath, {Range: 'bytes=0-3'});
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-range'), 'bytes 0-3/4');
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), sample);
  assert.ok(rangeForwarded);
  const lyrics = await (await request('/music/lyrics?title=Example%20Song&artist=Example%20Artist&duration=180&source=lrclib')).json();
  assert.ok(lyrics.lrc.includes('Example test line'));
  const wordQuery='/music/lyrics?title=Example%20Song&artist=Example%20Artist&duration=180&source=apple';
  const lineFallback=await request(wordQuery);
  assert.equal(lineFallback.headers.get('cache-control'),'no-store');
  assert.equal((await lineFallback.json()).hasWordSync,false);
  const previousLookups=wordLookupCount;
  wordLyricsAvailable=true;
  assert.equal((await (await request(wordQuery)).json()).hasWordSync,false);
  assert.equal(wordLookupCount,previousLookups,'Initial cached fallback should still be available immediately');
  const upgraded=await (await request(wordQuery+'&refresh=1')).json();
  assert.equal(upgraded.hasWordSync,true);
  assert.ok(upgraded.source.includes('lrc.red'));
  assert.equal(wordLookupCount,previousLookups+1,'A retry must bypass the cached line fallback');
  assert.equal((await (await request(wordQuery)).json()).hasWordSync,true,'Cache must retain the preferred word timestamps');
  wordLyricsAvailable=false;
  assert.equal((await (await request(wordQuery+'&refresh=1')).json()).hasWordSync,true,'A temporary provider failure must not downgrade cached word lyrics');
  const captions=await (await request('/music/yt-subtitles?videoId=abcdefghijk',{'X-YouTube-Cookie':'session=fixture'})).json();
  assert.ok(captions.lrc.includes('fixture first'));
  assert.equal(captions.subtitleTracks[0].isAutoGenerated,false);
  const privateCaptions=await (await request('/music/yt-subtitles?videoId=abcdefghijk',{'X-YouTube-Cookie':'session=other'})).json();
  assert.ok(privateCaptions.lrc.includes('fixture second'));
  assert.equal(captionRequests,2,'Caption cache must be partitioned by account credentials');
  const blocked=await request('/music/yt-subtitles?videoId=blocked1234');
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).code,'restricted');
  console.log('Embedded backend passed: loopback binding, authorization, routes, verified YouTube authentication, search, resolution, Range audio streaming, and timed lyrics.');
} finally {
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}


