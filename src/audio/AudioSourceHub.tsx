import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Upload,Disc3,X,ChevronRight,CheckCircle2} from 'lucide-react';
import SongSearch from '../music/SongSearch';
import type {PlayableSong} from '../music/providers';
import {connectExternalAudio} from './audioSignal';

export interface AudioSourceHubHandle{stop:()=>void}
export type AudioSourceMode = 'local' | 'online';

type Props={
 open:boolean;
 onClose:()=>void;
 activeMode:AudioSourceMode|null;
 onSelectMode:(mode:AudioSourceMode)=>void;
 onPickLocal:()=>void;
 onPlaySong:(song:PlayableSong)=>Promise<void>;
};

function AudioSourceHub(
 {open,onClose,activeMode,onSelectMode,onPickLocal,onPlaySong}:Props,
 ref:React.Ref<AudioSourceHubHandle>
){
 const [tab,setTab]=useState<AudioSourceMode>(activeMode||'online');
 const modalRef=useRef<HTMLDivElement>(null);

 useEffect(()=>{
  if(activeMode)setTab(activeMode);
 },[activeMode]);

 const stop=()=>{
  connectExternalAudio(null);
 };
 useImperativeHandle(ref,()=>({stop}),[]);

 useEffect(()=>{
  if(!open)return;
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape')onClose();
  };
  document.addEventListener('keydown',escape);
  return()=>document.removeEventListener('keydown',escape);
 },[open,onClose]);

 const handleChooseLocal=()=>{
  onSelectMode('local');
  onPickLocal();
  onClose();
 };

 const handleChooseOnline=()=>{
  setTab('online');
  onSelectMode('online');
 };

 return <>
  {open&&<div className="source-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
   <div ref={modalRef} className="source-modal" role="dialog" aria-modal="true" aria-label="Choose audio source">
    <div className="source-modal-head">
     <div>
      <span>STEP 2 · AUDIO SOURCE</span>
      <h2>Choose your audio source</h2>
      <small>Select Local Audio Upload or stream from the Built-in Stash Online Player</small>
     </div>
     <button type="button" aria-label="Close audio sources" className="source-close" onClick={onClose} title="Close window">
      <X size={20}/>
      <span>Close</span>
     </button>
    </div>

    <div className="source-two-card-grid">
     <button
      type="button"
      className={'source-option-card '+(tab==='local'?'active':'')}
      onClick={handleChooseLocal}
     >
      <div className="source-option-top">
       <span className="audio-source-icon"><Upload size={22}/></span>
       {activeMode==='local'&&<span className="source-active-label"><CheckCircle2 size={14}/> Active</span>}
      </div>
      <strong>Local Audio Upload</strong>
      <p>Play MP3, WAV, M4A, FLAC, OGG, or AAC files stored on your device. Automatically fetches synced lyrics by track metadata.</p>
      <span className="source-option-cta">Choose local audio file <ChevronRight size={16}/></span>
     </button>

     <button
      type="button"
      className={'source-option-card '+(tab==='online'?'active':'')}
      onClick={handleChooseOnline}
     >
      <div className="source-option-top">
       <span className="audio-source-icon"><Disc3 size={22}/></span>
       {activeMode==='online'&&<span className="source-active-label"><CheckCircle2 size={14}/> Active</span>}
      </div>
      <strong>Built-in Online Player (Stash)</strong>
      <p>Search and stream songs online from JioSaavn, YouTube Music, Audius, and SoundCloud with Apple Music word-synced lyrics.</p>
      <span className="source-option-cta">Search &amp; stream online <ChevronRight size={16}/></span>
     </button>
    </div>

    {tab==='online'&&<div className="source-online-stage">
     <SongSearch onPlay={async song=>{onSelectMode('online');await onPlaySong(song);onClose()}}/>
    </div>}

    <div className="source-modal-foot">
     <span>Tip: You can also search and switch songs directly from the main player bar below the visualizer.</span>
     <button type="button" className="source-primary" onClick={onClose}>Close Window</button>
    </div>
   </div>
  </div>}
 </>;
}

export default forwardRef(AudioSourceHub);
