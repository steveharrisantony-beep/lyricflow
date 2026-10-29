import { useState } from 'react';
import { AudioLines, LogIn, UserCheck, Sparkles, Sliders, Music2, CheckCircle2 } from 'lucide-react';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onGuestLogin: () => void;
}

export default function LoginScreen({ onGoogleLogin, onGuestLogin }: LoginScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await onGoogleLogin();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google sign-in could not be completed. You can retry or continue as Guest.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen" role="main" aria-label="Welcome to LyricFlow">
      <div className="login-backdrop-glow" aria-hidden="true" />
      <div className="login-container">
        <div className="login-brand-column">
          <div className="login-logo">
            <span className="logo-mark">
              <AudioLines size={24} />
            </span>
            <div>
              <strong>
                lyric<span>flow</span>
              </strong>
              <small>VISUAL SOUNDSTAGE &amp; KINETIC LYRICS</small>
            </div>
          </div>

          <h1 className="login-headline">
            Feel every syllable in <em>real-time 3D motion</em>.
          </h1>
          <p className="login-lead">
            Stream from the built-in Stash music catalog or load local high-resolution audio. LyricFlow automatically synchronizes Apple Music word-by-word lyrics and remembers your custom timing offsets and curated visual themes.
          </p>

          <div className="login-highlights">
            <div className="login-highlight-item">
              <Music2 size={18} />
              <div>
                <strong>Apple Music Word-Sync &amp; Stash Catalog</strong>
                <span>Automatic syllable-level kinetic lyrics with LRCLIB fallback and instant online streaming.</span>
              </div>
            </div>
            <div className="login-highlight-item">
              <Sliders size={18} />
              <div>
                <strong>Per-Song Lyric Delay Memory</strong>
                <span>Fine-tune timing offsets for any track once—automatically applied whenever that song plays again.</span>
              </div>
            </div>
            <div className="login-highlight-item">
              <Sparkles size={18} />
              <div>
                <strong>Curated Theme &amp; Choreography Pools</strong>
                <span>Toggle individual 2D/3D visual themes and kinetic lyric animation styles on or off.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-card" aria-label="Sign in options">
          <div className="login-card-head">
            <span>GET STARTED</span>
            <h2>Choose how to enter LyricFlow</h2>
            <p>Sign in with Google to sync your settings, theme toggles, and per-song lyric delays across devices, or jump right in as a Guest.</p>
          </div>

          <div className="login-actions">
            <button
              type="button"
              className="login-google-btn"
              onClick={() => void handleGoogle()}
              disabled={busy}
            >
              <LogIn size={18} />
              <span>{busy ? 'Signing in with Google…' : 'Continue with Google'}</span>
            </button>

            <button
              type="button"
              className="login-guest-btn"
              onClick={onGuestLogin}
              disabled={busy}
            >
              <UserCheck size={18} />
              <span>Continue as Guest</span>
            </button>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div className="login-comparison">
            <div>
              <strong>Google Account</strong>
              <span>
                <CheckCircle2 size={13} /> Cloud-synced settings, theme toggles &amp; per-song lyric delays
              </span>
            </div>
            <div>
              <strong>Guest Session</strong>
              <span>
                <CheckCircle2 size={13} /> Full visualizer &amp; Stash player access saved on this browser
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
