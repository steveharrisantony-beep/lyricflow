import {isLyricalVideo,rankYouTubeBackgroundCandidates,searchStashCatalog,type SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

/** Pool artist-qualified and title-only searches before choosing the best recording. */
export async function findYouTubeBackgrounds(track:{title:string;artist:string;album?:string;provider?:string;duration:number},preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const cleanTitle=track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim()||track.title.trim();
 const prefix=`${cleanTitle} ${track.artist}`.trim();
 const suffixes=preference==='music'?['music video','lyrics video']:['lyrics video','lyrical video'];
 const queries=suffixes.map(suffix=>`${prefix} ${suffix}`.trim());
 // Long multi-artist credits can hide the artist's upload in search. Include
 // the same short title searches available in the manual video picker.
 queries.push(`${cleanTitle} ${preference==='music'?'official music video':'lyrical video'}`);
 if(track.artist&&cleanTitle.length>=2)queries.push(preference==='music'?cleanTitle:`${cleanTitle} lyrics`);
 if(track.album!==undefined||track.provider!==undefined){
  const cleanAlbum=(track.album||'').replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
  if(cleanAlbum&&cleanAlbum.toLowerCase()!==cleanTitle.toLowerCase()&&!/^(?:audio\s*track|single|unknown|various)/i.test(cleanAlbum)){
   queries.push(preference==='music'?`${cleanTitle} ${cleanAlbum}`:`${cleanTitle} ${cleanAlbum} lyrics`);
  }
 }
 const uniqueQueries=[...new Set(queries)];
 const batches=await Promise.all(uniqueQueries.map(q=>searchStashCatalog(q,'resolver',base,signal).catch(error=>{if(signal?.aborted)throw error;return [];})));
 signal?.throwIfAborted();
 const byId=new Map<string,SongResult>();
 const hasChannel=(song:SongResult)=>Boolean(song.artist.trim())&&!/^(?:youtube|unknown|various artists?)$/i.test(song.artist.trim());
 for(const batch of batches)for(const song of batch){
  const id=extractYouTubeVideoId(song);if(!id)continue;
  const previous=byId.get(id);
  if(!previous){byId.set(id,song);continue;}
  // Keep useful uploader/view metadata even when an earlier search returned
  // the same ID with generic or incomplete details.
  const [primary,fallback]=!hasChannel(previous)&&hasChannel(song)?[song,previous]:[previous,song];
  byId.set(id,{...fallback,...primary,artist:primary.artist||fallback.artist,
   duration:primary.duration||fallback.duration,
   viewCount:Math.max(previous.viewCount||0,song.viewCount||0)||undefined,
   videoType:primary.videoType||fallback.videoType});
 }
 const candidates=[...byId.values()];
 const videos=rankYouTubeBackgroundCandidates(candidates,track,preference);
 return {videos,candidateCount:candidates.length,usedLyricalFallback:preference==='music'&&Boolean(videos[0]&&isLyricalVideo(videos[0]))};
}
