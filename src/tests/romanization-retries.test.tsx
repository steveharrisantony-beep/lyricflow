// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../romanization/romanize', async original => ({ ...await original<typeof import('../romanization/romanize')>(), romanizeLrcTextAsync:vi.fn() }));
import { romanizeLrcTextAsync } from '../romanization/romanize';
import ManualLyrics from '../lyrics/ManualLyrics';
import { getLyricState, setLyricTimeline } from '../lyrics/lyricTimeline';
import { setVirtualMediaTime } from '../audio/audioSignal';
import { getRomanizationLogs } from '../romanization/romanizationHistory';

const original='[00:01.00]青空<00:04.00>\n[00:05.00]白雲<00:09.00>';
const romanized='[00:01.00]qing kong\n[00:05.00]bai yun';
const track={title:'Romanization fixture',artist:'Fixture artist',album:'',duration:12,source:'provider' as const,confidence:1};
let host:HTMLDivElement,root:Root;
const show = async (token=1, enabled=true) => act(async()=>root.render(<ManualLyrics incoming={{token,original,romanized:'',source:'Fixture'}}
  track={track} time={2} trackLoaded delay={0} onDelayChange={()=>{}} displayMode="romanized" romanizationEnabled={enabled} enabledRomanizationLanguages={['zh']} />));
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers();vi.mocked(romanizeLrcTextAsync).mockReset();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  setLyricTimeline([]);setVirtualMediaTime(2);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setVirtualMediaTime(null);setLyricTimeline([]);vi.useRealTimers();});

it('awaits a failed attempt before retrying and applies success after the active line ends',async()=>{
  let fail!:(value:string)=>void, succeed!:(value:string)=>void;
  vi.mocked(romanizeLrcTextAsync)
    .mockImplementationOnce(()=>new Promise(resolve=>{fail=resolve;}))
    .mockImplementationOnce(()=>new Promise(resolve=>{succeed=resolve;}));
  await show();
  expect(romanizeLrcTextAsync).toHaveBeenCalledOnce();
  expect(getLyricState(2).cue?.romanized).toBe('');
  await act(async()=>fail(original));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(2);
  await act(async()=>succeed(romanized));
  expect(getLyricState(2).cue?.romanized).toBe('');
  expect(getRomanizationLogs()[0].status).toMatch(/switching after the current line/);
  const end=getLyricState(2).cue!.end;
  setVirtualMediaTime(end+.01);
  await act(async()=>vi.advanceTimersByTimeAsync(80));
  expect(getLyricState(2).cue?.romanized).toBe('qing kong');
  expect(getRomanizationLogs()[0].status).toBe('Romanized lyrics applied');
  expect(getRomanizationLogs()[0].events.map(event=>event.message).join('|')).toMatch(/Attempt 1 of 5.*incomplete.*Attempt 2 of 5.*running.*succeeded/);
  await show(2);
  expect(getLyricState(2).cue?.romanized).toBe('qing kong');
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(2);
});

it('waits one then two seconds after three failures and stops after five attempts while original lyrics remain active',async()=>{
  vi.mocked(romanizeLrcTextAsync).mockResolvedValue(original);
  await show();
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(3);
  expect(getRomanizationLogs()[0].status).toMatch(/Waiting 1s/);
  await act(async()=>vi.advanceTimersByTimeAsync(999));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(3);
  await act(async()=>vi.advanceTimersByTimeAsync(1));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(4);
  expect(getRomanizationLogs()[0].status).toMatch(/Waiting 2s/);
  await act(async()=>vi.advanceTimersByTimeAsync(1999));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(4);
  await act(async()=>vi.advanceTimersByTimeAsync(1));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(5);
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(5);
  expect(getLyricState(2).cue?.text).toBe('青空');
  expect(getLyricState(2).cue?.romanized).toBe('');
  expect(getRomanizationLogs()[0].status).toMatch(/Stopped after 5 attempts/);
});

it('cancels a ready replacement when romanization is disabled before the line ends',async()=>{
  vi.mocked(romanizeLrcTextAsync).mockResolvedValue(romanized);
  await show();
  expect(getRomanizationLogs()[0].status).toMatch(/switching after/);
  await show(1,false);
  setVirtualMediaTime(6);
  await act(async()=>vi.advanceTimersByTimeAsync(100));
  expect(getLyricState(6).cue?.romanized).toBe('');
  expect(getRomanizationLogs()[0].status).toMatch(/Cancelled/);
});

it('cancels an in-flight request without starting another attempt',async()=>{
  let requestSignal:AbortSignal|undefined;
  vi.mocked(romanizeLrcTextAsync).mockImplementation((_text,signal)=>new Promise((_,reject)=>{
    requestSignal=signal;
    signal!.addEventListener('abort',()=>reject(signal!.reason),{once:true});
  }));
  await show();
  await show(1,false);
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(requestSignal?.aborted).toBe(true);
  expect(romanizeLrcTextAsync).toHaveBeenCalledOnce();
  expect(getLyricState(2).cue?.romanized).toBe('');
});

it('bounds a stalled attempt before trying again',async()=>{
  vi.mocked(romanizeLrcTextAsync).mockImplementationOnce((_text,signal)=>new Promise((_,reject)=>{
    signal!.addEventListener('abort',()=>reject(signal!.reason),{once:true});
  })).mockResolvedValueOnce(romanized);
  await show();
  await act(async()=>vi.advanceTimersByTimeAsync(44999));
  expect(romanizeLrcTextAsync).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTimeAsync(1));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(2);
  expect(getRomanizationLogs()[0].events.map(event=>event.message).join('|')).toMatch(/timed out.*Attempt 2 of 5.*succeeded/);
});

it('cancels a delayed retry when romanization is disabled', async () => {
  vi.mocked(romanizeLrcTextAsync).mockResolvedValue(original);
  await show();
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(3);
  await show(1, false);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(3);
});

it('applies success on the fourth attempt without scheduling a fifth', async () => {
  vi.mocked(romanizeLrcTextAsync).mockResolvedValueOnce(original).mockResolvedValueOnce(original)
    .mockResolvedValueOnce(original).mockResolvedValueOnce(romanized);
  await show();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(4);
  expect(getLyricState(2).cue?.romanized).toBe('');
  setVirtualMediaTime(getLyricState(2).cue!.end + .01);
  await act(async () => vi.advanceTimersByTimeAsync(80));
  expect(getLyricState(2).cue?.romanized).toBe('qing kong');
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(romanizeLrcTextAsync).toHaveBeenCalledTimes(4);
});

it('does not run attempts for English lyrics, even when called directly', async () => {
  const { retryRomanization } = await import('../romanization/retryRomanization');
  const report = vi.fn();
  expect(await retryRomanization('[00:01]Hello world', ['zh'], new AbortController().signal, report)).toBe('');
  expect(romanizeLrcTextAsync).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
});
