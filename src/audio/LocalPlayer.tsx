import type Hls from "hls.js";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Search,
  Expand,
  ListMusic,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { describeAudioSource } from "../lyrics/ManualLyrics";
import { resolveTrackFilename } from "../metadata/metadataStore";
import { extractYouTubeVideoId, type TrackInfo } from "../metadata/trackInfo";
import { MUSIC_SOURCES, type PlayableSong } from "../music/providers";
import SongSearch from "../music/SongSearch";
import {
  computeLeadingNonMusicOffset,
  fetchSponsorBlockSegments,
  findActiveSkipSegment,
  formatSegmentCategory,
  type SponsorBlockSegment,
} from "../music/sponsorBlock";
import {
  connectLocalAudio,
  setLocalAudioPlaying,
  setLocalMediaElement,
  setVirtualMediaTime,
} from "./audioSignal";
import type { AudioSourceMode } from "./AudioSourceHub";

const format = (seconds: number) =>
  Number.isFinite(seconds) && seconds >= 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
    : "0:00";

export interface QueuedSongItem {
  queueId: string;
  song: PlayableSong;
}

export interface LocalPlayerHandle {
  chooseFile: () => void;
  openSearch: () => void;
  pause: () => void;
  stop: () => void;
  play: () => Promise<void>;
  loadRemote: (song: PlayableSong) => Promise<void>;
  addToQueue: (song: PlayableSong) => void;
  playNextFromQueue: () => boolean;
  seek: (time: number) => void;
  syncExternalClock: (currentTime: number, totalDuration?: number) => void;
}

