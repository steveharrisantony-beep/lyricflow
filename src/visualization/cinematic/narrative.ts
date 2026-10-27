import type {LyricCue} from '../../lyrics/lyricTimeline';
import type {Mood} from '../../lyrics/sceneDirector';
import type {DirectedScene,SceneId} from './catalog';
import {sceneColors} from './paint';
import type {Pulse} from './paint';

export type Motif='moon'|'rain'|'heart'|'flower'|'fire'|'stars'|'city'|
 'bird'|'mountain'|'ocean'|'road'|'memory'|'geometry'|'sound';
const keywords:readonly [Motif,RegExp][]=[
 ['rain',/\b(rain|tears?|storm|drizzle|monsoon|cloudburst|wet)\b|മഴ|மழை|बारिश/iu],
 ['heart',/\b(love|heart|kiss|darling|beloved|embrace)\b|സ്നേഹം|പ്രണയ|காதல்|प्यार/iu],
 ['fire',/\b(fire|burn|flame|inferno|rage|ash|ember)\b|തീ|நெருப்பு|आग/iu],
 ['stars',/\b(star|cosmos|galaxy|universe|sky|planet)\b|നക്ഷത്ര|நட்சத்திர|तार/iu],
 ['moon',/\b(moon|moonlight|nightfall|lunar)\b|നിലാവ്|நிலா|चाँद/iu],
 ['flower',/\b(flower|petal|bloom|rose|garden)\b|പൂവ്|மலர்|फूल/iu],
 ['city',/\b(city|street|downtown|building|avenue|neon sign)\b/iu],
 ['road',/\b(road|travel|drive|highway|journey|train|leave)\b/iu],
 ['ocean',/\b(ocean|sea|water|river|waves|shore|swim)\b|കടൽ|கடல்|सागर/iu],
 ['bird',/\b(fly|bird|wings|freedom|flying)\b/iu],
 ['mountain',/\b(mountain|hill|cliff|valley|summit)\b/iu],
 ['memory',/\b(memory|remember|yesterday|past|forgot|childhood)\b|ഓർമ്മ|நினைவு|याद/iu],
];
const basedOnMood:Record<Mood,Motif>={
 water:'ocean',cosmic:'stars',fire:'fire',nature:'flower',memory:'memory',
 warm:'heart',solitude:'moon',celebration:'sound',abstract:'geometry'
};
const familyFallback:Partial<Record<SceneId,Motif>>={
 'holographic-tide':'ocean',
 'glow-lagoon':'ocean',
 'celestial-orbit':'stars',
 'orbital-halo':'stars',
 'star-map':'stars',
 'signal-chamber':'city',
 'tidal-bloom':'flower',
 'pixel-garden':'flower',
 'cobalt-contours':'fire',
 'contour-flow':'mountain',
 'chromatic-drive':'road',
 'origami-flight':'bird',
 'aurora-field':'moon',
 'crystal-resonance':'memory'
};
export function selectMotif(text:string,mood:Mood,scene:SceneId):Motif {
 for(const [motif,test]of keywords)if(test.test(text))return motif;
 return familyFallback[scene]||basedOnMood[mood];
}
export interface ObjectMotion{scale:number;glow:number;drift:number;rotation:number}
export function objectMotion(p:Pulse,intensity:number,reduce=false):ObjectMotion{
 const motion=reduce?.14:1;
 const weight=Math.max(0,Math.min(1,intensity));
 return {
  scale:1+weight*motion*(.52*p.bass+.15*p.beat+.12*p.treble),
  glow:.18+weight*(.62*p.treble+.12*p.onset),
  drift:motion*(.4+p.mids*.85),
  rotation:motion*(.02+p.treble*.05),
 };
}
export function drawNarrativeObjects(
 _c:CanvasRenderingContext2D,scene:DirectedScene,cue:LyricCue|null,
 _w:number,_h:number,_time:number,_p:Pulse,_intensity:number,_reducedMotion:boolean
):Motif {
 return selectMotif(cue?.text||'',cue?.mood||'abstract',scene.id);
}
export {sceneColors};
