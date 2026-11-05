// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {act} from 'react';
import {expect,it,vi} from 'vitest';

const startup=vi.hoisted(()=>({backend:vi.fn(),fonts:vi.fn()}));
vi.mock('../network/embeddedBackend',()=>({initializeEmbeddedBackend:startup.backend}));
vi.mock('../visualization/cinematic/fonts',()=>({preloadLyricFonts:startup.fonts}));
vi.mock('../App',()=>({default:()=> <main data-testid="loaded-app">Your music</main>}));
vi.mock('../firebase/firebaseClient',()=>({auth:null,onAuthStateChanged:vi.fn()}));
vi.mock('../firebase/songDatabaseSync',()=>({
 syncPublishedSongData:()=>Promise.resolve(),syncAccountSongData:()=>Promise.resolve(),syncGuestDataToAccount:vi.fn(),
}));
vi.mock('../data/temporarySongs',()=>({temporarySongs:{clear:vi.fn()}}));

it('keeps the initial loading screen until fonts and the on-device service finish and the app mounts',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const html=readFileSync('index.html','utf8');
 document.body.innerHTML=new DOMParser().parseFromString(html,'text/html').body.innerHTML;
 let backendReady!:()=>void,fontsReady!:()=>void;
 startup.backend.mockReturnValue(new Promise<void>(resolve=>{backendReady=resolve;}));
 startup.fonts.mockReturnValue(new Promise<void>(resolve=>{fontsReady=resolve;}));
 await import('../main');
 expect(document.querySelector('[aria-label="Loading LyricFlow"]')).not.toBeNull();
 expect(document.querySelector('[data-testid="loaded-app"]')).toBeNull();
 await act(async()=>backendReady());
 expect(document.getElementById('app-startup')).not.toBeNull();
 await act(async()=>fontsReady());
 expect(document.getElementById('app-startup')).toBeNull();
 expect(document.querySelector('[data-testid="loaded-app"]')).toBeNull();
 const start=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Start visualizer'))!;
 await act(async()=>start.click());
 expect(document.querySelector('[data-testid="loaded-app"]')?.textContent).toBe('Your music');
});
