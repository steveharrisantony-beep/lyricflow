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
 'rain-on-glass':'rain','ocean-reverie':'ocean','cloud-cathedral':'moon',
 'stellar-expansion':'stars','concrete-manifesto':'city',
 'petal-memory':'flower','submerged-words':'ocean',
 'inferno-letterforms':'fire','midnight-transit':'road',
 'monochrome-memory':'memory','monument-titles':'mountain',
 'sunset-frequency':'moon','marker-diary':'flower'
};
export function selectMotif(text:string,mood:Mood,scene:SceneId):Motif {
 // Respect explicit lyric imagery. Section mood is fallback, not a per-word switch.
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
const TAU=Math.PI*2;
const seed=(i:number)=>{const n=Math.sin(i*71.7+13)*43758.545;return n-Math.floor(n)};
function circle(c:CanvasRenderingContext2D,x:number,y:number,r:number){
 c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);c.fill();
}
function line(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number){
 c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function star(c:CanvasRenderingContext2D,x:number,y:number,r:number){
 c.beginPath();
 for(let i=0;i<10;i++){
  const angle=i*Math.PI/5-Math.PI*.5,rr=i%2?r*.43:r;
  if(!i)c.moveTo(x+Math.cos(angle)*rr,y+Math.sin(angle)*rr);
  else c.lineTo(x+Math.cos(angle)*rr,y+Math.sin(angle)*rr);
 }c.closePath();c.fill();
}
/** Procedural illustrative elements. No downloaded artwork, no copyrighted visual assets. */
export function drawNarrativeObjects(
 c:CanvasRenderingContext2D,scene:DirectedScene,cue:LyricCue|null,
 w:number,h:number,time:number,p:Pulse,intensity:number,reducedMotion:boolean
):Motif {
 const template=sceneColors(scene.id);
 const motif=selectMotif(cue?.text||'',cue?.mood||'abstract',scene.id);
 const motion=objectMotion(p,intensity,reducedMotion);
 const unit=Math.min(w,h);
 // Place figurative objects toward the side, reserving a central text-safe region.
 const side=(scene.variation%2===0?1:-1);
 const x=side>0?w*.8:w*.20,y=h*.36;
 c.save();c.globalAlpha=scene.id==='quiet-pages'?.27:.45;
 c.translate(x+Math.sin(time*.23)*w*.018*motion.drift,y+Math.cos(time*.17)*h*.014*motion.drift);
 c.rotate(Math.sin(time*.14)*motion.rotation);
 c.scale(motion.scale,motion.scale);
 c.lineWidth=Math.max(1,unit*.003);
 c.strokeStyle=template.accent;c.fillStyle=template.accent;
 c.shadowColor=template.accent;c.shadowBlur=motion.glow*unit*.045;
 const r=unit*.17;
 switch(motif){
 case 'moon':
  c.beginPath();c.arc(0,0,r,Math.PI*.29,Math.PI*1.69,false);
  c.arc(r*.40,-r*.26,r*.79,Math.PI*1.52,Math.PI*.44,true);
  c.closePath();c.fill();
  c.strokeStyle=template.foreground;c.globalAlpha=.2;c.beginPath();c.arc(0,0,r*1.5,0,TAU);c.stroke();
  break;
 case 'rain':
  c.beginPath();c.arc(0,-r*.15,r,Math.PI,0);c.stroke();
  line(c,0,-r*.15,0,r*.75);c.beginPath();c.arc(r*.15,r*.75,r*.16,0,Math.PI);c.stroke();
  for(let i=0;i<18;i++){const xx=(seed(i)-.5)*r*2.5,yy=((seed(i+19)*r*3+time*unit*.03*(.4+p.treble))%(r*3))-r;line(c,xx,yy,xx-r*.05,yy+r*.25)}
  break;
 case 'heart':
  c.beginPath();c.moveTo(0,r*.86);
  c.bezierCurveTo(-r*1.5,-r*.12,-r*.62,-r*.97,0,-r*.33);
  c.bezierCurveTo(r*.62,-r*.97,r*1.5,-r*.12,0,r*.86);c.stroke();
  break;
 case 'flower':
  for(let i=0;i<7;i++){
   const a=i*TAU/7+time*.02,px=Math.cos(a)*r*.52,py=Math.sin(a)*r*.52;
   c.beginPath();c.ellipse(px,py,r*.48,r*.22,a,0,TAU);c.fill();
  }
  c.fillStyle=template.foreground;circle(c,0,0,r*.23);
  break;
 case 'fire':
  for(let i=0;i<5;i++){
   const xx=(i-2)*r*.38;
   c.beginPath();c.moveTo(xx-r*.26,r);
   c.quadraticCurveTo(xx-r*.38,-r*.28,xx+Math.sin(time*.8+i)*r*.18,-r*(.65+seed(i)*.65));
   c.quadraticCurveTo(xx+r*.39,r*.24,xx+r*.26,r);
   c.closePath();c.fill();
  }
  break;
 case 'stars':
  for(let i=0;i<13;i++){
   const xx=(seed(i*3)-.5)*r*3.3,yy=(seed(i*3+1)-.5)*r*2.8;
   star(c,xx,yy,r*(.075+seed(i*3+2)*.19)*(1+.32*p.treble));
  }break;
 case 'city':
  for(let i=0;i<9;i++){
   const xx=(i-4)*r*.27,bh=r*(.33+seed(i)*1.5);
   c.fillRect(xx,r-bh,r*.22,bh);
   c.save();c.fillStyle=template.foreground;c.globalAlpha*=.55;
   for(let j=0;j<4;j++)c.fillRect(xx+r*.055,r-bh+r*.12+j*r*.23,r*.045,r*.06);
   c.restore();
  }break;
 case 'road':
  line(c,-r*.8,r*.95,-r*.10,-r*1.3);line(c,r*.8,r*.95,r*.10,-r*1.3);
  for(let i=0;i<7;i++){const yy=(i/7)**2*r*1.9-r,xx=Math.abs(yy+r)*.025;line(c,-xx,yy,-xx,yy+r*.13)}
  break;
 case 'bird':
  for(let i=0;i<4;i++){
   const xx=(i-1)*r*.42,yy=(seed(i)-.5)*r;
   c.beginPath();c.moveTo(xx-r*.22,yy);c.quadraticCurveTo(xx,yy-r*.38,xx+r*.18,yy);
   c.quadraticCurveTo(xx+r*.38,yy-r*.4,xx+r*.65,yy);c.stroke();
  }break;
 case 'mountain':
  c.beginPath();c.moveTo(-r*1.5,r);c.lineTo(-r*.35,-r*.8);c.lineTo(r*.13,0);
  c.lineTo(r*.62,-r*1.05);c.lineTo(r*1.5,r);c.stroke();break;
 case 'ocean':
  for(let j=0;j<6;j++){
   c.beginPath();
   for(let i=0;i<=18;i++){
    const xx=(i/18-.5)*r*3,yy=(j-2.5)*r*.27+Math.sin(xx/r*4+time*.6+j)*r*.13;
    if(!i)c.moveTo(xx,yy);else c.lineTo(xx,yy);
   }c.stroke();
  }break;
 case 'memory':
  for(let j=0;j<4;j++){
   c.save();c.rotate((j-2)*.19);
   c.strokeRect((j-2)*r*.28,-r*.65,r*.8,r*.95);c.restore();
  }break;
 case 'geometry':
  for(let i=0;i<5;i++){
   const a=i*TAU/5+time*.04,xx=Math.cos(a)*r,yy=Math.sin(a)*r;
   c.strokeRect(xx-r*.18,yy-r*.18,r*.36,r*.36);
  }break;
 case 'sound':
  for(let i=0;i<5;i++){c.beginPath();c.arc(0,0,r*(.4+i*.2)*(1+.12*p.bass),-Math.PI*.75,Math.PI*.75);c.stroke()}
  break;
 }
 c.restore();
 return motif;
}
