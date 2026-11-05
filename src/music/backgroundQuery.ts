import {identityWords} from './recordingIdentity';

export function backgroundVideoQuery(title:string,primaryArtist:string){
 const titleWords=new Set(identityWords(title));
 const artistInTitle=identityWords(primaryArtist).some(word=>titleWords.has(word));
 return [title,artistInTitle?'':primaryArtist,'Music Video'].filter(Boolean).join(' ');
}
