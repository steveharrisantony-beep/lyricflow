/** Pure, replaceable track matching. Never treats a filename as verified metadata. */
export interface TrackInfo {
  title:string; artist:string; album:string; duration:number; fileName?:string;
  source:'filename'|'manual'|'provider'; confidence:number;
  artwork?:string;
  provider?:'ytmusic'|'soundcloud'|'jiosaavn'|'audius'|'resolver'|'local';
  audioSource?:string;
  sourceUrl?:string;
}
const stripTags=(text:string)=>text
 .replace(/\.(mp3|m4a|aac|wav|flac|ogg)$/i,'')
 .replace(/\b(?:mp3[_ -]?(?:128|192|256|320)k?|(?:128|192|256|320)kbps|lossless|hi[- ]?res|official(?: music)? video|official audio|lyric video|audio song|full song|4k|hq)\b/gi,' ')
 .replace(/[\[\](){}]/g,' ')
 .replace(/[_]+/g,' ')
 .replace(/\s+/g,' ').trim();
export function parseTrackFilename(filename:string):TrackInfo {
 const clean=stripTags(filename);
 const parts=clean.split(/\s+[-–—]\s+/).filter(Boolean);
 const artist=parts.length>=2?parts[0]:'';
 const title=parts.length>=2?parts.slice(1).join(' - '):clean;
 return {title,artist,album:'',duration:0,fileName:filename,provider:'local',audioSource:`Local Audio File (${filename})`,source:'filename',confidence:parts.length>=2?0.55:0.20};
}
export function normalizeTrack(text:string){
 return text.toLocaleLowerCase().normalize('NFKD')
  .replace(/\b(feat|ft|featuring|remastered|official|version|from)\b.*$/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export interface TrackCandidate { syncedLyrics?:string;id:number;title:string;artist:string;album:string;duration:number;instrumental:boolean;hasSynced:boolean;hasWordSync:boolean;url:string;confidence:number }
export interface SearchRecord {id:number;trackName:string;artistName:string;albumName:string;duration:number;instrumental:boolean;syncedLyrics:string|null;hasWordSync?:boolean }
export function rankCandidate(track:TrackInfo, candidate:SearchRecord):TrackCandidate{
 const t=normalizeTrack(track.title),c=normalizeTrack(candidate.trackName);
 const a=normalizeTrack(track.artist),ca=normalizeTrack(candidate.artistName);
 const words=(s:string)=>new Set(s.split(' ').filter(Boolean));
 const target=words(t),found=words(c);
 let common=0;for(const w of target)if(found.has(w))common++;
 const overlap=common/Math.max(1,Math.max(target.size,found.size));
 let confidence=t===c&&t!==''?.76:.68*overlap;
 if(a){confidence+=a===ca?.16:ca.includes(a)||a.includes(ca)?.06:0;}
 if(track.duration>0&&candidate.duration>0){
  const delta=Math.abs(track.duration-candidate.duration);
  confidence+=delta<3?.08:delta<12?.04:delta>35?-.13:0;
 }
 if(candidate.instrumental)confidence-=.05;
 return {syncedLyrics:candidate.syncedLyrics||undefined,id:candidate.id,title:candidate.trackName,artist:candidate.artistName,
  album:candidate.albumName,duration:candidate.duration,hasSynced:Boolean(candidate.syncedLyrics),
  hasWordSync:Boolean(candidate.hasWordSync),instrumental:candidate.instrumental,
  url:'https://lrclib.net/api/get/'+candidate.id,
  confidence:Math.max(0,Math.min(1,confidence))};
}
