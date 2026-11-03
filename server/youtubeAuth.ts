import { createHash } from 'node:crypto';

export interface YouTubeAuthContext {
  accessToken?: string;
  cookie?: string;
}

export function buildYouTubeAuthHeaders(
  auth?: YouTubeAuthContext,
  origin = 'https://www.youtube.com',
): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = auth?.accessToken?.trim();
  const cookie = auth?.cookie?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) {
    headers.Cookie = cookie;
    headers['X-Origin'] = origin;
    headers['X-Goog-AuthUser'] = '0';
    const sapisid = (cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/) ||
      cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/))?.[1]?.trim();
    if (sapisid && !token) {
      const timestamp = Math.floor(Date.now() / 1000);
      const digest = createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex');
      const hash = `${timestamp}_${digest}`;
      headers.Authorization = `SAPISIDHASH ${hash} SAPISID1PHASH ${hash} SAPISID3PHASH ${hash}`;
    }
  }
  return headers;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

/** Account-menu shape follows sigma67/ytmusicapi's get_account_info().
 * A successful HTTP response, guest cookies, or a loggedOut flag alone never proves sign-in.
 */
export async function verifyYouTubeAccount(auth: YouTubeAuthContext): Promise<string | null> {
  if (!auth.accessToken && !auth.cookie) return null;
  const origin = 'https://music.youtube.com';
  const response = await fetch(`${origin}/youtubei/v1/account/account_menu?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...buildYouTubeAuthHeaders(auth, origin) },
    body: JSON.stringify({ context: { client: {
      clientName: 'WEB_REMIX', clientVersion: '1.20250219.01.00', hl: 'en',
    } } }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('YouTube account verification is unavailable. Try again.');
  const data = record(await response.json());
  const context = record(record(data.responseContext).mainAppWebResponseContext);
  if (data.error || context.loggedOut === true) return null;
  const actions = Array.isArray(data.actions) ? data.actions : [];
  for (const action of actions) {
    const popup = record(record(action).openPopupAction).popup;
    const header = record(record(record(popup).multiPageMenuRenderer).header).activeAccountHeaderRenderer;
    const name = record(record(header).accountName);
    const runs = Array.isArray(name.runs) ? name.runs : [];
    const label = typeof name.simpleText === 'string' ? name.simpleText :
      runs.map(run => record(run).text).filter((text): text is string => typeof text === 'string').join('');
    if (label.trim()) return label.trim();
  }
  return null;
}
