/// <reference types="node" />
import { afterEach, expect, it, vi } from 'vitest';
import { verifyYouTubeAccount } from '../../server/youtubeAuth';
const account = { actions: [{ openPopupAction: { popup: { multiPageMenuRenderer: {
  header: { activeAccountHeaderRenderer: { accountName: { runs: [{ text: 'Fixture account' }] } } },
} } } }] };
afterEach(() => vi.unstubAllGlobals());
it('validates the authenticated account-menu response with the supplied credentials', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(account)); vi.stubGlobal('fetch', fetchMock);
  expect(await verifyYouTubeAccount({ cookie: 'SAPISID=fixture-only' })).toBe('Fixture account');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('/youtubei/v1/account/account_menu');
  expect(init.headers.Cookie).toBe('SAPISID=fixture-only');
  expect(init.headers.Authorization).toMatch(/^SAPISIDHASH /);
  expect(init.headers.Origin).toBe('https://music.youtube.com');
});
it('forwards OAuth bearer credentials for account verification', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(account)); vi.stubGlobal('fetch', fetchMock);
  expect(await verifyYouTubeAccount({ accessToken: 'fixture-token' })).toBe('Fixture account');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-token');
});
it.each([
  {}, { responseContext: { mainAppWebResponseContext: { loggedOut: false } } },
  { ...account, responseContext: { mainAppWebResponseContext: { loggedOut: true } } },
  { ...account, error: { code: 401 } },
])('rejects anonymous, incomplete or explicitly logged-out responses', async payload => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
  expect(await verifyYouTubeAccount({ cookie: 'VISITOR_INFO1_LIVE=fixture-only' })).toBeNull();
});
it.each([401, 403])('rejects HTTP %i without marking credentials verified', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
  expect(await verifyYouTubeAccount({ accessToken: 'fixture-token' })).toBeNull();
});
it('propagates outages instead of returning a false success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  await expect(verifyYouTubeAccount({ accessToken: 'fixture-token' })).rejects.toThrow('unavailable');
});
it('does not request an account when no credentials are supplied', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect(await verifyYouTubeAccount({})).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
});
