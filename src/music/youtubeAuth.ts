import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { ExternalMedia, isAndroidApp } from '../audio/externalPlayer';
import { musicResolverBase } from '../network/backend';
import { backendRequest } from '../network/embeddedBackend';

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
let memoryAccessToken = '';
let memoryCookieHeader = '';
let storedCookieHeader = '';
let authVersion = 0;
let activeSignIn = 0;
let restorePromise: Promise<YouTubeAuthState> | null = null;
// Keep resolver writes ordered so a late verification cannot undo a disconnect.
let backendQueue: Promise<unknown> = Promise.resolve();

interface StoredYouTubeMeta {
  useNoCookieDomain?: boolean;
  cookieHeader?: string;
}

function loadInitialState(): YouTubeAuthState {
  let useNoCookieDomain = false;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoredYouTubeMeta;
      storedCookieHeader = typeof parsed.cookieHeader === 'string' ? parsed.cookieHeader : '';
      useNoCookieDomain = Boolean(parsed.useNoCookieDomain);
    }
  } catch { /* Ignore storage read errors. */ }
  // Persisted metadata is not proof of a currently signed-in YouTube account.
  return { connected: false, method: null, accountLabel: '', interactivePlayer: false,
    useNoCookieDomain, reloadNonce: 0, hasServerAuth: false };
}

let currentState = loadInitialState();
const listeners = new Set<(state: YouTubeAuthState) => void>();

function saveAndNotify(next: Partial<YouTubeAuthState>) {
  currentState = { ...currentState, ...next };
  currentState.hasServerAuth = Boolean(currentState.connected && (memoryAccessToken || memoryCookieHeader));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      useNoCookieDomain: currentState.useNoCookieDomain,
      cookieHeader: memoryCookieHeader || undefined,
    } satisfies StoredYouTubeMeta));
  } catch { /* Ignore storage write errors. */ }
  for (const listener of listeners) listener(currentState);
}

export function getYouTubeAuthState(): YouTubeAuthState { return currentState; }
export function getYouTubeAccessToken(): string { return memoryAccessToken; }
export function getYouTubeCookieHeader(): string { return memoryCookieHeader; }
export function getYouTubeRequestHeaders(): Record<string, string> {
  if (!currentState.connected) return {};
  return { ...(memoryAccessToken ? { 'X-YouTube-Token': memoryAccessToken } : {}),
    ...(memoryCookieHeader ? { 'X-YouTube-Cookie': memoryCookieHeader } : {}) };
}

function ensureCurrent(version: number) {
  if (version !== authVersion) throw new Error('YouTube sign-in was cancelled or replaced by another attempt.');
}

