import {primaryVideoArtist,type VideoTarget} from './videoMatching';
import {searchStashCatalog} from './providers';

export async function findYouTubeBackgrounds(track:VideoTarget,base:string,signal?:AbortSignal){
 const title=track.title.trim();
 if(!title)return {candidates:[],candidateCount:0};
 const artist=primaryVideoArtist(track.artist);
 const query=[title,artist,'video'].filter(Boolean).join(' ');
 const candidates=await searchStashCatalog(query,'resolver',base,signal,{background:{title,artist}});
 signal?.throwIfAborted();
 return {candidates,candidateCount:candidates.length};
}
