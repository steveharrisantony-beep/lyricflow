// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  android: false, configured: true,
  status: vi.fn(), nativeSignIn: vi.fn(), nativeSignOut: vi.fn(), oauth: vi.fn(), credential: vi.fn(),
}));
vi.mock('../audio/externalPlayer', () => ({
  isAndroidApp: () => mocks.android,
  ExternalMedia: { getYouTubeAuthStatus: mocks.status, openYouTubeSignIn: mocks.nativeSignIn, signOutYouTube: mocks.nativeSignOut },
}));
vi.mock('../firebase/firebaseClient', () => ({ get isFirebaseConfigured() { return mocks.configured; }, auth: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class { addScope() {} setCustomParameters() {} static credentialFromResult = mocks.credential; },
  signInWithPopup: mocks.oauth,
}));
let auth: typeof import('../music/youtubeAuth');
let fetchMock: ReturnType<typeof vi.fn>;
const verified = () => Response.json({ authenticated: true, verified: true, accountLabel: 'Fixture account' });
function credentialsRequest() {
  return fetchMock.mock.calls.filter(([, init]) => {
    const body = JSON.parse(init.body);
    return body.accessToken || body.cookie;
  });
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  mocks.android = false; mocks.configured = true;
  mocks.nativeSignOut.mockResolvedValue({ signedIn: false });
  mocks.oauth.mockResolvedValue({ user: { displayName: 'Fixture Google user' } });
  mocks.credential.mockReturnValue({ accessToken: 'fixture-token' });
  fetchMock = vi.fn().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    return body.accessToken || body.cookie ? verified() : Response.json({ authenticated: false, verified: false });
  });
  vi.stubGlobal('fetch', fetchMock);
  auth = await import('../music/youtubeAuth');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('ignores a persisted connected flag and withholds unverified cookies from requests', async () => {
  localStorage.setItem('lyricflow.youtubeAuth.v1', JSON.stringify({ connected: true, method: 'android-webview', cookieHeader: 'fixture=expired' }));
  vi.resetModules(); auth = await import('../music/youtubeAuth');
  expect(auth.getYouTubeAuthState()).toMatchObject({ connected: false, hasServerAuth: false, accountLabel: '' });
  expect(auth.getYouTubeRequestHeaders()).toEqual({});
  expect(auth.getYouTubeCookieHeader()).toBe('');
});
it('does not count guest Android cookies as a completed sign-in', async () => {
  mocks.android = true;
  mocks.nativeSignIn.mockResolvedValue({ signedIn: false, cookie: 'VISITOR_INFO1_LIVE=fixture' });
  expect((await auth.signInToYouTubeAccount()).connected).toBe(false);
  expect(credentialsRequest()).toHaveLength(0);
  expect(auth.getYouTubeRequestHeaders()).toEqual({});
});
it('requires credentials even when the native plugin reports signed in', async () => {
  mocks.android = true; mocks.nativeSignIn.mockResolvedValue({ signedIn: true });
  await expect(auth.signInToYouTubeAccount()).rejects.toThrow('did not return');
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('connects an Android account only after the resolver verifies it', async () => {
  mocks.android = true; mocks.nativeSignIn.mockResolvedValue({ signedIn: true, cookie: 'SAPISID=fixture-only' });
  const result = await auth.signInToYouTubeAccount();
  expect(result).toMatchObject({ connected: true, hasServerAuth: true, method: 'android-webview', accountLabel: 'Fixture account' });
  expect(auth.getYouTubeRequestHeaders()).toEqual({ 'X-YouTube-Cookie': 'SAPISID=fixture-only' });
});
it('rejects expired Android login cookies despite a native signed-in flag', async () => {
  mocks.android = true; mocks.nativeSignIn.mockResolvedValue({ signedIn: true, cookie: 'SAPISID=expired-fixture' });
  fetchMock.mockResolvedValue(Response.json({ authenticated: false }, { status: 401 }));
  await expect(auth.signInToYouTubeAccount()).rejects.toThrow('did not confirm');
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('clears an existing connection when the native status reports signed out', async () => {
  await auth.saveCustomYouTubeCredentials({ cookieHeader: 'fixture=valid' });
  mocks.android = true; mocks.status.mockResolvedValue({ signedIn: false, cookie: 'VISITOR_INFO1_LIVE=fixture' });
  await auth.refreshNativeYouTubeAuthStatus();
  expect(auth.getYouTubeAuthState()).toMatchObject({ connected: false, hasServerAuth: false, accountLabel: '' });
});
it('clears an existing connection if checking the native session fails', async () => {
  await auth.saveCustomYouTubeCredentials({ cookieHeader: 'fixture=valid' });
  mocks.android = true; mocks.status.mockRejectedValue(new Error('Plugin unavailable'));
  await auth.refreshNativeYouTubeAuthStatus();
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('rejects a blocked browser popup instead of declaring it connected', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  await expect(auth.signInToYouTubeAccount('browser-popup')).rejects.toThrow('blocked');
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('does not infer sign-in from closing a browser popup', async () => {
  vi.useFakeTimers(); vi.spyOn(window, 'open').mockReturnValue({ closed: true } as Window);
  const result = expect(auth.signInToYouTubeAccount('browser-popup')).rejects.toThrow('could not be verified');
  await vi.advanceTimersByTimeAsync(500); await result;
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('keeps a timed-out browser popup disconnected', async () => {
  vi.useFakeTimers(); vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window);
  const result = expect(auth.signInToYouTubeAccount('browser-popup')).rejects.toThrow('could not be verified');
  await vi.advanceTimersByTimeAsync(45000); await result;
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('does not fall back to a browser popup after OAuth cancellation', async () => {
  const open = vi.spyOn(window, 'open');
  mocks.oauth.mockRejectedValue(new Error('Popup closed by user'));
  await expect(auth.signInToYouTubeAccount()).rejects.toThrow('Popup closed');
  expect(open).not.toHaveBeenCalled();
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('requires an OAuth access token, not just a Firebase user', async () => {
  mocks.credential.mockReturnValue(null);
  await expect(auth.signInToYouTubeAccount()).rejects.toThrow('did not return');
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('verifies OAuth credentials with YouTube before reporting connected', async () => {
  expect(await auth.signInToYouTubeAccount()).toMatchObject({ connected: true, method: 'google-oauth', accountLabel: 'Fixture account' });
  expect(auth.getYouTubeRequestHeaders()).toEqual({ 'X-YouTube-Token': 'fixture-token' });
});
it('rejects a presence-only response from an old resolver', async () => {
  fetchMock.mockImplementation(async (_url, init) => JSON.parse(init.body).cookie
    ? Response.json({ authenticated: true, hasCookie: true }) : Response.json({ authenticated: false }));
  await expect(auth.saveCustomYouTubeCredentials({ cookieHeader: 'fixture=invalid' })).rejects.toThrow('could not be verified');
  expect(auth.getYouTubeAuthState().connected).toBe(false);
  expect(auth.getYouTubeCookieHeader()).toBe('');
});
it('leaves the account disconnected when verification is unreachable', async () => {
  fetchMock.mockRejectedValue(new Error('Network unavailable'));
  await expect(auth.saveCustomYouTubeCredentials({ accessToken: 'fixture-token' })).rejects.toThrow();
  expect(auth.getYouTubeAuthState().connected).toBe(false);
});
it('clears the connection when advanced credentials are emptied', async () => {
  await auth.saveCustomYouTubeCredentials({ cookieHeader: 'fixture=valid' });
  const next = await auth.saveCustomYouTubeCredentials({ cookieHeader: '', accessToken: '' });
  expect(next).toMatchObject({ connected: false, hasServerAuth: false });
  expect(auth.getYouTubeRequestHeaders()).toEqual({});
});
it('does not revive a connection when a sign-in dialog completes after sign-out', async () => {
  mocks.android = true;
  let finish!: (value: unknown) => void;
  mocks.nativeSignIn.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = expect(auth.signInToYouTubeAccount()).rejects.toThrow('cancelled');
  await auth.signOutYouTubeAccount();
  finish({ signedIn: true, cookie: 'SAPISID=fixture-only' });
  await pending;
  expect(auth.getYouTubeAuthState().connected).toBe(false);
  expect(credentialsRequest()).toHaveLength(0);
});
it('discards a verification response arriving after sign-out and clears resolver credentials', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(async (_url, init) => JSON.parse(init.body).accessToken
    ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ authenticated: false }));
  const pending = expect(auth.saveCustomYouTubeCredentials({ accessToken: 'fixture-token' })).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const signingOut = auth.signOutYouTubeAccount();
  finish(verified());
  await pending; await signingOut;
  expect(auth.getYouTubeAuthState()).toMatchObject({ connected: false, hasServerAuth: false });
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ accessToken: '', cookie: '' });
});
