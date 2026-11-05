import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../network/embeddedBackend',()=>({backendRequest:vi.fn()}));
import {backendRequest} from '../network/embeddedBackend';
import {cacheRomanizedLine,getCachedRomanizedLine,romanizeLinesAsync,hasCompleteRomanization} from '../romanization/romanize';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});

it('does not cache unchanged or partially unconverted native text',()=>{
  cacheRomanizedLine('星明','星明');
  cacheRomanizedLine('山景','shan 景');
  expect(getCachedRomanizedLine('星明')).toBeUndefined();
  expect(getCachedRomanizedLine('山景')).toBeUndefined();
});

it('retries an unresolved line after a backend echoes the original text',async()=>{
  const original='雨景';
  vi.mocked(backendRequest).mockResolvedValueOnce(Response.json({romanized:[original]}))
    .mockResolvedValueOnce(Response.json({romanized:['yu jing']}));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
  expect(await romanizeLinesAsync([original],undefined,['zh'])).toEqual([original]);
  expect(getCachedRomanizedLine(original)).toBeUndefined();
  expect(await romanizeLinesAsync([original],undefined,['zh'])).toEqual(['yu jing']);
  expect(backendRequest).toHaveBeenCalledTimes(2);
  expect(getCachedRomanizedLine(original)).toBe('yu jing');
});

it('treats an incomplete mixed result as a failure and respects disabled languages',()=>{
  const original='[00:01]春風\n[00:05]Hello world\n[00:09]白雲';
  expect(hasCompleteRomanization(original,'[00:01]chun feng\n[00:05]Hello world\n[00:09]白雲',['zh'])).toBe(false);
  expect(hasCompleteRomanization(original,'[00:01]chun feng\n[00:05]Hello world\n[00:09]bai yun',['zh'])).toBe(true);
  expect(hasCompleteRomanization(original,original,[])).toBe(false);
});

it('does not cache a provider response that merges multiple lines into one',async()=>{
  const lines=['清泉','夜林'];
  vi.mocked(backendRequest).mockResolvedValue(Response.json({romanized:lines}));
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json([[[null,null,'qing quan ye lin']]])));
  expect(await romanizeLinesAsync(lines,undefined,['zh'])).toEqual(lines);
  expect(lines.map(line=>getCachedRomanizedLine(line))).toEqual([undefined,undefined]);
});
