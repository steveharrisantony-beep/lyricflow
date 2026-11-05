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
import {FirstVisit} from './ui/WelcomePage';
import './styles.css';
import {initializeEmbeddedBackend} from './network/embeddedBackend';
import {preloadLyricFonts} from './visualization/cinematic/fonts';

const fontsReadyPromise = preloadLyricFonts();
void Promise.all([
  initializeEmbeddedBackend().catch(error => {
    const status = document.createElement('p');
    status.className = 'device-service-status';
    status.setAttribute('role', 'alert');
    status.textContent = (error instanceof Error ? error.message : 'On-device music service unavailable.') + ' Local audio and manual lyrics remain available.';
    document.body.prepend(status);
  }),
  fontsReadyPromise,
]).finally(() => {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><FirstVisit><AccountRoot /></FirstVisit></React.StrictMode>);
});
