import {isLyricalVideo,rankYouTubeBackgroundCandidates,searchStashCatalog,type SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

/** Compare up to twenty results from each query rather than trusting the first search hit. */
export async function findYouTubeBackgrounds(track:{title:string;artist:string;duration:number},preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const prefix=`${track.title} ${track.artist}`.trim();
 const suffixes=preference==='music'?['music video','lyrics video']:['lyrics video','lyrical video'];
 const batches=await Promise.all(suffixes.map(suffix=>searchStashCatalog(`${prefix} ${suffix}`,'resolver',base,signal).catch(error=>{if(signal?.aborted)throw error;return [];})));
 signal?.throwIfAborted();
 const seen=new Set<string>(),candidates:SongResult[]=[];
 for(const batch of batches)for(const song of batch){const id=extractYouTubeVideoId(song);if(id&&!seen.has(id)){seen.add(id);candidates.push(song);}}
 const videos=rankYouTubeBackgroundCandidates(candidates,track,preference);
 return {videos,candidateCount:candidates.length,usedLyricalFallback:preference==='music'&&Boolean(videos[0]&&isLyricalVideo(videos[0]))};
}
