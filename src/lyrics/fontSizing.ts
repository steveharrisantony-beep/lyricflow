/** CSS-pixel limits apply to the base text, independently of the size preference. */
export function lyricFontBounds(minimum=30,maximum=100){
 const min=Math.max(16,Math.min(72,Number.isFinite(minimum)?minimum:30));
 const max=Math.max(min,Math.max(32,Math.min(130,Number.isFinite(maximum)?maximum:100)));
 return {min,max};
}
