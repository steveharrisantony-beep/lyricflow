/** Lyric offset corrects timestamp-file alignment; delay separately shifts display later. 
 * Positive delay means words appear LATER than their original timestamps.
 * Negative delay advances them. Calculated identically for stage and editor.
 */
export function effectiveLyricTime(playbackSeconds:number,offsetSeconds:number,delaySeconds:number){
 const valid=(value:number)=>Number.isFinite(value)?value:0;
 return valid(playbackSeconds)+valid(offsetSeconds)-valid(delaySeconds);
}
export function clampLyricDelay(value:number){
 if(!Number.isFinite(value))return 0;
 return Math.max(-30,Math.min(30,Math.round(value*100)/100));
}
export function formatLyricDelay(value:number){
 const safe=clampLyricDelay(value);
 return (safe>0?'+':'')+safe.toFixed(2)+'s';
}
