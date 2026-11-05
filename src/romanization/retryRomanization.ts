import { hasCompleteRomanization, needsRomanization, romanizeLrcTextAsync } from './romanize';

const ATTEMPT_DELAYS_MS = [0, 0, 0, 1000, 2000] as const;
export const ROMANIZATION_ATTEMPTS = ATTEMPT_DELAYS_MS.length;

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, delay);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** Await each whole attempt before starting another. Keep unresolved lines retryable. */
export async function retryRomanization(text: string, allowedCodes: readonly string[], signal: AbortSignal, report: (message: string) => void): Promise<string> {
  signal.throwIfAborted();
  if (!needsRomanization(text, allowedCodes)) {
    report('Skipped · no enabled non-Latin lyrics');
    return '';
  }
  for (let attempt = 1; attempt <= ROMANIZATION_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    const delay = ATTEMPT_DELAYS_MS[attempt - 1];
    if (delay) {
      report(`Waiting ${delay / 1000}s before attempt ${attempt} of ${ROMANIZATION_ATTEMPTS}`);
      await waitForRetry(delay, signal);
      signal.throwIfAborted();
    }
    report(`Attempt ${attempt} of ${ROMANIZATION_ATTEMPTS} · running`);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('Romanization timed out', 'TimeoutError')), 45000);
    try {
      signal.throwIfAborted();
      const candidate = await romanizeLrcTextAsync(text, controller.signal, allowedCodes);
      signal.throwIfAborted();
      controller.signal.throwIfAborted();
      if (hasCompleteRomanization(text, candidate, allowedCodes)) {
        report(`Attempt ${attempt} of ${ROMANIZATION_ATTEMPTS} · succeeded`);
        return candidate;
      }
      report(`Attempt ${attempt} of ${ROMANIZATION_ATTEMPTS} · incomplete or unchanged result`);
    } catch (error) {
      signal.throwIfAborted();
      const reason = controller.signal.aborted ? 'Romanization timed out' : error instanceof Error ? error.message : 'failed';
      report(`Attempt ${attempt} of ${ROMANIZATION_ATTEMPTS} · ${reason}`);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    }
  }
  report(`Stopped after ${ROMANIZATION_ATTEMPTS} attempts · current lyrics continue`);
  return '';
}
