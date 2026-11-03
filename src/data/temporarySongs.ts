import {correctionContext, type Correction, type RecordingIdentity} from '../firebase/correctionModel';
import type {SongMapping} from '../firebase/songMappings';
import type {TrackInfo} from '../metadata/trackInfo';
import type {StashResolvedLyrics} from '../lyrics/providers';
import type {findYouTubeBackgrounds} from '../music/backgroundVideos';

export const TEMPORARY_SONG_LIMIT=10;
export const TEMPORARY_SONG_EVENT='lyricflow:temporarySongs';
export interface TemporarySong {
 id:string;
 identity:RecordingIdentity;
 scope:string|null;
 revision?:string;
 draftMapping?:SongMapping;
 draftText?:string;
 corrections:Record<string,Correction|null>;
 lyrics?:{key:string;value:StashResolvedLyrics};
 videos?:{key:string;value:Awaited<ReturnType<typeof findYouTubeBackgrounds>>};
 generation:number;
}
const same=(a:RecordingIdentity,b:RecordingIdentity)=>a.title===b.title&&a.artist===b.artist&&a.duration===b.duration;
const announce=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event(TEMPORARY_SONG_EVENT));};

/** Session memory only: closing/restarting the webview cannot restore this cache. */
export class TemporarySongs {
 private songs=new Map<string,TemporarySong>();
 private current='';
 private previous:string[]=[];
 private window=new Set<string>();
 private counter=0;
 private key(id:string,uid:string|null){return `${uid||'guest'}:${id}`;}
 find(identity:RecordingIdentity,uid:string|null){
  // Title is the first lookup; artist and whole-second duration confirm it.
  return [...this.songs.values()].filter(song=>song.scope===uid&&song.identity.title===identity.title)
   .find(song=>same(song.identity,identity));
 }
 get(track:TrackInfo|null,uid:string|null,create=false):TemporarySong|undefined{
  const context=correctionContext(track,'lyrics');if(!context)return;
  const found=this.find(context.identity,uid);if(found||!create)return found;
  const key=this.key(context.recordingKey,uid);
  const entry:TemporarySong={id:context.recordingKey,identity:context.identity,scope:uid,corrections:{},generation:++this.counter};
  this.songs.set(key,entry);this.trim();return this.songs.get(key);
 }
 reconcile(track:TrackInfo|null,uid:string|null,revision:string){
  const entry=this.get(track,uid,true);if(!entry)return;
  if(entry.revision!==undefined&&entry.revision!==revision){
   delete entry.draftMapping;delete entry.draftText;entry.corrections={};
   delete entry.lyrics;delete entry.videos;entry.generation=++this.counter;
  }
  entry.revision=revision;return entry;
 }
 edit(track:TrackInfo|null,uid:string|null,update:(song:TemporarySong)=>void){
  const entry=this.get(track,uid,true);if(!entry)return;
  update(entry);announce();
 }
 /** Current + last two played + up to seven upcoming, never more than ten. */
 setWindow(track:TrackInfo|null,queue:TrackInfo[],uid:string|null){
  const before=[...this.window].join('|');
  const context=correctionContext(track,'lyrics');
  const next=context?this.key(context.recordingKey,uid):'';
  if(next!==this.current){
   if(this.current)this.previous=[this.current,...this.previous.filter(id=>id!==this.current&&id!==next)].slice(0,2);
   this.current=next;
  }
  const keys=[next,...this.previous].filter(Boolean);
  for(const item of queue){
   const ctx=correctionContext(item,'lyrics');if(!ctx)continue;
   const key=this.key(ctx.recordingKey,uid);
   if(!keys.includes(key)&&keys.length<TEMPORARY_SONG_LIMIT)keys.push(key);
  }
  this.window=new Set(keys);
  for(const key of this.songs.keys())if(!this.window.has(key))this.songs.delete(key);
  if(track)this.get(track,uid,true);
  for(const item of queue){const ctx=correctionContext(item,'lyrics');if(ctx&&this.window.has(this.key(ctx.recordingKey,uid)))this.get(item,uid,true);}
  this.trim();
  if(before!==[...this.window].join('|'))announce();
 }
 private trim(){
  while(this.songs.size>TEMPORARY_SONG_LIMIT){
   const key=[...this.songs.keys()].find(id=>!this.window.has(id))||[...this.songs.keys()].find(id=>id!==this.current);
   if(!key)break;this.songs.delete(key);
  }
 }
 has(entry:TemporarySong){return this.songs.get(this.key(entry.id,entry.scope))===entry;}
 clear(uid?:string|null){
  for(const [key,song] of this.songs)if(uid===undefined||song.scope===uid)this.songs.delete(key);
  this.current='';this.previous=[];this.window.clear();announce();
 }
 get size(){return this.songs.size;}
 entries(){return [...this.songs.values()];}
}
export const temporarySongs=new TemporarySongs();

