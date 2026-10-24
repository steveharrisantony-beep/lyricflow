import {useEffect,useMemo,useRef,useState} from 'react';
import type {TrackInfo} from '../metadata/trackInfo';
import {detectLanguage,romanizeText,hasDistinctRomanized} from '../romanization/romanize';
import {parseLRC,type TimedWord} from './lrc';
import {buildCues,setLyricTimeline} from './lyricTimeline';
import {analyzeSections} from './sceneDirector';
import {buildCinematicSchedule,byId,type SceneId} from '../visualization/cinematic/catalog';
import {LYRIC_COLOR_PALETTE} from '../visualization/cinematic/kineticTypography';
import {saveUserLyrics} from './userLibrary';
import {clampLyricDelay,effectiveLyricTime,formatLyricDelay} from './lyricTiming';
import {convertTtmlToEnhancedLrc} from './appleLyrics';
export {parseLRC} from './lrc';
export {normalizeTrack as cleanTrackTitle} from '../metadata/trackInfo';

export interface IncomingLyrics{
 original:string;
 romanized:string;
 plain?:string;
 source:string;
 sourceUrl?:string;
 hasWordSync?:boolean;
 token:number;
}

export interface LyricProviderBadgeInfo {
 providerName:string;
 syncMode:string;
 detail:string;
}

export interface AudioSourceBadgeInfo {
 providerName:string;
 detail:string;
 isLocal:boolean;
 sourceUrl?:string;
}

/**
 * Split a long lyric line into multiple balanced lines so it is never displayed
 * as a single overly long line.
 */
export function splitLyricIntoBalancedLines(text:string,maxCharsPerLine=36,maxWordsPerLine=6):string[]{
 const trimmed=(text||'').replace(/\s+/g,' ').trim();
 if(!trimmed)return [];
 const words=trimmed.split(' ');
 if(words.length<=maxWordsPerLine&&trimmed.length<=maxCharsPerLine)return [trimmed];

 const byWords=Math.ceil(words.length/maxWordsPerLine);
 const byChars=Math.ceil(trimmed.length/maxCharsPerLine);
 const targetRows=Math.min(words.length,Math.max(2,byWords,byChars));
 const targetCharsPerRow=Math.ceil(trimmed.length/targetRows);

 const rows:string[]=[];
 let currentWords:string[]=[];
 let currentLen=0;

 for(let i=0;i<words.length;i++){
  const w=words[i];
  const nextLen=currentLen+(currentWords.length>0?1:0)+w.length;
  const remainingWords=words.length-i;
  const remainingRows=targetRows-rows.length;

  const hasClauseBreak=currentWords.length>=2&&/[,;—–\-:!?]$/.test(currentWords[currentWords.length-1]);
  const exceedsTarget=currentWords.length>0&&(nextLen>maxCharsPerLine||currentWords.length>=maxWordsPerLine||(nextLen>targetCharsPerRow+4&&remainingWords>=remainingRows));

  if(rows.length<targetRows-1&&(exceedsTarget||(hasClauseBreak&&currentLen>=targetCharsPerRow*0.65))){
   rows.push(currentWords.join(' '));
   currentWords=[w];
   currentLen=w.length;
  }else{
   currentWords.push(w);
   currentLen=nextLen;
  }
 }
 if(currentWords.length>0)rows.push(currentWords.join(' '));
 return rows;
}

/**
 * Partition word-synced tokens into balanced multi-line rows so word-synced lyrics
 * wrap cleanly into multiple lines when long.
 */
