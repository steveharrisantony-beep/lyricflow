import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {artistIdentity,identityWords,includesWholeName,isUnwantedVideoVariant} from './recordingIdentity';
export {isUnwantedVideoVariant};
export type VideoTarget={title:string;artist:string};
export const primaryVideoArtist=(artist:string)=>artist.split(/[,;]|\s+(?:feat\.?|featuring|ft\.?)\s+/i)[0].trim();

export const isLyricalVideo=(song:SongResult)=>/\b(?:lyrics?|lyrical)\b/i.test(song.videoTitle||song.title);
export const matchesVideoPreference=(song:SongResult,preference:'music'|'lyrics')=>preference==='music'||isLyricalVideo(song);
export function isYouTubeVideoCandidate(song:SongResult){
 const label=`${song.title} ${song.videoTitle||''}`;
 if(!extractYouTubeVideoId(song)||song.embeddable===false||song.visualContent==='static'||song.videoType==='ATV'||/(?:^|[\s\-–—])Topic\b/i.test(song.uploaderName||song.artist)||/^Audio Track$/i.test(song.album))return false;
 return !/\b(?:audio|jukebox|album\s*(?:art|image)|cover\s*art|static|still\s*(?:image|photo|picture)|image\s*(?:only|background)|photo\s*(?:only|background)|visuali[sz]er|auto.generated|provided\s+to\s+youtube|podcast|reaction)\b/i.test(label);
}
/** Keep provider order while removing duplicate, static and blocked uploads. */
export function filterYouTubeVideoChoices(songs: SongResult[], include: (song: SongResult) => boolean = () => true): SongResult[] {
 const blocked=new Set(songs.filter(song=>!isYouTubeVideoCandidate(song)).map(song=>extractYouTubeVideoId(song)));
 const byId=new Map<string,SongResult>();
 for(const song of songs){const id=extractYouTubeVideoId(song);if(!id||blocked.has(id)||!include(song))continue;
  const previous=byId.get(id);if(!previous||(song.viewCount??-1)>(previous.viewCount??-1))byId.set(id,song);
 }
 return [...byId.values()];
}
export function compareYouTubeVideoViews(a: SongResult, b: SongResult): number {
 return (b.viewCount??-1)-(a.viewCount??-1)||(extractYouTubeVideoId(a)||'').localeCompare(extractYouTubeVideoId(b)||'');
}
export function sortYouTubeVideoChoicesByViews(songs: SongResult[], include?: (song: SongResult) => boolean): SongResult[] {
 return filterYouTubeVideoChoices(songs,include).sort(compareYouTubeVideoViews);
}
/** Both the song words and the primary artist must appear in the displayed video title. */
export function matchesYouTubeVideoTitle(videoTitle:string,track:VideoTarget):boolean{
 const title=identityWords(track.title);
 const primary=primaryVideoArtist(track.artist);
 const artist=identityWords(primary).join('');
 if(!title.length||!artistIdentity(primary))return false;
 const video=identityWords(videoTitle);
 const words=new Set(video);
 return title.every(word=>words.has(word))&&includesWholeName(video,artist);
}
export function relevantYouTubeVideoChoices(songs:SongResult[],track:VideoTarget,preference:'music'|'lyrics'='music'):SongResult[]{
 return sortYouTubeVideoChoicesByViews(songs,song=>{
  const title=song.videoTitle||song.title;
  return matchesYouTubeVideoTitle(title,track)&&matchesVideoPreference(song,preference);
 });
}
export const hasYouTubeViewCount=(song:SongResult)=>song.viewCount!==undefined;
