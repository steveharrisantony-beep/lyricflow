// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { correctionContext, correctionKey, makeCorrection, lyricFingerprint, validCorrection, chooseCorrection } from '../firebase/correctionModel';
import type { TrackInfo } from '../metadata/trackInfo';
import { scopedKey } from '../firebase/deviceStore';
import {temporarySongs} from '../data/temporarySongs';
import {saveSongMapping} from '../data/saveSongMapping';

import { watchCorrection, savePersonalCorrection, removePersonalCorrection, submitCorrection, discardSongCorrections } from '../firebase/correctionStore';
const track: TrackInfo = { title: 'Song', artist: 'Artist', album: 'Studio', duration: 200, provider: 'local', source: 'manual', confidence: 1 };
const ctx = correctionContext(track, 'delay', lyricFingerprint('[00:01]Original test words'))!;
const approved = makeCorrection(ctx, { delaySeconds: 2 });
const personal = makeCorrection(ctx, { delaySeconds: 0 });
function publish(value:unknown){
 localStorage.setItem('lyricflow.v3.approvedCorrections',JSON.stringify(value?{[correctionKey(ctx)]:{value,dirty:false}}:{}));
 window.dispatchEvent(new Event('lyricflow:corrections'));
}

beforeEach(() => { localStorage.clear(); temporarySongs.clear(); });
it('removes old lyric selections and timing fixes while preserving the video and other songs',async()=>{
 const selectionContext=correctionContext(track,'lyrics')!,videoContext=correctionContext(track,'video')!;
 await savePersonalCorrection(null,personal);
 await savePersonalCorrection(null,makeCorrection(selectionContext,{selection:{engine:'lrclib',lrclibId:11,subtitleTrackId:null}}));
 await savePersonalCorrection(null,makeCorrection(videoContext,{youtubeVideoId:'abcdefghijk',videoDelaySeconds:0}));
 const other=correctionContext({...track,title:'Another song'},'delay',ctx.lyricsKey)!;
 await savePersonalCorrection(null,makeCorrection(other,{delaySeconds:3}));
 discardSongCorrections(null,ctx.identity,['lyrics','delay']);
 expect(JSON.parse(localStorage.getItem(scopedKey('corrections',null))!)[correctionKey(ctx)]).toBeDefined();
 saveSongMapping(track,null);
 const saved=JSON.parse(localStorage.getItem(scopedKey('corrections',null))!);
 expect(saved[correctionKey(ctx)]).toBeUndefined();expect(saved[correctionKey(selectionContext)]).toBeUndefined();
 expect(saved[correctionKey(videoContext)]).toBeDefined();expect(saved[correctionKey(other)]).toBeDefined();
});
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
    publish(approved);
    expect(results.at(-1)).toMatchObject({ source: 'approved', correction: { delaySeconds: 2 } });
    stop();
  });
  it('retains a personal zero offset when the community changes and restores public defaults on reset', async () => {
    await savePersonalCorrection(null, personal);
    let result: unknown;
    const stop = watchCorrection(ctx, null, value => { result = value; }, () => {});
    publish(approved);
    expect(result).toMatchObject({ source: 'personal', correction: { delaySeconds: 0 } });
    await removePersonalCorrection(null, ctx);
    expect(result).toMatchObject({ source: 'approved', correction: { delaySeconds: 2 } });
    publish(null);
    expect(result).toMatchObject({ source: 'automatic', correction: null });
    stop();
  });
  it('keeps personal edits isolated between scopes', async () => {
    void savePersonalCorrection('accountA', personal);
    let result: unknown;
    const stop = watchCorrection(ctx, 'accountA', value => { result = value; }, () => {});
    expect(result).toMatchObject({ source: 'personal', correction: { delaySeconds: 0 } });
    expect(JSON.parse(localStorage.getItem(scopedKey('corrections', 'accountA'))!)[correctionKey(ctx)].dirty).toBe(true);
    stop();
    const stopB = watchCorrection(ctx, 'accountB', value => { result = value; }, () => {});
    expect(result).toMatchObject({ source: 'automatic', correction: null }); stopB();
  });
  it('removes a revoked public correction after reconnect, rather than keeping stale cache forever', () => {
    const stop = watchCorrection(ctx, null, () => {}, () => {});
    publish(approved); stop();
    let result: unknown;
    const stopAgain = watchCorrection(ctx, null, value => { result = value; }, () => {});
    expect(result).toMatchObject({ source: 'approved' });
    publish(null);
    expect(result).toMatchObject({ source: 'automatic', correction: null }); stopAgain();
  });
  it('reports community submissions as not configured while preserving local fixes', async () => {
    await expect(submitCorrection(null, personal)).rejects.toThrow('not configured');
  });
});

