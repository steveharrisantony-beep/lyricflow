import { useState } from 'react';
import { addAccountPassword, emailSignIn, isFirebaseConfigured, isNativeApp, signInWithGoogle, signOutUser, resetPassword, verifyEmail, type User } from '../firebase/firebaseClient';

export default function AccountControls({ user, syncStatus, onImportGuest }: { user: User | null; syncStatus: string; onImportGuest: () => void }) {
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setMessage('');
    try { await operation(); setPassword(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Account action failed.'); }
    finally { setBusy(false); }
  };
  return <div className="account-controls">
    <button type="button" className="upload-button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{user ? 'Account & sync' : 'Sign in / sync'}</button>
    {open && <section className="account-panel" aria-label="Account and cloud sync">
      <strong>{user ? user.email || 'Your account' : 'Keep your settings across devices'}</strong>
      <p role="status">{syncStatus}</p>
      {user ? <>
        <p>Guest data stays separate. Sign out to return to it.</p>
        <button type="button" disabled={busy} onClick={onImportGuest}>Use this device’s guest settings and fixes</button>
        {!user.emailVerified && <button type="button" disabled={busy} onClick={() => void run(async () => { await verifyEmail(); setMessage('Verification email sent. After verifying, sign out and sign in again.'); })}>Send verification email</button>}
        {!user.providerData.some(provider => provider.providerId === 'password') && <form onSubmit={event => {
          event.preventDefault(); void run(async () => { await addAccountPassword(password); setMessage('Password added. Use this same account email and password on Android.'); });
        }}>
          <label>Add a password for Android<input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          <button type="submit" disabled={busy}>Add account password</button>
        </form>}
        <button type="button" disabled={busy} onClick={() => void run(signOutUser)}>Sign out</button>
      </> : !isFirebaseConfigured ? <p>Cloud sync is not configured yet. Guest settings and fixes still save on this device.</p> : <>
        <form onSubmit={event => { event.preventDefault(); void run(() => emailSignIn(email, password)); }}>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          <button type="submit" disabled={busy}>Sign in</button>
          <button type="button" disabled={busy || !email || password.length < 6} onClick={() => void run(() => emailSignIn(email, password, true))}>Create account</button>
        </form>
        {!isNativeApp() && <button type="button" disabled={busy} onClick={() => void run(signInWithGoogle)}>Continue with Google</button>}
        <button type="button" disabled={busy || !email} onClick={() => void run(async () => { await resetPassword(email); setMessage('If an account exists, check your email for a reset link.'); })}>Reset password</button>
        {isNativeApp() && <p>Use the same email account on Android and web. Native Google sign-in is not configured.</p>}
      </>}
      {message && <p role="status">{message}</p>}
    </section>}
  </div>;
}
