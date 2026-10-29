import type {TrackInfo} from '../metadata/trackInfo';
import {normalizeTrack} from '../metadata/trackInfo';
const KEY='lyricflow.userLyrics.v1';
export interface LibraryEntry {
 id:string;title:string;artist:string;album:string;duration:number;
 original:string;romanized:string;language:string;rightsConfirmed:boolean;updated:number;source:string;
}
function valid(x:unknown):x is LibraryEntry {
 if(!x||typeof x!=='object')return false;
 const v=x as Partial<LibraryEntry>;
 return typeof v.id==='string'&&v.id.length<150&&typeof v.title==='string'&&v.title.length<200&&
 typeof v.artist==='string'&&v.artist.length<200&&typeof v.original==='string'&&v.original.length<200000&&
 typeof v.romanized==='string'&&v.romanized.length<200000&&v.rightsConfirmed===true&&
 typeof v.updated==='number'&&Number.isFinite(v.updated);
}
export function listUserLyrics():LibraryEntry[]{
 try{const arr:unknown=JSON.parse(localStorage.getItem(KEY)||'[]');
  return Array.isArray(arr)?arr.filter(valid).slice(0,100):[];
 }catch{return []}
}
export function findUserLyrics(track:TrackInfo){
 const t=normalizeTrack(track.title),a=normalizeTrack(track.artist);
 return listUserLyrics().filter(e=>normalizeTrack(e.title)===t&&(!a||normalizeTrack(e.artist)===a));
}
export function saveUserLyrics(entry:Omit<LibraryEntry,'id'|'updated'>){
 if(!entry.rightsConfirmed)throw new Error('Only save lyrics you have permission to store.');
 if(!entry.title.trim())throw new Error('Enter a song title.');
 if(entry.original.length>200000||entry.romanized.length>200000)throw new Error('Lyrics too long to save.');
 const id=normalizeTrack(entry.title)+'--'+normalizeTrack(entry.artist);
 if(!id||id==='--')throw new Error('Invalid song metadata.');
 const next=[...listUserLyrics().filter(e=>e.id!==id),{...entry,id,updated:Date.now()}];
 try{localStorage.setItem(KEY,JSON.stringify(next.slice(-100)))}catch{throw new Error('Local storage is full or blocked.')}
}
export function deleteUserLyrics(id:string){
 try{localStorage.setItem(KEY,JSON.stringify(listUserLyrics().filter(e=>e.id!==id)))}catch{throw new Error('Local browser storage unavailable.')}
}
