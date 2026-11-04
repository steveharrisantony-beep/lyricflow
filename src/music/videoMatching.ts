import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {identityWords} from './recordingIdentity';

export type VideoTarget={title:string;artist:string};
export const AUTO_VIDEO_ATTEMPT_LIMIT=20;
export const primaryVideoArtist=(artist:string)=>artist.split(/[,;]|\s+(?:feat\.?|featuring|ft\.?)\s+/i)[0].trim();
export const isLyricalVideo=(song:SongResult)=>/\b(?:lyrics?|lyrical)\b/i.test(song.videoTitle||song.title);
export const isYouTubeTopicChannel=(name:string)=>/\s*[-–—]\s*Topic\s*$/i.test(name);

export function videoAvailabilityRejections(song:SongResult):string[]{
 const reasons:string[]=[];
 if(!extractYouTubeVideoId(song))reasons.push('Invalid YouTube ID');
 if(song.embeddable===false)reasons.push('Embedding blocked');
 if(song.visualContent==='static')reasons.push('Static content');
 if(song.videoType==='ATV')reasons.push('YouTube Music audio track (ATV)');
 if(isYouTubeTopicChannel(song.uploaderName||'')||isYouTubeTopicChannel(song.artist))reasons.push('Topic channel');
 if(song.album==='Audio Track')reasons.push('Audio Track album');
 return reasons;
}

const rejectedKeywords=['jukebox','cover','reaction','karoke','reply'];
export function evaluateBackgroundVideos(songs:SongResult[],songTitle:string,preference:'music'|'lyrics',playbackRejections:Readonly<Record<string,string>>={}){
 const songWords=new Set(identityWords(songTitle));
 return songs.map((song,index)=>{
  const id=extractYouTubeVideoId(song);
  const availability=videoAvailabilityRejections(song);
  const words=new Set(identityWords(song.videoTitle||song.title));
  const reasons=[...availability];
  if(![...songWords].some(word=>words.has(word)))reasons.push('No song-title word in the video title');
  for(const keyword of rejectedKeywords){
   if(words.has(keyword)&&!songWords.has(keyword))reasons.push(`Rejected keyword: ${keyword}`);
  }
  if(preference==='lyrics'&&!isLyricalVideo(song))reasons.push('Video title needs lyric, lyrics, or lyrical');
  const playbackRejection=id&&Object.hasOwn(playbackRejections,id)?playbackRejections[id]:undefined;
  if(playbackRejection)reasons.push(playbackRejection);
  return {song,id,reasons,withinLimit:index<AUTO_VIDEO_ATTEMPT_LIMIT,canUse:!availability.length&&!playbackRejection};
 });
}
export type BackgroundVideoChoice=ReturnType<typeof evaluateBackgroundVideos>[number];

/** Manual online search keeps provider relevance order and allows sorting by views. */
export function filterYouTubeVideoChoices(songs: SongResult[]): SongResult[] {
 const blocked=new Set(songs.filter(song=>videoAvailabilityRejections(song).length).map(song=>extractYouTubeVideoId(song)));
 const byId=new Map<string,SongResult>();
 for(const song of songs){
  const id=extractYouTubeVideoId(song);
  if(!id||blocked.has(id))continue;
  const previous=byId.get(id);
  if(!previous||(song.viewCount??-1)>(previous.viewCount??-1))byId.set(id,song);
 }
 return [...byId.values()];
}
export function compareYouTubeVideoViews(a:SongResult,b:SongResult):number{
 return (b.viewCount??-1)-(a.viewCount??-1)||(extractYouTubeVideoId(a)||'').localeCompare(extractYouTubeVideoId(b)||'');
}
