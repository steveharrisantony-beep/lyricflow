import type {Mood,ScenePlan} from '../../lyrics/sceneDirector';
import type {LyricCue} from '../../lyrics/lyricTimeline';

export type SceneId =
 | 'crimson-impact'|'concrete-manifesto'|'rain-on-glass'|'neon-velocity'
 | 'ink-rebellion'|'ocean-reverie'|'color-riot'|'analog-breakdown'
 | 'cloud-cathedral'|'stellar-expansion'|'fragmented-thoughts'|'quiet-pages'
 | 'monochrome-memory'|'monument-titles'|'midnight-confession'|'glass-architecture'
 | 'ransom-poetry'|'type-collision'|'petal-memory'|'submerged-words'
 | 'inferno-letterforms'|'holographic-frequency'|'pixel-pulse'|'marker-diary'
 | 'bubble-pop'|'word-playground'|'sunset-frequency'|'typographic-vortex'
 | 'midnight-transit'|'final-ascension';
export type Layout='hero'|'editorial'|'left'|'stack'|'poster'|'scattered';
export type Transition='flash'|'wipe'|'dissolve'|'glitch'|'ripple'|'ink'|'zoom';
export type FontPack='impact'|'street'|'editorial'|'tech'|'grunge'|'rounded'|'mono'|'literary'
 | 'monument'|'noir'|'glass'|'collage'|'pixel'|'handwritten'|'retro'|'cyber'|'industrial'|'ultra';
