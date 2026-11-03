/** Real word timestamps outrank line timestamps; plain text is the last fallback. */
export function lyricsQuality(text:string|undefined,hasWordSync=false):number{
 if(!text?.trim())return 0;
 if(!/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(text))return 1;
 return (hasWordSync||/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/.test(text))?3:2;
}
