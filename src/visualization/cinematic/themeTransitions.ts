import type {Transition} from './catalog';
export const THEME_TRANSITIONS:readonly {id:Transition;name:string}[]=[
 {id:'dissolve',name:'Soft cross-warp'},{id:'wipe',name:'Whip pan'},{id:'zoom',name:'Portal zoom'},
 {id:'ripple',name:'Refraction rings'},{id:'ink',name:'Shutter slabs'},{id:'glitch',name:'Scanline shear'},{id:'flash',name:'Burning seam'}
];
export const ALL_THEME_TRANSITIONS=THEME_TRANSITIONS.map(t=>t.id);
function seed(text:string){let n=0;for(const char of text)n=(Math.imul(n,31)+char.charCodeAt(0))>>>0;return n;}
export function chooseThemeTransition(fallback:Transition,enabled:readonly Transition[]|undefined,key:string):Transition|null{
 if(enabled===undefined)return fallback;
 return enabled.length?enabled[seed(key)%enabled.length]:null;
}
