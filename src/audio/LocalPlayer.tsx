import type Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Upload, Play, Pause, Volume2, Music2, X, Disc3, RefreshCw, Edit3, CheckCircle2, Clock } from 'lucide-react';
import { connectLocalAudio, setLocalAudioPlaying, setLocalMediaElement } from './audioSignal';
import type { TrackInfo } from '../metadata/trackInfo';
import { MUSIC_SOURCES, type PlayableSong } from '../music/providers';
import { resolveTrackFilename } from '../metadata/metadataStore';
import { clampLyricDelay, formatLyricDelay } from '../lyrics/lyricTiming';
import { describeAudioSource, describeLyricProvider } from '../lyrics/ManualLyrics';
import type { AudioSourceMode } from './AudioSourceHub';
import SongSearch from '../music/SongSearch';

const format = (seconds: number) =>
  Number.isFinite(seconds) && seconds >= 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : '0:00';

export interface LocalPlayerHandle {
  chooseFile: () => void;
  pause: () => void;
  stop: () => void;
  play: () => Promise<void>;
  loadRemote: (song: PlayableSong) => Promise<void>;
  seek: (time: number) => void;
}

type Props = {
  onActiveChange: (active: boolean) => void;
  onTimeChange: (time: number) => void;
  onFileChange: (loaded: boolean) => void;
  onTrackChange: (track: TrackInfo | null) => void;
  onDurationChange: (duration: number) => void;
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
};

function LocalPlayer(
  {
    onActiveChange,
    onTimeChange,
    onFileChange,
    onTrackChange,
    onDurationChange,
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

  const loadRemote = async (song: PlayableSong) => {
    const player = audioRef.current;
    if (!player) throw Error('Player unavailable');
    const epoch = ++loadEpoch.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    player.pause();
    setLocalAudioPlaying(false);
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
    const audioSourceLabel = song.audioSource || MUSIC_SOURCES[song.provider] || 'Online Stream';
    const nextTrack: TrackInfo = {
      ...song,
      source: 'provider',
      provider: song.provider,
      audioSource: audioSourceLabel,
      sourceUrl: song.sourceUrl,
      confidence: 1,
    };
    setCurrentTrack(nextTrack);
    onTrackChange(nextTrack);
    onFileChange(true);
    onTimeChange(0);
    setInlineOnlineOpen(false);
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
      await player.play();
    } catch {
      if (epoch !== loadEpoch.current) return;
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

  useImperativeHandle(
    ref,
    () => ({
      chooseFile: () => fileRef.current?.click(),
      pause: () => {
        audioRef.current?.pause();
        setLocalAudioPlaying(false);
        onActiveChange(false);
      },
      stop,
      play,
      loadRemote,
      seek: (nextTime: number) => {
        const player = audioRef.current;
        if (player && Number.isFinite(player.duration)) {
          player.currentTime = Math.max(0, Math.min(player.duration, nextTime));
          onTimeChange(player.currentTime);
          setTime(player.currentTime);
        }
      },
    }),
    [onActiveChange]
  );

  useEffect(
    () => () => {
      ++loadEpoch.current;
      hlsRef.current?.destroy();
      audioRef.current?.pause();
      setLocalAudioPlaying(false);
      setLocalMediaElement(null);
      connectLocalAudio(null);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      void ctxRef.current?.close();
    },
    []
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
        onError={() => setError('This audio format could not be decoded by the browser.')}
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
                Audio Source:{' '}
                {currentTrack
                  ? describeAudioSource(currentTrack, Boolean(name)).detail
                  : remote || sourceMode === 'online'
                    ? 'Built-in Online Player (Stash Engine)'
                    : 'Local Audio Upload'}
              </small>
            </div>
          </div>
          <div className="player-heading-actions">
            <button type="button" className="upload-button" onClick={onOpenSourceSelector}>
              <RefreshCw size={14} /> Switch Audio Source
            </button>
          </div>
        </div>

        <div className="player-row">
          <button
            type="button"
            className="player-round"
            disabled={!name}
            aria-label={active ? 'Pause track' : 'Play track'}
            onClick={() => (active ? audioRef.current?.pause() : void play())}
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
            {inlineOnlineOpen ? 'Hide Stash Online Player' : 'Search Online Songs (Stash)'}
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
              <small>Track metadata &amp; automatic Stash / Apple Music word-synced lyrics status</small>
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
              {currentTrack?.artist ? `Artist: ${currentTrack.artist}` : 'Select a local file or search a song in Stash Online Player'}
              {currentTrack?.album ? ` · Album: ${currentTrack.album}` : ''}
              {duration > 0 ? ` · Duration: ${format(duration)}` : ''}
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
          </div>
        </div>
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
            onChange={e => {
              if (audioRef.current) {
                audioRef.current.currentTime = Number(e.target.value);
                onTimeChange(Number(e.target.value));
                setTime(Number(e.target.value));
              }
            }}
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