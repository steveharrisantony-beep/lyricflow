import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {assessRecordingIdentity,artistIdentity,matchesArtistName,isPublisherName,isUnwantedVideoVariant,type RecordingTarget} from './recordingIdentity';
import {confirmedMusicPublisherIds} from './youtubeChannels';
export {isUnwantedVideoVariant};
export type VideoTarget=RecordingTarget;
export type VideoPreference='music'|'lyrics';
export interface VideoMatch {song:SongResult;confidence:number;identityScore:number;score:number;lyric:boolean;releaseEvidence:number}

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
/** Explicit custom searches can offer other recordings; known static/blocked uploads stay excluded. */
export function sortYouTubeVideoChoicesByViews(songs: SongResult[], include: (song: SongResult) => boolean = () => true): SongResult[] {
 const blocked=new Set(songs.filter(song=>!isYouTubeVideoCandidate(song)).map(song=>extractYouTubeVideoId(song)));
 const byId=new Map<string,SongResult>();
 for(const song of songs){const id=extractYouTubeVideoId(song);if(!id||blocked.has(id)||!include(song))continue;
  const previous=byId.get(id);if(!previous||(song.viewCount||0)>(previous.viewCount||0))byId.set(id,song);
 }
 return [...byId.values()].sort((a,b)=>(b.viewCount||0)-(a.viewCount||0)||(extractYouTubeVideoId(a)||'').localeCompare(extractYouTubeVideoId(b)||''));
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
function releaseTier(song: SongResult, track: VideoTarget, creditedMatch: boolean) {
 if (song.counterpartOf && song.catalogueTitle) {
  const catalogue = assessRecordingIdentity({
   title: song.catalogueTitle,
   artist: (song.catalogueArtists || []).join(', '),
   album: song.catalogueAlbum || '',
   duration: 0,
   artistCredits: song.catalogueArtists,
   metadataSource: 'ytmusic',
  }, track);
  if (catalogue.relevant) return 4;
 }
 const uploader = song.uploaderName || song.artist;
 const channelId = song.channelId;
 if (channelId && (confirmedMusicPublisherIds.has(channelId) || song.artistChannelIds?.includes(channelId))) return 3;
 // A badge with matching release context can corroborate a publisher or artist.
 if (channelId && song.channelVerified) {
  const matchesCredits = song.artistCredits?.some(credit => matchesArtistName(uploader, credit));
  if (isPublisherName(uploader) || matchesCredits || matchesArtistName(uploader, track.artist)) return 2;
 }
 if (song.metadataSource === 'ytmusic' && song.videoType === 'OMV' && creditedMatch) return 1;
 return 0;
}
export function assessYouTubeBackgroundCandidates(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'):VideoMatch[]{
 const matches:VideoMatch[]=[];
 for(const song of relevantYouTubeVideoChoices(songs,track)){
  const lyric=isLyricalVideo(song);
  if(preference==='lyrics'&&!lyric)continue;
  const match=assessRecordingIdentity(song,track);
  const releaseEvidence=releaseTier(song,track,match.creditedMatch);
  const popularity=song.viewCount&&song.viewCount>0?Math.min(8,Math.max(0,Math.log10(song.viewCount)-3)*1.5):0;
  matches.push({song,confidence:match.confidence,identityScore:match.identityScore,score:match.identityScore+popularity,lyric,releaseEvidence});
 }
 const bestIdentity=new Map<number,number>();
 for(const match of matches)bestIdentity.set(match.releaseEvidence,Math.max(bestIdentity.get(match.releaseEvidence)||0,match.identityScore));
 const credibleMusic = (match: VideoMatch) => preference === 'music' && !match.lyric && match.releaseEvidence > 0 && match.confidence >= .75;
 return matches.sort((a,b)=>{
  const aClose=a.identityScore>=(bestIdentity.get(a.releaseEvidence)||0)-20,bClose=b.identityScore>=(bestIdentity.get(b.releaseEvidence)||0)-20;
  return Number(credibleMusic(b))-Number(credibleMusic(a))||b.releaseEvidence-a.releaseEvidence||Number(bClose)-Number(aClose)||(preference==='music'?Number(a.lyric)-Number(b.lyric):0)||b.score-a.score||(b.song.viewCount||0)-(a.song.viewCount||0)||
   (extractYouTubeVideoId(a.song)||'').localeCompare(extractYouTubeVideoId(b.song)||'');
 });
}
export function rankYouTubeBackgroundCandidates(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'){
 return assessYouTubeBackgroundCandidates(songs,track,preference).map(m=>m.song);
}
export function selectYouTubeBackgroundCandidate(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'){
 const best=assessYouTubeBackgroundCandidates(songs,track,preference).find(match=>match.confidence>=.75&&match.releaseEvidence>0);
 // User preference: if no credible release is available, use the first relevant preloaded choice (views descending).
 return best?extractYouTubeVideoId(best.song):extractYouTubeVideoId(relevantYouTubeVideoChoices(songs,track)[0]);
}
