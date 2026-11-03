import { useEffect, useState } from 'react';
import App from '../App';
import { auth, onAuthStateChanged, type User } from '../firebase/firebaseClient';
import { setDeviceScope } from '../firebase/deviceStore';
import { retrySongMappings } from '../firebase/songMappings';
import { retryCustomLyrics } from '../firebase/usePrivateLyrics';
import { retryAccountCorrections } from '../firebase/correctionStore';
import {retrySongMappingReset} from '../firebase/songMappingReset';

function retryAccountData(uid:string){
  void retrySongMappingReset(uid).then(ready=>{
    if(ready){retryAccountCorrections(uid);retryCustomLyrics(uid);retrySongMappings(uid);}
  }).catch(()=>{/* The pending reset is retried on the next connection. */});
}

export default function AccountRoot() {
  const [session, setSession] = useState<{ ready: boolean; user: User | null }>({ ready: !auth, user: null });
  useEffect(() => {
    if (!auth) { setDeviceScope(); return; }
    const unsubscribe = onAuthStateChanged(auth, user => {
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
