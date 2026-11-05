import { hasCompleteRomanization, romanizeLrcTextAsync } from './romanize';

export const ROMANIZATION_ATTEMPTS = 3;

/** Await each whole attempt before starting another. Keep unresolved lines retryable. */
export async function retryRomanization(text: string, allowedCodes: readonly string[], signal: AbortSignal, report: (message: string) => void): Promise<string> {
  for (let attempt = 1; attempt <= ROMANIZATION_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
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
  report('Stopped after 3 attempts · current lyrics continue');
  return '';
}
