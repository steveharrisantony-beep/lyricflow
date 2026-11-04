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
const stop=new Set(['unknown','various','artist','artists','official','music','records','vevo','youtube','topic','channel']);
export const artistWords=(s:string)=>identityWords(s.replace(/vevo$/i,' vevo ')).filter(w=>w.length>1&&!stop.has(w));
export const artistIdentity=(s:string)=>identityWords(s.replace(/vevo$/i,' vevo ')).filter(w=>!stop.has(w)).join('');
const artistIdentities=(s:string)=>new Set([s,...s.split(/[,;]|\s+(?:&|x|and|with|feat\.?|featuring|ft\.?)\s+/i)].map(artistIdentity).filter(x=>x.length>=2));
export const matchesArtistName=(name:string,artists:string)=>Boolean(artistIdentity(name))&&artistIdentities(artists).has(artistIdentity(name));
const overlap=(wanted:string[],context:string[])=>{
 if(!wanted.length)return 0;
 const set=new Set(context),compact=context.join('');
 return wanted.filter(w=>set.has(w)||(w.length>=4&&compact.includes(w))).length/wanted.length;
};
const variant=/\b(?:cover|live|sings|singing|remix|mashup|karaoke|instrumental|sped\s*up|slowed(?:reverb)?|reverb|lofi|lo\s*fi|nightcore|reaction|review|parody|tutorial|lesson|8d|bass\s*boosted|dance|choreography|choreo|dancers|flash\s*mob|zumba|futsal|stage\s*show|stage\s*performance|concert|events?|award|unplugged|making|behind\s*the\s*scenes|teaser|trailer|promo|shorts|status|whatsapp|ringtone|tribute)\b/gi;
const compactSpelling=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\b([a-z])(?:[\s._+-]+([a-z])){2,}\b/g,m=>m.replace(/[\s._+-]+/g,''));
export function isUnwantedVideoVariant(title:string,target='',_uploader=''){
 const normalized=compactSpelling(title),wanted=compactSpelling(target);
 return [...normalized.matchAll(new RegExp(variant.source,'gi'))].some(m=>!wanted.includes(m[0].toLowerCase()))||[...wanted.matchAll(new RegExp(variant.source,'gi'))].some(m=>!normalized.includes(m[0].toLowerCase()));
}
/** Names are corroboration only. A matching display name never establishes a channel's identity. */
export const isPublisherName=(name:string)=>/\b(?:mc\s*music|muzik\s*247|music\s*247|sony\s*music|t[\s-]*series|saregama|think\s*(?:music|indie)|zee\s*music|aditya\s*music|lahari|manorama\s*music|millennium\s*audios?|satyam\s*audios?|speed\s*audio|eros\s*now|yrf|tips\s*official|junglee\s*music|times\s*music|rajshri|venus|shemaroo|universal\s*music|warner\s*music|atlantic\s*records|interscope|republic\s*records|columbia\s*records|rca\s*records|reetha\s*records|guppy\s*cinemas?|def\s*jam|spinnin|monstercat|armada|ultra\s*music|1thek|hybe|smtown|jyp|yg)\b/i.test(name)&&!/\b(?:fans?|tribute|reuploads?)\b/i.test(name);
export function assessRecordingIdentity(song:RecordingCandidate,track:RecordingTarget){
 const titleWords=identityWords(track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' '));
 const songWords=identityWords(`${song.title} ${song.videoTitle||''}`);
 const joinedTitle=titleWords.join('');
 const titleMatch=joinedTitle&&songWords.includes(joinedTitle)?1:titleWords.filter(w=>songWords.includes(w)).length/Math.max(1,titleWords.length);
 const wantedArtist=artistWords(track.artist);
 if(!wantedArtist.length&&track.artist.trim()&&!/^(?:unknown(?: artist)?|various artists?|youtube)$/i.test(track.artist.trim()))wantedArtist.push(...identityWords(track.artist));
 const artists=artistIdentities(track.artist);
 const album=(track.album||'').replace(/\([^)]*\)|\[[^\]]*\]/g,' ').trim();
 const albumWords=album&&artistIdentity(album)!==artistIdentity(track.title)&&!/^(?:audio track|single|unknown|various|youtube)$/i.test(album)?identityWords(album):[];
 const context=identityWords(`${song.title} ${song.videoTitle||''} ${song.artist} ${song.album} ${(song.artistCredits||[]).join(' ')}`);
 const fullArtistMatch=[...artists].some(name=>name.length>=4&&context.join('').includes(name));
 const artistMatch=Math.max(overlap(wantedArtist,context),Number(fullArtistMatch)),albumMatch=overlap(albumWords,context);
 const creditedMatch=song.metadataSource==='ytmusic'&&(song.artistCredits||[]).some(a=>artists.has(artistIdentity(a)));
 const variantMismatch=isUnwantedVideoVariant(`${song.title} ${song.videoTitle||''}`,track.title);
 const relevant=titleMatch>=.85&&!variantMismatch&&(!wantedArtist.length||artistMatch>=.5||albumMatch>=.75||creditedMatch);
 const identityScore=titleMatch*100+artistMatch*30+albumMatch*20+(creditedMatch?10:0);
 const confidence=Math.min(1,titleMatch*(wantedArtist.length ? .55+.30*Math.max(artistMatch,Number(creditedMatch))+.20*albumMatch:.75));
 return {relevant,titleMatch,artistMatch,albumMatch,creditedMatch,identityScore,confidence};
}
