// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DemoPrompt from '../ui/DemoPrompt';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?:boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
const click = (text:string) => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(text))!.click();

it('counts down for five seconds and dismisses without starting music', async () => {
  const onClose = vi.fn(), onPlay = vi.fn();
  await act(async () => root.render(<DemoPrompt autoDismiss onClose={onClose} onPlay={onPlay} />));
  expect(host.querySelector('.demo-countdown')?.textContent).toBe('5s');
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(onClose).toHaveBeenCalledOnce(); expect(onPlay).not.toHaveBeenCalled();
});

it('stops the timer while loading and aborts work if the user cancels', async () => {
  const onClose = vi.fn(); let signal: AbortSignal | undefined;
  const onPlay = vi.fn((next:AbortSignal) => { signal=next; return new Promise<void>(() => {}); });
  await act(async () => root.render(<DemoPrompt autoDismiss onClose={onClose} onPlay={onPlay} />));
  await act(async () => { click('Play demo'); click('Play demo'); });
  expect(onPlay).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(onClose).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Loading demo');
  await act(async () => click('Cancel'));
  expect(signal?.aborted).toBe(true); expect(onClose).toHaveBeenCalledOnce();
});

it('keeps the settings invitation open and allows retry after a failed request', async () => {
  const onClose = vi.fn(), onPlay = vi.fn().mockRejectedValueOnce(new Error('JioSaavn unavailable')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<DemoPrompt autoDismiss={false} onClose={onClose} onPlay={onPlay} />));
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => click('Play demo'));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('JioSaavn unavailable');
  await act(async () => click('Try again'));
  expect(onPlay).toHaveBeenCalledTimes(2); expect(onClose).toHaveBeenCalledOnce();
});
