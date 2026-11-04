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
