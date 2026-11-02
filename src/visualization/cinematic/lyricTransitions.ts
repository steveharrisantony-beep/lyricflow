import type {Transition} from './catalog';
export const THEME_TRANSITIONS:readonly {id:Transition;name:string}[]=[
 {id:'dissolve',name:'Soft cross-warp'},{id:'wipe',name:'Whip pan'},{id:'zoom',name:'Portal zoom'},
 {id:'ripple',name:'Refraction rings'},{id:'ink',name:'Shutter slabs'},{id:'glitch',name:'Scanline shear'},{id:'flash',name:'Burning seam'}
];
export const LYRIC_TRANSITIONS=[
 {id:'fade',name:'Soft fade'},{id:'rise',name:'Rise into view'},{id:'alternate',name:'Alternating side entry'},
 {id:'zoom',name:'Soft zoom'},{id:'turn',name:'Turning entrance'},{id:'wipe',name:'Letter curtain'}
] as const;
export type LyricTransition=typeof LYRIC_TRANSITIONS[number]['id'];
export const ALL_THEME_TRANSITIONS=THEME_TRANSITIONS.map(t=>t.id);
export const ALL_LYRIC_TRANSITIONS=LYRIC_TRANSITIONS.map(t=>t.id);
function seed(text:string){let n=0;for(const char of text)n=(Math.imul(n,31)+char.charCodeAt(0))>>>0;return n;}
export function chooseThemeTransition(fallback:Transition,enabled:readonly Transition[]|undefined,key:string):Transition|null{
 if(enabled===undefined)return fallback;
 return enabled.length?enabled[seed(key)%enabled.length]:null;
}
export function chooseLyricTransition(enabled:readonly LyricTransition[]|undefined,lineIndex:number):LyricTransition|null{
 return enabled?.length?enabled[Math.max(0,lineIndex)%enabled.length]:null;
}
export function lyricEntryPose(kind:LyricTransition|null,age:number,w:number,h:number,lineIndex:number){
 const progress=Math.max(0,Math.min(1,age/.62)),tail=(1-progress)**3,direction=lineIndex%2===0?-1:1;
 return {x:kind==='alternate'?direction*w*.38*tail:0,y:kind==='rise'?h*.14*tail:0,
  scale:kind==='zoom'?1-.16*tail:1,rotation:kind==='turn'?direction*.11*tail:0,
  alpha:kind==='fade'?.4+.6*(1-tail):1,reveal:kind==='wipe'?.28+.72*(1-tail):1};
}
