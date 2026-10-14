import Sanscript from '@indic-transliteration/sanscript';
export type ScriptLanguage='Malayalam'|'Tamil'|'Hindi'|'English'|'Mixed'|'Other';
const SCRIPT_SEGMENTS=/[\u0D00-\u0D7F]+|[\u0B80-\u0BFF]+|[\u0900-\u097F]+/gu;
export function detectLanguage(text:string):ScriptLanguage{
 const counts=[
  ['Malayalam',(text.match(/[\u0D00-\u0D7F]/gu)||[]).length],
  ['Tamil',(text.match(/[\u0B80-\u0BFF]/gu)||[]).length],
  ['Hindi',(text.match(/[\u0900-\u097F]/gu)||[]).length],
  ['English',(text.match(/[A-Za-z]/g)||[]).length]
 ] as const;
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
 if(ranked[0][1]===0)return 'Other';
 if(ranked[1][1]>ranked[0][1]*.3)return 'Mixed';
 return ranked[0][0];
}
function asReadableLatin(text:string){
 return text.replace(/ā/g,'aa').replace(/ī/g,'ee').replace(/ū/g,'oo').replace(/ṛ/g,'ri')
  .replace(/ṝ/g,'rii').replace(/ḷ/g,'l').replace(/ṅ/g,'ng').replace(/ñ/g,'nj')
  .replace(/ṇ/g,'n').replace(/ṭ/g,'t').replace(/ḍ/g,'d').replace(/ś/g,'sh')
  .replace(/ṣ/g,'sh').replace(/ṃ/g,'m').replace(/ḥ/g,'h')
  .replace(/ē/g,'e').replace(/ō/g,'o').replace(/ḻ/g,'zh')
  .replace(/[\u0300-\u036f]/g,'');
}
export function romanizeText(text:string){
 let changed=false;
 const output=text.replace(SCRIPT_SEGMENTS,match=>{
  const cp=match.codePointAt(0)||0;
  const from=cp>=0x0D00&&cp<=0x0D7F?'malayalam':cp>=0x0B80&&cp<=0x0BFF?'tamil':cp>=0x0900&&cp<=0x097F?'devanagari':null;
  if(!from)return match;
  try{const value=Sanscript.t(match,from,'iast');
   if(value!==match){changed=true;return asReadableLatin(value)}
  }catch{return match}
  return match;
 });
 return {text:output,changed,method:'Sanscript IAST phonetic estimate (correct manually)'};
}
