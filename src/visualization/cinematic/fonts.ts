import type {FontPack} from './catalog';

/** Fontsource packages embed locally served, open-source Google Fonts. No runtime font API. */
const fontFamilies:Record<FontPack,string>={
 impact:'"Anton"',street:'"Anton"',editorial:'"Bricolage Grotesque"',tech:'"Orbitron"',
 grunge:'"Black Ops One"',rounded:'"Unbounded"',mono:'"Space Mono"',literary:'"Fraunces"',
 monument:'"Anton"',noir:'"Fraunces"',glass:'"Syne"',collage:'"Bricolage Grotesque"',
 pixel:'"Press Start 2P"',handwritten:'"Bricolage Grotesque"',retro:'"Righteous"',
 cyber:'"Chakra Petch"',industrial:'"Black Ops One"',ultra:'"Bricolage Grotesque"',
 couture:'"Unbounded"',vogue:'"Fraunces"',engraved:'"Syne"',techno:'"Orbitron"',
 manuscript:'"Bricolage Grotesque"',typewriter:'"Space Mono"',retrograde:'"Righteous"'
};
const fontWeights:Record<FontPack,number>={
 impact:400,street:400,editorial:800,tech:700,grunge:400,rounded:700,mono:700,
 literary:700,monument:400,noir:700,glass:800,collage:800,pixel:400,handwritten:800,
 retro:400,cyber:700,industrial:400,ultra:800,couture:700,vogue:700,engraved:800,
 techno:700,manuscript:800,typewriter:700,retrograde:400
};
const indianScript=/[\u0900-\u097f\u0b80-\u0bff\u0d00-\u0d7f]/u;
const scriptFallback='"Noto Sans Malayalam","Noto Sans Tamil","Noto Sans Devanagari",sans-serif';
export function usesNativeScript(text:string){return indianScript.test(text)}
export function fontSpec(pack:FontPack,size:number,text:string,_italic=false):string{
 const family=usesNativeScript(text)?scriptFallback:fontFamilies[pack]+',sans-serif';
 const weight=usesNativeScript(text)?800:fontWeights[pack];
 return weight+' '+Math.max(8,Math.round(size))+'px '+family;
}
export function applySceneFont(c:CanvasRenderingContext2D,pack:FontPack,size:number,text:string,italic=false){
 c.font=fontSpec(pack,size,text,italic);
}
export function fontLabel(pack:FontPack){return fontFamilies[pack].replaceAll('"','')}
export const FONT_SHOWCASE:readonly FontPack[]=[
 'impact','street','editorial','tech','grunge','rounded','mono','literary',
 'monument','noir','glass','collage','pixel','handwritten','retro','cyber','industrial','ultra',
 'couture','vogue','engraved','techno','manuscript','typewriter','retrograde'
] as const;