export type CameraPath='push'|'drift'|'side'|'orbit'|'pullback';
export interface Template {
 id:SceneId; label:string; family:string; moods:readonly Mood[]; genres:readonly string[];
 background:string; foreground:string; accent:string; font:FontPack;
 layout:Layout; transition:Transition; camera:CameraPath; baseEnergy:number;
}
export const TEMPLATES:readonly Template[]=[
 {id:'crimson-impact',label:'Crimson Impact',family:'cinematic',moods:['fire','celebration'],genres:['rock','metal','cinematic'],background:'#210509',foreground:'#fff6ef',accent:'#fa2239',font:'impact',layout:'hero',transition:'flash',camera:'push',baseEnergy:.86},
 {id:'concrete-manifesto',label:'Concrete Manifesto',family:'urban',moods:['fire','solitude'],genres:['hip-hop','rap','trap'],background:'#181b1c',foreground:'#f9f0d8',accent:'#f4cb39',font:'street',layout:'poster',transition:'wipe',camera:'side',baseEnergy:.67},
 {id:'rain-on-glass',label:'Rain on Glass',family:'water',moods:['water','solitude'],genres:['ambient','ballad','lofi'],background:'#071b27',foreground:'#d6eaf0',accent:'#81bfd1',font:'editorial',layout:'editorial',transition:'ripple',camera:'drift',baseEnergy:.27},
 {id:'neon-velocity',label:'Neon Velocity',family:'electronic',moods:['celebration','cosmic'],genres:['edm','techno','electronic','synth'],background:'#090720',foreground:'#f8f4ff',accent:'#fa49d3',font:'tech',layout:'hero',transition:'zoom',camera:'push',baseEnergy:.88},
 {id:'ink-rebellion',label:'Ink Rebellion',family:'grunge',moods:['fire','solitude'],genres:['grunge','punk','rock','metal'],background:'#ede9df',foreground:'#181617',accent:'#d82c31',font:'grunge',layout:'left',transition:'ink',camera:'side',baseEnergy:.81},
 {id:'ocean-reverie',label:'Ocean Reverie',family:'water',moods:['water','warm','memory'],genres:['ballad','ambient','acoustic'],background:'#0c3652',foreground:'#fff2e9',accent:'#f4ba93',font:'editorial',layout:'editorial',transition:'ripple',camera:'drift',baseEnergy:.30},
 {id:'color-riot',label:'Color Riot',family:'pop',moods:['celebration','warm'],genres:['pop','funk','dance'],background:'#feda36',foreground:'#171829',accent:'#fa486d',font:'rounded',layout:'scattered',transition:'wipe',camera:'side',baseEnergy:.81},
 {id:'analog-breakdown',label:'Analog Breakdown',family:'retro',moods:['memory','solitude'],genres:['indie','synth','retro','lofi'],background:'#111b1f',foreground:'#e4ecdf',accent:'#f37770',font:'mono',layout:'left',transition:'glitch',camera:'pullback',baseEnergy:.44},
 {id:'cloud-cathedral',label:'Cloud Cathedral',family:'dream',moods:['warm','nature','memory'],genres:['ambient','classical','cinematic'],background:'#626995',foreground:'#ffffff',accent:'#f6d1bc',font:'editorial',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.25},
 {id:'stellar-expansion',label:'Stellar Expansion',family:'cosmic',moods:['cosmic','memory'],genres:['synth','cinematic','electronic'],background:'#080a21',foreground:'#f4f4ff',accent:'#998fff',font:'tech',layout:'hero',transition:'zoom',camera:'orbit',baseEnergy:.63},
 {id:'fragmented-thoughts',label:'Fragmented Thoughts',family:'experimental',moods:['solitude','memory','fire'],genres:['alternative','indie','experimental'],background:'#0e1014',foreground:'#f7f7f0',accent:'#ff6956',font:'grunge',layout:'stack',transition:'ink',camera:'pullback',baseEnergy:.53},
 {id:'quiet-pages',label:'Quiet Pages',family:'minimal',moods:['solitude','memory','warm','nature'],genres:['acoustic','classical','ballad','ambient'],background:'#e9e4d9',foreground:'#27252a',accent:'#ae786b',font:'literary',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.16},

 {id:'monochrome-memory',label:'Monochrome Memory',family:'noir',moods:['memory','solitude'],genres:['indie','ballad','film','cinematic'],background:'#111112',foreground:'#efeee8',accent:'#999b9c',font:'noir',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.22},
 {id:'monument-titles',label:'Monument Titles',family:'epic',moods:['celebration','cosmic','fire'],genres:['orchestral','cinematic','anthem','rock'],background:'#080c16',foreground:'#ffefd1',accent:'#e4ae67',font:'monument',layout:'hero',transition:'zoom',camera:'push',baseEnergy:.82},
 {id:'midnight-confession',label:'Midnight Confession',family:'intimate',moods:['solitude','warm','memory'],genres:['ballad','acoustic','piano','indie'],background:'#07070a',foreground:'#f8eee7',accent:'#d55265',font:'literary',layout:'left',transition:'dissolve',camera:'drift',baseEnergy:.16},
 {id:'glass-architecture',label:'Glass Architecture',family:'structural',moods:['cosmic','abstract'],genres:['progressive','ambient','experimental','electronic'],background:'#0a101b',foreground:'#d9eff2',accent:'#94cde9',font:'glass',layout:'stack',transition:'zoom',camera:'orbit',baseEnergy:.45},
 {id:'ransom-poetry',label:'Ransom Poetry',family:'collage',moods:['memory','solitude','fire'],genres:['indie','alternative','hip-hop'],background:'#b7aa92',foreground:'#1e1a1c',accent:'#f7e4a4',font:'collage',layout:'scattered',transition:'wipe',camera:'side',baseEnergy:.62},
 {id:'type-collision',label:'Type Collision',family:'brutalist',moods:['celebration','fire'],genres:['rap','funk','pop','hip-hop'],background:'#f7f2dc',foreground:'#171923',accent:'#db301e',font:'ultra',layout:'stack',transition:'flash',camera:'push',baseEnergy:.78},
 {id:'petal-memory',label:'Petal Memory',family:'botanical',moods:['nature','warm','memory'],genres:['folk','romantic','ballad','classical'],background:'#22152d',foreground:'#fceaf0',accent:'#ec98bb',font:'editorial',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.26},
 {id:'submerged-words',label:'Submerged Words',family:'underwater',moods:['water','solitude','memory'],genres:['ambient','chill','indie','ballad'],background:'#041c31',foreground:'#dbf7ff',accent:'#39c9dc',font:'glass',layout:'editorial',transition:'ripple',camera:'drift',baseEnergy:.30},
 {id:'inferno-letterforms',label:'Inferno Letterforms',family:'inferno',moods:['fire','celebration'],genres:['metal','rock','hardstyle','cinematic'],background:'#190500',foreground:'#fff6e7',accent:'#ff771c',font:'industrial',layout:'hero',transition:'flash',camera:'push',baseEnergy:.94},
 {id:'holographic-frequency',label:'Holographic Frequency',family:'holographic',moods:['cosmic','celebration'],genres:['techno','electronic','experimental','edm'],background:'#03141d',foreground:'#d5ffff',accent:'#3cffce',font:'cyber',layout:'stack',transition:'glitch',camera:'orbit',baseEnergy:.75},
 {id:'pixel-pulse',label:'Pixel Pulse',family:'arcade',moods:['celebration','memory'],genres:['chiptune','retro','synth','game'],background:'#100e37',foreground:'#faf6cc',accent:'#fb63bf',font:'pixel',layout:'hero',transition:'wipe',camera:'side',baseEnergy:.79},
 {id:'marker-diary',label:'Marker Diary',family:'sketchbook',moods:['memory','warm','nature'],genres:['acoustic','indie','pop','folk'],background:'#f1e6d3',foreground:'#34322f',accent:'#f7a03b',font:'handwritten',layout:'left',transition:'wipe',camera:'drift',baseEnergy:.34},
 {id:'bubble-pop',label:'Bubble Pop',family:'bubble',moods:['celebration','warm'],genres:['k-pop','pop','dance','funk'],background:'#b9a4fa',foreground:'#fff8f2',accent:'#fb559e',font:'rounded',layout:'scattered',transition:'dissolve',camera:'drift',baseEnergy:.73},
 {id:'word-playground',label:'Word Playground',family:'typographic',moods:['celebration','warm','abstract'],genres:['pop','funk','indie','dance'],background:'#e6f5ea',foreground:'#181b23',accent:'#fa5839',font:'ultra',layout:'scattered',transition:'wipe',camera:'side',baseEnergy:.73},
 {id:'sunset-frequency',label:'Sunset Frequency',family:'vaporwave',moods:['warm','nature','memory'],genres:['tropical','chill','synth','pop'],background:'#3f2269',foreground:'#ffe7d3',accent:'#ff9b64',font:'retro',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.41},
 {id:'typographic-vortex',label:'Typographic Vortex',family:'vortex',moods:['cosmic','fire','solitude'],genres:['experimental','electronic','cinematic','techno'],background:'#0d0713',foreground:'#faf2ff',accent:'#ec71fc',font:'tech',layout:'hero',transition:'zoom',camera:'orbit',baseEnergy:.87},
 {id:'midnight-transit',label:'Midnight Transit',family:'transit',moods:['solitude','memory','fire'],genres:['trap','urban','synth','pop'],background:'#030a16',foreground:'#f0f5f6',accent:'#f39f59',font:'street',layout:'left',transition:'zoom',camera:'push',baseEnergy:.60},
 {id:'final-ascension',label:'Final Ascension',family:'ascension',moods:['celebration','cosmic','warm'],genres:['anthem','cinematic','orchestral','rock'],background:'#07070c',foreground:'#fff4da',accent:'#e5c291',font:'monument',layout:'hero',transition:'flash',camera:'pullback',baseEnergy:.99},
] as const;
export const byId=Object.fromEntries(TEMPLATES.map(t=>[t.id,t])) as Record<SceneId,Template>;
export interface DirectedScene {
 id:SceneId;start:number;end:number;layout:Layout;camera:CameraPath;
 font:FontPack;transition:Transition;variation:number;section:number;reason:string;
}
const LAYOUTS:Layout[]=['hero','editorial','left','stack','poster','scattered'];
const CAMERAS:CameraPath[]=['push','drift','side','orbit','pullback'];
function stableHash(input:string):number {
 let h=2166136261;
 for(let i=0;i<input.length;i++)h=Math.imul(h^input.charCodeAt(i),16777619);
 return h>>>0;
}
function normalizeGenre(value:string){return value.toLowerCase().replace(/[-_]/g,' ').trim()}
function compareCandidates(a:Template,b:Template,plan:ScenePlan,genre:string,recent:readonly SceneId[],seed:number){
 const grade=(t:Template)=>{
  let score=t.moods.includes(plan.mood)?4:0;
  if(genre&&t.genres.some(g=>genre.includes(g)))score+=3;
  score+=(1-Math.abs(t.baseEnergy-plan.energy))*1.5;
  if(t.id===recent[recent.length-1])score-=18;
  if(recent.slice(-3).includes(t.id))score-=11;
  if(t.family===byId[recent[recent.length-1]]?.family)score-=2;
  score+=((stableHash(t.id+seed)%1000)/1000)*.4;
  return score;
 };
 return grade(b)-grade(a);
}
/** Pure song-level scheduler. Scene choices are stable when seeking or replaying. */
export function buildCinematicSchedule(plans:readonly ScenePlan[],cues:readonly LyricCue[],genre='',songKey=''):DirectedScene[]{
 if(!cues.length)return [];
 const g=normalizeGenre(genre);
 const recent:SceneId[]=[];
 const result:DirectedScene[]=[];
 // Long sections are split into cinematic beats; lyric callbacks remain inside a visual family.
 const source=plans.length?plans:[{
  start:cues[0].time,end:cues[cues.length-1].end,mood:'abstract',font:'grotesk',
  motion:'drift',camera:'dolly',confidence:.2,palette:0,reason:'fallback',energy:.35
 } as ScenePlan];
 for(let i=0;i<source.length;i++){
  const section=source[i];
  const end=Math.max(section.start+.4,section.end);
  const duration=end-section.start;
  const n=Math.max(1,Math.ceil(duration/14));
  for(let part=0;part<n;part++){
   const start=section.start+duration*part/n;
   const finish=part===n-1?end:section.start+duration*(part+1)/n;
   const seed=stableHash(songKey+':'+i+':'+part);
   const sorted=[...TEMPLATES].sort((a,b)=>compareCandidates(a,b,section,g,recent,seed));
   const chosen=sorted[0];
   const variation=seed%5;
   const layout=LAYOUTS[(LAYOUTS.indexOf(chosen.layout)+variation)%LAYOUTS.length];
   const camera=CAMERAS[(CAMERAS.indexOf(chosen.camera)+(seed%3))%CAMERAS.length];
   result.push({id:chosen.id,start,end:finish,layout,camera,font:chosen.font,
    transition:chosen.transition,variation,section:i,reason:section.reason});
   recent.push(chosen.id);
  }
 }
 return result;
}
export function sceneAt(list:readonly DirectedScene[],time:number):DirectedScene|null {
 if(!list.length)return null;
 let lo=0,hi=list.length-1;
 if(time<list[0].start)return null;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(list[mid].start<=time)lo=mid;else hi=mid-1;}
 return time<list[lo].end?list[lo]:null;
}
export const AUDIO_ONLY_SCENES:readonly SceneId[]=[
 'neon-velocity','color-riot','stellar-expansion','analog-breakdown','crimson-impact','ocean-reverie',
 'holographic-frequency','sunset-frequency','pixel-pulse','glass-architecture','inferno-letterforms','midnight-transit'
] as const;
