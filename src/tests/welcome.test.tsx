// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstVisit } from '../ui/WelcomePage';

let root: Root;
let host: HTMLDivElement;
const mounted = vi.fn();
function Visualizer() {
  useEffect(() => { mounted(); }, []);
  return <div>Visualizer ready</div>;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mounted.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('waits for Start before mounting the visualizer and remembers the choice after a fresh mount', async () => {
  await act(async () => root.render(<FirstVisit><Visualizer /></FirstVisit>));
  expect(host.querySelector('h1')?.textContent).toBe('See the music.Feel every word.');
  expect(mounted).not.toHaveBeenCalled();
  expect(localStorage.getItem('lyricflow.welcomeStarted')).toBeNull();
  const start = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Start visualizer'))!;
  await act(async () => start.click());
  expect(host.textContent).toBe('Visualizer ready');
  expect(mounted).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<FirstVisit><Visualizer /></FirstVisit>));
  expect(host.querySelector('h1')).toBeNull();
  expect(host.textContent).toBe('Visualizer ready');
});

it('allows Start when device storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  await act(async () => root.render(<FirstVisit><Visualizer /></FirstVisit>));
  const start = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Start visualizer'))!;
  await act(async () => start.click());
  expect(host.textContent).toBe('Visualizer ready');
});
