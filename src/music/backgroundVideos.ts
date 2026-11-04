import type {TrackInfo} from '../metadata/trackInfo';
import {searchStashCatalog} from './providers';
import {identityWords} from './recordingIdentity';
import {logVideoSearch} from './videoSearchHistory';

type VideoTarget=Pick<TrackInfo,'title'|'artist'|'primaryArtist'|'featuredArtist'>;

function splitFeatureCredit(value:string){
 const bracketed=value.match(/\s*[\[(]\s*(?:featuring|feat|ft)(?:\.\s*|\s+)([^)\]]+)[)\]]\s*/i);
 if(bracketed)return {text:value.replace(bracketed[0],' ').trim(),credit:bracketed[1]};
 const suffix=value.match(/\s+(?:featuring|feat|ft)(?:\.\s*|\s+)(.+)$/i);
 return suffix ? {text:value.slice(0,suffix.index).trim(),credit:suffix[1]} : {text:value.trim(),credit:''};
}

const firstListedArtist=(value:string)=>value.split(/[,;]|\s+&\s+/).map(name=>name.trim()).find(Boolean);

function titleIncludesArtist(titleWords:string[],artist:string){
 const artistWords=identityWords(artist);
 return artistWords.length>0&&titleWords.some((_,start)=>
  artistWords.every((word,offset)=>titleWords[start+offset]===word)
 );
}

export async function findYouTubeBackgrounds(track:VideoTarget,base:string,signal?:AbortSignal){
 const titleCredit=splitFeatureCredit(track.title);
 const title=titleCredit.text;
 if(!title)return {candidates:[],candidateCount:0};
 const artistCredit=splitFeatureCredit(track.artist);
 const primary=track.primaryArtist?.trim()||firstListedArtist(artistCredit.text)||'';
 const featured=track.featuredArtist?.trim()||firstListedArtist(artistCredit.credit||titleCredit.credit)||'';
 const titleWords=identityWords(title);
 const artist=titleIncludesArtist(titleWords,primary)?'':primary;
 const featuredArtist=titleIncludesArtist(titleWords,featured)?'':featured;
 const query=[title,artist,featuredArtist,'video'].filter(Boolean).join(' ');
 const candidates=await logVideoSearch(query,'Autoplay',()=>searchStashCatalog(query,'resolver',base,signal,{
  background:{title,artist,...(featuredArtist?{featuredArtist}:{})},
 }),signal);
 signal?.throwIfAborted();
 return {candidates,candidateCount:candidates.length};
}
