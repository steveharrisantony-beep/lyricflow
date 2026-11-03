import { useEffect, useState } from 'react';
import App from '../App';
import { auth, onAuthStateChanged, type User } from '../firebase/firebaseClient';
import { setDeviceScope } from '../firebase/deviceStore';
import {syncAccountSongData,syncPublishedSongData} from '../firebase/songDatabaseSync';
import {temporarySongs} from '../data/temporarySongs';

function retryAccountData(uid:string){
  void syncAccountSongData(uid).catch(()=>{/* Keep local data and retry when connected. */});
}

export default function AccountRoot() {
  const [session, setSession] = useState<{ ready: boolean; user: User | null }>(() => {
    const initialUser = auth?.currentUser ?? null;
    setDeviceScope(initialUser?.uid);
    return { ready: true, user: initialUser };
  });
  useEffect(() => {
    void syncPublishedSongData().catch(()=>{});
    if (!auth) { setDeviceScope(); return; }
    const unsubscribe = onAuthStateChanged(auth, user => {
      temporarySongs.clear();
      setDeviceScope(user?.uid);
      setSession({ ready: true, user });
      if (user) retryAccountData(user.uid);
    });
    const retry = () => { if (auth?.currentUser) retryAccountData(auth.currentUser.uid); };
    window.addEventListener('online', retry);
    return () => { unsubscribe(); window.removeEventListener('online', retry); };
  }, []);
  if (!session.ready) return <p role="status">Restoring account…</p>;
  return <App key={session.user?.uid || 'guest'} user={session.user} />;
}
