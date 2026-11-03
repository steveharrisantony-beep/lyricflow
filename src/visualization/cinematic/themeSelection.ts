import {byId,TEMPLATES,type SceneId} from './catalog';

export type ThemePaletteSelections=Record<string,string[]>;
export type ThemePaletteInput=Readonly<Record<string,string|readonly string[]>>;
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;};

/** Accept old single selections while discarding unknown themes, duplicate and removed palettes. */
export function normalizePaletteSelections(raw:unknown):ThemePaletteSelections{
 const clean:ThemePaletteSelections={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return clean;
 for(const theme of TEMPLATES){
  const value=(raw as Record<string,unknown>)[theme.id];
  const values=typeof value==='string'?[value]:Array.isArray(value)?value:[];
  const valid=theme.palettes.filter(p=>values.includes(p.id)).map(p=>p.id);
  if(valid.length)clean[theme.id]=valid;
 }
 return clean;
}

export function selectedPaletteIds(id:SceneId,selections?:ThemePaletteInput):readonly string[]{
 const theme=byId[id]||TEMPLATES[0],value=selections?.[id];
 const values=typeof value==='string'?[value]:value;
 const valid=values?theme.palettes.filter(p=>values.includes(p.id)).map(p=>p.id):[];
 return valid.length?valid:[theme.palettes[0].id];
}

/** A deterministic shuffled rotation: every selected palette is visited, stable when seeking. */
export function paletteForSection(id:SceneId,selections:ThemePaletteInput|undefined,section:number,seed=''){
 const pool=[...selectedPaletteIds(id,selections)];
 for(let i=pool.length-1;i>0;i--){const j=hash(`${seed}:${id}:${pool.join(',')}:${i}`)%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const slot=Number.isFinite(section)?Math.max(0,Math.floor(section)):0;
 return pool[slot%pool.length];
}

export function togglePaletteSelection(id:SceneId,paletteId:string,selections:ThemePaletteSelections):ThemePaletteSelections{
 if(!byId[id]?.palettes.some(p=>p.id===paletteId))return selections;
 const current=selectedPaletteIds(id,selections);
 if(current.includes(paletteId)&&current.length===1)return selections;
 return {...selections,[id]:current.includes(paletteId)?current.filter(p=>p!==paletteId):[...current,paletteId]};
}

export function enableAllPaletteSelections(): ThemePaletteSelections {
 const all: ThemePaletteSelections = {};
 for (const theme of TEMPLATES) {
  all[theme.id] = theme.palettes.map(p => p.id);
 }
 return all;
}

export function enableAllPalettesForTheme(id: SceneId, selections?: ThemePaletteSelections): ThemePaletteSelections {
 if (!byId[id]) return selections || {};
 return {
  ...selections,
  [id]: byId[id].palettes.map(p => p.id),
 };
}

