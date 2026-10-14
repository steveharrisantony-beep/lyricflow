export type LyricMood='cosmic'|'water'|'warm'|'fire'|'solitude'|'celebration'|'abstract';
export type LyricCue={time:number;end:number;text:string;romanized:string;mood:LyricMood;words:{text:string;start:number;end:number}[]};
let cues:LyricCue[]=[];
let offset=0;
let display:'original'|'romanized'|'both'='original';
export function setLyricTimeline(lines:LyricCue[],timingOffset=0,mode:typeof display='original'){cues=lines;offset=timingOffset;display=mode;}
export function getLyricState(t:number){
 const position=t+offset;let index=-1;
 for(let i=0;i<cues.length;i++){if(cues[i].time<=position)index=i;else break;}
 return {cue:index>=0?cues[index]:null,next:cues[index+1]||null,mode:display,position,index};
}
export function inferMood(text:string):LyricMood{
 const s=text.toLowerCase();
 const groups:{mood:LyricMood;words:string[]}[]=[
  {mood:'water',words:['rain','river','ocean','sea','waves','storm','water','മഴ','കടൽ','மழை','बारिश']},
  {mood:'cosmic',words:['star','stars','moon','sky','galaxy','universe','night','നക്ഷത്ര','நிலா','चाँद']},
  {mood:'fire',words:['fire','burn','flame','rage','thunder','തീ','நெருப்பு','आग']},
  {mood:'warm',words:['love','heart','kiss','embrace','പ്രണയ','காதல்','प्यार','दिल']},
  {mood:'solitude',words:['alone','lonely','miss','memory','silence','goodbye','dream','ഓർമ്മ','தனிமை','याद']},
  {mood:'celebration',words:['dance','party','sing','celebrate','joy','happy','ആനന്ദ','மகிழ்ச்சி','खुशी']}
 ];
 for(const g of groups)if(g.words.some(w=>s.includes(w)))return g.mood;
 return 'abstract';
}
function tokenize(text:string,start:number,end:number){
 const words=text.trim().split(/\s+/).filter(Boolean);
 const total=words.reduce((n,w)=>n+w.length,0)||1;let progress=0;
 return words.map(w=>{const a=start+(end-start)*progress/total;progress+=w.length;return {text:w,start:a,end:start+(end-start)*progress/total};});
}
export function buildCues(original:{time:number;text:string}[],romanized:{time:number;text:string}[]):LyricCue[]{
 return original.map((l,i)=>{
  const end=original[i+1]?.time??l.time+4;
  return {time:l.time,end,text:l.text,romanized:romanized[i]?.text||'',mood:inferMood(l.text),words:tokenize(l.text,l.time,end)};
 });
}
