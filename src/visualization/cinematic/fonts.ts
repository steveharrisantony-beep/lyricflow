import type {FontPack} from './catalog';

/** Fontsource packages embed locally served, open-source Google Fonts. No runtime font API. */
const fontFamilies:Record<FontPack,string>={
 impact:'"Anton"',
 street:'"Bebas Neue"',
 editorial:'"Cormorant Garamond"',
 tech:'"Orbitron"',
 grunge:'"Rubik Dirt"',
 rounded:'"Unbounded"',
 mono:'"Space Mono"',
 literary:'"Bodoni Moda"',
 monument:'"Cinzel Decorative"',
 noir:'"Fraunces"',
 glass:'"Syne"',
 collage:'"Abril Fatface"',
 pixel:'"Press Start 2P"',
 handwritten:'"Caveat"',
 retro:'"Righteous"',
 cyber:'"Chakra Petch"',
 industrial:'"Black Ops One"',
 ultra:'"Bricolage Grotesque"',
};
const fontWeights:Record<FontPack,number>={
 impact:400,street:400,editorial:600,tech:700,grunge:400,rounded:700,
 mono:700,literary:600,monument:700,noir:700,glass:800,collage:400,
 pixel:400,handwritten:700,retro:400,cyber:700,industrial:400,ultra:800
};
const indianScript=/[\u0900-\u097f\u0b80-\u0bff\u0d00-\u0d7f]/u;
const scriptFallback='"Noto Sans Malayalam","Noto Sans Tamil","Noto Sans Devanagari",sans-serif';
export function usesNativeScript(text:string){return indianScript.test(text)}
export function fontSpec(pack:FontPack,size:number,text:string,italic=false):string{
 const family=usesNativeScript(text)?scriptFallback:fontFamilies[pack]+',sans-serif';
 const weight=usesNativeScript(text)?600:fontWeights[pack];
 const style=italic&&(pack==='editorial'||pack==='literary')?'italic ':'';
 return style+weight+' '+Math.max(8,Math.round(size))+'px '+family;
}
export function applySceneFont(c:CanvasRenderingContext2D,pack:FontPack,size:number,text:string,italic=false){
 c.font=fontSpec(pack,size,text,italic);
}
export function fontLabel(pack:FontPack){return fontFamilies[pack].replaceAll('"','')}
export const FONT_SHOWCASE:readonly FontPack[]=[
 'impact','street','editorial','tech','grunge','rounded','mono','literary',
 'monument','noir','glass','collage','pixel','handwritten','retro','cyber','industrial','ultra'
] as const;
