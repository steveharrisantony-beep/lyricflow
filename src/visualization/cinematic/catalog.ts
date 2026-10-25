import type {Mood,ScenePlan} from '../../lyrics/sceneDirector';
import type {LyricCue} from '../../lyrics/lyricTimeline';

export type VoxelWallCategory =
 | 'flow'
 | 'contours'
 | 'sculptures'
 | 'space'
 | 'nature'
 | 'architecture'
 | 'journeys';

export type SceneId =
 // Flow (6)
 | 'holographic-tide'
 | 'liquid-filigree'
 | 'crimson-current'
 | 'gilded-whirlpool'
 | 'silk-waves'
 | 'ribbon-dance'
 // Contours (5)
 | 'chroma-moire-voids'
 | 'cobalt-contours'
 | 'molten-contours'
 | 'layered-contours'
 | 'contour-flow'
 // Sculptures (4)
 | 'crystal-resonance'
 | 'pearl-resonance'
 | 'tidal-bloom'
 | 'paper-cut'
 // Space (5)
 | 'celestial-orbit'
 | 'orbital-halo'
 | 'infinite-tunnel'
 | 'orbital-score'
 | 'star-map'
 // Nature (4)
 | 'aurora-field'
 | 'silver-current'
 | 'glow-lagoon'
 | 'pixel-garden'
 // Architecture (4)
 | 'signal-chamber'
 | 'neon-metal-matrix'
 | 'bauhaus-beat'
 | 'halftone-club'
 // Journeys (4)
 | 'chromatic-drive'
 | 'origami-flight'
 | 'white-velocity'
 | 'color-riot';

export type Layout='hero'|'editorial'|'left'|'stack'|'poster'|'scattered';
export type Transition='flash'|'wipe'|'dissolve'|'glitch'|'ripple'|'ink'|'zoom';
export type FontPack='impact'|'street'|'editorial'|'tech'|'grunge'|'rounded'|'mono'|'literary'
 | 'monument'|'noir'|'glass'|'collage'|'pixel'|'handwritten'|'retro'|'cyber'|'industrial'|'ultra'
 | 'couture'|'vogue'|'engraved'|'techno'|'manuscript'|'typewriter'|'retrograde';
export type CameraPath='push'|'drift'|'side'|'orbit'|'pullback';

export interface Template {
 id:SceneId;
 label:string;
 family:VoxelWallCategory;
 moods:readonly Mood[];
 genres:readonly string[];
 background:string;
 foreground:string;
 accent:string;
 font:FontPack;
 layout:Layout;
 transition:Transition;
 camera:CameraPath;
 baseEnergy:number;
}

export const VOXELWALL_CATEGORIES:readonly {id:VoxelWallCategory;label:string;description:string}[]=[
 {id:'flow',label:'Flow',description:'Iridescent fluid currents, silk ribbons, and harmonic whirlpools'},
 {id:'contours',label:'Contours',description:'Topographic isolines, chromatic moiré fields, and molten elevation ridges'},
 {id:'sculptures',label:'Sculptures',description:'Faceted crystal prisms, nacreous acoustic spheres, and paper dioramas'},
 {id:'space',label:'Space',description:'Celestial orbits, eclipse halos, astrolabes, and infinite sacred portals'},
 {id:'nature',label:'Nature',description:'Geomagnetic auroras, bioluminescent lagoons, ocean swells, and voxel flora'},
 {id:'architecture',label:'Architecture',description:'Brutalist signal chambers, neon metal matrices, and constructivist grids'},
 {id:'journeys',label:'Journeys',description:'Chromatic synth horizons, origami flocks, and kinetic slipstreams'}
] as const;

