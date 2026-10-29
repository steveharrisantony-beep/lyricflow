"""Contract tests with synthetic metadata; no third-party recordings are fetched."""
import unittest
from unittest.mock import patch, AsyncMock
import time
import httpx
from server import sources
from fastapi.testclient import TestClient
from server import app as module


class ResolverContracts(unittest.TestCase):
    def setUp(self):
        module.requests.clear()
        module.streams.clear()
        sources.catalog.clear()
        self.client = TestClient(module.app)

    def test_health_does_not_require_credentials(self):
        self.assertEqual(self.client.get('/health').json()['cookies'], False)

    def test_invalid_ids_never_reach_extractor(self):
        with patch.object(module, 'extract') as extractor:
            self.assertEqual(self.client.get('/resolve/bad').status_code, 400)
            extractor.assert_not_called()

    def test_search_normalizes_metadata(self):
        with patch.object(module, 'extract', return_value={'entries': [
            {'id': 'abcdefghijk', 'title': 'Test Artist - Original rain', 'duration': 180},
            {'id': 'invalid', 'title': 'reject'},
        ]}):
            rows = self.client.get('/search?q=Original+rain').json()['data']
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['artist'], 'Test Artist')
            self.assertEqual(rows[0]['title'], 'Original rain')

    def test_resolver_only_stores_validated_source_urls(self):
        with patch.object(module, 'extract', return_value={'url': 'https://r1.example.googlevideo.com/test', 'track': 'Original rain', 'artist': 'Test Artist', 'duration': 180}):
            response = self.client.get('/resolve/abcdefghijk')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['streamPath'], '/audio/abcdefghijk')
            self.assertEqual(response.json()['track']['artist'], 'Test Artist')
        with patch.object(module, 'extract', return_value={'url': 'http://127.0.0.1/private'}):
            self.assertEqual(self.client.get('/resolve/abcdefghijk').status_code, 502)

    def test_restricted_source_and_unresolved_stream_fail_safely(self):
        with patch.object(module, 'extract', return_value={'has_drm': True}):
            self.assertEqual(self.client.get('/resolve/abcdefghijk').status_code, 422)
        self.assertEqual(self.client.get('/audio/abcdefghijk').status_code, 410)

    def test_rate_limit(self):
        with patch.object(module, 'extract', return_value={'entries': []}):
            for _ in range(20):
                self.assertEqual(self.client.get('/search?q=test').status_code, 200)
            self.assertEqual(self.client.get('/search?q=test').status_code, 429)

    def test_cors_requires_configured_origin(self):
        good = self.client.get('/health', headers={'Origin': 'http://localhost:5173'})
        self.assertEqual(good.headers['access-control-allow-origin'], 'http://localhost:5173')
        bad = self.client.get('/health', headers={'Origin': 'https://untrusted.example'})
        self.assertNotIn('access-control-allow-origin', bad.headers)

    def test_youtube_music_search_preserves_song_metadata(self):
        with patch.object(sources, 'YTMusic') as api:
            api.return_value.search.return_value = [{'videoId': 'abcdefghijk', 'title': 'Rain', 'artists': [{'name': 'Artist'}], 'duration_seconds': 182, 'album': {'name': 'Album'}}]
            result = self.client.get('/search?q=Rain&provider=ytmusic')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['data'][0]['artist'], 'Artist')
            api.return_value.search.assert_called_once_with('Rain', filter='songs', limit=12)

    def test_soundcloud_uses_search_registered_page_only(self):
        with patch.object(module, 'extract', return_value={'entries': [{'id': '1', 'title': 'Rain', 'url': 'https://soundcloud.com/test/rain', 'uploader': 'Artist'}]}):
            row = self.client.get('/search?q=Rain&provider=soundcloud').json()['data'][0]
        with patch.object(module, 'extract', return_value={'url': 'https://cf-hls-media.sndcdn.com/test/playlist.m3u8', 'protocol': 'm3u8_native', 'duration': 180}) as extract:
            result = self.client.get('/resolve/' + row['id'])
            self.assertEqual(result.json()['format'], 'hls')
            self.assertEqual(result.json()['track']['artist'], 'Artist')
            extract.assert_called_once_with('https://soundcloud.com/test/rain')

    def test_saavn_adapter_and_expired_search_token(self):
        row = {'id': 'jiosaavn_test', 'provider': 'jiosaavn', 'title': 'Rain', 'artist': 'Artist', 'duration': 180, 'sourceUrl': 'https://www.jiosaavn.com/song/rain/abcdef'}
        sources.remember(row)
        with patch.object(sources, 'saavn_search', new=AsyncMock(return_value=[row])):
            self.assertEqual(self.client.get('/search?q=Rain&provider=jiosaavn').json()['data'][0], row)
        with patch.object(module, 'extract', return_value={'url': 'https://aac.saavncdn.com/test.m4a'}):
            self.assertEqual(self.client.get('/resolve/jiosaavn_test').status_code, 200)
        sources.catalog[row['id']] = (0, row)
        with patch.object(module, 'extract') as extract:
            self.assertEqual(self.client.get('/resolve/jiosaavn_test').status_code, 400)
            extract.assert_not_called()

    def test_saavn_search_normalizes_public_catalog_response(self):
        import asyncio
        response = httpx.Response(200, json={'results': [{'id': 'one', 'title': 'Rain &amp; Light', 'perma_url': 'https://www.jiosaavn.com/song/rain/abc', 'more_info': {'duration': '182', 'album': 'Demo', 'artistMap': {'primary_artists': [{'name': 'Artist'}]}}}]}, request=httpx.Request('GET', 'https://www.jiosaavn.com/api.php'))
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.get.return_value = response
        with patch.object(sources.httpx, 'AsyncClient', return_value=client):
            rows = asyncio.run(sources.saavn_search('Rain'))
        self.assertEqual(rows[0]['title'], 'Rain & Light')
        self.assertEqual(rows[0]['artist'], 'Artist')
        self.assertEqual(rows[0]['duration'], 182)
        self.assertEqual(client.get.call_args.kwargs['params']['q'], 'Rain')

    def test_hls_resources_are_rewritten_and_untrusted_hosts_rejected(self):
        body = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n'
        result = module.rewrite_playlist(body, 'https://cf-hls-media.sndcdn.com/music/list.m3u8', time.monotonic()+900)
        self.assertNotIn('key.bin', result)
        self.assertNotIn('segment.ts', result)
        self.assertEqual(len(module.streams), 2)
        self.assertTrue(all(sources.trusted_media(v[1]) for v in module.streams.values()))
        for bad in ['http://127.0.0.1/a', 'https://sndcdn.com.evil.example/a', 'https://u:p@aac.saavncdn.com/a']:
            self.assertFalse(sources.trusted_media(bad))
            with self.assertRaises(module.HTTPException):
                module.rewrite_playlist('#EXTM3U\n'+bad, 'https://cf-hls-media.sndcdn.com/a', 999999)

    def test_audio_proxy_forwards_range_and_streams_bytes(self):
        module.streams['test'] = (time.monotonic()+900, 'https://aac.saavncdn.com/test.m4a')
        upstream = httpx.Response(206, content=b'abcd', headers={'Content-Range': 'bytes 0-3/20', 'Content-Type': 'audio/mp4'})
        upstream.aiter_raw = lambda: self.raw_chunks()
        client = AsyncMock()
        client.build_request = lambda method, url, headers: httpx.Request(method, url, headers=headers)
        client.send.return_value = upstream
        with patch.object(module.httpx, 'AsyncClient', return_value=client):
            response = self.client.get('/audio/test', headers={'Range': 'bytes=0-3'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b'abcd')
        self.assertEqual(response.headers['content-range'], 'bytes 0-3/20')
        self.assertEqual(client.send.call_args.args[0].headers['range'], 'bytes=0-3')
        client.aclose.assert_awaited_once()

    @staticmethod
    async def raw_chunks():
        yield b'abcd'


if __name__ == '__main__':
    unittest.main()
