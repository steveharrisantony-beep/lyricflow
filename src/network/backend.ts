/** The APK serves bundled files locally; the Express backend stays on HTTPS. */
export function backendOrigin(configured = import.meta.env.VITE_BACKEND_URL || ''): string {
  const value = configured.trim();
  if (value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('VITE_BACKEND_URL must be an HTTPS origin without a path or credentials.');
    }
    return url.origin;
  }
  return typeof location === 'undefined' ? '' : location.origin;
}

export const musicBackendBase = () => `${backendOrigin()}/music`;
