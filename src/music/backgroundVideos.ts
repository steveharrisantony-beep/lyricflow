import {primaryVideoArtist,relevantYouTubeVideoChoices,type VideoTarget} from './videoMatching';
import {searchStashCatalog} from './providers';

export async function findYouTubeBackgrounds(track:VideoTarget,base:string,signal?:AbortSignal){
 const title=track.title.trim();
 const artist=primaryVideoArtist(track.artist);
 if(!title||!artist)return {candidates:[],candidateCount:0};
 const found=await searchStashCatalog(`${title} ${artist} video`,'resolver',base,signal,{background:{title,artist}});
 signal?.throwIfAborted();
 return {candidates:relevantYouTubeVideoChoices(found,track),candidateCount:found.length};
}