export function splitWordsIntoBalancedRows<T extends {text:string}>(
 words:readonly T[],
 maxCharsPerRow=36,
 maxWordsPerRow=6
):T[][]{
 if(!words.length)return [];
 const totalChars=words.reduce((sum,w)=>sum+w.text.length,0)+Math.max(0,words.length-1);
 if(words.length<=maxWordsPerRow&&totalChars<=maxCharsPerRow)return [[...words]];

 const byWords=Math.ceil(words.length/maxWordsPerRow);
 const byChars=Math.ceil(totalChars/maxCharsPerRow);
 const targetRows=Math.min(words.length,Math.max(2,byWords,byChars));
 const targetCharsPerRow=Math.ceil(totalChars/targetRows);

 const rows:T[][]=[];
 let currentRow:T[]=[];
 let currentLen=0;

 for(let i=0;i<words.length;i++){
  const w=words[i];
  const nextLen=currentLen+(currentRow.length>0?1:0)+w.text.length;
  const remainingWords=words.length-i;
  const remainingRows=targetRows-rows.length;
  const hasClauseBreak=currentRow.length>=2&&/[,;—–\-:!?]$/.test(currentRow[currentRow.length-1].text);
  const exceedsTarget=
   currentRow.length>0&&
   (nextLen>maxCharsPerRow||
    currentRow.length>=maxWordsPerRow||
    (nextLen>targetCharsPerRow+4&&remainingWords>=remainingRows));

  if(rows.length<targetRows-1&&(exceedsTarget||(hasClauseBreak&&currentLen>=targetCharsPerRow*0.65))){
   rows.push(currentRow);
   currentRow=[w];
   currentLen=w.text.length;
  }else{
   currentRow.push(w);
   currentLen=nextLen;
  }
 }
 if(currentRow.length>0)rows.push(currentRow);
 return rows;
}

export function describeLyricProvider(
 source:string,
 hasWordSync:boolean,
 hasTimedLines:boolean,
 hasPlainText:boolean
):LyricProviderBadgeInfo{
 const raw=(source||'').trim();
 let providerName='Automatic Provider';
 if(/apple\s*music|itunes|paxsenix|lrc\.red|binimum/i.test(raw))providerName='Apple Music';
 else if(/musixmatch/i.test(raw))providerName='MusixMatch';
 else if(/lrclib/i.test(raw))providerName='LRCLIB';
 else if(/kugou/i.test(raw))providerName='KuGou';
 else if(/youtube\s*music|innertube/i.test(raw))providerName='YouTube Music';
 else if(/local|imported|file/i.test(raw))providerName='Local File';
 else if(/custom|saved|override|sample|edited/i.test(raw))providerName='Custom / Local';
 else if(/searching|resolving/i.test(raw))providerName='Resolving Provider…';
 else if(!hasTimedLines&&!hasPlainText)providerName='Awaiting Song';
 else if(raw.includes('·'))providerName=raw.split('·')[0].trim();
 else if(raw)providerName=raw;

 const syncMode=hasWordSync
  ?'Word-Synced TTML'
  :hasTimedLines
  ?'Line-Synced LRC'
  :hasPlainText
  ?'Plain Lyrics'
  :/searching|resolving/i.test(raw)
  ?'Searching…'
  :'Standby';

 return {
  providerName,
  syncMode,
  detail:raw||'Automatic (Apple Music / MusixMatch / LRCLIB / Local)'
 };
}

export function describeAudioSource(
 track:TrackInfo|null,
 trackLoaded:boolean
):AudioSourceBadgeInfo{
 if(!track||(!trackLoaded&&!track.title.trim())){
  return {
   providerName:'No Audio Loaded',
   detail:'Choose Local Audio Upload or Stash Online Player',
   isLocal:false
  };
 }
 if(track.source==='filename'||track.provider==='local'||Boolean(track.fileName)){
  const fileLabel=track.fileName?`Local File · ${track.fileName}`:track.audioSource||'Local Audio File';
  return {
   providerName:'Local File',
   detail:fileLabel,
   isLocal:true
  };
 }
 const rawAudio=(track.audioSource||'').trim();
 let providerName='Online Stream';
 if(track.provider==='jiosaavn'||/^jiosaavn/i.test(rawAudio))providerName='JioSaavn';
 else if(track.provider==='ytmusic'||/^youtube\s*music/i.test(rawAudio))providerName='YouTube Music';
 else if(track.provider==='soundcloud'||/^soundcloud/i.test(rawAudio))providerName='SoundCloud';
 else if(track.provider==='audius'||/^audius/i.test(rawAudio))providerName='Audius';
 else if(track.provider==='resolver'||/^youtube/i.test(rawAudio))providerName='YouTube';
 else if(rawAudio)providerName=rawAudio.split('·')[0].trim();

 return {
  providerName,
  detail:rawAudio||`${providerName} Stream`,
  isLocal:false,
  sourceUrl:track.sourceUrl
 };
}

