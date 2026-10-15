/** Whole-song frequency analysis; no lyric text leaves the device. */
export interface WordEmphasis {counts:ReadonlyMap<string,number>;weights:ReadonlyMap<string,number>;keywords:readonly string[]}
const common=new Set(('a an and are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its just let me my no not of on or our out she so that the their them then there these they this those to too up us was we were what when where which who why will with would you your yeah oh ooh la na '+
 'है हैं और का की के को में मैं तुम एक से यह वो तो भी ही ना न हम हो था थे थी '+
 'ஒரு இந்த அந்த என் உன் அது நான் நீ உன்னை '+
 'ഒരു ഈ ആ ഞാൻ നീ ഇത് അത് എന്റെ നിന്റെ ആണ്').split(/\s+/));
export function normalizeLyricWord(word:string){return word.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu,'')}
export function analyzeLyricWords(lines:readonly {text:string;romanized?:string}[]):WordEmphasis{
 const count=(field:'text'|'romanized')=>{
  const counts=new Map<string,number>();
  for(const line of lines)for(const word of (line[field]||'').split(/\s+/)){
   const key=normalizeLyricWord(word);if(key)counts.set(key,(counts.get(key)||0)+1);
  }return counts;
 };
 const counts=count('text');for(const [key,n] of count('romanized'))counts.set(key,Math.max(n,counts.get(key)||0));
 const ranked=[...counts].filter(([word,n])=>n>=2&&word.length>=(/[\u0900-\u097f\u0b80-\u0bff\u0d00-\u0d7f]/u.test(word)?2:3)&&!common.has(word)).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12);
 const peak=ranked[0]?.[1]||1,weights=new Map<string,number>();
 for(const [word,n] of ranked)weights.set(word,.5+.5*Math.log1p(n)/Math.log1p(peak));
 return {counts,weights,keywords:ranked.map(([word])=>word)};
}
export function wordEmphasis(analysis:WordEmphasis,word:string){return analysis.weights.get(normalizeLyricWord(word))||0}
