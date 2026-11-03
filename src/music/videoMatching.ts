import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';

export interface VideoTarget {title:string;artist:string;album?:string;duration:number}
export type VideoPreference='music'|'lyrics';
export interface VideoMatch {song:SongResult;confidence:number;identityScore:number;score:number;lyric:boolean}

// Match identity before applying popularity. These are independent implementations
// informed by spotDL's shortlist, Music Assistant's confidence tiers and
// ytmusicapi's structured video metadata; no downloader code is included.
const words=(s:string)=>s.normalize('NFKC').replace(/([\p{Ll}])([\p{Lu}])/gu,'$1 $2').replace(/(\p{L})\$(?=\p{L})/gu,'$1s').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
const stop=new Set(['unknown','various','artist','artists','official','music','records','vevo','youtube','topic','channel']);
const artistWords=(s:string)=>words(s.replace(/vevo$/i,' vevo ')).filter(w=>w.length>1&&!stop.has(w));
const identity=(s:string)=>words(s.replace(/vevo$/i,' vevo ')).filter(w=>!stop.has(w)).join('');
const artistIdentities=(s:string)=>new Set([s,...s.split(/[,;]|\s+(?:&|x|and|with|feat\.?|featuring|ft\.?)\s+/i)].map(identity).filter(x=>x.length>=2));
const labels=/\b(?:mc\s*music|muzik\s*247|music\s*247|sony\s*music|t[\s-]*series|saregama|think\s*(?:music|indie)|zee\s*music|aditya\s*music|lahari|manorama\s*music|millennium\s*audios?|satyam\s*audios?|speed\s*audio|eros\s*now|yrf|tips\s*official|junglee\s*music|times\s*music|rajshri|venus|shemaroo|universal\s*music|warner\s*music|atlantic\s*records|interscope|republic\s*records|columbia\s*records|rca\s*records|reetha\s*records|guppy\s*cinemas?|def\s*jam|spinnin|monstercat|armada|ultra\s*music|1thek|hybe|smtown|jyp|yg)\b/i;
const variant=/\b(?:cover|live|sings|singing|remix|mashup|karaoke|instrumental|sped\s*up|slowed(?:reverb)?|reverb|lofi|lo\s*fi|nightcore|reaction|review|parody|tutorial|lesson|8d|bass\s*boosted|dance|choreography|choreo|dancers|flash\s*mob|zumba|futsal|stage\s*show|stage\s*performance|concert|events?|award|unplugged|making|behind\s*the\s*scenes|teaser|trailer|promo|shorts|status|whatsapp|ringtone|tribute)\b/gi;
const compactSpelling=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\b([a-z])(?:[\s._+-]+([a-z])){2,}\b/g,m=>m.replace(/[\s._+-]+/g,''));
export const isLyricalVideo=(song:SongResult)=>/\b(?:lyric(?:s|al)?|lirics?)\b/i.test(`${song.title} ${song.videoTitle||''}`);
export function isUnwantedVideoVariant(title:string,target='',_uploader=''){
 const normalized=compactSpelling(title),wanted=compactSpelling(target);
 return [...normalized.matchAll(new RegExp(variant.source,'gi'))].some(m=>!wanted.includes(m[0].toLowerCase()))||[...wanted.matchAll(new RegExp(variant.source,'gi'))].some(m=>!normalized.includes(m[0].toLowerCase()));
}
export function isYouTubeBackgroundVideo(song:SongResult){
 const label=`${song.title} ${song.videoTitle||''}`;
 if(!extractYouTubeVideoId(song)||song.visualContent==='static'||song.videoType==='ATV'||/(?:^|[\s\-–—])Topic\b/i.test(song.artist)||/^Audio Track$/i.test(song.album))return false;
 // An mp4 container is not evidence of moving imagery. Never use album art,
 // still-image/audio uploads, podcasts or visualizers as a video fallback.
 if(/\b(?:audio|jukebox|album\s*(?:art|image)|cover\s*art|static|still\s*(?:image|photo|picture)|image\s*(?:only|background)|photo\s*(?:only|background)|visuali[sz]er|auto.generated|provided\s+to\s+youtube|podcast|reaction)\b/i.test(label))return false;
 return song.videoType==='OMV'||isLyricalVideo(song)||/\b(?:(?:official|music|full|hd|4k|movie|film|hit)\s*(?:video|song|songs|mv)|video\s*song|full\s*song|songs|mv)\b/i.test(label)||
  (song.channelVerified===true&&song.artistCredits?.some(a=>artistIdentities(a).has(identity(song.artist)))===true);
}
const overlap=(wanted:string[],context:string[])=>{
 if(!wanted.length)return 0;
 const set=new Set(context),compact=context.join('');
 return wanted.filter(w=>set.has(w)||(w.length>=4&&compact.includes(w))).length/wanted.length;
};
export function assessYouTubeBackgroundCandidates(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'):VideoMatch[]{
 const titleWords=words(track.title.replace(/\([^)]*\)|\[[^\]]*\]/g,' '));
 const wantedArtist=artistWords(track.artist),artists=artistIdentities(track.artist);
 const album=(track.album||'').replace(/\([^)]*\)|\[[^\]]*\]/g,' ').trim();
 const albumWords=album&&identity(album)!==identity(track.title)&&!/^(?:audio track|single|unknown|various)$/i.test(album)?artistWords(album):[];
 const unique=new Map<string,SongResult>();
 for(const song of songs){const id=extractYouTubeVideoId(song);if(id&&!unique.has(id))unique.set(id,song);}
 const matches:VideoMatch[]=[];
 for(const song of unique.values()){
  if(!isYouTubeBackgroundVideo(song)||isUnwantedVideoVariant(song.title,track.title))continue;
  const lyric=isLyricalVideo(song);if(preference==='lyrics'&&!lyric)continue;
  const songWords=words(song.title),titleMatch=titleWords.filter(w=>songWords.includes(w)).length/Math.max(1,titleWords.length);
  if(titleMatch<.85)continue;
  const context=words(`${song.title} ${song.artist} ${song.album} ${(song.artistCredits||[]).join(' ')}`);
  const artistMatch=overlap(wantedArtist,context),albumMatch=overlap(albumWords,context);
  const nameMatch=artists.has(identity(song.artist));
  const creditedMatch=(song.metadataSource==='ytmusic'||song.channelVerified===true)&&(song.artistCredits||[]).some(a=>artists.has(identity(a)));
  const channelMatch=nameMatch&&(song.channelVerified===true||creditedMatch);
  // A publisher name or "Full Song" never excuses a different recording.
  if(wantedArtist.length&&artistMatch===0&&albumMatch===0&&!creditedMatch&&!channelMatch)continue;
  if(song.artistCredits?.length&&wantedArtist.length&&!creditedMatch&&artistMatch<.5&&albumMatch===0)continue;
  const knownLabel=labels.test(song.artist)&&!/\b(?:fans?|tribute|reuploads?)\b/i.test(song.artist);
  const movieVideo=knownLabel&&albumMatch>0;
  const difference=track.duration>0&&song.duration>0?Math.abs(song.duration-track.duration):null;
  const minDuration=movieVideo?Math.min(140,track.duration*.5):track.duration*.65;
  if(difference!==null&&(song.duration<minDuration||difference>Math.max(120,track.duration*.5)))continue;
  const rawTiming=difference===null?6:12*Math.max(0,1-difference/Math.max(90,track.duration*.4));
  const timing=movieVideo&&song.duration>=140?Math.max(rawTiming,10):rawTiming;
  const publisher=(nameMatch?6:0)+(channelMatch?24:0)+(creditedMatch?12:0)+(knownLabel&&(artistMatch>0||albumMatch>0)?(song.channelVerified?18:6):0)+(song.channelVerified?6:0);
  const identityScore=titleMatch*100+artistMatch*(creditedMatch?30:15)+albumMatch*20+publisher;
  const confidence=Math.min(1,titleMatch*(wantedArtist.length ? .55+.30*Math.max(artistMatch,Number(creditedMatch),Number(channelMatch))+.20*albumMatch : .75));
  const popularity=song.viewCount&&song.viewCount>0?Math.min(28,Math.max(0,Math.log10(song.viewCount)-3)*5):0;
  // Prefer motion videos; artist/label lyric releases can still beat reuploads.
  const videoPreference=preference==='music'&&!lyric?20:0;
  matches.push({song,confidence,identityScore,score:identityScore+timing+popularity+videoPreference,lyric});
 }
 // Compute the identity shortlist once. Never switch comparison criteria per
 // pair: doing so creates cycles and makes the winner depend on input order.
 const bestIdentity=Math.max(0,...matches.map(m=>m.identityScore));
 return matches.sort((a,b)=>{
  const aClose=a.identityScore>=bestIdentity-20,bClose=b.identityScore>=bestIdentity-20;
  return Number(bClose)-Number(aClose)||b.score-a.score||(b.song.viewCount||0)-(a.song.viewCount||0)||
   (extractYouTubeVideoId(a.song)||'').localeCompare(extractYouTubeVideoId(b.song)||'');
 });
}
export function rankYouTubeBackgroundCandidates(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'){
 return assessYouTubeBackgroundCandidates(songs,track,preference).map(m=>m.song);
}
export function selectYouTubeBackgroundCandidate(songs:SongResult[],track:VideoTarget,preference:VideoPreference='music'){
 const best=assessYouTubeBackgroundCandidates(songs,track,preference).find(match=>match.confidence>=.75&&(match.song.duration>0||(match.song.metadataSource==='ytmusic'&&match.song.videoType==='OMV')));
 return best?extractYouTubeVideoId(best.song):null;
}
