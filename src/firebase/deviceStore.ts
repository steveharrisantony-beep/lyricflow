let scope = 'guest';
export const setDeviceScope = (uid?: string) => { scope = uid ? `user:${uid}` : 'guest'; };
export const scopedKey = (key: string, uid?: string | null) => `lyricflow.v3.${uid === undefined ? scope : uid ? `user:${uid}` : 'guest'}.${key}`;
export function readDevice<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function writeDevice(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
