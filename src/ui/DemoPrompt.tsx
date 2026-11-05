import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Play } from 'lucide-react';
import './demo.css';

const INVITATION_SECONDS = 15;

export default function DemoPrompt({ autoDismiss, onClose, onPlay }: {
  autoDismiss: boolean;
  onClose: () => void;
  onPlay: (signal: AbortSignal) => Promise<void>;
}) {
  const [phase, setPhase] = useState<'offer' | 'loading' | 'error'>('offer');
  const [remaining, setRemaining] = useState(INVITATION_SECONDS);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!autoDismiss || phase !== 'offer') return;
    const deadline = Date.now() + INVITATION_SECONDS * 1000;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { window.clearInterval(timer); onClose(); }
    };
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [autoDismiss, phase, onClose]);

  const close = () => { request.current?.abort(); onClose(); };
  const play = async () => {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setPhase('loading');
    setError('');
    try {
      await onPlay(controller.signal);
      if (!controller.signal.aborted) onClose();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Could not load the demo. Please try again.');
      setPhase('error');
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  return <section className="demo-prompt" role="dialog" aria-labelledby="demo-title" aria-describedby="demo-description" aria-busy={phase === 'loading'}>
    {autoDismiss && phase === 'offer' && <div className="demo-timer-track" aria-hidden="true"><span style={{ width: `${remaining / INVITATION_SECONDS * 100}%` }} /></div>}
    <div className="demo-prompt-heading"><h2 id="demo-title">Want a quick demo?</h2>
      {autoDismiss && phase === 'offer' && <span className="demo-countdown">{remaining}s</span>}
    </div>
    <p id="demo-description">We'll queue up three songs on JioSaavn and start the visualizer.</p>
    {phase === 'loading' && <p className="demo-prompt-status" role="status">Finding your songs and preparing playback…</p>}
    {error && <p className="demo-prompt-error" role="alert">{error}</p>}
    <div className="demo-prompt-actions">
      <button type="button" className="demo-decline" onClick={close}>{phase === 'loading' ? 'Cancel' : 'No thanks'}</button>
      <button type="button" className="demo-play" onClick={() => void play()} disabled={phase === 'loading'} autoFocus={!autoDismiss}>
        {phase === 'loading' ? <LoaderCircle className="demo-spinner" size={17} aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}
        {phase === 'loading' ? 'Loading demo…' : phase === 'error' ? 'Try again' : 'Play demo'}
      </button>
    </div>
  </section>;
}
