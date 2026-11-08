import { useEffect } from 'react';
import App from '../App';
import { setDeviceScope } from '../firebase/deviceStore';

export default function AccountRoot() {
  useEffect(() => {
    document.getElementById('app-startup')?.remove();
    setDeviceScope();
  }, []);
  return <App user={null} />;
}