export type LyricColorMode='auto'|'cyan'|'rose'|'gold'|'emerald'|'violet'|'coral'|'white';

const LYRIC_COLOR_MAP:Record<Exclude<LyricColorMode,'auto'>,{main:string;highlight:string;label:string}>={
 cyan:{main:'#72efdd',highlight:'#aef8ff',label:'Cyan Glow'},
 rose:{main:'#ff6b8b',highlight:'#ffc2d1',label:'Neon Rose'},
 gold:{main:'#ffd166',highlight:'#fff0a8',label:'Solar Gold'},
 emerald:{main:'#80ed99',highlight:'#c7f9cc',label:'Emerald Pulse'},
 violet:{main:'#c792ea',highlight:'#e9d5ff',label:'Electric Violet'},
 coral:{main:'#ff9f43',highlight:'#ffd8a8',label:'Warm Coral'},
 white:{main:'#ffffff',highlight:'#97e0e9',label:'Classic White'}
};

const SAMPLE='[00:00.00]<00:00.00>This <00:00.60>is <00:01.10>an <00:01.60>original <00:02.30>sample <00:02.90>lyric\n[00:03.50]<00:03.50>Watch <00:04.20>the <00:04.70>lights <00:05.40>begin <00:06.10>to <00:06.50>glow\n[00:07.00]<00:07.00>Moving <00:07.80>gently <00:08.60>with <00:09.10>the <00:09.60>music';