type Props = {
  onActiveChange: (active: boolean) => void;
  onTimeChange: (time: number) => void;
  onFileChange: (loaded: boolean) => void;
  onTrackChange: (track: TrackInfo | null) => void;
  onDurationChange: (duration: number) => void;
  onAudioStreamModeChange?: (hasAudioStream: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  preferredVolume?: number;
  sourceMode: AudioSourceMode | null;
  onOpenSourceSelector: () => void;
  onFullscreen?: () => void;
  fullscreen?: boolean;
  onOverlayChange?: (open: boolean) => void;
  externalTrack?: TrackInfo | null;
  externalTime?: number;
  externalPlaying?: boolean;
  sponsorBlockEnabled?: boolean;
  onSponsorBlockOffsetChange?: (leadingOffsetSec: number) => void;
};

function LocalPlayer(
  {
    onActiveChange,
    onTimeChange,
    onFileChange,
    onTrackChange,
    onDurationChange,
    onAudioStreamModeChange,
    onVolumeChange,
    preferredVolume,
    sourceMode,
    onOpenSourceSelector,
    onFullscreen,
    fullscreen = false,
    onOverlayChange,
    externalTrack,
    externalTime = 0,
    externalPlaying = false,
    sponsorBlockEnabled = true,
    onSponsorBlockOffsetChange,
  }: Props,
  ref: React.Ref<LocalPlayerHandle>,
) {
  const hlsRef = useRef<Hls | null>(null);
  const loadEpoch = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [artwork, setArtwork] = useState<string | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(preferredVolume ?? 85);
  useEffect(() => {
    if (preferredVolume === undefined) return;
    setVolume(preferredVolume);
    if (audioRef.current) audioRef.current.volume = preferredVolume / 100;
  }, [preferredVolume]);
  const [error, setError] = useState("");
  const [, setRemote] = useState(false);
  const [inlineOnlineOpen, setInlineOnlineOpen] = useState(false);
  useEffect(() => {
    if (!inlineOnlineOpen) return;
    searchPanelRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "instant",
    });
    searchPanelRef.current
      ?.querySelector<HTMLInputElement>('input[aria-label="Search songs"]')
      ?.focus({ preventScroll: true });
  }, [inlineOnlineOpen]);
  const [youtubeOnlyClock, setYoutubeOnlyClock] = useState(false);
  const youtubeOnlyClockRef = useRef(false);
  const setYouTubeClockMode = (enabled: boolean) => {
    youtubeOnlyClockRef.current = enabled;
    setYoutubeOnlyClock(enabled);
  };
  // Events queued by the previous audio element must not pause a new iframe/external source.
  const ignoreAudioElementEvent = () =>
    youtubeOnlyClockRef.current || sourceMode === "external";
  const ytClockRef = useRef(0);
  const ytLastClockSyncRef = useRef(0);
  const lastUiTimeUpdateRef = useRef(0);

  // Song Queue (Q) & Previous History state
  const [queue, setQueue] = useState<QueuedSongItem[]>([]);
  const queueRef = useRef<QueuedSongItem[]>([]);
  queueRef.current = queue;
  const historyRef = useRef<PlayableSong[]>([]);
  const lastRemoteSongRef = useRef<PlayableSong | null>(null);
  const [dragQueueIndex, setDragQueueIndex] = useState<number | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  useEffect(() => {
    onOverlayChange?.(queueOpen || inlineOnlineOpen);
  }, [queueOpen, inlineOnlineOpen, onOverlayChange]);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const repeatEnabledRef = useRef(false);
  repeatEnabledRef.current = repeatEnabled;
  const shuffleEnabledRef = useRef(false);
  shuffleEnabledRef.current = shuffleEnabled;
  // SponsorBlock state
  const [sponsorSegments, setSponsorSegments] = useState<SponsorBlockSegment[]>(
    [],
  );
  const sponsorSegmentsRef = useRef<SponsorBlockSegment[]>([]);
  sponsorSegmentsRef.current = sponsorSegments;
  const [sponsorNotice, setSponsorNotice] = useState("");
  const lastSkippedUuidRef = useRef<string>("");
  const sponsorEnabledRef = useRef(sponsorBlockEnabled);
  sponsorEnabledRef.current = sponsorBlockEnabled;

  const addSongToQueue = (song: PlayableSong) => {
    const item: QueuedSongItem = {
      queueId: `${song.provider}-${song.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      song,
    };
    setQueue((prev) => [...prev, item]);
    if (!currentTrack && !name) {
      void loadRemote(song);
    }
  };

  const moveQueueItem = (fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const removeQueueItem = (queueId: string) => {
    setQueue((prev) => prev.filter((item) => item.queueId !== queueId));
  };

  const playQueueItemNow = (index: number) => {
    const target = queueRef.current[index];
    if (!target) return;
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    void loadRemote(target.song);
  };

  const playNextFromQueue = (): boolean => {
    const currentQ = queueRef.current;
    if (currentQ.length === 0) {
      if (repeatEnabledRef.current && name) {
        seekPlayback(0);
        void play();
        return true;
      }
      return false;
    }
    const pickIdx =
      shuffleEnabledRef.current && currentQ.length > 1
        ? Math.floor(Math.random() * currentQ.length)
        : 0;
    const nextItem = currentQ[pickIdx];
    const rest = currentQ.filter((_, idx) => idx !== pickIdx);
    setQueue(rest);
    void loadRemote(nextItem.song);
    return true;
  };

  const playPreviousTrack = () => {
    if (time > 3) {
      seekPlayback(0);
      return;
    }
    const prevSong = historyRef.current.pop();
    if (prevSong) {
      void loadRemote(prevSong);
      return;
    }
    seekPlayback(0);
  };

  useEffect(() => {
    const ytId = currentTrack?.youtubeVideoId || currentTrack?.videoId;
    setSponsorSegments([]);
    setSponsorNotice("");
    lastSkippedUuidRef.current = "";
    if (!ytId) {
      onSponsorBlockOffsetChange?.(0);
      return;
    }
    const controller = new AbortController();
    void fetchSponsorBlockSegments(ytId, controller.signal).then((segments) => {
      if (controller.signal.aborted) return;
      setSponsorSegments(segments);
      const leadingOffset = computeLeadingNonMusicOffset(segments);
      onSponsorBlockOffsetChange?.(leadingOffset);
      if (segments.length > 0) {
        const categories = Array.from(
          new Set(segments.map((s) => formatSegmentCategory(s.category))),
        ).join(", ");
        setSponsorNotice(
          `SponsorBlock ready: ${segments.length} segment(s) (${categories})`,
        );
      }
    });
    return () => controller.abort();
  }, [currentTrack?.youtubeVideoId, currentTrack?.videoId]);

  const checkAndApplySponsorBlockSkip = (currentSec: number): number | null => {
    if (!sponsorEnabledRef.current || sponsorSegmentsRef.current.length === 0)
      return null;
    const activeSeg = findActiveSkipSegment(
      sponsorSegmentsRef.current,
      currentSec,
    );
    if (!activeSeg || lastSkippedUuidRef.current === activeSeg.uuid)
      return null;
    lastSkippedUuidRef.current = activeSeg.uuid;
    const segStart = activeSeg.start ?? activeSeg.segment[0];
    const segEnd = activeSeg.end ?? activeSeg.segment[1];
    const targetSec = Math.max(currentSec + 0.2, segEnd);
    setSponsorNotice(
      `Skipped ${formatSegmentCategory(activeSeg.category)} (${format(segStart)} → ${format(segEnd)})`,
    );
    return targetSec;
  };

  // Advance playback clock when playing a YouTube video directly without a separate audio stream
  useEffect(() => {
    if (!youtubeOnlyClock || !active) return;
    let lastTick = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      // Never invent progress before YouTube starts, or while its clock stalls.
      if (
        !ytLastClockSyncRef.current ||
        now - ytLastClockSyncRef.current > 2500
      )
        return;
      const maxDur = duration > 0 ? duration : 600;
      let next = Math.min(maxDur, ytClockRef.current + dt);

      const skipTarget = checkAndApplySponsorBlockSkip(next);
      if (skipTarget !== null) {
        next = Math.min(maxDur, skipTarget);
        ytClockRef.current = next;
        setTime(next);
        onTimeChange(next);
        setVirtualMediaTime(next);
        return;
      }

      ytClockRef.current = next;
      setVirtualMediaTime(next);
      if (
        now - lastUiTimeUpdateRef.current >= 220 ||
        (duration > 0 && next >= duration)
      ) {
        lastUiTimeUpdateRef.current = now;
        setTime(next);
        onTimeChange(next);
      }
      if (duration > 0 && next >= duration) {
        if (!playNextFromQueue()) {
          setActive(false);
          onActiveChange(false);
        }
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [youtubeOnlyClock, active, duration, onTimeChange, onActiveChange]);

  const loadRemote = async (song: PlayableSong) => {
    const player = audioRef.current;
    if (!player) throw Error("Player unavailable");
    if (lastRemoteSongRef.current && lastRemoteSongRef.current.id !== song.id) {
      historyRef.current = [
        ...historyRef.current.slice(-19),
        lastRemoteSongRef.current,
      ];
    }
    lastRemoteSongRef.current = song;
    const epoch = ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    player.pause();
    setLocalAudioPlaying(false);
    setYouTubeClockMode(false);
    setVirtualMediaTime(null);
    ytClockRef.current = 0;
    ytLastClockSyncRef.current = 0;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    player.crossOrigin = "anonymous";
    player.removeAttribute("src");
    player.load();
    setRemote(true);
    setName(song.title + (song.artist ? " — " + song.artist : ""));
    setArtwork(song.artwork);
    setTime(0);
    setDuration(song.duration);
    setError("");
    const ytId =
      song.youtubeVideoId || extractYouTubeVideoId(song) || undefined;
    const audioSourceLabel =
      song.audioSource || MUSIC_SOURCES[song.provider] || "Online Stream";
    const nextTrack: TrackInfo = {
      ...song,
      source: "provider",
      provider: song.provider,
      sourceTrackId: song.id,
      audioSource: audioSourceLabel,
      sourceUrl: song.sourceUrl,
      youtubeVideoId: ytId,
      videoId: ytId,
      videoTitle: song.videoTitle || (ytId ? song.title : undefined),
      confidence: 1,
    };
    setCurrentTrack(nextTrack);
    onTrackChange(nextTrack);
    onFileChange(true);
    onTimeChange(0);
    setInlineOnlineOpen(false);

    if (song.format === "youtube") {
      setYouTubeClockMode(true);
      onAudioStreamModeChange?.(false);
      setVirtualMediaTime(0);
      setActive(true);
      onActiveChange(true);
      return;
    }

    try {
      await initialize();
      if (epoch !== loadEpoch.current) return;
      if (
        song.format === "hls" &&
        !player.canPlayType("application/vnd.apple.mpegurl")
      ) {
        const { default: HlsPlayer } = await import("hls.js");
        if (epoch !== loadEpoch.current) return;
        if (!HlsPlayer.isSupported())
          throw Error("HLS is not supported by this browser");
        const hls = new HlsPlayer({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = hls;
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError(
              "The stream was interrupted. Choose the song again or try another source.",
            );
            player.pause();
            hls.destroy();
            if (hlsRef.current === hls) hlsRef.current = null;
          }
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            hls.destroy();
            reject(Error("Stream timed out"));
          }, 20000);
          hls.once(HlsPlayer.Events.MANIFEST_PARSED, () => {
            clearTimeout(timer);
            resolve();
          });
          hls.once(HlsPlayer.Events.DESTROYING, () => {
            clearTimeout(timer);
            reject(Error("Stream closed"));
          });
          hls.loadSource(song.streamUrl);
          hls.attachMedia(player);
        });
      } else {
        player.src = song.streamUrl;
        player.load();
      }
      if (epoch !== loadEpoch.current) return;
      player.volume = volume / 100;
      onAudioStreamModeChange?.(true);
      await player.play();
    } catch {
      if (epoch !== loadEpoch.current) return;
      setError(
        "This source could not play in your browser. Try another result or a local file.",
      );
      throw Error(
        "Playback failed. The source may be unavailable or block browser audio access.",
      );
    }
  };

  const initialize = async () => {
    const element = audioRef.current;
    if (!element) throw new Error("Audio player is unavailable");
    if (!ctxRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.42;
      source.connect(analyser);
      analyser.connect(context.destination);
      ctxRef.current = context;
      setLocalMediaElement(element);
      connectLocalAudio(analyser);
    }
    setLocalMediaElement(element);
    await ctxRef.current.resume();
  };

  const play = async () => {
    if (youtubeOnlyClock) {
      setError("");
      setActive(true);
      onActiveChange(true);
      return;
    }
    const element = audioRef.current;
    if (!element || !element.src) return;
    try {
      setError("");
      await initialize();
      await element.play();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Audio playback was blocked. Tap Play again.",
      );
    }
  };

  const pausePlayback = () => {
    if (youtubeOnlyClock) {
      setActive(false);
      onActiveChange(false);
      return;
    }
    audioRef.current?.pause();
    setLocalAudioPlaying(false);
    onActiveChange(false);
  };

  const seekPlayback = (nextTime: number) => {
    const clamped = Math.max(
      0,
      duration > 0 ? Math.min(duration, nextTime) : nextTime,
    );
    if (youtubeOnlyClock) {
      ytClockRef.current = clamped;
      setTime(clamped);
      onTimeChange(clamped);
      setVirtualMediaTime(clamped);
      return;
    }
    const player = audioRef.current;
    if (player && Number.isFinite(player.duration)) {
      player.currentTime = Math.max(0, Math.min(player.duration, nextTime));
      onTimeChange(player.currentTime);
      setTime(player.currentTime);
    }
  };

  const load = (file: File | undefined) => {
    if (!file) return;
    if (
      !(
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)
      )
    ) {
      setError("Please choose a supported audio file.");
      return;
    }
    const player = audioRef.current;
    if (!player) return;
    ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    player.pause();
    setYouTubeClockMode(false);
    setVirtualMediaTime(null);
    onAudioStreamModeChange?.(true);
    setLocalAudioPlaying(false);
    onActiveChange(false);
    setActive(false);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    player.removeAttribute("crossorigin");
    player.src = urlRef.current;
    player.load();
    setRemote(false);
    setArtwork(undefined);
    const cleanName = file.name.replace(/\.[^.]+$/, "");
    setName(cleanName);
    const resolved = resolveTrackFilename(file.name);
    setCurrentTrack(resolved);
    onTrackChange(resolved);
    onFileChange(true);
    onTimeChange(0);
    setTime(0);
    setDuration(0);
    setError("");
  };

  const stop = () => {
    ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const player = audioRef.current;
    player?.pause();
    if (player) {
      player.removeAttribute("src");
      player.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setYouTubeClockMode(false);
    setVirtualMediaTime(null);
    setLocalAudioPlaying(false);
    setLocalMediaElement(null);
    setCurrentTrack(null);
    setArtwork(undefined);
    onTrackChange(null);
    onFileChange(false);
    onTimeChange(0);
    setName("");
    setTime(0);
    setDuration(0);
    setActive(false);
    onActiveChange(false);
    setError("");
  };

  const syncExternalClock = (currentTime: number, totalDuration?: number) => {
    if (!youtubeOnlyClock) return;
    if (
      typeof totalDuration === "number" &&
      Number.isFinite(totalDuration) &&
      totalDuration > 0 &&
      Math.abs(totalDuration - duration) > 1
    ) {
      setDuration(totalDuration);
      setCurrentTrack((prev) =>
        prev ? { ...prev, duration: totalDuration } : prev,
      );
      onDurationChange(totalDuration);
    }
    if (Number.isFinite(currentTime) && currentTime >= 0) {
      ytLastClockSyncRef.current = performance.now();
      ytClockRef.current = currentTime;
      setTime(currentTime);
      onTimeChange(currentTime);
      setVirtualMediaTime(currentTime);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      chooseFile: () => fileRef.current?.click(),
      openSearch: () => setInlineOnlineOpen(true),
      pause: pausePlayback,
      stop,
      play,
      loadRemote,
      addToQueue: addSongToQueue,
      playNextFromQueue,
      seek: seekPlayback,
      syncExternalClock,
    }),
    [
      youtubeOnlyClock,
      duration,
      onActiveChange,
      onTimeChange,
      onDurationChange,
    ],
  );

  useEffect(
    () => () => {
      ++loadEpoch.current;
      hlsRef.current?.destroy();
      audioRef.current?.pause();
      setVirtualMediaTime(null);
      setLocalAudioPlaying(false);
      setLocalMediaElement(null);
      connectLocalAudio(null);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      void ctxRef.current?.close();
    },
    [],
  );

  return (
    <div className="ordered-player-stack">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => {
          if (ignoreAudioElementEvent()) return;
          const ct = e.currentTarget.currentTime;
          const now = performance.now();
          if (
            now - lastUiTimeUpdateRef.current >= 120 ||
            ct === 0 ||
            (duration > 0 && ct >= duration - 0.15)
          ) {
            lastUiTimeUpdateRef.current = now;
            setTime(ct);
            onTimeChange(ct);
          }
        }}
        onLoadedMetadata={(e) => {
          if (ignoreAudioElementEvent()) return;
          const d = e.currentTarget.duration;
          setDuration(d);
          if (Number.isFinite(d)) {
            setCurrentTrack((prev) => (prev ? { ...prev, duration: d } : prev));
            onDurationChange(d);
          }
        }}
        onPlay={() => {
          if (ignoreAudioElementEvent()) return;
          setLocalAudioPlaying(true);
          setActive(true);
          onActiveChange(true);
        }}
        onPause={() => {
          if (ignoreAudioElementEvent()) return;
          setLocalAudioPlaying(false);
          setActive(false);
          onActiveChange(false);
        }}
        onEnded={() => {
          if (ignoreAudioElementEvent()) return;
          if (!playNextFromQueue()) {
            setLocalAudioPlaying(false);
            setActive(false);
            onActiveChange(false);
          }
        }}
        onError={() => {
          if (!ignoreAudioElementEvent()) {
            setError("This audio format could not be decoded by the browser.");
          }
        }}
      />
      <input
        className="visually-hidden"
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
        onChange={(e) => {
          load(e.target.files?.[0]);
          e.target.value = "";
        }}
        aria-label="Select local audio file"
      />

      {/* UNIFIED MUSIC DETAILS & SPOTIFY-STYLE MOBILE PLAYER SECTION (Directly Below Visualizer) */}
      <section
        className="local-player yt-music-details-card spotify-player-card glass"
        aria-label="Music details and player controls"
      >
        {/* 1. Top Row: Bold Title + Artist Subtitle on Left */}
        <div className="spotify-header-row">
          {artwork && !externalTrack ? (
            <div className="song-cover-box spotify-mini-art">
              <img src={artwork} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className="player-art-placeholder">
              <Music2 size={26} />
            </div>
          )}

          <div className="spotify-title-stack">
            <strong className="spotify-track-title">
              {externalTrack?.title ||
                currentTrack?.title ||
                name ||
                "No song selected"}
            </strong>
            <span className="spotify-track-artist">
              {externalTrack?.artist ||
                (currentTrack?.artist
                  ? currentTrack.artist
                  : name
                    ? describeAudioSource(currentTrack, Boolean(name))
                        .providerName
                    : "Choose a source or search for a song")}
            </span>
          </div>

          {name && (
            <div className="spotify-header-actions">
              <button
                type="button"
                className="player-remove spotify-unload-btn"
                aria-label="Unload track"
                title="Unload track"
                onClick={stop}
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>

        {/* 2. Progress Seek Bar + Left/Right Timestamps Below */}
        <div className="spotify-seek-block">
          <input
            className="spotify-seek-slider"
            aria-label="Song position"
            type="range"
            min="0"
            max={
              externalTrack?.duration ||
              (Number.isFinite(duration) && duration > 0 ? duration : 100)
            }
            step=".1"
            disabled={!name}
            value={
              externalTrack
                ? Math.min(externalTime, externalTrack.duration || 0)
                : Math.min(
                    time,
                    Number.isFinite(duration) && duration > 0 ? duration : 0,
                  )
            }
            onChange={(e) => seekPlayback(Number(e.target.value))}
          />
          <div className="spotify-time-labels">
            <span className="timebar-clock">
              {format(externalTrack ? externalTime : time)}
            </span>
            <span className="timebar-clock">
              {format(externalTrack?.duration || duration)}
            </span>
          </div>
        </div>

        {/* 3. Centered 5-Button Transport Row: Shuffle | Previous | Large Play/Pause | Next | Repeat */}
        <div className="spotify-transport-row">
          <button
            type="button"
            className={"spotify-aux-btn " + (shuffleEnabled ? "is-active" : "")}
            aria-label="Shuffle queue"
            aria-pressed={shuffleEnabled}
            title="Shuffle queue"
            onClick={() => {
              setShuffleEnabled((v) => {
                const next = !v;
                if (next && queue.length > 1) {
                  setQueue((prev) => [...prev].sort(() => Math.random() - 0.5));
                }
                return next;
              });
            }}
          >
            <Shuffle size={20} />
          </button>

          <button
            type="button"
            className="spotify-skip-btn"
            disabled={!name && historyRef.current.length === 0}
            aria-label="Previous track"
            title="Previous / Restart track"
            onClick={playPreviousTrack}
          >
            <SkipBack size={26} fill="currentColor" />
          </button>

          <button
            type="button"
            className="player-round spotify-play-circle"
            disabled={!name}
            aria-label={
              (externalTrack ? externalPlaying : active)
                ? "Pause track"
                : "Play track"
            }
            onClick={() => (active ? pausePlayback() : void play())}
          >
            {(externalTrack ? externalPlaying : active) ? (
              <Pause size={26} fill="currentColor" />
            ) : (
              <Play size={26} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            className="spotify-skip-btn"
            disabled={queue.length === 0 && !name}
            aria-label="Next track"
            title={
              queue.length > 0
                ? "Play next song in Queue"
                : "Open search to add next song"
            }
            onClick={() => {
              if (!playNextFromQueue()) {
                setInlineOnlineOpen(true);
              }
            }}
          >
            <SkipForward size={26} fill="currentColor" />
          </button>

          <button
            type="button"
            className={"spotify-aux-btn " + (repeatEnabled ? "is-active" : "")}
            aria-label="Repeat track"
            aria-pressed={repeatEnabled}
            title="Repeat track"
            onClick={() => {
              setRepeatEnabled((v) => {
                const next = !v;
                if (audioRef.current) audioRef.current.loop = next;
                return next;
              });
            }}
          >
            <Repeat size={20} />
          </button>
        </div>

        {/* 4. Compact Mobile-Optimized Action Grid & Volume */}
        <div className="yt-player-actions-bar">
          <button
            type="button"
            className={
              "upload-button " + (inlineOnlineOpen ? "active-pill" : "")
            }
            onClick={() => setInlineOnlineOpen((v) => !v)}
          >
            <Search size={14} />
            <span>{inlineOnlineOpen ? "Close search" : "Search"}</span>
          </button>

          <button
            type="button"
            className="upload-button"
            onClick={onOpenSourceSelector}
          >
            <RefreshCw size={14} />
            <span>{sourceMode ? "Change source" : "Select source"}</span>
          </button>

          <button
            type="button"
            className={"upload-button " + (queueOpen ? "active-pill" : "")}
            aria-expanded={queueOpen}
            onClick={() => setQueueOpen((v) => !v)}
          >
            <ListMusic size={14} />
            <span>Queue{queue.length > 0 ? ` (${queue.length})` : ""}</span>
            {queueOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button
            type="button"
            className="upload-button player-fullscreen"
            onClick={onFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Expand size={17} />
            <span>Fullscreen</span>
          </button>
          <label className="volume-label spotify-volume-row">
            <Volume2 size={15} />
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => {
                const n = Number(e.target.value);
                setVolume(n);
                onVolumeChange?.(n);
                if (audioRef.current) audioRef.current.volume = n / 100;
              }}
            />
            <span>{volume}%</span>
          </label>
        </div>

        {externalTrack && (
          <p className="quiet-status">
            Playback is controlled in{" "}
            {externalTrack.audioSource || "your music app"}.
          </p>
        )}
        {sponsorNotice && (
          <p className="quiet-status" role="status">
            {sponsorNotice}
          </p>
        )}
        {error && (
          <p className="player-error" role="alert">
            {error}
          </p>
        )}

        {/* Collapsible Online Search Drawer (Opens Only When Clicked) */}
        {inlineOnlineOpen && (
          <div className="inline-stash-drawer" ref={searchPanelRef}>
            <SongSearch onPlay={loadRemote} onAddToQueue={addSongToQueue} />
          </div>
        )}

        {/* Collapsible Queue (Q) Drawer (Opens Only When Clicked) */}
        <div
          className={
            "settings-accordion-body " +
            (queueOpen ? "is-open" : "is-collapsed")
          }
          aria-label="Song queue"
        >
          <div className="yt-drawer-subpanel">
            <div className="player-heading" style={{ marginBottom: 8 }}>
              <div className="heading-left">
                <div>
                  <b>Up next · {queue.length}</b>
                </div>
              </div>
              <div
                className="player-heading-actions"
                style={{ display: "flex", gap: 6 }}
              >
                {queue.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="upload-button"
                      onClick={() => playNextFromQueue()}
                    >
                      <SkipForward size={14} /> Play next
                    </button>
                    <button
                      type="button"
                      className="upload-button"
                      onClick={() => setQueue([])}
                      aria-label="Clear song queue"
                    >
                      <Trash2 size={14} /> Clear Queue
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="upload-button"
                  onClick={() => setInlineOnlineOpen(true)}
                >
                  Add songs
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <p className="player-footnote" style={{ margin: "4px 0 2px" }}>
                Your queue is empty. Search for a song and choose <b>+ Queue</b>
                .
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                {queue.map((item, idx) => (
                  <div
                    key={item.queueId}
                    draggable
                    onDragStart={() => setDragQueueIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragQueueIndex !== null && dragQueueIndex !== idx) {
                        moveQueueItem(dragQueueIndex, idx);
                      }
                      setDragQueueIndex(null);
                    }}
                    onDragEnd={() => setDragQueueIndex(null)}
                    className="yt-queue-row"
                  >
                    <span className="yt-queue-index">#{idx + 1}</span>
                    {item.song.artwork ? (
                      <img
                        src={item.song.artwork}
                        alt=""
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="yt-queue-cover-fallback">♪</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="yt-queue-title">{item.song.title}</div>
                      <div className="yt-queue-sub">
                        {item.song.artist || "Unknown artist"} ·{" "}
                        {format(item.song.duration)} ·{" "}
                        {MUSIC_SOURCES[item.song.provider]}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        className="upload-button"
                        disabled={idx === 0}
                        onClick={() => moveQueueItem(idx, idx - 1)}
                        aria-label={`Move ${item.song.title} up in queue`}
                        title="Move Up"
                        style={{ padding: "4px 7px" }}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="upload-button"
                        disabled={idx === queue.length - 1}
                        onClick={() => moveQueueItem(idx, idx + 1)}
                        aria-label={`Move ${item.song.title} down in queue`}
                        title="Move Down"
                        style={{ padding: "4px 7px" }}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        className="source-primary"
                        onClick={() => playQueueItemNow(idx)}
                        aria-label={`Play ${item.song.title} now`}
                        style={{ padding: "4px 9px", fontSize: 11 }}
                      >
                        <Play size={12} /> Play
                      </button>
                      <button
                        type="button"
                        className="player-remove"
                        onClick={() => removeQueueItem(item.queueId)}
                        aria-label={`Remove ${item.song.title} from queue`}
                        title="Remove from Queue"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default forwardRef(LocalPlayer);
