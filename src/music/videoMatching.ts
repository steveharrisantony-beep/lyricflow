import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {assessRecordingIdentity,artistIdentity,isUnwantedVideoVariant,type RecordingTarget} from './recordingIdentity';
export {isUnwantedVideoVariant};
export type VideoTarget=RecordingTarget;

export const isLyricalVideo=(song:SongResult)=>/\b(?:lyric(?:s|al)?|lirics?)\b/i.test(`${song.title} ${song.videoTitle||''}`);
export function isYouTubeVideoCandidate(song:SongResult){
 const label=`${song.title} ${song.videoTitle||''}`;
 if(!extractYouTubeVideoId(song)||song.embeddable===false||song.visualContent==='static'||song.videoType==='ATV'||/(?:^|[\s\-–—])Topic\b/i.test(song.uploaderName||song.artist)||/^Audio Track$/i.test(song.album))return false;
 return !/\b(?:audio|jukebox|album\s*(?:art|image)|cover\s*art|static|still\s*(?:image|photo|picture)|image\s*(?:only|background)|photo\s*(?:only|background)|visuali[sz]er|auto.generated|provided\s+to\s+youtube|podcast|reaction)\b/i.test(label);
}
export function isYouTubeBackgroundVideo(song:SongResult){
 const label=`${song.title} ${song.videoTitle||''}`;
 if(!isYouTubeVideoCandidate(song))return false;
 return song.videoType==='OMV'||Boolean(song.counterpartOf)||isLyricalVideo(song)||/\b(?:(?:official|music|full|hd|4k|movie|film|hit)\s*(?:video|song|songs|mv)|video\s*song|full\s*song|songs|mv)\b/i.test(label)||
  (song.channelVerified===true&&(song.artistCredits||[]).some(a=>artistIdentity(a)===artistIdentity(song.uploaderName||song.artist)));
}
/** Keep provider order while removing duplicate, static and blocked uploads. */
export function filterYouTubeVideoChoices(songs: SongResult[], include: (song: SongResult) => boolean = () => true): SongResult[] {
 const blocked=new Set(songs.filter(song=>!isYouTubeVideoCandidate(song)).map(song=>extractYouTubeVideoId(song)));
 const byId=new Map<string,SongResult>();
 for(const song of songs){const id=extractYouTubeVideoId(song);if(!id||blocked.has(id)||!include(song))continue;
  const previous=byId.get(id);if(!previous||(song.viewCount||0)>(previous.viewCount||0))byId.set(id,song);
 }
 return [...byId.values()];
}
export function compareYouTubeVideoViews(a: SongResult, b: SongResult): number {
 return (b.viewCount||0)-(a.viewCount||0)||(extractYouTubeVideoId(a)||'').localeCompare(extractYouTubeVideoId(b)||'');
}
export function sortYouTubeVideoChoicesByViews(songs: SongResult[], include?: (song: SongResult) => boolean): SongResult[] {
 return filterYouTubeVideoChoices(songs,include).sort(compareYouTubeVideoViews);
}
/** Apply song relevance before popularity. Keep both formats and uncertain publishers for manual choice. */
export function relevantYouTubeVideoChoices(songs:SongResult[],track:VideoTarget):SongResult[]{
 return sortYouTubeVideoChoicesByViews(songs,song=>{
  if(!isYouTubeBackgroundVideo(song)||!assessRecordingIdentity(song,track).relevant)return false;
  return plausibleVideoLength(song,track);
 });
}
function plausibleVideoLength(song:SongResult,track:VideoTarget){
 if(!(track.duration>0&&song.duration>0))return true;
 // Gross clip/compilation checks only. Added intros/outros receive no ranking penalty or reward.
 return song.duration>=Math.min(90,track.duration*.45)&&song.duration<=Math.max(track.duration*3,track.duration+600);
}
