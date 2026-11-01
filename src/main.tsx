import '@fontsource/noto-sans-malayalam/800.css';
import '@fontsource/noto-sans-tamil/800.css';
import '@fontsource/noto-sans-devanagari/800.css';
import '@fontsource/anton/400.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/righteous/400.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/black-ops-one/400.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import AccountRoot from './auth/AccountRoot';
import './styles.css';
import {initializeEmbeddedBackend} from './network/embeddedBackend';
import {preloadLyricFonts} from './visualization/cinematic/fonts';

const startup = document.createElement('p');
startup.className = 'device-service-status';
startup.setAttribute('role', 'status');
startup.textContent = 'Starting LyricFlow…';
document.body.prepend(startup);
const fontsReadyPromise = preloadLyricFonts();
void Promise.all([
  initializeEmbeddedBackend().then(() => startup.remove()).catch(error => {
    startup.textContent = (error instanceof Error ? error.message : 'On-device music service unavailable.') + ' Local audio and manual lyrics remain available.';
  }),
  fontsReadyPromise,
]).finally(() => {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountRoot /></React.StrictMode>);
});