export default function ManualLyrics({
 time,
 trackLoaded,
 track,
 incoming,
 delay,
 onDelayChange,
 customEditOpen,
 onToggleCustomEdit,
 onSaveCustomOverride,
 enabledScenes
}:{
 time:number;
 trackLoaded:boolean;
 track:TrackInfo|null;
 incoming:IncomingLyrics|null;
 delay:number;
 onDelayChange:(value:number)=>void;
 customEditOpen?:boolean;
 onToggleCustomEdit?:()=>void;
 onSaveCustomOverride?:(lrc:string)=>void;
 enabledScenes?:readonly SceneId[];
}){
 const [raw,setRaw]=useState('');
 const [roman,setRoman]=useState('');
 const [plain,setPlain]=useState('');
 const [mode,setMode]=useState<'original'|'romanized'|'both'>('both');
 const [lyricColorMode,setLyricColorMode]=useState<LyricColorMode>('auto');
 const [offset,setOffset]=useState(0);
 const [genre,setGenre]=setGenreState('');
 const [source,setSource]=useState('Automatic (Apple Music / LRCLIB)');
 const [sourceUrl,setSourceUrl]=useState('');
 const [corrected,setCorrected]=useState(false);
 const [message,setMessage]=useState('');
 const [autoRoman,setAutoRoman]=useState(true);
 const fileRef=useRef<HTMLInputElement>(null);

 function setGenreState(initial:string){
  return useState(initial);
 }

 const lines=useMemo(()=>parseLRC(raw),[raw]);
 const romanLines=useMemo(()=>parseLRC(roman),[roman]);
 const language=useMemo(()=>detectLanguage(raw||plain),[raw,plain]);
 const sections=useMemo(()=>analyzeSections(lines,genre),[lines,genre]);
 const storyboard=useMemo(
  ()=>buildCinematicSchedule(sections,buildCues(lines,romanLines,genre),genre,lines.map(l=>l.text).join('|').slice(0,1500),enabledScenes),
  [sections,lines,romanLines,genre,enabledScenes]
 );

 useEffect(()=>{
  setLyricTimeline(buildCues(lines,romanLines,genre),offset-delay,mode,genre);
  return()=>setLyricTimeline([]);
 },[lines,romanLines,offset,delay,mode,genre]);

 useEffect(()=>{
  if(!incoming)return;
  setRaw(incoming.original);
  setPlain(incoming.plain||'');
  const nextRoman=incoming.romanized||(!incoming.romanized&&autoRoman?romanizeText(incoming.original).text:'');
  setRoman(nextRoman);
  setSource(incoming.source);
  setSourceUrl(incoming.sourceUrl||'');
  setCorrected(false);
  setMessage(`Auto-loaded from ${incoming.source}.`);
 },[incoming?.token]);

 useEffect(()=>{if(!trackLoaded)setOffset(0)},[trackLoaded]);

 function updateRaw(value:string){
  if(value.includes('<tt')||value.includes('<p begin=')){
   const converted=convertTtmlToEnhancedLrc(value);
   if(converted.lrc){
    setRaw(converted.lrc);
    setPlain('');
    setSource('Custom Apple TTML Override');
    if(converted.romanizedLrc)setRoman(converted.romanizedLrc);
    else if(autoRoman&&!corrected)setRoman(romanizeText(converted.lrc).text);
    return;
   }
  }
  setRaw(value);
  setPlain('');
  setSource('Custom Edited');
  if(autoRoman&&!corrected)setRoman(romanizeText(value).text);
 }

 function autoGenerate(){
  if(!raw){setMessage('Add original lyrics before romanization.');return}
  setRoman(romanizeText(raw).text);
  setCorrected(false);
  setMessage('Romanization generated locally.');
 }

 async function importLocal(){
  const file=fileRef.current?.files?.[0];if(!file)return;
  if(file.size>250000){setMessage('Lyric file too large (maximum 250 KB).');return}
  try{
   const text=await file.text();
   if(text.includes('<p begin=')){
    const converted=convertTtmlToEnhancedLrc(text);
    if(converted.lrc){
     updateRaw(converted.lrc);
     if(converted.romanizedLrc)setRoman(converted.romanizedLrc);
     setSource(`Local File · TTML (${file.name})`);
     setSourceUrl('');
     setMessage('Imported word-synced TTML file '+file.name);
     return;
    }
   }
   if(parseLRC(text).length){
    updateRaw(text);
    setSource(`Local File · LRC (${file.name})`);
    setSourceUrl('');
   }else{
    setPlain(text);
    setRaw('');
    setRoman('');
    setSource(`Local File · Plain Text (${file.name})`);
    setSourceUrl('');
   }
   setMessage('Imported '+file.name+' from your device.');
  }catch{
   setMessage('The lyric file could not be read.');
  }
  if(fileRef.current)fileRef.current.value='';
 }

 function estimatePlain(){
  const rows=plain.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,300);
  if(!rows.length){setMessage('No untimed lines available.');return}
  const interval=track?.duration&&track.duration>0?Math.max(1,track.duration/rows.length):4;
  const lrc=rows.map((line,i)=>{const t=i*interval;const mm=String(Math.floor(t/60)).padStart(2,'0');const ss=(t%60).toFixed(2).padStart(5,'0');return '['+mm+':'+ss+']'+line}).join('\n');
  setRaw(lrc);if(autoRoman&&!corrected)setRoman(romanizeText(lrc).text);
  setPlain('');setSource(source+' · estimated timing');
  setMessage('Approximate line timestamps generated.');
 }

 function saveOverride(){
  if(!raw.trim()){setMessage('Add or edit lyrics first before saving.');return}
  onSaveCustomOverride?.(raw);
  if(track){
   try{
    saveUserLyrics({
     title:track.title,
     artist:track.artist,
     album:track.album,
     duration:track.duration,
     original:raw,
     romanized:roman,
     language,
     rightsConfirmed:true,
     source:'Custom Override'
    });
   }catch{
    // Ignore local library duplicate issues
   }
  }
  setMessage('Custom lyrics override saved for this song.');
 }

 const lyricTime=effectiveLyricTime(time,offset,delay);
 let idx=-1;for(let i=0;i<lines.length;i++){if(lines[i].time<=lyricTime)idx=i;else break}
 const prevLine=idx>0?lines[idx-1]:undefined;
 const current=lines[idx],next=lines[idx+1];
 const prevRom=idx>0?romanLines[idx-1]?.text:'';
 const rom=romanLines[idx]?.text||'';
 const nextRom=romanLines[idx+1]?.text||'';

 const hasWordTags=useMemo(()=>lines.some(l=>l.words&&l.words.some(w=>w.timing==='sourced')),[lines]);
 const currentHasWordSync=Boolean(current?.words&&current.words.length>0&&current.words.some(w=>w.timing==='sourced'));

 // Prefer romanized lyrics if available unless the user explicitly selected 'original'
 const hasCurrentRoman=Boolean(current&&hasDistinctRomanized(current.text,rom));
 const preferRoman=mode!=='original'&&hasCurrentRoman;
 const primaryLineText=current?(preferRoman?rom:current.text):'';
 const secondaryLineText=current&&mode==='both'&&hasCurrentRoman?current.text:'';

 const prevDisplay=prevLine
  ?(mode!=='original'&&prevRom&&hasDistinctRomanized(prevLine.text,prevRom)?prevRom:prevLine.text)
  :'';
 const nextDisplay=next
  ?(mode!=='original'&&nextRom&&hasDistinctRomanized(next.text,nextRom)?nextRom:next.text)
  :'';

 const lyricProviderInfo=useMemo(
  ()=>describeLyricProvider(source,hasWordTags,lines.length>0,Boolean(plain.trim())),
  [source,hasWordTags,lines.length,plain]
 );
 const audioSourceInfo=useMemo(
  ()=>describeAudioSource(track,trackLoaded),
  [track,trackLoaded]
 );

 // Dynamic main lyric text color change mechanism
 const {activeMainColor,activeHighlightColor}=useMemo(()=>{
  if(lyricColorMode!=='auto'){
   const preset=LYRIC_COLOR_MAP[lyricColorMode];
   return {activeMainColor:preset.main,activeHighlightColor:preset.highlight};
  }
  const activeScene=storyboard.find(s=>lyricTime>=s.start&&lyricTime<s.end);
  const sceneAccent=activeScene?byId[activeScene.id]?.accent:undefined;
  const palette=sceneAccent?[sceneAccent,...LYRIC_COLOR_PALETTE]:[...LYRIC_COLOR_PALETTE];
  const colorIdx=Math.max(0,idx)%palette.length;
  const main=palette[colorIdx]||'#72efdd';
  const highlight=palette[(colorIdx+1)%palette.length]||'#ffffff';
  return {activeMainColor:main,activeHighlightColor:highlight};
 },[lyricColorMode,storyboard,lyricTime,idx]);

 // Only build word-by-word tokens when REAL sourced word-sync is available for this line!
 // Never predict/estimate word sync when only line-synced lyrics are available.
 const activeSourcedWords=useMemo<TimedWord[]>(()=>{
  if(!current||!currentHasWordSync||!current.words)return [];
  if(!preferRoman)return current.words;
  const romTokens=rom.trim().split(/\s+/).filter(Boolean);
  if(romTokens.length===current.words.length){
   return current.words.map((w,i)=>({...w,text:romTokens[i]}));
  }
  const firstStart=current.words[0].start;
  const lastEnd=current.words[current.words.length-1].end;
  const totalSpan=Math.max(0.2,lastEnd-firstStart);
  const totalChars=romTokens.reduce((s,t)=>s+t.length,0)||1;
  let cursor=0;
  return romTokens.map(token=>{
   const start=firstStart+(totalSpan*cursor)/totalChars;
   cursor+=token.length;
   const end=firstStart+(totalSpan*cursor)/totalChars;
   return {text:token,start,end,timing:'sourced' as const};
  });
 },[current,currentHasWordSync,preferRoman,rom]);

 // Split long lines into multiple balanced lines (both for word-synced and line-synced)
 const activeWordRows=useMemo(
  ()=>splitWordsIntoBalancedRows(activeSourcedWords,36,6),
  [activeSourcedWords]
 );
 const activeLineRows=useMemo(
  ()=>splitLyricIntoBalancedLines(primaryLineText,36,6),
  [primaryLineText]
 );
 const secondaryLineRows=useMemo(
  ()=>splitLyricIntoBalancedLines(secondaryLineText,42,7),
  [secondaryLineText]
 );

 const currentLineEnd=useMemo(()=>{
  if(!current)return 0;
  if(activeSourcedWords.length>0)return activeSourcedWords[activeSourcedWords.length-1].end;
  return next?Math.min(next.time,current.time+6):current.time+4;
 },[current,next,activeSourcedWords]);

 // Spicy Lyrics / Stash 3-dot instrumental interlude indicator when vocal gap >= 3.5s
 const interludeProgress=useMemo(()=>{
  if(!lines.length)return null;
  if(idx===-1&&lines[0].time>=3.0&&lyricTime>=0&&lyricTime<lines[0].time){
   return Math.max(0,Math.min(1,lyricTime/lines[0].time));
  }
  if(current&&next){
   const gap=next.time-currentLineEnd;
   if(gap>=3.8&&lyricTime>currentLineEnd+0.25&&lyricTime<next.time){
    return Math.max(0,Math.min(1,(lyricTime-currentLineEnd)/gap));
   }
  }
  return null;
 },[lines,idx,current,next,currentLineEnd,lyricTime]);

 return <section className="local-player lyrics-panel">
  <div className="player-heading">
   <div className="heading-left">
    <span className="heading-icon">文</span>
    <div>
     <b>AUTOMATIC WORD-SYNCED &amp; LINE-SYNCED LYRICS</b>
     <small>{lyricProviderInfo.detail} · {hasWordTags?'Syllable / Word-level timestamps active':'Line-level synchronization (no fake word prediction)'}</small>
    </div>
   </div>
   <button className="upload-button" onClick={onToggleCustomEdit}>
    {customEditOpen?'Close Custom Edit':'Custom Edit (If Lyrics Mismatch)'}
   </button>
  </div>

  {/* Source Attribution Bar: Displays both Lyrics Provider and Audio Source for the active song */}
  <div className="lyric-source-bar" aria-label="Active song lyrics provider and audio source">
   <div className="lyric-source-card">
    <span className="lyric-source-label">LYRICS PROVIDER</span>
    <div className="lyric-source-main">
     <strong className="lyric-provider-badge">{lyricProviderInfo.providerName}</strong>
     <span className={`lyric-sync-tag ${hasWordTags?'word-sync':'line-sync'}`}>{lyricProviderInfo.syncMode}</span>
     {sourceUrl&&(
      <a className="lyric-source-link" href={sourceUrl} target="_blank" rel="noreferrer">
       Verify Source ↗
      </a>
     )}
    </div>
    <small className="lyric-source-sub">{lyricProviderInfo.detail}</small>
   </div>

   <div className="lyric-source-card">
    <span className="lyric-source-label">AUDIO SOURCE</span>
    <div className="lyric-source-main">
     <strong className="audio-provider-badge">{audioSourceInfo.providerName}</strong>
     <span className={`lyric-sync-tag ${audioSourceInfo.isLocal?'local-audio':'online-audio'}`}>
      {audioSourceInfo.isLocal?'Local Device File':'Full Studio Stream'}
     </span>
     {audioSourceInfo.sourceUrl&&(
      <a className="lyric-source-link" href={audioSourceInfo.sourceUrl} target="_blank" rel="noreferrer">
       Open Track ↗
      </a>
     )}
    </div>
    <small className="lyric-source-sub">{audioSourceInfo.detail}</small>
   </div>
  </div>

  <div className="lyric-display spicy-lyric-stage">
   <div className="spicy-stage-badges">
    <span title={`Lyrics Provider: ${lyricProviderInfo.detail}`}>
     Lyrics: <b>{lyricProviderInfo.providerName}</b> ({lyricProviderInfo.syncMode})
    </span>
    <span title={`Audio Source: ${audioSourceInfo.detail}`}>
     Audio: <b>{audioSourceInfo.providerName}</b>
    </span>
   </div>
   {prevDisplay&&<small className="spicy-prev-line">{splitLyricIntoBalancedLines(prevDisplay,44,8).join(' · ')}</small>}
   {interludeProgress!==null&&(
    <div className="spicy-interlude-dots" aria-label="Instrumental interlude">
     {[0,1,2].map(dotIdx=>{
      const dotFill=Math.max(0,Math.min(1,interludeProgress*3-dotIdx));
      return <span key={dotIdx} className={'spicy-dot '+(dotFill>0.1?'active':'')} style={{opacity:0.28+dotFill*0.72,transform:`scale(${0.88+dotFill*0.28})`,backgroundColor:activeMainColor}}/>;
     })}
    </div>
   )}
   {current?<>
    {currentHasWordSync?(
     <div className="spicy-word-multiline" role="region" aria-label="Word-synced lyrics">
      {activeWordRows.map((rowWords,rowIdx)=>(
       <p className="spicy-word-line" key={'row-'+rowIdx}>
        {rowWords.map((w,wIdx)=>{
         const dur=Math.max(0.05,w.end-w.start);
         const rawProg=(lyricTime-w.start)/dur;
         const prog=Math.max(0,Math.min(1,rawProg));
         const state=rawProg>=1?'sung':rawProg>0?'active':'upcoming';
         const pct=Math.round(prog*100);
         return (
          <span
           key={rowIdx+'-'+wIdx+'-'+w.start}
           className={`spicy-word ${state}`}
           style={
            state==='active'
             ? {
                backgroundImage:`linear-gradient(90deg, ${activeHighlightColor} ${Math.max(0,pct-8)}%, ${activeMainColor} ${pct}%, rgba(220,236,242,0.34) ${Math.min(100,pct+14)}%)`,
                WebkitBackgroundClip:'text',
                backgroundClip:'text',
                color:'transparent',
                WebkitTextFillColor:'transparent',
                filter:`drop-shadow(0 0 12px ${activeMainColor}80)`
               }
             : state==='sung'
             ? {
                color:activeMainColor,
                textShadow:`0 0 16px ${activeMainColor}55`
               }
             : undefined
           }
          >
           {w.text}{wIdx<rowWords.length-1?' ':''}
          </span>
         );
        })}
       </p>
      ))}
     </div>
    ):(
     <div className="spicy-word-multiline" role="region" aria-label="Line-synced lyrics">
      {activeLineRows.map((rowText,rowIdx)=>(
       <p
        key={'line-row-'+rowIdx}
        className="spicy-word-line spicy-line-synced"
        style={{
         color:activeMainColor,
         textShadow:`0 0 18px ${activeMainColor}45`
        }}
       >
        {rowText}
       </p>
      ))}
     </div>
    )}
    {secondaryLineRows.length>0&&(
     <div className="spicy-secondary-multiline">
      {secondaryLineRows.map((secRow,sIdx)=>(
       <p key={'sec-'+sIdx} className="romanized">{secRow}</p>
      ))}
     </div>
    )}
   </>:
    <p>{plain?'Untimed lyrics loaded — click "Create approximate timestamps" below to synchronize.':lines.length?'Waiting for first vocal cue…':'Lyrics load automatically when you select a song from Stash Online Player or upload a local file.'}</p>}
   {nextDisplay&&<small className="spicy-next-line">UP NEXT · {splitLyricIntoBalancedLines(nextDisplay,44,8).join(' / ')}</small>}
  </div>

  <div className="lyrics-tools">
   <label>Lyrics display
    <select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>
     <option value="both">Prefer Romanized + Original</option>
     <option value="romanized">Romanized Only (Preferred)</option>
     <option value="original">Original Script Only</option>
    </select>
   </label>
   <label>Main lyric color
    <select aria-label="Main lyric text color" value={lyricColorMode} onChange={e=>setLyricColorMode(e.target.value as LyricColorMode)}>
     <option value="auto">Auto (Scene &amp; Line Color Shift)</option>
     {(Object.entries(LYRIC_COLOR_MAP) as [Exclude<LyricColorMode,'auto'>,{label:string}][]).map(([key,val])=>(
      <option key={key} value={key}>{val.label}</option>
     ))}
    </select>
   </label>
   <label>Visual genre preset<select value={genre} onChange={e=>setGenre(e.target.value)}><option value="">Auto / unknown</option>{['Ambient','Cinematic','Pop','EDM','Rock','Hip-hop','Ballad','Classical'].map(g=><option key={g}>{g}</option>)}</select></label>
   <label>Song delay (sec)<input aria-label="Lyrics delay seconds" type="number" step=".05" min="-30" max="30" value={delay} onChange={e=>onDelayChange(clampLyricDelay(Number(e.target.value)))}/></label>
   <span>{lines.length} timed lines · {lyricProviderInfo.providerName} · {hasWordTags?'Word-synced':'Line-synced'} · {language} · Delay {formatLyricDelay(delay)}</span>
  </div>

  {plain&&!lines.length&&<div className="plain-lyrics-fallback">
   <textarea rows={4} readOnly value={plain} aria-label="Untimed lyrics" className="plain-preview"/>
   <button className="upload-button" onClick={estimatePlain}>Create approximate timestamps</button>
  </div>}

  {customEditOpen&&<div className="lyrics-editor">
   <label>Custom LRC or Apple TTML Lyrics (Edit only if auto-loaded lyrics do not match)
    <textarea rows={7} value={raw} onChange={e=>updateRaw(e.target.value)} placeholder="[00:12.50]<00:12.50>Word <00:13.00>synced <00:13.50>line"/>
   </label>
   <label>Romanization (editable)
    <textarea rows={7} value={roman} onChange={e=>{setRoman(e.target.value);setCorrected(true)}} placeholder="Auto-generated or corrected Romanized lyrics"/>
   </label>
   <div className="editor-actions">
    <input className="visually-hidden" ref={fileRef} type="file" accept=".lrc,.ttml,.xml,.txt,text/plain" aria-label="Import LRC or TTML file" onChange={()=>void importLocal()}/>
    <button className="upload-button" onClick={()=>fileRef.current?.click()}>Import LRC / TTML</button>
    <button className="upload-button" onClick={()=>{updateRaw(SAMPLE);setSource('Sample word-sync')}}>Load sample word-sync</button>
    <button className="upload-button" onClick={autoGenerate}>Romanize locally</button>
    <button className="upload-button" onClick={saveOverride}>Save custom lyrics for this song</button>
    <button className="player-remove" onClick={()=>{setRaw('');setRoman('');setPlain('');setSource('Cleared')}}>Clear</button>
   </div>
   <label className="rights-check">
    <input type="checkbox" checked={autoRoman} onChange={e=>setAutoRoman(e.target.checked)}/>
    Automatically Romanize non-Latin scripts
   </label>
  </div>}

  {storyboard.length>0&&<div className="storyboard">
   <div className="storyboard-title"><strong>AUTO-DIRECTED SCENE STORYBOARD</strong><span>{storyboard.length} planned scene(s) from your enabled themes</span></div>
   <div className="storyboard-track">{storyboard.map((item,i)=><div className="storyboard-item" key={item.start+'-'+i} style={{borderTopColor:byId[item.id].accent}}>
     <span className="storyboard-time">{Math.floor(item.start/60)}:{String(Math.floor(item.start%60)).padStart(2,'0')} – {Math.floor(item.end/60)}:{String(Math.floor(item.end%60)).padStart(2,'0')}</span>
     <strong>{byId[item.id].label}</strong>
     <span>{byId[item.id].family} · {item.font}</span>
     <small>{item.layout} · {item.transition} · {item.reason}</small>
    </div>)}</div>
   <p className="player-footnote">Storyboard scenes are chosen deterministically from your enabled themes and stay locked when seeking.</p>
  </div>}
  {message&&<p className="player-footnote" role="status">{message}</p>}
 </section>;
}
