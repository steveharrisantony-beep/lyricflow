# Optional music resolver

LyricFlow's browser client cannot execute Stash's Android yt-dlp resolver.
This independent FastAPI service provides the same search → resolve → player-clock
architecture for public YouTube Music, YouTube, SoundCloud and JioSaavn audio. It does not access Spotify audio,
accept cookies, log in, download recordings to disk, or bypass restricted videos.
Use only recordings you are authorized to access and synchronize with visuals.
Third-party availability and terms still apply; search is not a grant of rights.

The frontend works without this server: Audius search, local audio, microphone,
and direct streams remain available. No server is deployed or preconfigured.

## Browser-only setup

1. Use a hosting service that supports Docker and outbound HTTPS. Create a service
   from this repository, with `server` as its root directory and `Dockerfile` as
   its build definition. Availability and cost depend on your chosen host.
2. Set `ALLOWED_ORIGINS` to your exact LyricFlow HTTPS origin (comma-separated if
   necessary). For StackBlitz, use the preview's actual origin, not the editor URL.
3. Run one worker/process initially; stream URLs are held in bounded memory.
4. Open the deployed `/health` address to check the server starts.
5. In LyricFlow: **Audio source → Search settings → Music resolver URL**. Paste
   the server's HTTPS base URL and save. Choose **YouTube Music**, **SoundCloud**, **JioSaavn** or **YouTube**, search,
   then select Play. Enable automatic timed lyrics in Find Lyrics after confirming
   your permission to display them.

The resolver uses Node 22+ for yt-dlp's JavaScript challenges. The Docker image
and Codespaces setup include it; `yt-dlp[default]` supplies its helper scripts.

Local development: `pip install -r requirements.txt`, then
`uvicorn app:app --host 0.0.0.0 --port 8000` from this directory.

GET `/search?q=artist+song&provider=ytmusic` returns normalized candidates.
Providers: `ytmusic`, `soundcloud`, `jiosaavn`, `youtube` (default).
GET `/resolve/{track_id}` resolves an audio-only URL and returns `streamPath`.
GET `/audio/{track_id}` forwards bytes and HTTP Range headers for seeking;
there is no caller-supplied URL parameter. URLs expire after 15 minutes.
SoundCloud/JioSaavn IDs come from the bounded search registry. HLS playlists,
segments and keys are rewritten into validated proxy resources; the browser
loads hls.js only for HLS playback when native HLS is unavailable.

Search/resolve are concurrency-limited and rate-limited. For public hosting, add
host-level bandwidth/concurrent-stream limits; the in-process request limit is
not a distributed abuse-control system. Do not store secrets in the frontend.
YouTube can block cloud IPs or change extraction behavior; update yt-dlp as needed.
A successful `/health` response does not establish that search/playback work.
Verify a permitted recording end-to-end on the chosen host before relying on it.
