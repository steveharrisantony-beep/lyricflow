import {isLyricalVideo,rankYouTubeBackgroundCandidates,searchStashCatalog,type SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

/** Compare up to twenty results from each query rather than trusting the first search hit. */
export async function findYouTubeBackgrounds(track:{title:string;artist:string;album?:string;provider?:string;duration:number},preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const cleanTitle=track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim()||track.title.trim();
 const prefix=`${cleanTitle} ${track.artist}`.trim();
 const suffixes=preference==='music'?['music video','lyrics video']:['lyrics video','lyrical video'];
 const queries=suffixes.map(suffix=>`${prefix} ${suffix}`.trim());
 if(track.album!==undefined||track.provider!==undefined){
  const cleanAlbum=(track.album||'').replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
  if(cleanAlbum&&cleanAlbum.toLowerCase()!==cleanTitle.toLowerCase()&&!/^(?:audio\s*track|single|unknown|various)/i.test(cleanAlbum)){
   queries.push(preference==='music'?`${cleanTitle} ${cleanAlbum}`:`${cleanTitle} ${cleanAlbum} lyrics`);
  }
  if(track.artist&&cleanTitle.length>=2){
   queries.push(preference==='music'?cleanTitle:`${cleanTitle} lyrics`);
  }
 }
 const uniqueQueries=[...new Set(queries)];
 const batches=await Promise.all(uniqueQueries.map(q=>searchStashCatalog(q,'resolver',base,signal).catch(error=>{if(signal?.aborted)throw error;return [];})));
 signal?.throwIfAborted();
 const seen=new Set<string>(),candidates:SongResult[]=[];
 for(const batch of batches)for(const song of batch){const id=extractYouTubeVideoId(song);if(id&&!seen.has(id)){seen.add(id);candidates.push(song);}}
 const videos=rankYouTubeBackgroundCandidates(candidates,track,preference);
 return {videos,candidateCount:candidates.length,usedLyricalFallback:preference==='music'&&Boolean(videos[0]&&isLyricalVideo(videos[0]))};
}
