import {hasYouTubeViewCount,primaryVideoArtist,relevantYouTubeVideoChoices,type VideoTarget} from './videoMatching';
import {searchStashCatalog} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

export async function findYouTubeBackgrounds(track:VideoTarget,preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const title=track.title.trim();
 const artist=primaryVideoArtist(track.artist);
 if(!title||!artist)return {candidates:[],automaticVideoId:null,candidateCount:0};
 const found=await searchStashCatalog(`${title} ${artist} video`,'resolver',base,signal,{background:{title,artist}});
 signal?.throwIfAborted();
 const candidates=relevantYouTubeVideoChoices(found,track,preference);
 return {candidates,automaticVideoId:extractYouTubeVideoId(candidates.find(hasYouTubeViewCount)),candidateCount:found.length};
}
