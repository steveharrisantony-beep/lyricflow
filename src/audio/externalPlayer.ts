import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import {
  connectExternalAudio,
  connectMicrophoneAudio,
  feedExternalVisualizerData,
} from './audioSignal';

export type ExternalAudioCaptureMode = 'mic' | 'internal';

export interface ExternalMediaState {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  playing: boolean;
  packageName: string;
  appName: string;
  updatedAt: number;
  isAd?: boolean;
}

export interface ExternalMediaPluginInterface {
  checkNotificationAccess(): Promise<{ granted: boolean }>;
  openNotificationSettings(): Promise<{ opened: boolean }>;
  getCurrentMedia(): Promise<{ granted: boolean; media: ExternalMediaState | null }>;
  startListening(): Promise<{ listening: boolean; granted: boolean; media: ExternalMediaState | null }>;
  stopListening(): Promise<{ listening: boolean }>;
  startAudioCapture(options: { mode: ExternalAudioCaptureMode }): Promise<{ started: boolean; mode: ExternalAudioCaptureMode }>;
  stopAudioCapture(): Promise<{ stopped: boolean }>;
  getYouTubeAuthStatus(): Promise<{ signedIn: boolean; cookie?: string }>;
  openYouTubeSignIn(): Promise<{ signedIn: boolean; cookie?: string }>;
  signOutYouTube(): Promise<{ signedIn: boolean }>;
  addListener(
    eventName: 'mediaChange',
    listenerFunc: (state: ExternalMediaState) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'audioCapture',
    listenerFunc: (data: { mode: string; fft: number[]; waveform: number[] }) => void
  ): Promise<PluginListenerHandle>;
}

export const ExternalMedia = registerPlugin<ExternalMediaPluginInterface>('ExternalMedia');

let androidOverrideForTest: boolean | null = null;

export function setAndroidAppOverrideForTest(value: boolean | null) {
  androidOverrideForTest = value;
}

/**
 * Returns true only when running inside the native Android Capacitor app.
 * On web browsers, External Player mode displays as "Not available in web".
 */
export function isAndroidApp(): boolean {
  if (androidOverrideForTest !== null) return androidOverrideForTest;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function checkExternalNotificationAccess(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const res = await ExternalMedia.checkNotificationAccess();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

export async function openExternalNotificationSettings(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    const res = await ExternalMedia.openNotificationSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function getCurrentExternalMedia(): Promise<{
  granted: boolean;
  media: ExternalMediaState | null;
}> {
  if (!isAndroidApp()) return { granted: false, media: null };
  try {
    const res = await ExternalMedia.getCurrentMedia();
    return {
      granted: Boolean(res?.granted),
      media: res?.media && res.media.title ? res.media : null,
    };
  } catch {
    return { granted: false, media: null };
  }
}

export async function subscribeExternalMedia(
  onMediaChange: (media: ExternalMediaState | null, granted: boolean) => void
): Promise<() => void> {
  if (!isAndroidApp()) {
    onMediaChange(null, false);
    return () => {};
  }
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  try {
    handle = await ExternalMedia.addListener('mediaChange', state => {
      if (cancelled) return;
      if (state && typeof state.title === 'string' && state.title.trim()) {
        onMediaChange(state, true);
      }
    });
    const initial = await ExternalMedia.startListening();
    if (!cancelled) {
      onMediaChange(
        initial?.media && initial.media.title ? initial.media : null,
        Boolean(initial?.granted)
      );
    }
  } catch {
    if (!cancelled) onMediaChange(null, false);
  }

  return () => {
    cancelled = true;
    void handle?.remove();
    void ExternalMedia.stopListening().catch(() => {});
  };
}

let activeAudioCtx: AudioContext | null = null;
let activeMediaStream: MediaStream | null = null;
let activeCaptureListener: PluginListenerHandle | null = null;

export async function stopExternalAudioCapture(): Promise<void> {
  if (activeCaptureListener) {
    try {
      await activeCaptureListener.remove();
    } catch {}
    activeCaptureListener = null;
  }
  if (isAndroidApp()) {
    try {
      await ExternalMedia.stopAudioCapture();
    } catch {}
  }
  if (activeMediaStream) {
    for (const track of activeMediaStream.getTracks()) {
      track.stop();
    }
    activeMediaStream = null;
  }
  if (activeAudioCtx) {
    try {
      await activeAudioCtx.close();
    } catch {}
    activeAudioCtx = null;
  }
  connectMicrophoneAudio(null);
  connectExternalAudio(null);
}

/**
 * Starts audio reactivity capture for the External Player on Android:
 * - `'mic'`: Captures microphone input via Web Audio `AnalyserNode` (after ensuring Android RECORD_AUDIO permission).
 * - `'internal'`: Captures Android internal system output mix via native `Visualizer(0)` and feeds the 64-band analyzer.
 */
export async function startExternalAudioCapture(
  mode: ExternalAudioCaptureMode
): Promise<{ ok: boolean; activeMode: ExternalAudioCaptureMode; message: string }> {
  await stopExternalAudioCapture();

  if (!isAndroidApp()) {
    return {
      ok: false,
      activeMode: mode,
      message: 'External Player audio capture is only available in the Android app.',
    };
  }

  if (mode === 'internal') {
    try {
      activeCaptureListener = await ExternalMedia.addListener('audioCapture', payload => {
        if (payload && Array.isArray(payload.fft) && Array.isArray(payload.waveform)) {
          feedExternalVisualizerData(payload.waveform, payload.fft, 'INTERNAL AUDIO');
        }
      });
      await ExternalMedia.startAudioCapture({ mode: 'internal' });
      return {
        ok: true,
        activeMode: 'internal',
        message: 'Internal audio capture active · reacting to device media output',
      };
    } catch (err) {
      await stopExternalAudioCapture();
      return {
        ok: false,
        activeMode: 'internal',
        message:
          err instanceof Error
            ? err.message
            : 'Internal audio capture failed. Try switching audio source to Mic.',
      };
    }
  }

  // Microphone mode
  try {
    await ExternalMedia.startAudioCapture({ mode: 'mic' });
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.42;
      source.connect(analyser);
      await ctx.resume();
      activeMediaStream = stream;
      activeAudioCtx = ctx;
      connectMicrophoneAudio(analyser);
    }
    return {
      ok: true,
      activeMode: 'mic',
      message: 'Microphone audio capture active · reacting to ambient song audio',
    };
  } catch (err) {
    await stopExternalAudioCapture();
    return {
      ok: false,
      activeMode: 'mic',
      message:
        err instanceof Error
          ? err.message
          : 'Microphone access was denied. Grant audio permission in Android settings.',
    };
  }
}
