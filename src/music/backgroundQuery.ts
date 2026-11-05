import {identityWords} from './recordingIdentity';

export function backgroundVideoQuery(title:string,primaryArtist:string,preference:'music'|'lyrics'='music'){
 const titleWords=new Set(identityWords(title));
 const artistInTitle=identityWords(primaryArtist).some(word=>titleWords.has(word));
 return [title,artistInTitle?'':primaryArtist,preference==='lyrics'?'Lyric Video':'Music Video'].filter(Boolean).join(' ');
}
