import {Capacitor} from '@capacitor/core';

const usesEmbeddedBackend=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';

/** Android routes its HTTPS WebView requests to the bundled backend on the device. */
export function backendOrigin(configured = import.meta.env.VITE_BACKEND_URL || ''): string {
  if(usesEmbeddedBackend())return location.origin;
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

export function musicResolverBase(configured?:string):string {
  if(usesEmbeddedBackend())return musicBackendBase();
  if(configured!==undefined)return configured.trim()||musicBackendBase();
  let saved='';
  try{saved=localStorage.getItem('lyricflow.resolver')||'';}catch{}
  return saved.trim()||import.meta.env.VITE_MUSIC_RESOLVER||musicBackendBase();
}
