import { useState } from 'react';
import { isFirebaseConfigured, signInWithGoogle, signOutUser, type User } from '../firebase/firebaseClient';

export default function AccountControls({ user, syncStatus }: { user: User | null; syncStatus: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setMessage('');
    try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Account action failed.'); }
    finally { setBusy(false); }
  };
  return <div className="account-controls">
    <button type="button" className="upload-button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{user ? 'Account & sync' : 'Sign in / sync'}</button>
    {open && <section className="account-panel" aria-label="Account and cloud sync">
      <strong>{user ? user.email || 'Your account' : 'Keep your settings across devices'}</strong>
      <p role="status">{syncStatus}</p>
      {user ? (
        <button type="button" disabled={busy} onClick={() => void run(signOutUser)}>Sign out</button>
      ) : !isFirebaseConfigured ? (
        <p>Cloud sync is not configured yet. Guest settings and fixes still save on this device.</p>
      ) : (
        <button type="button" disabled={busy} onClick={() => void run(signInWithGoogle)}>Sign in with Google</button>
      )}
      {message && <p role="status">{message}</p>}
    </section>}
  </div>;
}

