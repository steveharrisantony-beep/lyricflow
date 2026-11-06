import type {SongResult} from './providers';
import {extractYouTubeVideoId} from '../metadata/trackInfo';
import {identityWords} from './recordingIdentity';
import {messytitlefixer} from '../lyrics/messytitlefixer';

export const AUTO_VIDEO_ATTEMPT_LIMIT=10;
export const AUTO_VIDEO_SHORTLIST_LIMIT=3;
export const isLyricalVideo=(song:SongResult)=>/\b(?:lyrics?|lyrical)\b/i.test(song.videoTitle||song.title);
export const isYouTubeTopicChannel=(name:string)=>/\s*[-–—]\s*Topic\s*$/i.test(name);

export function videoAvailabilityRejections(song:SongResult):string[]{
 const reasons:string[]=[];
 if(!extractYouTubeVideoId(song))reasons.push('Invalid YouTube ID');
 if(song.embeddable===false)reasons.push('Embedding blocked');
 if(song.visualContent==='static')reasons.push('Static content');
 if(song.videoType==='ATV')reasons.push('YouTube Music audio track (ATV)');
 if(isYouTubeTopicChannel(song.uploaderName||'')||isYouTubeTopicChannel(song.artist))reasons.push('Topic channel');
 if(song.album==='Audio Track')reasons.push('Audio Track album');
 return reasons;
}

const rejectedKeywords=['jukebox','cover','reaction','karaoke','reply','audio'];
const rejectedBackgroundChannels=[
 '7clouds','DopeLyrics','LatinHype','The Vibe Guide','SyrebralVibes','Vibe Music',
 'Shadow Music','Cakes & Eclairs','Unique Vibes','Taj Tracks','Dan Music','WaveMusic',
 'BangersOnly','Royal Music',
 'TikTokTunes','Jaeguchi','Pizza Music','Superhit Music',
 'NightcoreReality','Popular Music','NewMelody','RohitMix Lyrics',
 'LyricsZone','Cassiopeia','Unique Sound','TheGoodVibe',
 'Love Life Lyrics','Aureal','Hip Hop/R&B Lyrics','jostland.',
 'Lemoring','Mera','IndieAir','VibesOnly',
 'headset lyrics','GOLDY LYRICS','Zaty Farhani','Lazy Fox',
 'Aura Melodies','Superior Lyrics','Rap Paradise','Lyrics&Translation',
 'Lyrics Tube','Lovely Lyrics','Love Book','My Lyrics Editor',
 'Lyrical Network','Saturday Melody','Enjoy Hindi Lyrics','GHOSTIFY',
 'Twilight Sounds','Amazing Melody','Country Paradise','PicksRap',
 'Music Cavier','Steal Lyrics','Bullz Edit','Iconic Lyrics',
 'TheCatLadyJ','Pop Paradise','Lyrical Audio','Accelerate',
 'Lyrics Vibes','aw3somesauce',
];
export function evaluateBackgroundVideos(songs:SongResult[],songTitle:string,_preference:'music'|'lyrics',playbackRejections:Readonly<Record<string,string>>={}){
 const songWords=new Set(identityWords(songTitle));
 return songs.map((song,index)=>{
  const id=extractYouTubeVideoId(song);
  const availability=videoAvailabilityRejections(song);
  const words=new Set(identityWords(song.videoTitle||song.title));
  const reasons=[...availability];
  if(![...songWords].some(word=>words.has(word)))reasons.push('No song-title word in the video title');
  for(const keyword of rejectedKeywords){
   if(words.has(keyword)&&!songWords.has(keyword))reasons.push(`Rejected keyword: ${keyword}`);
  }
  const channel=(song.uploaderName||song.artist).toLowerCase();
  const blocked=rejectedBackgroundChannels.find(name=>channel.includes(name.toLowerCase()));
  if(blocked)reasons.push(`Blocked channel: ${blocked}`);
  const playbackRejection=id&&Object.hasOwn(playbackRejections,id)?playbackRejections[id]:undefined;
  if(playbackRejection)reasons.push(playbackRejection);
  return {song,id,reasons,withinLimit:index<AUTO_VIDEO_ATTEMPT_LIMIT,canUse:!availability.length&&!playbackRejection};
 });
}
export type BackgroundVideoChoice=ReturnType<typeof evaluateBackgroundVideos>[number];


/** Match the *whole* lyrics-cleaned song title against contiguous video-title
 * words. Do not inspect the opaque eleven-character YouTube video ID.
 * Token boundaries prevent accidental partial matches; Unicode marks are kept.
 */
export function videoContainsFilteredSongTitle(songTitle:string,videoTitle:string,artistContext=''):boolean{
 const filtered=identityWords(messytitlefixer(songTitle,artistContext));
 const title=identityWords(videoTitle);
 if(!filtered.length||filtered.length>title.length)return false;
 return title.some((_,start)=>start+filtered.length<=title.length&&
  filtered.every((word,index)=>title[start+index]===word));
}

/** Screen ten relevance results, shortlist the first three passing all initial
 * checks (including channel restrictions), then rank only those three by views.
 * Final title validation does not repeat the blacklist or refill the shortlist.
 */
export function selectAutomaticBackgroundVideo(songs:SongResult[],songTitle:string,preference:'music'|'lyrics',playbackRejections:Readonly<Record<string,string>>={},artistContext=''){
 // Lock in the shortlist using the initial static filters. A later playback
 // error must not refill the original first three from the fourth candidate.
 const choices=evaluateBackgroundVideos(songs,songTitle,preference);
 const shortlist=choices.filter(choice=>choice.withinLimit&&!choice.reasons.length)
  .slice(0,AUTO_VIDEO_SHORTLIST_LIMIT).sort((a,b)=>(b.song.viewCount??-1)-(a.song.viewCount??-1));
 for(const choice of choices){
  if(choice.id&&Object.hasOwn(playbackRejections,choice.id)){
   choice.reasons.push(playbackRejections[choice.id]);
   choice.canUse=false;
  }
 }
 for(const choice of shortlist){
  if(choice.reasons.length)continue;
  if(!videoContainsFilteredSongTitle(songTitle,choice.song.videoTitle||choice.song.title,artistContext))
   choice.reasons.push('Filtered song title missing from video title');
  if(choice.reasons.length)continue;
  return {choices,selected:choice.song};
 }
 return {choices,selected:undefined};
}

/** Manual online search keeps provider relevance order and allows sorting by views. */
export function filterYouTubeVideoChoices(songs: SongResult[]): SongResult[] {
 const blocked=new Set(songs.filter(song=>videoAvailabilityRejections(song).length).map(song=>extractYouTubeVideoId(song)));
 const byId=new Map<string,SongResult>();
 for(const song of songs){
  const id=extractYouTubeVideoId(song);
  if(!id||blocked.has(id))continue;
  const previous=byId.get(id);
  if(!previous||(song.viewCount??-1)>(previous.viewCount??-1))byId.set(id,song);
 }
 return [...byId.values()];
}
export function compareYouTubeVideoViews(a:SongResult,b:SongResult):number{
 return (b.viewCount??-1)-(a.viewCount??-1)||(extractYouTubeVideoId(a)||'').localeCompare(extractYouTubeVideoId(b)||'');
}
