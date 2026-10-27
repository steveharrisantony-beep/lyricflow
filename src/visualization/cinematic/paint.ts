/** Shared audio pulse and palette lookup.
 * Supports per-theme multi-palette selection while guaranteeing WCAG contrast.
 */
import {readableInk} from './contrast';
import type {AudioMetrics} from '../../audio/audioSignal';
import {byId,resolveThemePalette,type SceneId} from './catalog';

export type Pulse=Pick<AudioMetrics,'loudness'|'bass'|'mids'|'treble'|'beat'|'onset'|'downbeat'>;
export const NO_AUDIO:Pulse={loudness:0,bass:0,mids:0,treble:0,beat:0,onset:0,downbeat:0};

export function sceneColors(id:SceneId,paletteId?:string){
 const base=byId[id];
 const pal=resolveThemePalette(id,paletteId);
 return {
  ...base,
  paletteId:pal.id,
  paletteName:pal.name,
  background:pal.background,
  foreground:readableInk(pal.background,pal.foreground),
  accent:readableInk(pal.background,pal.accent)
 };
}
