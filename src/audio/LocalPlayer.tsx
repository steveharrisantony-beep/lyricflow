import type Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Upload, Play, Pause, Volume2, Music2, X, Disc3, RefreshCw, Edit3, CheckCircle2, Clock, ListMusic, ArrowUp, ArrowDown, SkipForward, ShieldCheck, Trash2 } from 'lucide-react';
import { connectLocalAudio, setLocalAudioPlaying, setLocalMediaElement, setVirtualMediaTime } from './audioSignal';
import { extractYouTubeVideoId, type TrackInfo } from '../metadata/trackInfo';
import { MUSIC_SOURCES, type PlayableSong } from '../music/providers';
import { resolveTrackFilename } from '../metadata/metadataStore';
import { clampLyricDelay, formatLyricDelay } from '../lyrics/lyricTiming';
import { describeAudioSource, describeLyricProvider } from '../lyrics/ManualLyrics';
import type { AudioSourceMode } from './AudioSourceHub';
import SongSearch from '../music/SongSearch';
import {
  fetchSponsorBlockSegments,
  findActiveSkipSegment,
  computeLeadingNonMusicOffset,
  formatSegmentCategory,
  type SponsorBlockSegment,
} from '../music/sponsorBlock';
import {
  LYRIC_ENGINE_OPTIONS,
  cleanYouTubeTitleForLyrics,
  type LyricEngineOption,
  type YouTubeSubtitleTrackItem,
} from '../lyrics/lyricFlowEngine';

const format = (seconds: number) =>
  Number.isFinite(seconds) && seconds >= 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : '0:00';

export interface QueuedSongItem {
  queueId: string;
  song: PlayableSong;
}

