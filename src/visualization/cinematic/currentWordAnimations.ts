/** Word motion is independent of both line choreography and static decoration. */
export const CURRENT_WORD_ANIMATIONS=[
 {id:'lift',name:'Lift',detail:'The current word rises gently, then returns to its baseline'},
 {id:'glow',name:'Glow',detail:'A luminous halo blooms around the current word'},
 {id:'zoom',name:'Zoom',detail:'The current word grows smoothly, then settles'}
] as const;
export type CurrentWordAnimation=typeof CURRENT_WORD_ANIMATIONS[number]['id'];
export const ALL_CURRENT_WORD_ANIMATION_IDS=CURRENT_WORD_ANIMATIONS.map(animation=>animation.id);
export function normalizeWordAnimationPool(value:unknown):CurrentWordAnimation[]|null{
 return Array.isArray(value)?[...new Set(value.filter((id):id is CurrentWordAnimation=>ALL_CURRENT_WORD_ANIMATION_IDS.includes(id as CurrentWordAnimation)))]:null;
}
export function currentWordAnimationPose(animation:CurrentWordAnimation|'off',progress:number,energy:number){
 const e=progress<=0||progress>=1?0:Math.sin(Math.PI*progress)**2*Math.max(0,Math.min(1,energy));
 if(e===0)return {y:0,scale:1,glow:0};
 return {y:animation==='lift'?-.20*e:0,scale:animation==='zoom'?1+.14*e:1,glow:animation==='glow'?.34*e:0};
}
