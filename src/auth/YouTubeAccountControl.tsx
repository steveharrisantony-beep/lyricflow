import { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  MousePointerClick,
  RefreshCw,
  Shield,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { isFirebaseConfigured, isNativeApp } from '../firebase/firebaseClient';
import {
  getYouTubeAccessToken,
  getYouTubeCookieHeader,
  saveCustomYouTubeCredentials,
  setYouTubeInteractivePlayer,
  setYouTubeNoCookieDomain,
  signInToYouTubeAccount,
  signOutYouTubeAccount,
  triggerYouTubePlayerReload,
  useYouTubeAuth,
} from '../music/youtubeAuth';
import {
  syncBlockyListsFromBackend,
  updateYouTubeAdBlockerConfig,
  useYouTubeAdBlocker,
} from '../music/youtubeAdBlocker';

export default function YouTubeAccountControl({
  compact = false,
  onSignedIn,
}: {
  compact?: boolean;
  onSignedIn?: () => void;
}) {
  const ytAuth = useYouTubeAuth();
  const adBlocker = useYouTubeAdBlocker();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncingLists, setSyncingLists] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tokenInput, setTokenInput] = useState(() => getYouTubeAccessToken());
  const [cookieInput, setCookieInput] = useState(() => getYouTubeCookieHeader());

  const handlePrimarySignIn = async (mode: 'auto' | 'browser-popup' | 'google-oauth' = 'auto') => {
    setBusy(true);
    setStatusMsg('');
    try {
      const next = await signInToYouTubeAccount(mode);
      if (next.connected) {
        setStatusMsg(
          isNativeApp()
            ? 'Signed in to YouTube! Embedded videos and searches now use your YouTube account.'
            : 'YouTube account connected! Videos now play from your signed-in YouTube session.'
        );
        onSignedIn?.();
      } else {
        setStatusMsg('YouTube sign-in window closed. Click Reload Video if you signed in.');
      }
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Unable to complete YouTube sign-in.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAdvanced = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveCustomYouTubeCredentials({
        accessToken: tokenInput,
        cookieHeader: cookieInput,
      });
      setStatusMsg('Saved YouTube session credentials and synced with search resolver.');
      onSignedIn?.();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncBlockyLists = async () => {
    setSyncingLists(true);
    try {
      const result = await syncBlockyListsFromBackend();
      setStatusMsg(
        `Blocky denylists synced (${result.rulesCount} active rules from ${result.syncedSources.join(', ')}).`
      );
    } catch {
      setStatusMsg('Using built-in Blocky + RemoveAdblockThing adblock rules.');
    } finally {
      setSyncingLists(false);
    }
  };

  return (
    <div className="youtube-account-control" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="upload-button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '5px 10px' : '7px 12px',
          fontSize: compact ? 12 : 13,
          borderColor: ytAuth.connected ? 'rgba(52, 211, 153, 0.55)' : 'rgba(248, 113, 113, 0.45)',
          background: ytAuth.connected
            ? 'rgba(6, 78, 59, 0.35)'
            : 'rgba(127, 29, 29, 0.28)',
          color: '#f8fafc',
        }}
      >
        {ytAuth.connected ? (
          <>
            <CheckCircle2 size={14} style={{ color: '#34d399' }} />
            <span>{compact ? 'YT Signed In' : `YouTube: ${ytAuth.accountLabel || 'Connected'}`}</span>
          </>
        ) : (
          <>
            <Video size={14} style={{ color: '#f87171' }} />
            <span>{compact ? 'YouTube Sign-In' : 'Sign in to YouTube'}</span>
          </>
        )}
        {adBlocker.enabled && (
          <span
            title="Blocky + RemoveAdblockThing YouTube AdBlocker Active"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 6px',
              borderRadius: 6,
              fontSize: 10.5,
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.22)',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              color: '#6ee7b7',
            }}
          >
            <Shield size={10} />
            AdBlock
          </span>
        )}
      </button>

      {open && (
        <section
          className="account-panel youtube-auth-panel"
          aria-label="YouTube account sign-in and AdBlocker"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 1200,
            width: 'min(410px, 94vw)',
            padding: 14,
            borderRadius: 14,
            background: 'rgba(10, 15, 29, 0.97)',
            border: '1px solid rgba(148, 163, 184, 0.26)',
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <ShieldCheck size={16} style={{ color: ytAuth.connected ? '#34d399' : '#60a5fa' }} />
              {ytAuth.connected
                ? `Connected: ${ytAuth.accountLabel || 'YouTube Account'}`
                : 'Sign in to YouTube (Bypass Bot Block)'}
            </strong>
            <button
              type="button"
              className="upload-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'rgba(226, 232, 240, 0.85)' }}>
            Signing in plays embedded YouTube videos directly from your personal YouTube account and prevents YouTube from blocking video playback or searches after multiple songs.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="source-primary"
              disabled={busy}
              onClick={() => void handlePrimarySignIn('auto')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                fontSize: 12.5,
                flex: '1 1 auto',
                justifyContent: 'center',
              }}
            >
              <LogIn size={14} />
              {busy
                ? 'Opening YouTube Sign-In…'
                : isNativeApp()
                  ? 'Sign in to YouTube (In-App)'
                  : ytAuth.connected
                    ? 'Switch / Re-authenticate YouTube Account'
                    : 'Sign in with YouTube Account'}
            </button>

            {!isNativeApp() && isFirebaseConfigured && (
              <button
                type="button"
                className="upload-button"
                disabled={busy}
                onClick={() => void handlePrimarySignIn('browser-popup')}
                style={{ fontSize: 12, padding: '7px 10px' }}
              >
                Sign in on YouTube.com Popup
              </button>
            )}

            <button
              type="button"
              className="upload-button"
              onClick={() => {
                triggerYouTubePlayerReload();
                setStatusMsg('Reloaded YouTube video player with current account session.');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 10px' }}
              title="Reload the YouTube video player iframe"
            >
              <RefreshCw size={13} />
              Reload Video
            </button>
          </div>

          {/* YouTube AdBlocker Section (0xERR0R/blocky + TheRealJoelmatic/RemoveAdblockThing) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              padding: '9px 11px',
              borderRadius: 10,
              background: 'rgba(6, 78, 59, 0.24)',
              border: '1px solid rgba(52, 211, 153, 0.28)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6ee7b7' }}>
                <Shield size={14} />
                YouTube AdBlocker (Blocky + RemoveAdblockThing)
              </strong>
              <input
                type="checkbox"
                aria-label="Enable YouTube AdBlocker"
                checked={adBlocker.enabled}
                onChange={e => updateYouTubeAdBlockerConfig({ enabled: e.target.checked })}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: 'rgba(209, 250, 229, 0.85)' }}>
              <span>Rules: {adBlocker.blockyRulesCount}</span>
              <span>·</span>
              <span>Blocked Requests: {adBlocker.blockedRequestsCount}</span>
              <span>·</span>
              <span>Skipped Ads/Popups: {adBlocker.skippedAdsCount + adBlocker.removedPopupsCount}</span>
            </div>

            {adBlocker.enabled && (
              <>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  <span>0xERR0R/blocky DNS & Ad-Domain Sinkhole</span>
                  <input
                    type="checkbox"
                    checked={adBlocker.blockyEnabled}
                    onChange={e => updateYouTubeAdBlockerConfig({ blockyEnabled: e.target.checked })}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  <span>RemoveAdblockThing (Skip Ads & Remove Warning Popups)</span>
                  <input
                    type="checkbox"
                    checked={adBlocker.removeAdblockThingEnabled}
                    onChange={e =>
                      updateYouTubeAdBlockerConfig({ removeAdblockThingEnabled: e.target.checked })
                    }
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  <span>Fast-forward embedded commercial clips (16x Auto-Skip)</span>
                  <input
                    type="checkbox"
                    checked={adBlocker.skipEmbeddedAdsEnabled}
                    onChange={e =>
                      updateYouTubeAdBlockerConfig({ skipEmbeddedAdsEnabled: e.target.checked })
                    }
                  />
                </label>

                <button
                  type="button"
                  className="upload-button"
                  disabled={syncingLists}
                  onClick={() => void handleSyncBlockyLists()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    padding: '4px 8px',
                    marginTop: 2,
                  }}
                >
                  <RefreshCw size={12} />
                  {syncingLists ? 'Syncing Blocky Denylists…' : 'Sync Blocky Ad Lists'}
                </button>
              </>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(30, 41, 59, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.16)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MousePointerClick size={13} />
                Allow clicking inside YouTube video (dismiss prompts)
              </span>
              <input
                type="checkbox"
                checked={ytAuth.interactivePlayer}
                onChange={e => setYouTubeInteractivePlayer(e.target.checked)}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span>Use YouTube account cookies in embed (youtube.com)</span>
              <input
                type="checkbox"
                checked={!ytAuth.useNoCookieDomain}
                onChange={e => setYouTubeNoCookieDomain(!e.target.checked)}
              />
            </label>
          </div>

          <div>
            <button
              type="button"
              className="upload-button"
              onClick={() => setShowAdvanced(v => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                padding: '4px 9px',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <KeyRound size={12} />
              {showAdvanced
                ? 'Hide Advanced YouTube Cookie / Token Settings'
                : 'Advanced: Paste YouTube OAuth Token or Cookie'}
            </button>

            {showAdvanced && (
              <form
                onSubmit={handleSaveAdvanced}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                  YouTube OAuth Access Token (optional)
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="ya29.a0..."
                    onKeyDown={e => e.stopPropagation()}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                  YouTube Session Cookie (optional — e.g. SAPISID=...; __Secure-3PAPISID=...)
                  <input
                    type="text"
                    value={cookieInput}
                    onChange={e => setCookieInput(e.target.value)}
                    placeholder="SAPISID=...; __Secure-3PAPISID=...; LOGIN_INFO=..."
                    onKeyDown={e => e.stopPropagation()}
                  />
                </label>
                <button type="submit" className="upload-button" disabled={busy} style={{ fontSize: 12 }}>
                  Save Session Credentials
                </button>
              </form>
            )}
          </div>

          {ytAuth.connected && (
            <button
              type="button"
              className="upload-button"
              disabled={busy}
              onClick={() =>
                void signOutYouTubeAccount().then(() => {
                  setTokenInput('');
                  setCookieInput('');
                  setStatusMsg('Signed out of YouTube account.');
                })
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 12,
                color: '#fca5a5',
              }}
            >
              <LogOut size={13} />
              Disconnect YouTube Account
            </button>
          )}

          {statusMsg && (
            <p role="status" style={{ margin: 0, fontSize: 11.5, color: '#93c5fd' }}>
              {statusMsg}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
