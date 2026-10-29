"""Optional public-audio resolver. No login cookies, DRM handling, or arbitrary URL proxy.

The frontend can run without this service. Only play recordings you are authorized
 to access and visualize; a searchable result is not a grant of rights.
"""
import asyncio
import hashlib
import os
import re
import time
from collections import OrderedDict, deque
from urllib.parse import urlparse, urljoin

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
try:
    from . import sources
except ImportError:
    import sources

app = FastAPI(title="LyricFlow music resolver")
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"],
                   allow_headers=["Range"], expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"])
slots = asyncio.Semaphore(2)
streams: OrderedDict[str, tuple[float, str]] = OrderedDict()
requests: OrderedDict[str, deque] = OrderedDict()
ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def throttle(request: Request):
    # Client address comes from ASGI, never a caller-supplied forwarding header.
    address = request.client.host if request.client else "unknown"
    now = time.monotonic()
    history = requests.setdefault(address, deque())
    while history and now - history[0] > 60:
        history.popleft()
    if len(history) >= 20:
        raise HTTPException(429, "Too many resolver requests. Retry in a minute.")
    history.append(now)
    requests.move_to_end(address)
    while len(requests) > 2000:
        requests.popitem(last=False)


def extract(target, flat=False):
    options = {"quiet": True, "no_warnings": True, "skip_download": True,
               "extract_flat": flat, "noplaylist": True, "socket_timeout": 12,
               "retries": 1, "extractor_retries": 1, "js_runtimes": {"node": {}},
               # Native M4A audio avoids server-side transcoding/ffmpeg.
               "format": "bestaudio[protocol=https][ext=m4a]/bestaudio[protocol=https][ext=mp3]/bestaudio[protocol=https]/bestaudio"}
    with yt_dlp.YoutubeDL(options) as client:
        return client.extract_info(target, download=False)


@app.get("/health")
def health():
    return {"status": "ok", "providers": ["ytmusic", "soundcloud", "jiosaavn", "youtube"], "cookies": False}


@app.get("/search")
async def search(request: Request, q: str = Query(min_length=2, max_length=180), provider: str = "youtube"):
    throttle(request)
    # ytsearch text is passed as data to yt-dlp, never a shell command or URL.
    if not q.strip() or any(ord(c) < 32 for c in q):
        raise HTTPException(400, "Enter a song or artist")
    if provider not in ('youtube', 'ytmusic', 'soundcloud', 'jiosaavn'):
        raise HTTPException(400, "Unknown music source")
    if provider != 'youtube':
        async with slots:
            try:
                if provider == 'ytmusic':
                    data = await asyncio.to_thread(sources.music_search, q.strip())
                elif provider == 'soundcloud':
                    data = await asyncio.to_thread(sources.soundcloud_search, q.strip(), extract)
                else:
                    data = await sources.saavn_search(q.strip())
                return {"data": data}
            except Exception:
                raise HTTPException(502, f"{provider} is unavailable. Choose another source or retry shortly.")
    async with slots:
        try:
            result = await asyncio.to_thread(extract, "ytsearch12:" + q.strip(), True)
        except Exception:
            raise HTTPException(502, "Search source unavailable; retry or use another source")
    data = []
    for entry in (result or {}).get("entries", []):
        if not entry or not ID.fullmatch(entry.get("id", "")) or entry.get("is_live"):
            continue
        title = entry.get("track") or entry.get("title") or "Untitled"
        artist = entry.get("artist") or ""
        # Search metadata is sometimes a video title. Preserve it rather than
        # labelling the uploader as a verified recording artist.
        if not artist and " - " in title:
            artist, title = title.split(" - ", 1)
        data.append({"id": entry["id"], "title": title, "artist": artist,
                     "album": entry.get("album") or "", "duration": entry.get("duration") or 0,
                     "sourceUrl": "https://www.youtube.com/watch?v=" + entry["id"]})
    return {"data": data}


