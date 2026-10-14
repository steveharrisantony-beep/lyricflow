export type TimedWord={text:string;start:number;end:number;timing:'sourced'|'estimated'};
export type TimedLine={time:number;text:string;words?:TimedWord[]};
const LINE_TAG=/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
const WORD_TAG=/<(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?>/g;
const seconds=(match:RegExpMatchArray)=>Number(match[1])*60+Number(match[2])+Number((match[3]||'0').padEnd(3,'0'))/1000;
export function parseLRC(input:string):TimedLine[]{
 const output:TimedLine[]=[];
 if(input.length>250000)return [];
 for(const raw of input.split(/\r?\n/).slice(0,5000)){
  const tags=[...raw.matchAll(LINE_TAG)];
  if(!tags.length)continue;
  const body=raw.replace(LINE_TAG,'').trim();
  const words:TimedWord[]=[];
  const markers=[...body.matchAll(WORD_TAG)];
  if(markers.length){
   for(let i=0;i<markers.length;i++){
    const a=markers[i],b=markers[i+1],start=seconds(a),end=b?seconds(b):start+.6;
    const text=body.slice((a.index||0)+a[0].length,b?.index??body.length).trim();
    if(text&&end>=start&&Number.isFinite(start))words.push({text,start,end,timing:'sourced'});
   }
  }
  const text=body.replace(WORD_TAG,'').trim();
  for(const tag of tags){
   const time=seconds(tag);
   if(Number.isFinite(time)&&time>=0)output.push({time,text,words:words.length?words:undefined});
  }
 }
 return output.sort((a,b)=>a.time-b.time);
}
export function makeEstimatedWords(text:string,start:number,end:number):TimedWord[]{
 const words=text.split(/\s+/).filter(Boolean);const length=words.reduce((n,w)=>n+w.length,0)||1;
 let current=0;return words.map(word=>{const a=start+(end-start)*current/length;current+=word.length;
  return {text:word,start:a,end:start+(end-start)*current/length,timing:'estimated' as const};
 });
}
