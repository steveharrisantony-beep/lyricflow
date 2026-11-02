/** CSS-pixel limits apply to the base text, independently of the size preference. */
export function lyricFontBounds(minimum=26,maximum=88){
 const min=Math.max(16,Math.min(72,Number.isFinite(minimum)?minimum:26));
 const max=Math.max(min,Math.max(32,Math.min(130,Number.isFinite(maximum)?maximum:88)));
 return {min,max};
}