function sendCredentials(accessToken: string, cookie: string, version: number): Promise<string | null> {
  const request = backendQueue.then(async () => {
    ensureCurrent(version);
    const base = musicResolverBase();
    const response = await backendRequest(`${base.replace(/\/$/, '')}/yt-auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, cookie }), signal: AbortSignal.timeout(10000),
    });
    ensureCurrent(version);
    if (!accessToken && !cookie) return null;
    if (!response.ok) throw new Error(response.status === 401
      ? 'YouTube did not confirm a signed-in account. Sign in again.'
      : 'Unable to verify your YouTube account. Please try again.');
    const data = await response.json() as { authenticated?: boolean; verified?: boolean; accountLabel?: string };
    if (data.authenticated !== true || data.verified !== true || !data.accountLabel?.trim()) {
      throw new Error('YouTube sign-in could not be verified. The account remains disconnected.');
    }
    return data.accountLabel.trim();
  });
  backendQueue = request.catch(() => undefined);
  return request;
}

function clearConnection() {
  memoryAccessToken = '';
  memoryCookieHeader = '';
  storedCookieHeader = '';
  saveAndNotify({ connected: false, method: null, accountLabel: '' });
}

function beginAttempt(): number {
  const version = ++authVersion;
  clearConnection();
  void sendCredentials('', '', version).catch(() => undefined);
  return version;
}

async function connectVerified(version: number, method: YouTubeAuthState['method'], accessToken: string, cookie: string) {
  ensureCurrent(version);
  if (!accessToken && !cookie) throw new Error('YouTube did not return sign-in credentials. Please sign in again.');
  const accountLabel = await sendCredentials(accessToken, cookie, version);
  ensureCurrent(version);
  memoryAccessToken = accessToken;
  memoryCookieHeader = cookie;
  saveAndNotify({ connected: true, method, accountLabel: accountLabel!,
    useNoCookieDomain: false, reloadNonce: currentState.reloadNonce + 1 });
  return currentState;
}

export async function refreshNativeYouTubeAuthStatus(): Promise<YouTubeAuthState> {
  if (!isAndroidApp() || activeSignIn) return currentState;
  if (restorePromise) return restorePromise;
  const version = beginAttempt();
  restorePromise = (async () => {
    try {
      const status = await ExternalMedia.getYouTubeAuthStatus();
      ensureCurrent(version);
      if (status?.signedIn === true && status.cookie?.trim()) {
        return await connectVerified(version, 'android-webview', '', status.cookie.trim());
      }
    } catch { /* A failed or unavailable check must leave the account disconnected. */ }
    return currentState;
  })();
  try { return await restorePromise; } finally { restorePromise = null; }
}

/** A popup closing or a WebView receiving guest cookies is not sign-in confirmation. */
export async function signInToYouTubeAccount(
  mode: 'auto' | 'browser-popup' | 'google-oauth' = 'auto',
): Promise<YouTubeAuthState> {
  const version = beginAttempt();
  activeSignIn = version;
  try {
    if (isAndroidApp() && mode !== 'google-oauth') {
      const result = await ExternalMedia.openYouTubeSignIn();
      ensureCurrent(version);
      if (result?.signedIn !== true) return currentState;
      return await connectVerified(version, 'android-webview', '', result.cookie?.trim() || '');
    }
    if ((mode === 'auto' || mode === 'google-oauth') && !isAndroidApp()) {
      const fb = await import('../firebase/firebaseClient');
      if (fb.isFirebaseConfigured && fb.auth) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(fb.auth, provider);
        ensureCurrent(version);
        const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
        // OAuth errors/cancellation must not fall through to a browser-only success path.
        return await connectVerified(version, 'google-oauth', token?.trim() || '', '');
      }
      if (mode === 'google-oauth') throw new Error('Google sign-in is not configured.');
    }
    if (typeof window === 'undefined') throw new Error('YouTube sign-in is unavailable here.');
    const popup = window.open(
      'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2F',
      'lyricflow_youtube_signin', 'width=520,height=680,menubar=no,toolbar=no,location=yes,status=no',
    );
    if (!popup) throw new Error('The YouTube sign-in popup was blocked. Allow popups and try again.');
    await new Promise<void>(resolve => {
      let elapsed = 0;
      const timer = window.setInterval(() => {
        elapsed += 500;
        if (popup.closed || elapsed >= 45000 || version !== authVersion) {
          window.clearInterval(timer);
          resolve();
        }
      }, 500);
    });
    ensureCurrent(version);
    // Cross-origin browser sessions cannot be inspected by this app.
    throw new Error('Browser sign-in could not be verified. The account remains disconnected.');
  } catch (error) {
    if (version === authVersion) {
      clearConnection();
      void sendCredentials('', '', version).catch(() => undefined);
    }
    throw error;
  } finally {
    if (activeSignIn === version) activeSignIn = 0;
  }
}

export async function saveCustomYouTubeCredentials(options: {
  accessToken?: string; cookieHeader?: string; accountLabel?: string;
}): Promise<YouTubeAuthState> {
  const token = (options.accessToken ?? memoryAccessToken).trim().replace(/^Bearer\s+/i, '');
  const cookie = (options.cookieHeader ?? memoryCookieHeader).trim();
  const version = beginAttempt();
  if (!token && !cookie) return currentState;
  activeSignIn = version;
  try { return await connectVerified(version, 'custom-credentials', token, cookie); }
  finally { if (activeSignIn === version) activeSignIn = 0; }
}

export function setYouTubeInteractivePlayer(interactive: boolean): void {
  saveAndNotify({ interactivePlayer: interactive });
}
export function setYouTubeNoCookieDomain(useNoCookie: boolean): void {
  saveAndNotify({ useNoCookieDomain: useNoCookie, reloadNonce: currentState.reloadNonce + 1 });
}
export function triggerYouTubePlayerReload(): void {
  saveAndNotify({ reloadNonce: currentState.reloadNonce + 1 });
}

export async function signOutYouTubeAccount(): Promise<void> {
  const version = beginAttempt();
  activeSignIn = 0;
  saveAndNotify({ interactivePlayer: false, reloadNonce: currentState.reloadNonce + 1 });
  if (isAndroidApp()) {
    try { await ExternalMedia.signOutYouTube(); } catch { /* Keep local state disconnected. */ }
  }
  await sendCredentials('', '', version).catch(() => undefined);
}

function restoreStoredAuth(): Promise<YouTubeAuthState> {
  if (restorePromise) return restorePromise;
  if (activeSignIn || !storedCookieHeader) return Promise.resolve(currentState);
  const cookie = storedCookieHeader;
  const version = beginAttempt();
  restorePromise = connectVerified(version, 'custom-credentials', '', cookie).catch(() => currentState);
  return restorePromise.finally(() => { restorePromise = null; });
}

export function useYouTubeAuth(): YouTubeAuthState {
  const [state, setState] = useState<YouTubeAuthState>(() => getYouTubeAuthState());
  useEffect(() => {
    const listener = (next: YouTubeAuthState) => setState(next);
    listeners.add(listener);
    if (isAndroidApp()) void refreshNativeYouTubeAuthStatus();
    else void restoreStoredAuth();
    return () => { listeners.delete(listener); };
  }, []);
  return state;
}
