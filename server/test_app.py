"""Contract tests with synthetic metadata; no third-party recordings are fetched."""
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from server import app as module


class ResolverContracts(unittest.TestCase):
    def setUp(self):
        module.requests.clear()
        module.streams.clear()
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


if __name__ == '__main__':
    unittest.main()
