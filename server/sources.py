"""Public catalog adapters. Playback remains a separate, validated extraction step."""
import hashlib
import functools
import requests
import html
import re
import time
from collections import OrderedDict
from urllib.parse import urlparse
import httpx
from ytmusicapi import YTMusic

catalog: OrderedDict[str, tuple[float, dict]] = OrderedDict()
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')


def trusted_page(url, provider):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        return False
    if provider == 'soundcloud':
        return parsed.hostname in ('soundcloud.com', 'www.soundcloud.com') and len(parsed.path.strip('/').split('/')) == 2
    if provider == 'jiosaavn':
        return parsed.hostname in ('jiosaavn.com', 'www.jiosaavn.com') and parsed.path.startswith('/song/')
    return parsed.hostname in ('www.youtube.com', 'music.youtube.com')


def remember(row):
    catalog[row['id']] = (time.monotonic() + 3600, row)
    catalog.move_to_end(row['id'])
    while len(catalog) > 500:
        catalog.popitem(last=False)
    return row


def row_id(provider, url):
    return provider + '_' + hashlib.sha256(url.encode()).hexdigest()[:24]


def music_search(query):
    with requests.Session() as session:
        session.request = functools.partial(session.request, timeout=12)
        rows = YTMusic(requests_session=session).search(query, filter='songs', limit=12)
    result = []
    for entry in rows[:12]:
        video = entry.get('videoId', '')
        if not VIDEO_ID.fullmatch(video) or entry.get('isAvailable') is False:
            continue
        result.append(remember({'id': video, 'provider': 'ytmusic', 'title': entry.get('title', ''),
            'artist': ', '.join(a['name'] for a in entry.get('artists', []) if a.get('name')),
            'album': (entry.get('album') or {}).get('name', ''), 'duration': entry.get('duration_seconds') or 0,
            'sourceUrl': 'https://music.youtube.com/watch?v=' + video}))
    return result


def soundcloud_search(query, extract):
    result = extract('scsearch12:' + query, True) or {}
    rows = []
    for entry in result.get('entries', []):
        if not entry:
            continue
        url = entry.get('webpage_url') or entry.get('url') or ''
        if not trusted_page(url, 'soundcloud'):
            continue
        rows.append(remember({'id': row_id('soundcloud', url), 'provider': 'soundcloud',
            'title': entry.get('track') or entry.get('title') or 'Untitled',
            'artist': entry.get('artist') or entry.get('uploader') or '', 'album': entry.get('album') or '',
            'duration': entry.get('duration') or 0, 'sourceUrl': url}))
    return rows


async def saavn_search(query):
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get('https://www.jiosaavn.com/api.php', headers={
            'Accept': 'application/json', 'Referer': 'https://www.jiosaavn.com/',
            'User-Agent': 'Mozilla/5.0 (compatible; LyricFlow/0.3)'}, params={
            '__call': 'search.getResults', '_format': 'json', '_marker': '0', 'ctx': 'web6dot0', 'n': 12, 'p': 1, 'q': query})
        response.raise_for_status()
        data = response.json()
    rows = []
    for entry in data.get('results', [])[:12]:
        url = entry.get('perma_url', '')
        if not trusted_page(url, 'jiosaavn'):
            continue
        more = entry.get('more_info') or {}
        artists = (more.get('artistMap') or {}).get('primary_artists', [])
        artist = entry.get('primary_artists') or ', '.join(a.get('name', '') for a in artists)
        rows.append(remember({'id': row_id('jiosaavn', url), 'provider': 'jiosaavn',
            'title': html.unescape(entry.get('song') or entry.get('title') or 'Untitled'),
            'artist': html.unescape(artist), 'album': html.unescape(entry.get('album') or more.get('album') or ''),
            'duration': float(entry.get('duration') or more.get('duration') or 0), 'sourceUrl': url}))
    return rows


def trusted_media(url):
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ''
        return parsed.scheme == 'https' and not parsed.username and not parsed.password and parsed.port in (None, 443) and any(
            host.endswith('.' + domain) for domain in ('googlevideo.com', 'sndcdn.com', 'saavncdn.com'))
    except ValueError:
        return False