@app.get("/resolve/{track_id}")
async def resolve(request: Request, track_id: str):
    throttle(request)
    saved = sources.catalog.get(track_id)
    row = saved[1] if saved and saved[0] > time.monotonic() else None
    if not ID.fullmatch(track_id) and row is None:
        raise HTTPException(400, "Search again: this source ID is invalid or expired")
    target = row['sourceUrl'] if row else "https://www.youtube.com/watch?v=" + track_id
    async with slots:
        try:
            info = await asyncio.to_thread(extract, target)
        except Exception:
            raise HTTPException(502, "This recording cannot be resolved. No login or restricted-content bypass is supported.")
    if not info or info.get("is_live") or info.get("has_drm"):
        raise HTTPException(422, "A finite, unrestricted audio recording is required")
    url = info.get("url", "")
    if not sources.trusted_media(url):
        raise HTTPException(502, "Source did not return a supported audio stream")
    streams[track_id] = (time.monotonic() + 900, url)
    streams.move_to_end(track_id)
    while len(streams) > 4000:
        streams.popitem(last=False)
    return {"streamPath": "/audio/" + track_id, "format": "hls" if 'm3u8' in (info.get('protocol', '') + url) else "audio", "track": {
        "id": track_id, "provider": row['provider'] if row else 'resolver',
        "title": (row or {}).get('title') or info.get("track") or info.get("title") or "Untitled",
        "artist": (row or {}).get('artist') or info.get("artist") or ', '.join(info.get('artists') or []) or "",
        "album": (row or {}).get('album') or info.get("album") or "",
        "duration": info.get("duration") or (row or {}).get('duration') or 0,
        "sourceUrl": target}}


@app.get("/audio/{track_id}")
async def audio(request: Request, track_id: str):
    cached = streams.get(track_id)
    if not cached or cached[0] < time.monotonic():
        streams.pop(track_id, None)
        raise HTTPException(410, "Stream expired; select the song again")
    headers = {}
    byte_range = request.headers.get("range")
    if byte_range:
        if not re.fullmatch(r"bytes=\d*-\d*", byte_range) or byte_range == "bytes=-":
            raise HTTPException(416, "Invalid byte range")
        headers["Range"] = byte_range
    # Only URLs produced by the validated resolver above can reach this route.
    # Refuse redirects so the service cannot become an arbitrary URL proxy.
    client = httpx.AsyncClient(timeout=httpx.Timeout(25, read=45), follow_redirects=False)
    try:
        response = await client.send(client.build_request("GET", cached[1], headers=headers), stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(502, "Audio source unavailable")
    if response.status_code not in (200, 206):
        await response.aclose()
        await client.aclose()
        raise HTTPException(502, "Audio link expired or source rejected playback; select the song again")
    content_type = response.headers.get('content-type', '')
    if 'mpegurl' in content_type.lower() or '.m3u8' in urlparse(cached[1]).path:
        try:
            body = (await response.aread()).decode('utf-8')
            body = rewrite_playlist(body, cached[1], cached[0])
        finally:
            await response.aclose()
            await client.aclose()
        return Response(body, media_type='application/vnd.apple.mpegurl')
    async def chunks():
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()
    forwarded = {k: response.headers[k] for k in ("content-length", "content-range", "accept-ranges") if k in response.headers}
    return StreamingResponse(chunks(), status_code=response.status_code,
                             media_type=response.headers.get("content-type", "audio/mp4"), headers=forwarded)


def rewrite_playlist(body, origin, expires):
    """Rewrite HLS media/key URLs into bounded, trusted proxy tokens (relative to /audio)."""
    if not body.startswith('#EXTM3U') or len(body) > 2_000_000:
        raise HTTPException(502, 'Invalid audio playlist')
    def register(value):
        url = urljoin(origin, value)
        if not sources.trusted_media(url):
            raise HTTPException(502, 'Unsupported playlist resource')
        token = 'segment_' + hashlib.sha256(url.encode()).hexdigest()[:32]
        streams[token] = (expires, url)
        streams.move_to_end(token)
        return token
    lines = []
    for line in body.splitlines():
        if line.startswith('#'):
            line = re.sub(r'URI="([^"]+)"', lambda m: 'URI="' + register(m[1]) + '"', line)
        elif line.strip():
            line = register(line.strip())
        lines.append(line)
    while len(streams) > 4000:
        streams.popitem(last=False)
    return '\n'.join(lines) + '\n'
