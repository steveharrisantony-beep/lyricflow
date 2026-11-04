export type TimedWord={text:string;start:number;end:number;timing:'sourced'|'estimated';endEstimated?:boolean};
export type TimedLine={time:number;text:string;words?:TimedWord[];end?:number};
const LINE_TAG=/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG=/<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const seconds=(match:RegExpMatchArray)=>Number(match[1])*60+Number(match[2])+Number((match[3]||'0').padEnd(3,'0'))/1000;
export function parseLRC(input:string,trackEnd?:number):TimedLine[]{
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
    if(text&&end>=start&&Number.isFinite(start))words.push({text,start,end,timing:'sourced',...(!b?{endEstimated:true}:{})});
   }
  }
  const text=body.replace(WORD_TAG,'').trim();
  const leadingText=markers[0]?body.slice(0,markers[0].index).trim():'';
  // A single timed span wrapping a whole phrase still supplies line timing.
  const wholeLineSpan=/\s/.test(text)&&!leadingText&&words.every(word=>word.start===words[0]?.start);
  for(const tag of tags){
   const time=seconds(tag);
   if(Number.isFinite(time)&&time>=0){
    const last=markers[markers.length-1];
    const trailingEnd=last&&!body.slice((last.index||0)+last[0].length).trim()?seconds(last):undefined;
    const leadingWord=leadingText&&words[0]?.start>time
     ? {text:leadingText,start:time,end:words[0].start,timing:'sourced' as const} : undefined;
    const timedWords=leadingWord?[leadingWord,...words]:words;
    output.push({time,text,words:timedWords.length&&!wholeLineSpan?timedWords:undefined,...(trailingEnd!==undefined&&trailingEnd>time?{end:trailingEnd}:{})});
   }
  }
 }
 output.sort((a,b)=>a.time-b.time);
 for(let i=0;i<output.length;i++){
  const line=output[i],last=line.words?.[line.words.length-1];
  if(!last?.endEstimated)continue;
  let low=i+1,high=output.length;
  while(low<high){const middle=(low+high)>>>1;if(output[middle].time<=last.start)low=middle+1;else high=middle;}
  const next=output[low]?.time;
  const hasLaterLine=output[output.length-1].time>line.time;
  const boundary=line.end??(next!==undefined?next:!hasLaterLine?trackEnd:undefined);
  if(boundary!==undefined&&Number.isFinite(boundary)&&boundary>last.start)last.end=boundary;
 }
 return output;
}
export function hasSourcedWordTiming(lines: readonly TimedLine[]): boolean {
 return lines.some(line=>{
  const starts=new Set(line.words?.filter(word=>word.timing==='sourced'&&/[\p{L}\p{N}]/u.test(word.text)).map(word=>word.start));
  return starts.size>1;
 });
}

export function makeEstimatedWords(text:string,start:number,end:number):TimedWord[]{
 const words=text.split(/\s+/).filter(Boolean);const length=words.reduce((n,w)=>n+w.length,0)||1;
 let current=0;return words.map(word=>{const a=start+(end-start)*current/length;current+=word.length;
  return {text:word,start:a,end:start+(end-start)*current/length,timing:'estimated' as const};
 });
}
