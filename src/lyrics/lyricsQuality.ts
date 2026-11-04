import {hasSourcedWordTiming,parseLRC} from './lrc';

export function hasWordTiming(text:string|undefined):boolean{
 return Boolean(text&&hasSourcedWordTiming(parseLRC(text)));
}

/** Determine timing from the lyric text. Provider flags and end markers are not word timings. */
export function lyricsQuality(text:string|undefined):number{
 if(!text?.trim())return 0;
 const lines=parseLRC(text);
 if(!lines.length)return 1;
 return hasSourcedWordTiming(lines)?3:2;
}

const lyricText = /[\p{L}\p{N}]/u;
const majority = 0.8;

function denseWindow(starts: readonly number[], minimum: number, seconds: number) {
 const required = Math.max(minimum, Math.ceil(starts.length * majority));
 if (starts.length < required) return undefined;
 const times = [...starts].sort((a,b)=>a-b);
 let left=0, count=0, span=0;
 for (let right=0;right<times.length;right++) {
  while (times[right]-times[left]>seconds) left++;
  if (right-left+1>count) {
   count=right-left+1;
   span=times[right]-times[left];
  }
 }
 return count>=required?{count,span}:undefined;
}

export function checkLyricsTiming(lrc:string, primaryLineStarts?:readonly number[]): {
 rejection?:string; wordTimingIssue?:string;
} {
 const lines=parseLRC(lrc).filter(line=>lyricText.test(line.text));
 const starts=[...new Set(primaryLineStarts??lines.map(line=>line.time))];
 // LRC has no voice labels. Count shared start times as one cue, except when
 // many distinct lines have almost exactly the same timestamp.
 const collapsed=denseWindow(starts,8,3)??denseWindow(
  primaryLineStarts??[...new Map(lines.map(line=>[JSON.stringify([line.time,line.text]),line.time])).values()],8,.1
 );
 if (collapsed) return {
  rejection:`Collapsed line timing: ${collapsed.count} lyric lines start within ${collapsed.span.toFixed(2)} seconds`,
 };

 const wordLines=lines.map(line=>line.words?.filter(word=>word.timing==='sourced'&&lyricText.test(word.text)).map(word=>word.start)||[]);
 const wordCluster=denseWindow(wordLines.flat(),20,3);
 if (wordCluster) return {
  wordTimingIssue:`Collapsed word timing: ${wordCluster.count} words start within ${wordCluster.span.toFixed(2)} seconds`,
 };
 const multiWordLines=wordLines.filter(times=>times.length>=3);
 const compressed=multiWordLines.filter(times=>times[times.length-1]-times[0]<=.1);
 if (compressed.length>=8&&compressed.length>=multiWordLines.length*majority) return {
  wordTimingIssue:`Collapsed word timing in ${compressed.length} lyric lines`,
 };
 return {};
}
