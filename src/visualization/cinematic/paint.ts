/** Shared audio pulse and palette lookup.
 * The old 2D background painters were removed in favor of ProceduralCinema.
 * Lyrics use these types/colors but never receive beat-driven scale.
 */
import {readableInk} from './contrast';
import type {AudioMetrics} from '../../audio/audioSignal';
import {byId,type SceneId} from './catalog';

export type Pulse=Pick<AudioMetrics,'loudness'|'bass'|'mids'|'treble'|'beat'|'onset'|'downbeat'>;
export const NO_AUDIO:Pulse={loudness:0,bass:0,mids:0,treble:0,beat:0,onset:0,downbeat:0};
export function sceneColors(id:SceneId){const p=byId[id];return {...p,foreground:readableInk(p.background,p.foreground),accent:readableInk(p.background,p.accent)}}
