import {useEffect,useState} from 'react';
const KEY='lyricflow.spotify.clientId',SESSION='lyricflow.spotify.session';
type Session={access_token:string;refresh_token?:string;expires_at:number};
type Track={name:string;artists:string;album:string;url:string};
function base64url(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
const redirect=()=>location.origin+location.pathname;
export default function SpotifyDiscovery(){
 const [clientId,setClientId]=useState(()=>sessionStorage.getItem(KEY)||'');
 const [session,setSession]=useState<Session|null>(()=>{try{return JSON.parse(sessionStorage.getItem(SESSION)||'null') as Session|null}catch{return null}});
 const [status,setStatus]=useState('Not connected');
 const [track,setTrack]=useState<Track|null>(null);
 const [busy,setBusy]=useState(false);
 async function exchange(body:URLSearchParams):Promise<Session>{
  const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!response.ok)throw new Error('Spotify token exchange failed ('+response.status+')');
  const result:unknown=await response.json();
  if(typeof result!=='object'||result===null||!('access_token' in result)||typeof result.access_token!=='string')throw new Error('Invalid token response');
  const token=result as {access_token:string;refresh_token?:string;expires_in?:number};
  return {access_token:token.access_token,refresh_token:token.refresh_token,expires_at:Date.now()+(token.expires_in||3600)*1000};
 }
 useEffect(()=>{const url=new URL(location.href);const code=url.searchParams.get('code'),error=url.searchParams.get('error'),actualState=url.searchParams.get('state');
  if(!code&&!error)return;
  url.searchParams.delete('code');url.searchParams.delete('state');url.searchParams.delete('error');history.replaceState(null,'',url);
  if(error){setStatus('Spotify authorization: '+error);return}
  const state=sessionStorage.getItem('lyricflow.spotify.state'),verifier=sessionStorage.getItem('lyricflow.spotify.verifier'),storedId=sessionStorage.getItem(KEY);

  if(!verifier||!storedId||!state||actualState!==state){setStatus('Authorization state mismatch. Please reconnect.');return}
  setBusy(true);
  const body=new URLSearchParams({client_id:storedId,grant_type:'authorization_code',code,redirect_uri:redirect(),code_verifier:verifier});
  void exchange(body).then(value=>{sessionStorage.setItem(SESSION,JSON.stringify(value));setSession(value);setStatus('Connected — metadata only')}).catch(e=>setStatus(String(e))).finally(()=>{setBusy(false);sessionStorage.removeItem('lyricflow.spotify.state');sessionStorage.removeItem('lyricflow.spotify.verifier')});
 },[]);
 async function connect(){
  if(!/^[a-zA-Z0-9]{20,64}$/.test(clientId.trim())){setStatus('Enter a valid Spotify Client ID, not the secret.');return}
  try{
   const verifier=base64url(crypto.getRandomValues(new Uint8Array(48)));
   const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   const state=base64url(crypto.getRandomValues(new Uint8Array(24)));
   sessionStorage.setItem(KEY,clientId.trim());sessionStorage.setItem('lyricflow.spotify.state',state);sessionStorage.setItem('lyricflow.spotify.verifier',verifier);
   const p=new URLSearchParams({response_type:'code',client_id:clientId.trim(),scope:'user-read-currently-playing',redirect_uri:redirect(),code_challenge_method:'S256',code_challenge:challenge,state});
   location.assign('https://accounts.spotify.com/authorize?'+p);
  }catch(e){setStatus('Authorization unavailable: '+String(e))}
 }
 function disconnect(){sessionStorage.removeItem(SESSION);setSession(null);setTrack(null);setStatus('Disconnected')}
 useEffect(()=>{
  if(!session)return;
  let alive=true;let delay=0;
  async function poll(){
   if(document.hidden||!alive)return;
   try{
    let token=JSON.parse(sessionStorage.getItem(SESSION)||'null') as Session|null;if(!token)return;
    if(token.expires_at-Date.now()<60000&&token.refresh_token){
     const body=new URLSearchParams({client_id:sessionStorage.getItem(KEY)||'',grant_type:'refresh_token',refresh_token:token.refresh_token});
     const renewed=await exchange(body);
     token={...renewed,refresh_token:renewed.refresh_token||token.refresh_token};
     sessionStorage.setItem(SESSION,JSON.stringify(token));if(alive)setSession(token);
    }
    const response=await fetch('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:'Bearer '+token.access_token}});
    if(!alive)return;
    if(response.status===204){setTrack(null);setStatus('Connected · Nothing playing');return}
    if(response.status===429){const retry=Number(response.headers.get('Retry-After')||30);delay=Math.min(300000,Math.max(15000,retry*1000));setStatus('Rate-limited · retrying later');return}
    if(!response.ok)throw new Error('Spotify returned '+response.status);
    const json:unknown=await response.json();
    if(typeof json==='object'&&json!==null&&'item'in json&&json.item&&typeof json.item==='object'){
     const item=json.item as {name?:string;artists?:{name?:string}[];album?:{name?:string};external_urls?:{spotify?:string}};
     setTrack({name:item.name||'Unknown track',artists:(item.artists||[]).map(a=>a.name||'').join(', '),album:item.album?.name||'',url:item.external_urls?.spotify||''});
     setStatus('Connected · Track metadata');
    }else{setTrack(null);setStatus('Connected · No track metadata')}
   }catch(e){if(alive)setStatus('Connection error: '+String(e))}
  }
  const id=setInterval(()=>{if(delay>0){delay-=10000;return}void poll()},10000);
  void poll();return()=>{alive=false;clearInterval(id)}
 },[session?.access_token]);
 return <section className="local-player spotify-discovery">
  <div className="player-heading"><div className="heading-left"><span className="heading-icon">♫</span><div><b>SPOTIFY DISCOVERY</b><small>Account connection · metadata only</small></div></div><span className="local-badge">NO VISUAL SYNC</span></div>
  <p className="player-footnote">Spotify's rules do not permit using its recording or playback position to synchronize this visualizer or lyrics. This independent panel only identifies the track.</p>
  <label className="spotify-label">Spotify Client ID (public)<input type="text" autoComplete="off" placeholder="Paste Spotify Client ID — never the Client Secret" value={clientId} onChange={e=>setClientId(e.target.value)}/></label>
  <p className="player-footnote">Register this exact redirect URI in your Spotify app: <code>{redirect()}</code></p>
  <div className="player-row"><button className="upload-button" disabled={busy} onClick={session?disconnect:()=>void connect()}>{session?'Disconnect Spotify':'Connect Spotify with PKCE'}</button><span className="spotify-status">{status}</span></div>
  {track&&<div className="spotify-track"><b>{track.name}</b><span>{track.artists}{track.album?' · '+track.album:''}</span>{track.url&&<a href={track.url} target="_blank" rel="noreferrer">Open track in Spotify ↗</a>}</div>}
 </section>;
}