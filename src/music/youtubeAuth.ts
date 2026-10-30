import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { ExternalMedia, isAndroidApp } from '../audio/externalPlayer';
import { musicBackendBase } from '../network/backend';

export interface YouTubeAuthState {
  connected: boolean;
  method: 'android-webview' | 'google-oauth' | 'browser-session' | 'custom-credentials' | null;
  accountLabel: string;
  interactivePlayer: boolean;
  useNoCookieDomain: boolean;
  reloadNonce: number;
  hasServerAuth: boolean;
}

const STORAGE_KEY = 'lyricflow.youtubeAuth.v1';

// Keep OAuth accessToken & cookies in memory so they are never leaked unnecessarily
let memoryAccessToken = '';
let memoryCookieHeader = '';

interface StoredYouTubeMeta {
  connected?: boolean;
  method?: YouTubeAuthState['method'];
  accountLabel?: string;
  interactivePlayer?: boolean;
  useNoCookieDomain?: boolean;
  cookieHeader?: string;
}

function loadInitialState(): YouTubeAuthState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoredYouTubeMeta;
      if (parsed.cookieHeader) {
        memoryCookieHeader = parsed.cookieHeader;
      }
      return {
        connected: Boolean(parsed.connected),
        method: parsed.method ?? null,
        accountLabel: parsed.accountLabel || (parsed.connected ? 'YouTube Account' : ''),
        interactivePlayer: Boolean(parsed.interactivePlayer),
        useNoCookieDomain: Boolean(parsed.useNoCookieDomain),
        reloadNonce: 0,
        hasServerAuth: Boolean(memoryAccessToken || memoryCookieHeader),
      };
    }
  } catch {
    // Ignore storage read error
  }
  return {
    connected: false,
    method: null,
    accountLabel: '',
    interactivePlayer: false,
    useNoCookieDomain: false,
    reloadNonce: 0,
    hasServerAuth: false,
  };
}

let currentState: YouTubeAuthState = loadInitialState();
const listeners = new Set<(state: YouTubeAuthState) => void>();

function saveAndNotify(next: Partial<YouTubeAuthState>) {
  currentState = {
    ...currentState,
    ...next,
    hasServerAuth: Boolean(memoryAccessToken || memoryCookieHeader),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      const toStore: StoredYouTubeMeta = {
        connected: currentState.connected,
        method: currentState.method,
        accountLabel: currentState.accountLabel,
        interactivePlayer: currentState.interactivePlayer,
        useNoCookieDomain: currentState.useNoCookieDomain,
        cookieHeader: memoryCookieHeader || undefined,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    }
  } catch {
    // Ignore storage error
  }
  for (const listener of listeners) {
    listener(currentState);
  }
}

export function getYouTubeAuthState(): YouTubeAuthState {
  return currentState;
}

export function getYouTubeAccessToken(): string {
  return memoryAccessToken;
}

export function getYouTubeCookieHeader(): string {
  return memoryCookieHeader;
}

export function getYouTubeRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (memoryAccessToken) {
    headers['X-YouTube-Token'] = memoryAccessToken;
  }
  if (memoryCookieHeader) {
    headers['X-YouTube-Cookie'] = memoryCookieHeader;
  }
  return headers;
}

async function syncCredentialsToBackend(): Promise<void> {
  try {
    const base =
      (typeof localStorage !== 'undefined' && localStorage.getItem('lyricflow.resolver')) ||
      import.meta.env?.VITE_MUSIC_RESOLVER ||
      musicBackendBase();
    const url = `${base.replace(/\/$/, '')}/yt-auth`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getYouTubeRequestHeaders(),
      },
      body: JSON.stringify({
        accessToken: memoryAccessToken || '',
        cookie: memoryCookieHeader || '',
      }),
    });
  } catch {
    // Non-fatal if backend is not yet ready
  }
}

export async function refreshNativeYouTubeAuthStatus(): Promise<YouTubeAuthState> {
  if (!isAndroidApp()) return currentState;
  try {
    const status = await ExternalMedia.getYouTubeAuthStatus();
    if (status?.signedIn) {
      memoryCookieHeader = status.cookie || memoryCookieHeader;
      saveAndNotify({
        connected: true,
        method: 'android-webview',
        accountLabel: 'Signed in on Android YouTube',
      });
      void syncCredentialsToBackend();
    }
  } catch {
    // Ignore if plugin method not available
  }
  return currentState;
}

/**
 * Signs in to the user's YouTube account:
 * - On Android App: opens a first-party WebView Dialog to Google/YouTube Sign-In, shares cookies with
 *   the embedded YouTube player (`CookieManager.setAcceptThirdPartyCookies`), and forwards session cookies to the backend.
 * - On Web (with Firebase): opens Google OAuth with `youtube.readonly` scope so YouTube searches and embeds run under the user's Google account.
 * - On Web (without Firebase / Guest mode): opens the YouTube Sign-In window so the browser authenticates on youtube.com for embedded playback.
 */
