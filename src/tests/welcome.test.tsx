// @vitest-environment jsdom
import { act, useContext, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DemoInvitationContext, FirstVisit } from '../ui/WelcomePage';

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

it('offers the demo only after the first Start and consumes the invitation when dismissed', async () => {
  function Invitation() {
    const {pending,dismiss} = useContext(DemoInvitationContext);
    return pending ? <button onClick={dismiss}>Dismiss demo</button> : <span>No invitation</span>;
  }
  await act(async () => root.render(<FirstVisit><Invitation /></FirstVisit>));
  await act(async () => [...host.querySelectorAll('button')].find(button=>button.textContent?.includes('Start visualizer'))!.click());
  expect(host.textContent).toBe('Dismiss demo');
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toBe('No invitation');
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<FirstVisit><Invitation /></FirstVisit>));
  expect(host.textContent).toBe('No invitation');
});

it('renders the Buy Me a Coffee button and script in the top-right header', async () => {
  await act(async () => root.render(<FirstVisit><Visualizer /></FirstVisit>));
  const link = host.querySelector<HTMLAnchorElement>('.welcome-header .bmc-btn');
  const script = host.querySelector<HTMLScriptElement>('.welcome-header script[data-name="bmc-button"]');
  expect(link).not.toBeNull();
  expect(link?.getAttribute('href')).toBe('https://www.buymeacoffee.com/steveharris');
  expect(link?.getAttribute('data-slug')).toBe('steveharris');
  expect(link?.getAttribute('data-color')).toBe('#FFDD00');
  expect(link?.getAttribute('data-emoji')).toBe('☕');
  expect(link?.getAttribute('data-font')).toBe('Comic');
  expect(link?.getAttribute('data-text')).toBe('Buy me a coffee');
  expect(link?.getAttribute('data-outline-color')).toBe('#000000');
  expect(link?.getAttribute('data-font-color')).toBe('#000000');
  expect(link?.getAttribute('data-coffee-color')).toBe('#ffffff');
  expect(script?.getAttribute('src')).toBe('https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js');
});
