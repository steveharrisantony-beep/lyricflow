import {Capacitor, registerPlugin} from '@capacitor/core';

export type TvCapabilities = {
  isTelevision: boolean;
  hasMicrophone: boolean;
  hasTouchscreen: boolean;
};

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type NativeTvDevice = {getCapabilities(): Promise<TvCapabilities>};
const TvDevice = registerPlugin<NativeTvDevice>('TvDevice');
const CHANGE_EVENT = 'lyricflow:tv-capabilities';
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[role="button"][tabindex]';
let capabilities: TvCapabilities = {isTelevision:false,hasMicrophone:true,hasTouchscreen:true};
let installed = false;

export function getTvCapabilities(): TvCapabilities { return capabilities; }
export function onTvCapabilitiesChange(callback: (value: TvCapabilities) => void): () => void {
  const listener = () => callback(capabilities);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function visible(element: HTMLElement): boolean {
  if (element.closest('[inert],[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none'
    && rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0;
}

function activeScope(): Document | HTMLElement {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '.source-backdrop,dialog[open],[role="dialog"][aria-modal="true"]'
  );
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (visible(dialogs[i])) return dialogs[i];
  }
  return document;
}

export function findDirectionalFocus(
  current: HTMLElement | null,
  elements: HTMLElement[],
  direction: Direction
): HTMLElement | null {
  if (!elements.length) return null;
  if (!current || !elements.includes(current)) return elements[0];
  const a = current.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const candidate of elements) {
    if (candidate === current) continue;
    const b = candidate.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const main = direction === 'ArrowRight' ? dx : direction === 'ArrowLeft' ? -dx
      : direction === 'ArrowDown' ? dy : -dy;
    if (main <= 2) continue;
    const cross = direction === 'ArrowLeft' || direction === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
    // Prefer the same row/column, then the nearest element in that direction.
    const score = main + cross * 2.8 + Math.hypot(dx,dy) * 0.1;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function tvTargets(root: Document | HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

function closeTvOverlay(): boolean {
  const scope = activeScope();
  if (scope === document) return false;
  const close = scope.querySelector<HTMLElement>(
    '.source-close,.welcome-close,.settings-close,button[aria-label^="Close"],button[aria-label^="Back"]'
  );
  if (!close || !visible(close)) return false;
  close.click();
  return true;
}

function onRemoteKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const isEditing = Boolean(active?.closest('input,textarea,select,[contenteditable="true"]'));
  if ((event.key === 'Escape' || event.key === 'Backspace') && !isEditing) {
    if (closeTvOverlay()) event.preventDefault();
    return;
  }
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) || isEditing) return;
  const candidates = tvTargets(activeScope());
  const next = findDirectionalFocus(active, candidates, event.key as Direction);
  if (next) {
    event.preventDefault();
    next.focus({preventScroll: true});
    next.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
}

/**
 * Called once at startup. The native TV check avoids misidentifying desktop
 * browsers, tablets or HDMI-connected phones as televisions.
 */
export async function initializeTvExperience(): Promise<void> {
  if (installed || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const detected = await TvDevice.getCapabilities();
    capabilities = {
      isTelevision: detected.isTelevision === true,
      hasMicrophone: detected.hasMicrophone === true,
      hasTouchscreen: detected.hasTouchscreen === true,
    };
  } catch { return; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (!capabilities.isTelevision || installed) return;
  installed = true;
  document.documentElement.classList.add('android-tv');
  document.addEventListener('keydown', onRemoteKey, true);
  window.addEventListener('lyricflow:tv-back', (event: Event) => {
    if (closeTvOverlay()) event.preventDefault();
  });
}
