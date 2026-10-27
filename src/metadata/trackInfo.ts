/** Pure, replaceable track matching. Never treats a filename as verified metadata. */
export interface TrackInfo {
  title:string; artist:string; album:string; duration:number; fileName?:string;
  source:'filename'|'manual'|'provider'; confidence:number;
  artwork?:string;
  provider?:'ytmusic'|'soundcloud'|'jiosaavn'|'audius'|'resolver'|'local';
  audioSource?:string;
  sourceUrl?:string;
  youtubeVideoId?:string;
  videoTitle?:string;
}

const LYRIC_VIDEO_PATTERN=/\b(?:lyrical|lyrics|lyric\s*video|official\s*lyric|with\s*lyrics|lyrical\s*video|lyrics\s*video)\b/i;

/**
 * Extracts an 11-character YouTube video ID from a TrackInfo or SongResult if the source is YouTube.
 */
export function extractYouTubeVideoId(
 item?: {
  id?:string;
  provider?:string;
  sourceUrl?:string;
  youtubeVideoId?:string;
 }|null
):string|null{
 if(!item)return null;
 if(typeof item.youtubeVideoId==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(item.youtubeVideoId.trim())){
  return item.youtubeVideoId.trim();
 }
 if(typeof item.id==='string'){
  if(item.id.startsWith('yt_')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id.slice(3))){
   return item.id.slice(3);
  }
  if(item.id.startsWith('ytm_')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id.slice(4))){
   return item.id.slice(4);
  }
  if((item.provider==='resolver'||item.provider==='youtube')&&/^[a-zA-Z0-9_-]{11}$/.test(item.id)){
   return item.id;
  }
 }
 if(typeof item.sourceUrl==='string'&&item.sourceUrl){
  const m=item.sourceUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if(m?.[1])return m[1];
 }
 return null;
}

/**
 * Detects whether a currently playing video already contains embedded lyrics
 * by searching for terms like "lyrical", "lyrics", or "lyric video" in its metadata.
 */
export function isLyricVideoTrack(
 track?: {
  title?:string;
  videoTitle?:string;
  artist?:string;
  album?:string;
 }|null
):boolean{
 if(!track)return false;
 const combined=[track.videoTitle,track.title,track.album,track.artist]
  .filter(Boolean)
  .join(' ');
 return LYRIC_VIDEO_PATTERN.test(combined);
}

const stripTags=(text:string)=>text
 .replace(/\.(mp3|m4a|aac|wav|flac|ogg)$/i,'')
 .replace(/\b(?:mp3[_ -]?(?:128|192|256|320)k?|(?:128|192|256|320)kbps|lossless|hi[- ]?res|official(?: music)? video|official audio|lyric video|lyrical video|lyrical|audio song|full song|4k|hq)\b/gi,' ')
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
  .replace(/\b(feat|ft|featuring|remastered|official|version|from|lyrical|lyrics|lyric video)\b.*$/g,'')
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
