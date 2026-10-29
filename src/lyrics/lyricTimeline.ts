import {analyzeLyricWords} from './wordEmphasis';
import {analyzeSections,planAt,type Mood,type ScenePlan} from './sceneDirector';
import {makeEstimatedWords,type TimedLine,type TimedWord} from './lrc';

export type LyricMood=Mood;
export type LyricCue={
 time:number;
 end:number;
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

/**
 * Compute the natural vocal end timestamp of a lyric line so that previous lyrics
 * are never held on screen during instrumental music breaks or vocal pauses.
 * Preserves overlapping word-synced durations when two singers sing simultaneously.
 */
export function computeNaturalLineEnd(line:TimedLine,nextLineTime?:number):number{
 const nextStart=nextLineTime!==undefined?nextLineTime:Infinity;
 const trimmed=(line.text||'').trim();
 if(!trimmed)return line.time;
 const hasSourcedWords=Boolean(line.words&&line.words.length>0&&line.words.some(w=>w.timing==='sourced'));
 if(hasSourcedWords&&line.words){
  const lastWordEnd=line.words[line.words.length-1].end;
  // If sourced words explicitly continue past nextStart, two vocalists are singing simultaneously
  if(Number.isFinite(nextStart)&&lastWordEnd>nextStart+0.15){
   return Math.max(line.time+0.15,lastWordEnd+0.3);
  }
  return Math.max(line.time+0.15,Math.min(nextStart,lastWordEnd+0.45));
 }
 const wordCount=trimmed.split(/\s+/).filter(Boolean).length;
 const naturalSpan=Math.min(4.8,Math.max(2.0,wordCount*0.52+0.9));
 return Math.max(line.time+0.15,Math.min(nextStart,line.time+naturalSpan));
}

export function buildCues(original:TimedLine[],romanized:TimedLine[],genre=''):LyricCue[]{
 const plans=analyzeSections(original.filter(l=>l.text.trim().length>0).map(l=>({time:l.time,text:l.text})),genre);
 const out:LyricCue[]=[];
 for(let i=0;i<original.length;i++){
  const line=original[i];
  if(!line.text.trim())continue;
  const nextTime=original[i+1]?.time;
  const end=computeNaturalLineEnd(line,nextTime);
  const hasSourced=Boolean(line.words&&line.words.length>0&&line.words.some(w=>w.timing==='sourced'));
  const words=hasSourced&&line.words?line.words:makeEstimatedWords(line.text,line.time,end);
  out.push({
   time:line.time,
   end,
   text:line.text,
   romanized:romanized[i]?.text||'',
   mood:planAt(plans,line.time)?.mood||'abstract',
   words,
   timing:hasSourced?'sourced':'estimated'
  });
 }
 // Lock simultaneous dual-singer pairs so if one side finishes first, neither side changes
 // position, animation, or color until the line on the second side is finished.
 for(let i=0;i<out.length-1;i++){
  if(out[i].end>out[i+1].time+0.12){
   const sharedEnd=Math.max(out[i].end,out[i+1].end);
   const groupKey=out[i].duetGroupKey||`duet:${out[i].time.toFixed(2)}:${out[i].text}`;
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
