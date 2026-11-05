import type {TrackInfo} from '../metadata/trackInfo';
import {searchStashCatalog} from './providers';
import {backgroundVideoQuery} from './backgroundQuery';
import {logVideoSearch} from './videoSearchHistory';

type VideoTarget=Pick<TrackInfo,'title'|'artist'|'primaryArtist'|'featuredArtist'>;

function splitFeatureCredit(value:string){
 const bracketed=value.match(/\s*[\[(]\s*(?:featuring|feat|ft)(?:\.\s*|\s+)([^)\]]+)[)\]]\s*/i);
 if(bracketed)return {text:value.replace(bracketed[0],' ').trim(),credit:bracketed[1]};
 const suffix=value.match(/\s+(?:featuring|feat|ft)(?:\.\s*|\s+)(.+)$/i);
 return suffix ? {text:value.slice(0,suffix.index).trim(),credit:suffix[1]} : {text:value.trim(),credit:''};
}

const firstListedArtist=(value:string)=>value.split(/[,;]|\s+&\s+/).map(name=>name.trim()).find(Boolean);

export async function findYouTubeBackgrounds(track:VideoTarget,base:string,signal?:AbortSignal){
 const title=track.title;
 if(!title.trim())return {candidates:[],candidateCount:0};
 const artistCredit=splitFeatureCredit(track.artist);
 const artist=track.primaryArtist?.trim()||firstListedArtist(artistCredit.text)||'';
 const query=backgroundVideoQuery(title,artist);
 const candidates=await logVideoSearch(query,'Autoplay',()=>searchStashCatalog(query,'resolver',base,signal,{
  background:{title,artist},
 }),signal);
 signal?.throwIfAborted();
 return {candidates,candidateCount:candidates.length};
}
