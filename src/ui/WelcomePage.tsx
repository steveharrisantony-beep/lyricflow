import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, AudioLines, Captions, Check, Languages, Layers3, Link2, Play, SlidersHorizontal, X } from 'lucide-react';
import { SUPPORTED_ROMANIZATION_LANGUAGES } from '../romanization/romanize';
import './welcome.css';

const WELCOME_STARTED_KEY = 'lyricflow.welcomeStarted';

const features = [
  { Icon: Layers3, title: 'Videos or a world of themes', text: 'Play music videos with lyrics on top, or switch to built-in themes that react to your music.' },
  { Icon: Captions, title: 'Follow every word', text: 'Word-synced lyrics for popular songs, with line-synced lyrics for others when available.' },
  { Icon: Languages, title: `${SUPPORTED_ROMANIZATION_LANGUAGES.length} languages. Read along.`, text: 'The built-in romanization engine brings lyrics into Latin script, including Malayalam, Tamil and Hindi.' },
  { Icon: AudioLines, title: 'Listen your way', text: 'Search music, queue songs or use local files and your mic. Connect external players in the Android app.' },
  { Icon: Link2, title: 'Your song, your settings', text: 'Choose a video or lyric version, adjust the sync, and save your mapping for that song.' },
  { Icon: SlidersHorizontal, title: 'Make the stage yours', text: 'Shape the fonts, colours and motion. Go fullscreen and let the beat take over.' },
];

export default function WelcomePage({ onStart, onClose }: { onStart: () => void; onClose?: () => void }) {
  const Container = onClose ? 'div' : 'main';
  return <Container className="welcome-page">
    <header className="welcome-header">
      <span className="welcome-brand"><AudioLines aria-hidden="true" size={25} /> LyricFlow<span className="welcome-brand-dot">.</span></span>
      {onClose ? <button type="button" className="welcome-close" onClick={onClose} aria-label="Close About"><X size={21} aria-hidden="true" /></button>
        : <span className="welcome-platforms">Web & Android</span>}
    </header>

    <section className="welcome-hero" aria-labelledby="welcome-title">
      <div className="welcome-hero-copy">
        <p className="welcome-eyebrow"><span /> Music. Lyrics. Motion.</p>
        <h1 id="welcome-title">See the music.<br /><span>Feel every word.</span></h1>
        <p className="welcome-intro">Your favourite songs, music videos and lyrics.<br className="welcome-desktop-break" /> Together on a stage that feels like you.</p>
        <button type="button" className="welcome-start" onClick={onStart}>
          <Play size={17} fill="currentColor" aria-hidden="true" /> Start visualizer <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="welcome-start-note"><Check size={14} aria-hidden="true" /> Pick a song. Make it yours.</p>
      </div>

      <div className="welcome-art" aria-hidden="true">
        <div className="welcome-orbit welcome-orbit-one" />
        <div className="welcome-orbit welcome-orbit-two" />
        <div className="welcome-orbit welcome-orbit-three" />
        <svg className="welcome-wave" viewBox="0 0 640 420" fill="none">
          <defs><linearGradient id="welcome-wave-colour"><stop stopColor="#b7a7ff" /><stop offset=".5" stopColor="#d4ffee" /><stop offset="1" stopColor="#91c9ff" /></linearGradient></defs>
          {Array.from({ length: 18 }, (_, i) => <path key={i} d={`M-40 ${235 + i * 4} C100 ${20 + i * 6}, 170 ${400 - i * 3}, 310 ${180 + i * 4} S510 ${90 + i * 6}, 690 ${220 + i * 3}`} stroke="url(#welcome-wave-colour)" strokeWidth=".8" opacity={.12 + i * .025} />)}
        </svg>
        <div className="welcome-lyric-art"><span>FEEL THE SOUND</span><strong>every <em>word.</em></strong>
          <div className="welcome-spectrum">{Array.from({ length: 33 }, (_, i) => <i key={i} style={{ height: 8 + Math.round(Math.abs(Math.sin(i * .65)) * 24 + Math.sin(i * .2) * 9) }} />)}</div>
          <small>LYRICFLOW</small>
        </div>
      </div>

      <a className="welcome-explore" href="#welcome-features">A little more to love <ArrowDown size={15} aria-hidden="true" /></a>
    </section>

    <section className="welcome-features" id="welcome-features" aria-labelledby="welcome-features-title">
      <div className="welcome-section-heading"><p className="welcome-eyebrow">Made for your music</p><h2 id="welcome-features-title">More than listening.</h2></div>
      <div className="welcome-feature-grid">{features.map(({ Icon, title, text }) => <article className="welcome-feature" key={title}>
        <Icon size={22} strokeWidth={1.5} aria-hidden="true" /><h3>{title}</h3><p>{text}</p>
      </article>)}</div>
    </section>
    <footer className="welcome-footer"><span>LyricFlow <span aria-hidden="true">·</span> Developed by Steve Harris</span><span>Revisit this page in Settings → Others → About.</span></footer>
  </Container>;
}

export function FirstVisit({ children }: { children: ReactNode }) {
  const [started, setStarted] = useState(() => {
    try { return localStorage.getItem(WELCOME_STARTED_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => { document.getElementById('app-startup')?.remove(); }, []);
  const start = () => {
    try { localStorage.setItem(WELCOME_STARTED_KEY, 'true'); } catch { /* Continue when device storage is unavailable. */ }
    setStarted(true);
  };
  return started ? children : <WelcomePage onStart={start} />;
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="welcome-dialog" aria-label="About LyricFlow" onCancel={event => { event.preventDefault(); onClose(); }}>
    <WelcomePage onStart={onClose} onClose={onClose} />
  </dialog>;
}
