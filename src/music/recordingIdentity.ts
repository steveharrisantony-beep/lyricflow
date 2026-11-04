/** Shared by catalogue discovery and the picker. No browser or network dependencies. */
export interface RecordingTarget {title:string;artist:string;album?:string;duration:number}
export interface RecordingCandidate {
 title:string;videoTitle?:string;artist:string;album:string;duration:number;
 artistCredits?:string[];artistChannelIds?:string[];metadataSource?:string;
 channelId?:string;channelVerified?:boolean;uploaderName?:string;
 counterpartOf?:string;catalogueTitle?:string;catalogueArtists?:string[];catalogueAlbum?:string;
}
export const identityWords = (value: string) => value.normalize('NFKC')
 .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2')
 .replace(/(\p{L})\$(?=\p{L})/gu, '$1s')
 .toLowerCase()
 // Keep vowel signs and other marks in Malayalam, Tamil and Hindi titles.
 .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
 .trim().split(/\s+/).filter(Boolean);
const missingArtist = /^(?:unknown(?: artist)?|various(?: artists?)?|youtube)$/i;

export function artistIdentity(name: string) {
 if (missingArtist.test(name.trim())) return '';
 const words = identityWords(name.replace(/vevo$/i, ' vevo'));
 while (words.length > 1 && /^(?:official|vevo|topic|channel)$/.test(words[words.length - 1])) words.pop();
 return words.join('');
}

const artistNames = (value: string) => [value, ...value.split(/[,;]|\s+(?:&|x|and|with|feat\.?|featuring|ft\.?)\s+/i)];
const artistIdentities = (value: string) => new Set(artistNames(value).map(artistIdentity).filter(Boolean));

/** Match a whole name, including joined spellings, without matching parts of other names. */
function includesWholeName(words: string[], name: string) {
 if (!name) return false;
 for (let start = 0; start < words.length; start++) {
  let joined = '';
  for (let i = start; i < words.length; i++) {
   joined += words[i];
   if (joined === name) return true;
   if (!name.startsWith(joined)) break;
  }
 }
 return false;
}
const variant=/\b(?:cover|live|sings|singing|remix|mashup|karaoke|instrumental|sped\s*up|slowed(?:reverb)?|reverb|lofi|lo\s*fi|nightcore|reaction|review|parody|tutorial|lesson|8d|bass\s*boosted|dance|choreography|choreo|dancers|flash\s*mob|zumba|futsal|stage\s*show|stage\s*performance|concert|events?|award|unplugged|making|behind\s*the\s*scenes|teaser|trailer|promo|shorts|status|whatsapp|ringtone|tribute)\b/gi;
const compactSpelling=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\b([a-z])(?:[\s._+-]+([a-z])){2,}\b/g,m=>m.replace(/[\s._+-]+/g,''));
export function isUnwantedVideoVariant(title:string,target='',_uploader=''){
 const normalized=compactSpelling(title),wanted=compactSpelling(target);
 return [...normalized.matchAll(new RegExp(variant.source,'gi'))].some(m=>!wanted.includes(m[0].toLowerCase()))||[...wanted.matchAll(new RegExp(variant.source,'gi'))].some(m=>!normalized.includes(m[0].toLowerCase()));
}
export function assessRecordingIdentity(song:RecordingCandidate,track:RecordingTarget){
 const titleWords=identityWords(track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' '));
 const songWords=identityWords(`${song.title} ${song.videoTitle||''}`);
 const joinedTitle=titleWords.join('');
 const titleMatch=joinedTitle&&songWords.includes(joinedTitle)?1:titleWords.filter(w=>songWords.includes(w)).length/Math.max(1,titleWords.length);
 const artists = artistIdentities(track.artist);
 const credits = new Set((song.artistCredits || []).flatMap(credit => [...artistIdentities(credit)]));
 const creditedMatch = [...credits].some(credit => artists.has(credit));
 const uploader = artistIdentity(song.uploaderName || '');
 // Some video results list the uploader as the sole credit. Treat that as a byline.
 const uploaderOnlyCredit = song.metadataSource === 'ytmusic' && Boolean(uploader) &&
  song.artistCredits?.length === 1 && artistIdentity(song.artistCredits[0]) === uploader;
 const conflictingCredits = (song.metadataSource === 'ytmusic' || song.channelVerified === true) &&
  credits.size > 0 && !creditedMatch && !uploaderOnlyCredit;
 const titleFields = [identityWords(song.title), identityWords(song.videoTitle || '')];
 const titleArtistMatch = [...artists].some(name => name !== joinedTitle &&
  titleFields.some(words => includesWholeName(words, name)));
 const artistMatch = creditedMatch || artists.has(uploader) ||
  [...artistIdentities(song.artist)].some(name => artists.has(name)) || titleArtistMatch;

 const album = (track.album || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').trim();
 const albumName = identityWords(album).join('');
 const distinctAlbum = albumName && albumName !== joinedTitle &&
  !/^(?:audio track|single|unknown|various(?: artists?)?|youtube|greatest hits|best of)$/i.test(album);
 const albumMatch = Boolean(distinctAlbum && (identityWords(song.album).join('') === albumName ||
  titleFields.some(words => includesWholeName(words, albumName))));
 const variantMismatch = isUnwantedVideoVariant(`${song.title} ${song.videoTitle || ''}`, track.title);
 const relevant = titleMatch >= .85 && !variantMismatch && (!artists.size ||
  (!conflictingCredits && (artistMatch || albumMatch)));
 const identityScore = titleMatch * 100 + Number(artistMatch) * 30 + Number(albumMatch) * 20 + (creditedMatch ? 10 : 0);
 const confidence = Math.min(1, titleMatch * (artists.size ? .55 + .30 * Number(artistMatch) + .20 * Number(albumMatch) : .75));
 return {relevant, identityScore, confidence};
}
