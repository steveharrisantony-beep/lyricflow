// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { correctionContext, correctionKey, makeCorrection, lyricFingerprint, validCorrection, chooseCorrection } from '../firebase/correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';
import { scopedKey } from '../firebase/deviceStore';

const fake = vi.hoisted(() => ({ listeners: new Map<string, (snap: unknown) => void>(), set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../firebase/firebaseClient', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  onSnapshot: (path: string, options: unknown, callback?: (snap: unknown) => void) => {
    fake.listeners.set(path, (typeof options === 'function' ? options : callback) as (snap: unknown) => void);
    return () => fake.listeners.delete(path);
  },
  setDoc: (...args: unknown[]) => fake.set(...args), deleteDoc: (...args: unknown[]) => fake.remove(...args), serverTimestamp: () => 'SERVER_TIME',
}));
import { watchCorrection, savePersonalCorrection, removePersonalCorrection, submitCorrection } from '../firebase/correctionStore';
const track: TrackInfo = { title: 'Song', artist: 'Artist', album: 'Studio', duration: 200, provider: 'local', source: 'manual', confidence: 1 };
const ctx = correctionContext(track, 'delay', lyricFingerprint('[00:01]Original test words'))!;
const approved = makeCorrection(ctx, { delaySeconds: 2 });
const personal = makeCorrection(ctx, { delaySeconds: 0 });
function snapshot(value: unknown, fromCache = false) { return { exists: () => value !== null, data: () => value, metadata: { fromCache, hasPendingWrites: false } }; }

beforeEach(() => { localStorage.clear(); fake.listeners.clear(); fake.set.mockReset().mockResolvedValue(undefined); fake.remove.mockReset().mockResolvedValue(undefined); });
describe('safe correction matching', () => {
  it('separates recordings, durations and lyrics revisions while sharing catalog matches', () => {
    for (const change of [{ title: 'Song (Live)' }, { duration: 260 }]) {
      expect(correctionContext({ ...track, ...change }, 'delay', ctx.lyricsKey)?.recordingKey).not.toBe(ctx.recordingKey);
    }
    expect(correctionContext({ ...track, provider: 'jiosaavn', album: 'Different catalog label' }, 'delay', ctx.lyricsKey)?.recordingKey).toBe(ctx.recordingKey);
    const revised = correctionContext(track, 'delay', lyricFingerprint('[00:02]Original test words'))!;
    expect(validCorrection(approved, revised)).toBeNull();
    expect(chooseCorrection(personal, approved).correction?.delaySeconds).toBe(0);
  });
  it('accepts reordered Firestore maps but rejects forged identity and invalid values', () => {
    const i = ctx.identity;
    expect(validCorrection({ ...approved, identity: { duration: i.duration, album: i.album, artist: i.artist, title: i.title, providerId: i.providerId, provider: i.provider } }, ctx)).not.toBeNull();
    expect(validCorrection({ ...approved, identity: { ...i, title: 'different song' } }, ctx)).toBeNull();
    expect(validCorrection({ ...approved, delaySeconds: NaN }, ctx)).toBeNull();
    expect(validCorrection({ ...approved, delaySeconds: 31 }, ctx)).toBeNull();
  });
});
describe('personal and public storage', () => {
  it('gives a guest public corrections without exposing another account’s override', async () => {
    await savePersonalCorrection('accountA', personal);
    const results: unknown[] = [];
    const stop = watchCorrection(ctx, null, value => results.push(value), () => {});
    fake.listeners.get('approvedCorrections/' + correctionKey(ctx))!(snapshot({ ...approved, active: true }));
    expect(results.at(-1)).toMatchObject({ source: 'approved', correction: { delaySeconds: 2 } });
    expect([...fake.listeners.keys()].some(p => p.startsWith('profiles/'))).toBe(false);
    stop(); expect(fake.listeners.size).toBe(0);
  });
  it('retains a personal zero offset when the community changes and restores public defaults on reset', async () => {
    await savePersonalCorrection(null, personal);
    let result: unknown;
    const stop = watchCorrection(ctx, null, value => { result = value; }, () => {});
    const pub = fake.listeners.get('approvedCorrections/' + correctionKey(ctx))!;
    pub(snapshot({ ...approved, active: true }));
    expect(result).toMatchObject({ source: 'personal', correction: { delaySeconds: 0 } });
    await removePersonalCorrection(null, ctx);
    expect(result).toMatchObject({ source: 'approved', correction: { delaySeconds: 2 } });
    pub(snapshot({ ...approved, active: false }));
    expect(result).toMatchObject({ source: 'automatic', correction: null });
    stop();
  });
  it('keeps queued offline edits ahead of stale cloud snapshots and isolates account B', async () => {
    fake.set.mockImplementation(() => new Promise(() => {}));
    void savePersonalCorrection('accountA', personal);
    let result: unknown;
    const stop = watchCorrection(ctx, 'accountA', value => { result = value; }, () => {});
    fake.listeners.get(`profiles/accountA/corrections/${correctionKey(ctx)}`)!(snapshot(approved, true));
    expect(result).toMatchObject({ source: 'personal', correction: { delaySeconds: 0 } });
    expect(JSON.parse(localStorage.getItem(scopedKey('corrections', 'accountA'))!)[correctionKey(ctx)].dirty).toBe(true);
    stop();
    const stopB = watchCorrection(ctx, 'accountB', value => { result = value; }, () => {});
    expect(result).toMatchObject({ source: 'automatic', correction: null }); stopB();
  });
  it('removes a revoked public correction after reconnect, rather than keeping stale cache forever', () => {
    const stop = watchCorrection(ctx, null, () => {}, () => {});
    fake.listeners.get('approvedCorrections/' + correctionKey(ctx))!(snapshot({ ...approved, active: true })); stop();
    let result: unknown;
    const stopAgain = watchCorrection(ctx, null, value => { result = value; }, () => {});
    expect(result).toMatchObject({ source: 'approved' });
    fake.listeners.get('approvedCorrections/' + correctionKey(ctx))!(snapshot(null));
    expect(result).toMatchObject({ source: 'automatic', correction: null }); stopAgain();
  });
  it('requires verified sign-in and submits metadata only as pending', async () => {
    await expect(submitCorrection(null, personal)).rejects.toThrow('Sign in');
    await expect(submitCorrection({ uid: 'accountA', emailVerified: false } as never, personal)).rejects.toThrow('Verify');
    await submitCorrection({ uid: 'accountA', emailVerified: true, email: 'private@example.com' } as never, personal);
    const [path, payload] = fake.set.mock.calls.at(-1)!;
    expect(path).toMatch(new RegExp(`^correctionSubmissions/accountA/items/${correctionKey(ctx)}_[a-f0-9]{16}$`));
    expect(payload.status).toBe('pending'); expect(payload).not.toHaveProperty('email'); expect(payload).not.toHaveProperty('original');
  });
});
