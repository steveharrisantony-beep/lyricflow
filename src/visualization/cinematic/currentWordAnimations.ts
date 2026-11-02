/** Word motion is independent of both line choreography and static decoration. */
export const CURRENT_WORD_ANIMATIONS=[
 {id:'lift',name:'Lift',detail:'An overlapping lift wave flows through the letters'},
 {id:'glow',name:'Glow',detail:'Letters light progressively and keep their glow until the word ends'},
 {id:'zoom',name:'Zoom',detail:'An overlapping zoom wave flows through the letters'}
] as const;
export type CurrentWordAnimation=typeof CURRENT_WORD_ANIMATIONS[number]['id'];
export const ALL_CURRENT_WORD_ANIMATION_IDS=CURRENT_WORD_ANIMATIONS.map(animation=>animation.id);
export function normalizeWordAnimationPool(value:unknown):CurrentWordAnimation[]|null{
 return Array.isArray(value)?[...new Set(value.filter((id):id is CurrentWordAnimation=>ALL_CURRENT_WORD_ANIMATION_IDS.includes(id as CurrentWordAnimation)))]:null;
}
const neutral={y:0,scale:1,glow:0};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));

/** Local grapheme timing stays inside the sourced word interval. Connected-script
 * words use one shaped unit, so the same function preserves their joining.
 * Lift/Zoom spend 60% of the interval on each pulse while their starts span 40%:
 * adjacent letters overlap rather than completing one at a time.
 */
export function currentWordAnimationPose(animation:CurrentWordAnimation|'off',progress:number,energy:number,letterIndex=0,letterCount=1){
 if(animation==='off'||progress<=0||progress>=1||energy<=0)return neutral;
 const gain=clamp(energy),count=Math.max(1,letterCount),index=Math.max(0,Math.min(count-1,letterIndex));
 const order=count>1?index/(count-1):0;
 if(animation==='glow'){
  // The final letter finishes its attack before the word boundary. Earlier
  // letters keep their full glow; the renderer clears it at the word's end.
  const attack=clamp((progress-order*.78)/.16);
  const hold=attack*attack*(3-2*attack);
  return {y:0,scale:1,glow:.34*hold*gain};
 }
 const stagger=count>1?.40:0;
 const local=(progress-order*stagger)/(1-stagger);
 if(local<=0||local>=1)return neutral;
 const wave=Math.sin(Math.PI*local)**2*gain;
 return {y:animation==='lift'?-.20*wave:0,scale:animation==='zoom'?1+.14*wave:1,glow:0};
}