export const TEMPLATES:readonly Template[]=[
 // FLOW (6)
 {id:'holographic-tide',label:'Holographic Tide',family:'flow',moods:['water','cosmic','celebration'],genres:['electronic','pop','synth','ambient'],background:'#071326',foreground:'#eefaff',accent:'#5ef2e4',font:'glass',layout:'hero',transition:'ripple',camera:'drift',baseEnergy:.68},
 {id:'liquid-filigree',label:'Liquid Filigree',family:'flow',moods:['warm','water','memory'],genres:['classical','ambient','ballad','indie'],background:'#121024',foreground:'#fcf6ea',accent:'#f5c26b',font:'couture',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.48},
 {id:'crimson-current',label:'Crimson Current',family:'flow',moods:['fire','warm','solitude'],genres:['rock','electronic','cinematic','hip-hop'],background:'#1d0710',foreground:'#fff2f4',accent:'#ff5c77',font:'vogue',layout:'hero',transition:'wipe',camera:'push',baseEnergy:.78},
 {id:'gilded-whirlpool',label:'Gilded Whirlpool',family:'flow',moods:['celebration','warm','fire'],genres:['pop','funk','dance','cinematic'],background:'#181206',foreground:'#fff8e6',accent:'#f7b93e',font:'monument',layout:'poster',transition:'zoom',camera:'orbit',baseEnergy:.74},
 {id:'silk-waves',label:'Silk Waves',family:'flow',moods:['water','warm','memory'],genres:['electronic','pop','indie','ballad'],background:'#f4dfe7',foreground:'#2b1d38',accent:'#8f2d75',font:'editorial',layout:'hero',transition:'dissolve',camera:'drift',baseEnergy:.52},
 {id:'ribbon-dance',label:'Ribbon Dance',family:'flow',moods:['celebration','abstract','cosmic'],genres:['electronic','pop','dance'],background:'#11122c',foreground:'#f2f1ff',accent:'#9c93ff',font:'rounded',layout:'hero',transition:'ripple',camera:'drift',baseEnergy:.64},

 // CONTOURS (5)
 {id:'chroma-moire-voids',label:'Chroma Moire Voids',family:'contours',moods:['abstract','cosmic','solitude'],genres:['experimental','techno','electronic','idm'],background:'#090b18',foreground:'#f3f5ff',accent:'#c98bff',font:'cyber',layout:'stack',transition:'glitch',camera:'orbit',baseEnergy:.72},
 {id:'cobalt-contours',label:'Cobalt Contours',family:'contours',moods:['water','solitude','abstract'],genres:['ambient','lofi','electronic','indie'],background:'#061933',foreground:'#e8f4ff',accent:'#63b8ff',font:'tech',layout:'editorial',transition:'ripple',camera:'side',baseEnergy:.46},
 {id:'molten-contours',label:'Molten Contours',family:'contours',moods:['fire','celebration','warm'],genres:['rock','metal','electronic','trap'],background:'#210b04',foreground:'#fff3e8',accent:'#ff8533',font:'industrial',layout:'poster',transition:'flash',camera:'push',baseEnergy:.86},
 {id:'layered-contours',label:'Layered Contours',family:'contours',moods:['nature','memory','warm'],genres:['acoustic','folk','indie','ambient'],background:'#141e19',foreground:'#eef7f0',accent:'#75d99c',font:'engraved',layout:'left',transition:'dissolve',camera:'pullback',baseEnergy:.42},
 {id:'contour-flow',label:'Contour Flow',family:'contours',moods:['abstract','nature','memory'],genres:['electronic','pop','indie'],background:'#eef0e8',foreground:'#15302f',accent:'#25695d',font:'literary',layout:'hero',transition:'dissolve',camera:'drift',baseEnergy:.50},

 // SCULPTURES (4)
 {id:'crystal-resonance',label:'Crystal Resonance',family:'sculptures',moods:['cosmic','celebration','abstract'],genres:['electronic','synth','pop','cinematic'],background:'#0b1629',foreground:'#f0f9ff',accent:'#7ce8ff',font:'ultra',layout:'hero',transition:'zoom',camera:'orbit',baseEnergy:.76},
 {id:'pearl-resonance',label:'Pearl Resonance',family:'sculptures',moods:['warm','memory','solitude'],genres:['classical','piano','ballad','ambient'],background:'#f5efe6',foreground:'#241f26',accent:'#8c4a6b',font:'manuscript',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.34},
 {id:'tidal-bloom',label:'Tidal Bloom',family:'sculptures',moods:['water','nature','warm'],genres:['indie','pop','ambient','chill'],background:'#082228',foreground:'#ebfffb',accent:'#52e3c2',font:'handwritten',layout:'scattered',transition:'ripple',camera:'orbit',baseEnergy:.58},
 {id:'paper-cut',label:'Paper Cut',family:'sculptures',moods:['abstract','celebration','memory'],genres:['electronic','pop','indie'],background:'#f1eadc',foreground:'#1e2130',accent:'#b54324',font:'collage',layout:'hero',transition:'wipe',camera:'drift',baseEnergy:.55},

 // SPACE (5)
 {id:'celestial-orbit',label:'Celestial Orbit',family:'space',moods:['cosmic','memory','solitude'],genres:['cinematic','synth','ambient','orchestral'],background:'#06091c',foreground:'#f2f4ff',accent:'#8cb4ff',font:'techno',layout:'hero',transition:'zoom',camera:'orbit',baseEnergy:.66},
 {id:'orbital-halo',label:'Orbital Halo',family:'space',moods:['cosmic','fire','celebration'],genres:['electronic','cinematic','anthem','rock'],background:'#13091f',foreground:'#fbf2ff',accent:'#ff7ae0',font:'impact',layout:'hero',transition:'flash',camera:'push',baseEnergy:.84},
 {id:'infinite-tunnel',label:'Infinite Tunnel',family:'space',moods:['cosmic','celebration','fire'],genres:['techno','edm','electronic','trance'],background:'#050d1a',foreground:'#ecfbff',accent:'#47e6ff',font:'street',layout:'stack',transition:'zoom',camera:'push',baseEnergy:.90},
 {id:'orbital-score',label:'Orbital Score',family:'space',moods:['abstract','cosmic','memory'],genres:['electronic','pop','indie'],background:'#080d24',foreground:'#eff7ff',accent:'#64d6de',font:'noir',layout:'hero',transition:'zoom',camera:'drift',baseEnergy:.58},
 {id:'star-map',label:'Star Map',family:'space',moods:['cosmic','solitude','memory'],genres:['electronic','pop','indie','ambient'],background:'#091821',foreground:'#eff8df',accent:'#9edab4',font:'mono',layout:'hero',transition:'dissolve',camera:'drift',baseEnergy:.44},

 // NATURE (4)
 {id:'aurora-field',label:'Aurora Field',family:'nature',moods:['nature','cosmic','warm'],genres:['ambient','folk','cinematic','ballad'],background:'#071c1f',foreground:'#edfff9',accent:'#6bf2b8',font:'typewriter',layout:'editorial',transition:'dissolve',camera:'drift',baseEnergy:.40},
 {id:'silver-current',label:'Ocean Pulse',family:'nature',moods:['water','solitude','memory'],genres:['ambient','ballad','acoustic','lofi'],background:'#071f2e',foreground:'#ebf8ff',accent:'#7ad7f0',font:'retrograde',layout:'editorial',transition:'ripple',camera:'drift',baseEnergy:.38},
 {id:'glow-lagoon',label:'Glow Lagoon',family:'nature',moods:['water','nature','warm'],genres:['chill','tropical','indie','pop'],background:'#062624',foreground:'#eafff8',accent:'#4df0c8',font:'rounded',layout:'left',transition:'ripple',camera:'side',baseEnergy:.54},
 {id:'pixel-garden',label:'Pixel Garden',family:'nature',moods:['nature','celebration','memory'],genres:['electronic','pop','indie','chiptune'],background:'#102b29',foreground:'#e7ffc5',accent:'#9ed36f',font:'pixel',layout:'hero',transition:'wipe',camera:'drift',baseEnergy:.60},

 // ARCHITECTURE (4)
 {id:'signal-chamber',label:'Signal Chamber',family:'architecture',moods:['fire','abstract','solitude'],genres:['hip-hop','trap','electronic','industrial'],background:'#14121d',foreground:'#f7f2ff',accent:'#ff6e59',font:'industrial',layout:'poster',transition:'flash',camera:'push',baseEnergy:.82},
 {id:'neon-metal-matrix',label:'Neon Metal Matrix',family:'architecture',moods:['cosmic','celebration','abstract'],genres:['techno','edm','cyberpunk','synth'],background:'#0b1017',foreground:'#ecf6ff',accent:'#45f0df',font:'cyber',layout:'stack',transition:'glitch',camera:'side',baseEnergy:.85},
 {id:'bauhaus-beat',label:'Bauhaus Beat',family:'architecture',moods:['abstract','celebration','warm'],genres:['electronic','pop','indie','funk'],background:'#f3ebd4',foreground:'#202526',accent:'#b8381e',font:'impact',layout:'hero',transition:'wipe',camera:'drift',baseEnergy:.65},
 {id:'halftone-club',label:'Halftone Club',family:'architecture',moods:['celebration','fire','abstract'],genres:['electronic','pop','dance','hip-hop'],background:'#23102d',foreground:'#fff1dc',accent:'#ed80b2',font:'grunge',layout:'hero',transition:'ink',camera:'drift',baseEnergy:.70},

 // JOURNEYS (4)
 {id:'chromatic-drive',label:'Chromatic Drive',family:'journeys',moods:['celebration','fire','cosmic'],genres:['synth','pop','electronic','rock'],background:'#160826',foreground:'#fff2fa',accent:'#ff6ec7',font:'retro',layout:'hero',transition:'zoom',camera:'push',baseEnergy:.83},
 {id:'origami-flight',label:'Origami Flight',family:'journeys',moods:['warm','nature','memory'],genres:['indie','acoustic','pop','cinematic'],background:'#f2ede2',foreground:'#232634',accent:'#c4492d',font:'editorial',layout:'scattered',transition:'wipe',camera:'side',baseEnergy:.52},
 {id:'white-velocity',label:'White Velocity',family:'journeys',moods:['celebration','abstract','fire'],genres:['edm','drum-and-bass','rock','pop'],background:'#eef2f7',foreground:'#151b26',accent:'#1f5eff',font:'street',layout:'poster',transition:'wipe',camera:'push',baseEnergy:.88},
 {id:'color-riot',label:'Color Riot',family:'journeys',moods:['celebration','warm','abstract'],genres:['pop','funk','dance'],background:'#feda36',foreground:'#171829',accent:'#b81d43',font:'ultra',layout:'scattered',transition:'wipe',camera:'side',baseEnergy:.81},
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
export function buildCinematicSchedule(plans:readonly ScenePlan[],cues:readonly LyricCue[],genre='',songKey='',enabledScenes?:readonly SceneId[]):DirectedScene[]{
 if(!cues.length)return [];
 const g=normalizeGenre(genre);
 const recent:SceneId[]=[];
 const result:DirectedScene[]=[];
 const allowedSet=enabledScenes&&enabledScenes.length>0?new Set(enabledScenes):null;
 const pool=allowedSet?TEMPLATES.filter(t=>allowedSet.has(t.id)):TEMPLATES;
 const activeTemplates=pool.length>0?pool:TEMPLATES;
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
   const sorted=[...activeTemplates].sort((a,b)=>compareCandidates(a,b,section,g,recent,seed));
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

export const AUDIO_ONLY_SCENES:readonly SceneId[]=TEMPLATES.map(t=>t.id);
