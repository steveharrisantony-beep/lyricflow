import { useEffect, useMemo, useState } from 'react';
import { correctionContext, makeCorrection, type Correction, type CorrectionKind, type LyricsSourceReference } from './correctionModel';
import { watchCorrection, savePersonalCorrection, removePersonalCorrection } from './correctionStore';
import type { TrackInfo } from '../metadata/trackInfo';

export function useCorrection(track: TrackInfo | null, kind: CorrectionKind, uid: string | null, lyricsKey = '', lyricsSource: LyricsSourceReference | null = null) {
  const serialized = JSON.stringify(correctionContext(track, kind, lyricsKey, lyricsSource));
  const context = useMemo(() => JSON.parse(serialized) as ReturnType<typeof correctionContext>, [serialized]);
  const [state, setState] = useState<{ key: string; correction: Correction | null; source: string }>({ key: '', correction: null, source: 'automatic' });
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!context) return;
    return watchCorrection(context, uid, result => setState({ key: serialized, ...result }), setError);
  }, [context, serialized, uid]);
  const current = state.key === serialized ? state : { correction: null, source: 'automatic' };
  const save = (value: Partial<Correction>) => {
    if (!context) return;
    const correction = makeCorrection(context, value);
    try { void savePersonalCorrection(uid, correction).catch(() => setError('Saved on device · waiting for cloud sync')); }
    catch { setError('Device storage is full or blocked. This correction could not be saved.'); }
  };
  const reset = () => { try { if (context) void removePersonalCorrection(uid, context).catch(() => setError('Reset saved on device · waiting for cloud sync')); } catch { setError('Device storage is full or blocked. The override could not be removed.'); } };
  return { ...current, context, save, reset, error };
}
