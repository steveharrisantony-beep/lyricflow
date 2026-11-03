import { useEffect, useMemo, useState } from 'react';
import { correctionContext, makeCorrection, type Correction, type CorrectionKind, type LyricsSourceReference } from './correctionModel';
import { watchCorrection } from './correctionStore';
import type { TrackInfo } from '../metadata/trackInfo';
import {correctionKey} from './correctionModel';
import {temporarySongs,TEMPORARY_SONG_EVENT} from '../data/temporarySongs';
import {localSongData} from '../data/localSongData';

export function useCorrection(track: TrackInfo | null, kind: CorrectionKind, uid: string | null, lyricsKey = '', lyricsSource: LyricsSourceReference | null = null) {
  const serialized = JSON.stringify(correctionContext(track, kind, lyricsKey, lyricsSource));
  const context = useMemo(() => JSON.parse(serialized) as ReturnType<typeof correctionContext>, [serialized]);
  const [state, setState] = useState<{ key: string; correction: Correction | null; source: string }>({ key: '', correction: null, source: 'automatic' });
  const [error, setError] = useState('');
  const [,refresh]=useState(0);
  useEffect(()=>{
    const emit=()=>refresh(value=>value+1);window.addEventListener(TEMPORARY_SONG_EVENT,emit);
    return()=>window.removeEventListener(TEMPORARY_SONG_EVENT,emit);
  },[]);
  useEffect(() => {
    setError('');
    if (!context) return;
    return watchCorrection(context, uid, result => setState({ key: serialized, ...result }), setError);
  }, [context, serialized, uid]);
  const draft=localSongData(track,uid).session?.corrections;
  const draftKey=context?correctionKey(context):'';
  const current = draft&&Object.hasOwn(draft,draftKey)?{correction:draft[draftKey],source:draft[draftKey]?'personal':'automatic'}:
    state.key === serialized ? state : { correction: null, source: 'automatic' };
  const save = (value: Partial<Correction>) => {
    if (!context) return;
    const correction = makeCorrection(context, value);
    temporarySongs.edit(track,uid,entry=>{entry.corrections[correctionKey(context)]=correction;});
  };
  const reset = () => {if(context)temporarySongs.edit(track,uid,entry=>{entry.corrections[correctionKey(context)]=null;});};
  return { ...current, context, save, reset, error };
}

