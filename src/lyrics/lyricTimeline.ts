import {analyzeSections,planAt,type Mood,type ScenePlan} from './sceneDirector';
import {makeEstimatedWords,type TimedLine,type TimedWord} from './lrc';
export type LyricMood=Mood;
export type LyricCue={time:number;end:number;text:string;romanized:string;mood:Mood;words:TimedWord[];timing:'sourced'|'estimated'};
let cues:LyricCue[]=[];
let sections:ScenePlan[]=[];
let offset=0;
let display:'original'|'romanized'|'both'='original';
let genrePreset='';
let revision=0;
/** Read-only snapshot for the cinematic scheduler; rebuilt only after lyric edits. */
export function getLyricTimelineSnapshot(){
 return {revision,cues,sections,genre:genrePreset};
}
export function setLyricTimeline(lines:LyricCue[],timingOffset=0,mode:typeof display='original',genre=''){
 cues=lines;offset=timingOffset;display=mode;genrePreset=genre;revision++;
 sections=analyzeSections(lines.map(l=>({time:l.time,text:l.text})),genre);
}
export function getLyricState(time:number){
 const position=time+offset;
 let index=-1;
 for(let i=0;i<cues.length;i++){if(cues[i].time<=position)index=i;else break}
 const candidate=index>=0?cues[index]:null;
 const cue=candidate&&position<candidate.end?candidate:null;
 return {cue,next:cues[index+1]||null,mode:display,position,index,plan:planAt(sections,position),hasLyrics:cues.length>0};
}
export function inferMood(text:string):Mood{
 const plans=analyzeSections([{time:0,text}]);
 return plans[0]?.mood||'abstract';
}
export function buildCues(original:TimedLine[],romanized:TimedLine[],genre=''):LyricCue[]{
 const plans=analyzeSections(original.map(l=>({time:l.time,text:l.text})),genre);
 return original.map((line,i)=>{
  const end=Math.max(line.time+.15,original[i+1]?.time??line.time+4);
  const words=line.words?.length?line.words:makeEstimatedWords(line.text,line.time,end);
  return {time:line.time,end,text:line.text,romanized:romanized[i]?.text||'',mood:planAt(plans,line.time)?.mood||'abstract',
   words,timing:line.words?.length?'sourced':'estimated'};
 });
}
