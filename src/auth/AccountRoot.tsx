import { useEffect, useState } from 'react';
import App from '../App';
import { auth, onAuthStateChanged, type User } from '../firebase/firebaseClient';
import { setDeviceScope } from '../firebase/deviceStore';
import { retryCustomLyrics } from '../firebase/usePrivateLyrics';
import { retryAccountCorrections } from '../firebase/correctionStore';

export default function AccountRoot() {
  const [session, setSession] = useState<{ ready: boolean; user: User | null }>({ ready: !auth, user: null });
  useEffect(() => {
    if (!auth) { setDeviceScope(); return; }
    const unsubscribe = onAuthStateChanged(auth, user => {
      setDeviceScope(user?.uid);
      setSession({ ready: true, user });
      if (user) { retryAccountCorrections(user.uid); retryCustomLyrics(user.uid); }
    });
    const retry = () => { if (auth?.currentUser) { retryAccountCorrections(auth.currentUser.uid); retryCustomLyrics(auth.currentUser.uid); } };
    window.addEventListener('online', retry);
    return () => { unsubscribe(); window.removeEventListener('online', retry); };
  }, []);
  if (!session.ready) return <p role="status">Restoring account…</p>;
  return <App key={session.user?.uid || 'guest'} user={session.user} />;
}
