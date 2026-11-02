import {analyzeLyricWords} from './wordEmphasis';
import {analyzeSections,planAt,type Mood,type ScenePlan} from './sceneDirector';
import {makeEstimatedWords,type TimedLine,type TimedWord} from './lrc';

export type LyricMood=Mood;
export type LyricCue={
 time:number;
 end:number;
 naturalEnd?:number;
 vocalEnd?:number;
 text:string;
 romanized:string;
 mood:Mood;
 words:TimedWord[];
 timing:'sourced'|'estimated';
 duetSide?:'left'|'right';
 duetGroupKey?:string;
};

let cues:LyricCue[]=[];
let sections:ScenePlan[]=[];
let offset=0;
let display:'original'|'romanized'|'both'='original';
let genrePreset='';
let revision=0;
let analyzedKey='';
let emphasis=analyzeLyricWords([]);

/** Read-only snapshot for the cinematic scheduler; rebuilt only after lyric edits. */
export function getLyricTimelineSnapshot(){
 return {revision,cues,sections,genre:genrePreset,emphasis};
}

export function setLyricTimeline(lines:LyricCue[],timingOffset=0,mode:typeof display='original',genre=''){
 const key=lines.map(l=>l.text+'\t'+l.romanized).join('\n');
 if(key!==analyzedKey){emphasis=analyzeLyricWords(lines);analyzedKey=key}
 cues=lines;offset=timingOffset;display=mode;genrePreset=genre;revision++;
 sections=analyzeSections(lines.map(l=>({time:l.time,text:l.text})),genre);
}

export function getLyricState(time:number){
 const position=time+offset;
 let index=-1;
 const activeCues:LyricCue[]=[];
 for(let i=0;i<cues.length;i++){
  if(cues[i].time<=position){
   index=i;
   if(position<cues[i].end){
    activeCues.push(cues[i]);
   }
  }else{
   break;
  }
 }
 const cue=activeCues[0]||null;
 const secondaryCue=activeCues.length>1?activeCues[1]:null;
 return {
  cue,
  secondaryCue,
  next:cues[index+1]||null,
  mode:display,
  position,
  index,
  plan:planAt(sections,position),
  hasLyrics:cues.length>0
 };
}

export function inferMood(text:string):Mood{
 const plans=analyzeSections([{time:0,text}]);
 return plans[0]?.mood||'abstract';
}

/** Skip simultaneous cue starts when finding the next display boundary. */
export function nextLyricTime(lines:TimedLine[],index:number):number|undefined{
 const start=lines[index]?.time;if(start===undefined)return undefined;
 let low=index+1,high=lines.length;
 while(low<high){const middle=(low+high)>>>1;if(lines[middle].time<=start)low=middle+1;else high=middle;}
 return lines[low]?.time;
}
/** A known end comes from an explicit line marker or complete sourced word ends. */
export function knownVocalEnd(line:TimedLine):number|undefined{
 const explicit=line.end!==undefined&&Number.isFinite(line.end)&&line.end>line.time?line.end:undefined;
 const sourced=line.words?.filter(word=>word.timing==='sourced'&&Number.isFinite(word.end)&&word.end>word.start);
 if(!sourced?.length)return explicit;
 if(sourced[sourced.length-1].endEstimated)return explicit;
 return Math.max(explicit??line.time,...sourced.map(word=>word.end));
}
/** Respect timed intervals. A word-count guess must never shorten a line-only
 * interval; blank timestamps and explicit ends still clear instrumental gaps.
 */
export function computeNaturalLineEnd(line:TimedLine,nextLineTime?:number,trackEnd?:number):number{
 if(!(line.text||'').trim())return line.time;
 const next=nextLineTime!==undefined&&Number.isFinite(nextLineTime)&&nextLineTime>line.time?nextLineTime:undefined;
 const known=knownVocalEnd(line);
 if(known!==undefined){
  if(next!==undefined&&known>next+.15)return Math.max(line.time+.15,known+.3);
  return Math.max(line.time+.15,Math.min(next??Infinity,known+.45));
 }
 const last=line.words?.[line.words.length-1];
 if(next!==undefined&&(!last||next>last.start))return next;
 if(next===undefined&&trackEnd!==undefined&&Number.isFinite(trackEnd)&&trackEnd>Math.max(line.time,last?.start??line.time))return trackEnd;
 // No following timestamp or usable media end is available (e.g. an editor sample).
 const count=line.text.trim().split(/\s+/).length;
 const fallback=line.time+Math.max(8,count*.8+1.5);
 return Math.max(fallback,...(line.words||[]).map(word=>word.end+.3));
}

export function buildCues(original:TimedLine[],romanized:TimedLine[],genre='',trackEnd?:number):LyricCue[]{
 const plans=analyzeSections(original.filter(l=>l.text.trim().length>0).map(l=>({time:l.time,text:l.text})),genre);
 const out:LyricCue[]=[];
 for(let i=0;i<original.length;i++){
  const line=original[i];
  if(!line.text.trim())continue;
  const nextTime=nextLyricTime(original,i);
  const end=computeNaturalLineEnd(line,nextTime,trackEnd);
  const hasSourced=Boolean(line.words&&line.words.length>0&&line.words.some(w=>w.timing==='sourced'));
  const words=hasSourced&&line.words?line.words.map(word=>word.endEstimated?{...word,end:Math.max(word.start+.05,end)}:word):makeEstimatedWords(line.text,line.time,end);
  out.push({
   time:line.time,
   end,
   naturalEnd:end,
   vocalEnd:knownVocalEnd(line),
   text:line.text,
   romanized:romanized[i]?.text||'',
   mood:planAt(plans,line.time)?.mood||'abstract',
   words,
   timing:hasSourced?'sourced':'estimated'
  });
 }
 // Lock simultaneous dual-singer pairs on two separate sides ('left' and 'right').
 // Each cue retains its individual `naturalEnd` so when one side finishes early it hides cleanly,
 // while `end` is extended to `sharedEnd` so the ongoing side never changes colour, position, animation, or font.
 for(let i=0;i<out.length-1;i++){
  if(out[i].end>out[i+1].time+0.12){
   const sharedEnd=Math.max(out[i].end,out[i+1].end);
   const groupKey=out[i].duetGroupKey||`duet:${out[i].time.toFixed(2)}:${out[i].text}`;
   out[i].naturalEnd=out[i].naturalEnd??out[i].end;
   out[i+1].naturalEnd=out[i+1].naturalEnd??out[i+1].end;
   out[i].end=sharedEnd;
   out[i+1].end=sharedEnd;
   if(!out[i].duetSide)out[i].duetSide='left';
   out[i+1].duetSide=out[i].duetSide==='left'?'right':'left';
   out[i].duetGroupKey=groupKey;
   out[i+1].duetGroupKey=groupKey;
  }
 }
 return out;
}
