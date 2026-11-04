import {relevantYouTubeVideoChoices} from './videoMatching';
import {searchStashCatalog,searchVideoCounterparts,type SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

/** Pool artist-qualified and title-only searches before choosing the best recording. */
export async function findYouTubeBackgrounds(track:{title:string;artist:string;album?:string;provider?:string;duration:number},preference:'music'|'lyrics',base:string,signal?:AbortSignal){
 const cleanTitle=track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim()||track.title.trim();
 const primaryArtist=track.artist.split(/[,;]|\s+(?:&|x|and|with|feat\.?|featuring|ft\.?)\s+/i)[0];
 const prefix=`${cleanTitle} ${primaryArtist}`.trim();
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
 // Neutral queries also find official lyric releases whose catalogue title
 // omits the lyric suffix or whose credits differ from the uploader name.
 if(preference==='lyrics'){
  queries.push(prefix,`${cleanTitle} official lyric video`);
  if(track.album&&track.album.trim().toLowerCase()!==cleanTitle.toLowerCase())queries.push(`${cleanTitle} ${track.album}`);
 }
 const uniqueQueries=[...new Set(queries)];
 const batches=await Promise.all([searchVideoCounterparts(track,base,signal),...uniqueQueries.map(q=>searchStashCatalog(q,'resolver',base,signal).catch(error=>{if(signal?.aborted)throw error;return [];}))]);
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
  const titles=[previous.videoTitle,song.videoTitle,...[previous,song].filter(v=>v.metadataSource==='innertube'||v.metadataSource==='mirror').map(v=>v.title)].filter((title):title is string=>Boolean(title));
  titles.sort((a,b)=>Number(/\blyric(?:s|al)?\b/i.test(b))-Number(/\blyric(?:s|al)?\b/i.test(a))||b.length-a.length||a.localeCompare(b));
  byId.set(id,{...fallback,...primary,artist:primary.artist||fallback.artist,
   duration:primary.duration||fallback.duration,
   videoTitle:titles[0]||primary.title,
   viewCount:Math.max(previous.viewCount||0,song.viewCount||0)||undefined,
   videoType:previous.videoType==='ATV'||song.videoType==='ATV'?'ATV':previous.videoType==='OMV'||song.videoType==='OMV'?'OMV':primary.videoType||fallback.videoType,
   channelId:primary.channelId||fallback.channelId,channelVerified:previous.channelVerified||song.channelVerified,uploaderName:primary.uploaderName||fallback.uploaderName,
   artistChannelIds:[...new Set([...(previous.artistChannelIds||[]),...(song.artistChannelIds||[])])],
   counterpartOf:primary.counterpartOf||fallback.counterpartOf,catalogueTitle:primary.catalogueTitle||fallback.catalogueTitle,catalogueArtists:primary.catalogueArtists||fallback.catalogueArtists,catalogueAlbum:primary.catalogueAlbum||fallback.catalogueAlbum,
   embeddable:previous.embeddable===false||song.embeddable===false?false:primary.embeddable??fallback.embeddable,
   artistCredits:[...new Set([...(previous.artistCredits||[]),...(song.artistCredits||[])])],
   visualContent:previous.visualContent==='static'||song.visualContent==='static'?'static':primary.visualContent||fallback.visualContent});
 }
 const candidates = relevantYouTubeVideoChoices([...byId.values()], track);
 return { candidates, automaticVideoId: extractYouTubeVideoId(candidates[0]), candidateCount: byId.size };
}