export async function signInToYouTubeAccount(
  mode: 'auto' | 'browser-popup' | 'google-oauth' = 'auto'
): Promise<YouTubeAuthState> {
  // 1. Android Native App: Use in-app WebView Dialog with shared CookieManager
  if (isAndroidApp() && mode !== 'google-oauth') {
    const res = await ExternalMedia.openYouTubeSignIn();
    if (res?.cookie) {
      memoryCookieHeader = res.cookie;
    }
    saveAndNotify({
      connected: Boolean(res?.signedIn || res?.cookie),
      method: 'android-webview',
      accountLabel: res?.signedIn ? 'YouTube Account (Android)' : 'YouTube Session Active',
      useNoCookieDomain: false,
      reloadNonce: currentState.reloadNonce + 1,
    });
    await syncCredentialsToBackend();
    return currentState;
  }

  // 2. Web Google OAuth Popup (when Firebase is configured and requested)
  if ((mode === 'auto' || mode === 'google-oauth') && !isAndroidApp()) {
    try {
      const fb = await import('../firebase/firebaseClient');
      if (fb.isFirebaseConfigured && fb.auth) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(fb.auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          memoryAccessToken = credential.accessToken;
        }
        const label =
          result.user.displayName || result.user.email || 'Google / YouTube Account';
        saveAndNotify({
          connected: true,
          method: 'google-oauth',
          accountLabel: label,
          useNoCookieDomain: false,
          reloadNonce: currentState.reloadNonce + 1,
        });
        await syncCredentialsToBackend();
        return currentState;
      }
    } catch (err) {
      if (mode === 'google-oauth') throw err;
      // Fall through to browser session popup if OAuth popup wasn't used
    }
  }

  // 3. Browser YouTube Session Sign-In Popup (works in all web environments including Guest mode)
  if (typeof window !== 'undefined') {
    const loginUrl =
      'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2F';
    const popup = window.open(
      loginUrl,
      'lyricflow_youtube_signin',
      'width=520,height=680,menubar=no,toolbar=no,location=yes,status=no'
    );
    if (popup) {
      await new Promise<void>(resolve => {
        let elapsed = 0;
        const timer = window.setInterval(() => {
          elapsed += 500;
          if (popup.closed || elapsed >= 45000) {
            window.clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    }
    saveAndNotify({
      connected: true,
      method: 'browser-session',
      accountLabel: 'YouTube Browser Account',
      useNoCookieDomain: false,
      reloadNonce: currentState.reloadNonce + 1,
    });
  }

  return currentState;
}

export async function saveCustomYouTubeCredentials(options: {
  accessToken?: string;
  cookieHeader?: string;
  accountLabel?: string;
}): Promise<YouTubeAuthState> {
  if (options.accessToken !== undefined) {
    memoryAccessToken = options.accessToken.trim().replace(/^Bearer\s+/i, '');
  }
  if (options.cookieHeader !== undefined) {
    memoryCookieHeader = options.cookieHeader.trim();
  }
  const hasAny = Boolean(memoryAccessToken || memoryCookieHeader);
  saveAndNotify({
    connected: hasAny || currentState.connected,
    method: hasAny ? 'custom-credentials' : currentState.method,
    accountLabel:
      options.accountLabel?.trim() ||
      (hasAny ? 'YouTube Authenticated Session' : currentState.accountLabel),
    useNoCookieDomain: false,
    reloadNonce: currentState.reloadNonce + 1,
  });
  await syncCredentialsToBackend();
  return currentState;
}

export function setYouTubeInteractivePlayer(interactive: boolean): void {
  saveAndNotify({
    interactivePlayer: interactive,
  });
}

export function setYouTubeNoCookieDomain(useNoCookie: boolean): void {
  saveAndNotify({
    useNoCookieDomain: useNoCookie,
    reloadNonce: currentState.reloadNonce + 1,
  });
}

export function triggerYouTubePlayerReload(): void {
  saveAndNotify({
    reloadNonce: currentState.reloadNonce + 1,
  });
}

export async function signOutYouTubeAccount(): Promise<void> {
  memoryAccessToken = '';
  memoryCookieHeader = '';
  if (isAndroidApp()) {
    try {
      await ExternalMedia.signOutYouTube();
    } catch {
      // Ignore native sign-out error
    }
  }
  saveAndNotify({
    connected: false,
    method: null,
    accountLabel: '',
    interactivePlayer: false,
    reloadNonce: currentState.reloadNonce + 1,
  });
  await syncCredentialsToBackend();
}

export function useYouTubeAuth(): YouTubeAuthState {
  const [state, setState] = useState<YouTubeAuthState>(() => getYouTubeAuthState());
  useEffect(() => {
    const listener = (next: YouTubeAuthState) => setState(next);
    listeners.add(listener);
    if (isAndroidApp()) {
      void refreshNativeYouTubeAuthStatus();
    } else if (memoryAccessToken || memoryCookieHeader) {
      void syncCredentialsToBackend();
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}