export interface LocalPlayerHandle {
  chooseFile: () => void;
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
  sourceMode: AudioSourceMode | null;
  onOpenSourceSelector: () => void;
  lyricSourceLabel: string;
  lyricStatusMessage: string;
  hasWordSync: boolean;
  customEditOpen: boolean;
  onToggleCustomEdit: () => void;
  lyricDelay: number;
  onLyricDelayChange: (delay: number) => void;
  delaySavedStatus: string;
  lyricEngineOption?: LyricEngineOption;
  onLyricEngineOptionChange?: (option: LyricEngineOption) => void;
  availableLyricEngines?: LyricEngineOption[];
  youtubeSubtitleTracks?: YouTubeSubtitleTrackItem[];
  selectedSubtitleTrackId?: string;
  onSelectSubtitleTrackId?: (id: string) => void;
  sponsorBlockEnabled?: boolean;
  onSponsorBlockEnabledChange?: (enabled: boolean) => void;
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
    sourceMode,
    onOpenSourceSelector,
    lyricSourceLabel,
    lyricStatusMessage,
    hasWordSync,
    customEditOpen,
    onToggleCustomEdit,
    lyricDelay,
    onLyricDelayChange,
    delaySavedStatus,
    lyricEngineOption = 'lyricflow',
    onLyricEngineOptionChange,
    availableLyricEngines = [],
    youtubeSubtitleTracks = [],
    selectedSubtitleTrackId,
    onSelectSubtitleTrackId,
    sponsorBlockEnabled = true,
    onSponsorBlockEnabledChange,
    onSponsorBlockOffsetChange,
  }: Props,
  ref: React.Ref<LocalPlayerHandle>
) {
  const hlsRef = useRef<Hls | null>(null);
  const loadEpoch = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [artwork, setArtwork] = useState<string | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(85);
  const [error, setError] = useState('');
  const [remote, setRemote] = useState(false);
  const [inlineOnlineOpen, setInlineOnlineOpen] = useState(false);
  const [youtubeOnlyClock, setYoutubeOnlyClock] = useState(false);
  const ytClockRef = useRef(0);
  const lastUiTimeUpdateRef = useRef(0);

  // Song Queue (Q) state
  const [queue, setQueue] = useState<QueuedSongItem[]>([]);
  const queueRef = useRef<QueuedSongItem[]>([]);
  queueRef.current = queue;
  const [dragQueueIndex, setDragQueueIndex] = useState<number | null>(null);

  // SponsorBlock state
  const [sponsorSegments, setSponsorSegments] = useState<SponsorBlockSegment[]>([]);
  const sponsorSegmentsRef = useRef<SponsorBlockSegment[]>([]);
  sponsorSegmentsRef.current = sponsorSegments;
  const [sponsorNotice, setSponsorNotice] = useState('');
  const lastSkippedUuidRef = useRef<string>('');
  const sponsorEnabledRef = useRef(sponsorBlockEnabled);
  sponsorEnabledRef.current = sponsorBlockEnabled;

  const addSongToQueue = (song: PlayableSong) => {
    const item: QueuedSongItem = {
      queueId: `${song.provider}-${song.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      song,
    };
    setQueue(prev => [...prev, item]);
    if (!currentTrack && !name) {
      void loadRemote(song);
    }
  };

  const moveQueueItem = (fromIndex: number, toIndex: number) => {
    setQueue(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const removeQueueItem = (queueId: string) => {
    setQueue(prev => prev.filter(item => item.queueId !== queueId));
  };

  const playQueueItemNow = (index: number) => {
    const target = queueRef.current[index];
    if (!target) return;
    setQueue(prev => prev.filter((_, idx) => idx !== index));
    void loadRemote(target.song);
  };

  const playNextFromQueue = (): boolean => {
    const currentQ = queueRef.current;
    if (currentQ.length === 0) return false;
    const [nextItem, ...rest] = currentQ;
    setQueue(rest);
    void loadRemote(nextItem.song);
    return true;
  };

  useEffect(() => {
    const ytId = currentTrack?.youtubeVideoId || currentTrack?.videoId;
    setSponsorSegments([]);
    setSponsorNotice('');
    lastSkippedUuidRef.current = '';
    if (!ytId) {
      onSponsorBlockOffsetChange?.(0);
      return;
    }
    const controller = new AbortController();
    void fetchSponsorBlockSegments(ytId, controller.signal).then(segments => {
      if (controller.signal.aborted) return;
      setSponsorSegments(segments);
      const leadingOffset = computeLeadingNonMusicOffset(segments);
      onSponsorBlockOffsetChange?.(leadingOffset);
      if (segments.length > 0) {
        const categories = Array.from(new Set(segments.map(s => formatSegmentCategory(s.category)))).join(', ');
        setSponsorNotice(`SponsorBlock ready: ${segments.length} segment(s) (${categories})`);
      }
    });
    return () => controller.abort();
  }, [currentTrack?.youtubeVideoId, currentTrack?.videoId]);

  const checkAndApplySponsorBlockSkip = (currentSec: number): number | null => {
    if (!sponsorEnabledRef.current || sponsorSegmentsRef.current.length === 0) return null;
    const activeSeg = findActiveSkipSegment(sponsorSegmentsRef.current, currentSec);
    if (!activeSeg || lastSkippedUuidRef.current === activeSeg.uuid) return null;
    lastSkippedUuidRef.current = activeSeg.uuid;
    const segStart = activeSeg.start ?? activeSeg.segment[0];
    const segEnd = activeSeg.end ?? activeSeg.segment[1];
    const targetSec = Math.max(currentSec + 0.2, segEnd);
    setSponsorNotice(
      `Skipped ${formatSegmentCategory(activeSeg.category)} (${format(segStart)} → ${format(segEnd)})`
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
      if (now - lastUiTimeUpdateRef.current >= 220 || (duration > 0 && next >= duration)) {
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
    if (!player) throw Error('Player unavailable');
    const epoch = ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    player.pause();
    setLocalAudioPlaying(false);
    setYoutubeOnlyClock(false);
    setVirtualMediaTime(null);
    ytClockRef.current = 0;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    player.crossOrigin = 'anonymous';
    player.removeAttribute('src');
    player.load();
    setRemote(true);
    setName(song.title + (song.artist ? ' — ' + song.artist : ''));
    setArtwork(song.artwork);
    setTime(0);
    setDuration(song.duration);
    setError('');
    const ytId = song.youtubeVideoId || extractYouTubeVideoId(song) || undefined;
    const audioSourceLabel = song.audioSource || MUSIC_SOURCES[song.provider] || 'Online Stream';
    const nextTrack: TrackInfo = {
      ...song,
      source: 'provider',
      provider: song.provider,
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

    if (song.format === 'youtube') {
      setYoutubeOnlyClock(true);
      onAudioStreamModeChange?.(false);
      setVirtualMediaTime(0);
      setActive(true);
      onActiveChange(true);
      return;
    }

    try {
      await initialize();
      if (epoch !== loadEpoch.current) return;
      if (song.format === 'hls' && !player.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: HlsPlayer } = await import('hls.js');
        if (epoch !== loadEpoch.current) return;
        if (!HlsPlayer.isSupported()) throw Error('HLS is not supported by this browser');
        const hls = new HlsPlayer({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hlsRef.current = hls;
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError('The stream was interrupted. Choose the song again or try another source.');
            player.pause();
            hls.destroy();
            if (hlsRef.current === hls) hlsRef.current = null;
          }
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            hls.destroy();
            reject(Error('Stream timed out'));
          }, 20000);
          hls.once(HlsPlayer.Events.MANIFEST_PARSED, () => {
            clearTimeout(timer);
            resolve();
          });
          hls.once(HlsPlayer.Events.DESTROYING, () => {
            clearTimeout(timer);
            reject(Error('Stream closed'));
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
      if (ytId) {
        // Fallback smoothly to YouTube embedded video playback if audio proxy stream failed
        setYoutubeOnlyClock(true);
        onAudioStreamModeChange?.(false);
        setVirtualMediaTime(0);
        setActive(true);
        onActiveChange(true);
        return;
      }
      setError('This source could not play in your browser. Try another result or a local file.');
      throw Error('Playback failed. The source may be unavailable or block browser audio access.');
    }
  };

  const initialize = async () => {
    const element = audioRef.current;
    if (!element) throw new Error('Audio player is unavailable');
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
      setError('');
      setActive(true);
      onActiveChange(true);
      return;
    }
    const element = audioRef.current;
    if (!element || !element.src) return;
    try {
      setError('');
      await initialize();
      await element.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audio playback was blocked. Tap Play again.');
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
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, nextTime) : nextTime);
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
    if (!(file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name))) {
      setError('Please choose a supported audio file.');
      return;
    }
    const player = audioRef.current;
    if (!player) return;
    ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    player.pause();
    setYoutubeOnlyClock(false);
    setVirtualMediaTime(null);
    onAudioStreamModeChange?.(true);
    setLocalAudioPlaying(false);
    onActiveChange(false);
    setActive(false);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    player.removeAttribute('crossorigin');
    player.src = urlRef.current;
    player.load();
    setRemote(false);
    setArtwork(undefined);
    const cleanName = file.name.replace(/\.[^.]+$/, '');
    setName(cleanName);
    const resolved = resolveTrackFilename(file.name);
    setCurrentTrack(resolved);
    onTrackChange(resolved);
    onFileChange(true);
    onTimeChange(0);
    setTime(0);
    setDuration(0);
    setError('');
  };

  const stop = () => {
    ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const player = audioRef.current;
    player?.pause();
    if (player) {
      player.removeAttribute('src');
      player.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setYoutubeOnlyClock(false);
    setVirtualMediaTime(null);
    setLocalAudioPlaying(false);
    setLocalMediaElement(null);
    setCurrentTrack(null);
    setArtwork(undefined);
    onTrackChange(null);
    onFileChange(false);
    onTimeChange(0);
    setName('');
    setTime(0);
    setDuration(0);
    setActive(false);
    onActiveChange(false);
    setError('');
  };

  const syncExternalClock = (currentTime: number, totalDuration?: number) => {
    if (!youtubeOnlyClock) return;
    if (typeof totalDuration === 'number' && Number.isFinite(totalDuration) && totalDuration > 0 && Math.abs(totalDuration - duration) > 1) {
      setDuration(totalDuration);
      setCurrentTrack(prev => (prev ? { ...prev, duration: totalDuration } : prev));
      onDurationChange(totalDuration);
    }
    if (Number.isFinite(currentTime) && currentTime >= 0) {
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
      pause: pausePlayback,
      stop,
      play,
      loadRemote,
      addToQueue: addSongToQueue,
      playNextFromQueue,
      seek: seekPlayback,
      syncExternalClock,
    }),
    [youtubeOnlyClock, duration, onActiveChange, onTimeChange, onDurationChange]
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
    []
  );

  const isYouTubeTrack = Boolean(
    currentTrack?.youtubeVideoId || currentTrack?.videoId || currentTrack?.provider === 'resolver'
  );

  return (
    <div className="ordered-player-stack">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={e => {
          setTime(e.currentTarget.currentTime);
          onTimeChange(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          setDuration(d);
          if (Number.isFinite(d)) {
            setCurrentTrack(prev => (prev ? { ...prev, duration: d } : prev));
            onDurationChange(d);
          }
        }}
        onPlay={() => {
          setLocalAudioPlaying(true);
          setActive(true);
          onActiveChange(true);
        }}
        onPause={() => {
          setLocalAudioPlaying(false);
          setActive(false);
          onActiveChange(false);
        }}
        onEnded={() => {
          setLocalAudioPlaying(false);
          setActive(false);
          onActiveChange(false);
        }}
        onError={() => {
          if (!youtubeOnlyClock) {
            setError('This audio format could not be decoded by the browser.');
          }
        }}
      />
      <input
        className="visually-hidden"
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
        onChange={e => {
          load(e.target.files?.[0]);
          e.target.value = '';
        }}
        aria-label="Select local audio file"
      />

      {/* 1. PLAYER DETAILS */}
      <section className="local-player player-details-section" aria-label="Player details">
        <div className="player-heading">
          <div className="heading-left">
            <span className="heading-icon">
              {remote || sourceMode === 'online' ? <Disc3 size={17} /> : <Music2 size={17} />}
            </span>
            <div>
              <b>PLAYER DETAILS</b>
              <small>
                Source:{' '}
                {currentTrack
                  ? describeAudioSource(currentTrack, Boolean(name)).detail
                  : remote || sourceMode === 'online'
                    ? 'Built-in Online Player (JioSaavn & YouTube)'
                    : 'Local Audio Upload'}
              </small>
            </div>
          </div>
          <div className="player-heading-actions">
            <button type="button" className="upload-button" onClick={onOpenSourceSelector}>
              <RefreshCw size={14} /> Switch Source
            </button>
          </div>
        </div>

        <div className="player-row">
          <button
            type="button"
            className="player-round"
            disabled={!name}
            aria-label={active ? 'Pause track' : 'Play track'}
            onClick={() => (active ? pausePlayback() : void play())}
          >
            {active ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>

          <button type="button" className="upload-button" onClick={() => fileRef.current?.click()}>
            <Upload size={16} />
            {name && !remote ? 'Change Local Audio' : 'Upload Local Audio'}
          </button>

          <button
            type="button"
            className="upload-button"
            onClick={() => setInlineOnlineOpen(v => !v)}
          >
            <Disc3 size={16} />
            {inlineOnlineOpen ? 'Hide Online Player' : 'Search JioSaavn & YouTube'}
          </button>

          <label className="volume-label" style={{ marginLeft: 'auto' }}>
            <Volume2 size={16} />
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={e => {
                const n = Number(e.target.value);
                setVolume(n);
                onVolumeChange?.(n);
                if (audioRef.current) audioRef.current.volume = n / 100;
              }}
            />
            <span>{volume}%</span>
          </label>

          {name && (
            <button type="button" className="player-remove" aria-label="Unload track" onClick={stop}>
              <X size={17} />
            </button>
          )}
        </div>

        {inlineOnlineOpen && (
          <div className="inline-stash-drawer">
            <SongSearch onPlay={loadRemote} />
          </div>
        )}

        {error && (
          <p className="player-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {/* 2. SONG DETAILS */}
      <section className="local-player song-details-section" aria-label="Song details">
        <div className="player-heading">
          <div className="heading-left">
            <span className="heading-icon">♪</span>
            <div>
              <b>SONG DETAILS</b>
              <small>Track metadata, 4-Engine Lyrics Selector &amp; SponsorBlock status</small>
            </div>
          </div>
          <button
            type="button"
            className="upload-button"
            onClick={onToggleCustomEdit}
            aria-expanded={customEditOpen}
          >
            <Edit3 size={15} />
            {customEditOpen ? 'Hide Lyrics Override Editor' : 'Custom Edit / Change Lyrics'}
          </button>
        </div>

        <div className="song-details-grid">
          <div className="song-cover-box">
            {artwork ? (
              <img src={artwork} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="song-cover-placeholder">♫</span>
            )}
          </div>
          <div className="song-meta-main">
            <strong>{currentTrack?.title || name || 'No track loaded yet'}</strong>
            <span>
              {currentTrack?.artist
                ? `Artist: ${currentTrack.artist}`
                : 'Select a local file or search a song in JioSaavn / YouTube'}
              {currentTrack?.album ? ` · Album: ${currentTrack.album}` : ''}
              {duration > 0 ? ` · Duration: ${format(duration)}` : ''}
              {isYouTubeTrack && currentTrack?.title
                ? ` · Cleaned Lyric Query: "${cleanYouTubeTitleForLyrics(currentTrack.videoTitle || currentTrack.title, currentTrack.artist)}"`
                : ''}
            </span>
            <div className="song-lyric-sync-line">
              <CheckCircle2 size={14} />
              <b>
                Lyrics Provider:{' '}
                {
                  describeLyricProvider(
                    lyricSourceLabel,
                    hasWordSync,
                    Boolean(currentTrack),
                    false
                  ).providerName
                }
              </b>
              <span>({lyricSourceLabel})</span>
              {hasWordSync && <span className="word-sync-indicator">· Word-by-Word Sync Active</span>}
              {lyricStatusMessage && <small> — {lyricStatusMessage}</small>}
            </div>
            <div className="song-audio-source-line">
              <Disc3 size={14} />
              <b>
                Audio Source: {describeAudioSource(currentTrack, Boolean(name)).providerName}
              </b>
              <span>({describeAudioSource(currentTrack, Boolean(name)).detail})</span>
              {currentTrack?.sourceUrl && (
                <a
                  href={currentTrack.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="lyric-source-link"
                >
                  Open Source ↗
                </a>
              )}
            </div>

            {/* Available Lyrics Engine Options per Song (only shown when available) */}
            {onLyricEngineOptionChange && availableLyricEngines.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }}>
                  AVAILABLE LYRICS SOURCES ({availableLyricEngines.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {LYRIC_ENGINE_OPTIONS.filter(opt => availableLyricEngines.includes(opt.id)).map(opt => {
                    const selected = lyricEngineOption === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onLyricEngineOptionChange(opt.id)}
                        title={opt.description}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: selected ? 700 : 500,
                          border: selected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
                          background: selected ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                          color: selected ? '#e0f2fe' : '#cbd5e1',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label} <span style={{ fontSize: 10, opacity: 0.75 }}>({opt.badge})</span>
                      </button>
                    );
                  })}
                </div>
                {youtubeSubtitleTracks.length > 1 && onSelectSubtitleTrackId && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                      Creator Subtitle Track ({youtubeSubtitleTracks.length}):
                    </span>
                    {youtubeSubtitleTracks.map(st => {
                      const activeSt = (selectedSubtitleTrackId || youtubeSubtitleTracks[0]?.id) === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => onSelectSubtitleTrackId(st.id)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: activeSt ? 700 : 500,
                            border: activeSt ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
                            background: activeSt ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                            color: activeSt ? '#e0f2fe' : '#cbd5e1',
                            cursor: 'pointer',
                          }}
                        >
                          {st.label} ({st.lineCount} lines)
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SponsorBlock Non-Music & Sponsor Auto-Skip */}
            {isYouTubeTrack && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <button
                  type="button"
                  onClick={() => onSponsorBlockEnabledChange?.(!sponsorBlockEnabled)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 9px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: sponsorBlockEnabled ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                    background: sponsorBlockEnabled ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
                    color: sponsorBlockEnabled ? '#a7f3d0' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <ShieldCheck size={13} />
                  SponsorBlock Auto-Skip: {sponsorBlockEnabled ? 'ON' : 'OFF'}
                </button>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>
                  {sponsorNotice ||
                    (sponsorSegments.length > 0
                      ? `${sponsorSegments.length} non-music/sponsor segment(s) detected`
                      : 'No non-music/sponsor segments reported for this video')}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2B. QUEUE (Q) SECTION — Directly Below Current Song Details */}
      <section className="local-player song-queue-section" aria-label="Song queue">
        <div className="player-heading">
          <div className="heading-left">
            <span className="heading-icon">
              <ListMusic size={17} />
            </span>
            <div>
              <b>QUEUE (Q) · {queue.length} {queue.length === 1 ? 'SONG' : 'SONGS'} UP NEXT</b>
              <small>Arrange song order with Up / Down arrows or drag-and-drop; auto-plays when the current song ends</small>
            </div>
          </div>
          <div className="player-heading-actions" style={{ display: 'flex', gap: 6 }}>
            {queue.length > 0 && (
              <>
                <button type="button" className="upload-button" onClick={() => playNextFromQueue()}>
                  <SkipForward size={14} /> Play Next Now
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
              + Add Songs to Q
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <p className="player-footnote" style={{ margin: '6px 0 2px' }}>
            Queue (Q) is empty. Search for songs in JioSaavn or YouTube and click <b>+ Queue</b> to line up multiple video songs.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {queue.map((item, idx) => (
              <div
                key={item.queueId}
                draggable
                onDragStart={() => setDragQueueIndex(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragQueueIndex !== null && dragQueueIndex !== idx) {
                    moveQueueItem(dragQueueIndex, idx);
                  }
                  setDragQueueIndex(null);
                }}
                onDragEnd={() => setDragQueueIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: dragQueueIndex === idx ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#38bdf8',
                    minWidth: 24,
                    textAlign: 'center',
                  }}
                >
                  #{idx + 1}
                </span>
                {item.song.artwork ? (
                  <img
                    src={item.song.artwork}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    ♪
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.song.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.song.artist || 'Unknown artist'} · {format(item.song.duration)} · {MUSIC_SOURCES[item.song.provider]}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="upload-button"
                    disabled={idx === 0}
                    onClick={() => moveQueueItem(idx, idx - 1)}
                    aria-label={`Move ${item.song.title} up in queue`}
                    title="Move Up"
                    style={{ padding: '4px 7px' }}
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
                    style={{ padding: '4px 7px' }}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="source-primary"
                    onClick={() => playQueueItemNow(idx)}
                    aria-label={`Play ${item.song.title} now`}
                    style={{ padding: '4px 9px', fontSize: 11 }}
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
      </section>

      {/* 3. TIMEBAR & PER-SONG LYRIC DELAY */}
      <section className="local-player timebar-section" aria-label="Playback timebar and lyric delay">
        <div className="timebar-row">
          <span className="timebar-clock">{format(time)}</span>
          <input
            aria-label="Song position"
            type="range"
            min="0"
            max={Number.isFinite(duration) && duration > 0 ? duration : 100}
            step=".1"
            disabled={!name}
            value={Math.min(time, Number.isFinite(duration) && duration > 0 ? duration : 0)}
            onChange={e => seekPlayback(Number(e.target.value))}
          />
          <span className="timebar-clock">{format(duration)}</span>
        </div>

        <div className="timebar-delay-bar">
          <div className="timebar-delay-info">
            <Clock size={15} />
            <strong>PER-SONG LYRICS DELAY: {formatLyricDelay(lyricDelay)}</strong>
            <span>{delaySavedStatus}</span>
          </div>
          <div className="timebar-delay-controls">
            <button
              type="button"
              aria-label="Advance lyrics 0.25 seconds"
              onClick={() => onLyricDelayChange(clampLyricDelay(lyricDelay - 0.25))}
            >
              −0.25s
            </button>
            <button
              type="button"
              aria-label="Reset lyric delay"
              onClick={() => onLyricDelayChange(0)}
            >
              Reset (0.00s)
            </button>
            <button
              type="button"
              aria-label="Delay lyrics 0.25 seconds"
              onClick={() => onLyricDelayChange(clampLyricDelay(lyricDelay + 0.25))}
            >
              +0.25s
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default forwardRef(LocalPlayer);