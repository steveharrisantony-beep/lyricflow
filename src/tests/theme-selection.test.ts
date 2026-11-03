import {expect,it} from 'vitest';
import {paletteForSection,normalizePaletteSelections,selectedPaletteIds,togglePaletteSelection,enableAllPaletteSelections,enableAllPalettesForTheme} from '../visualization/cinematic/themeSelection';
import {TEMPLATES,byId} from '../visualization/cinematic/catalog';
import {sanitizePreferences} from '../firebase/firebaseClient';

it('migrates single palettes and preserves valid multiple selections across preference saves',()=>{
 const prefs=sanitizePreferences({themePalettes:{'color-riot':'lavender-milk','pixel-garden':['cherry-blossom','botanical-mint','cherry-blossom','missing']}});
 expect(prefs.themePalettes['color-riot']).toEqual(['lavender-milk']);
 expect(prefs.themePalettes['pixel-garden']).toEqual(['botanical-mint','cherry-blossom']);
 expect(sanitizePreferences(JSON.parse(JSON.stringify(prefs))).themePalettes).toEqual(prefs.themePalettes);
 expect(normalizePaletteSelections({'removed-theme':['x'],'color-riot':['festival-gold']})).toEqual({});
});
it('automatically rotates themes only when multiple valid themes are enabled, ignoring the obsolete flag',()=>{
 expect(sanitizePreferences({enabledScenes:['pixel-garden'],autoScenes:true}).autoScenes).toBe(false);
 expect(sanitizePreferences({enabledScenes:['pixel-garden','pixel-garden'],autoScenes:true}).autoScenes).toBe(false);
 expect(sanitizePreferences({enabledScenes:['pixel-garden','color-riot'],autoScenes:false}).autoScenes).toBe(true);
});
it('keeps one palette fixed and rotates only the selected subset without changing after a seek',()=>{
 const one={'color-riot':['lavender-milk']};
 for(let section=0;section<20;section++)expect(paletteForSection('color-riot',one,section,'song')).toBe('lavender-milk');
 const many={'color-riot':['peach-sorbet','lavender-milk','rosewater']};
 const first=Array.from({length:9},(_,section)=>paletteForSection('color-riot',many,section,'song'));
 expect(new Set(first.slice(0,3))).toEqual(new Set(many['color-riot']));
 expect(first.every((id,index)=>index===0||id!==first[index-1])).toBe(true);
 expect(paletteForSection('color-riot',many,6,'song')).toBe(first[6]);
 expect(paletteForSection('color-riot',{'color-riot':['rosewater','lavender-milk','peach-sorbet']},6,'song')).toBe(first[6]);
});
it('toggles independent palettes while retaining one usable choice',()=>{
 let values=togglePaletteSelection('color-riot','lavender-milk',{});
 expect(values['color-riot']).toEqual(['peach-sorbet','lavender-milk']);
 values=togglePaletteSelection('color-riot','peach-sorbet',values);
 expect(values['color-riot']).toEqual(['lavender-milk']);
 expect(togglePaletteSelection('color-riot','lavender-milk',values)).toBe(values);
 expect(selectedPaletteIds('color-riot',{'color-riot':['removed']})).toEqual(['peach-sorbet']);
});
it('enables all colour palettes across all themes or for an individual theme',()=>{
 const all=enableAllPaletteSelections();
 for(const theme of TEMPLATES){
  expect(all[theme.id]).toEqual(theme.palettes.map(p=>p.id));
 }
 const single=enableAllPalettesForTheme('pixel-garden',{});
 expect(single['pixel-garden']).toEqual(byId['pixel-garden'].palettes.map(p=>p.id));
});

