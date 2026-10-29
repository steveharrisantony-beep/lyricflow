/** Precomputed lyric sections: no model calls or text interpretation on animation frames. */
export type Mood='cosmic'|'water'|'warm'|'fire'|'solitude'|'celebration'|'abstract'|'memory'|'nature';
export type FontStyle='editorial'|'grotesk'|'mono'|'expressive';
export type MotionStyle='drift'|'surge'|'orbit'|'scatter'|'pulse'|'recede';
export interface ScenePlan {
 start:number;end:number;mood:Mood;font:FontStyle;motion:MotionStyle;
 camera:'orbit'|'dolly'|'side'|'top'|'pullback';confidence:number;
 palette:number;reason:string;energy:number;
}
type TimedLine={time:number;text:string};
const moodDictionary:Record<Exclude<Mood,'abstract'>,readonly string[]>={
 water:['rain','drizzle','storm','river','ocean','water','sea','waves','tears','flood','monsoon','മഴ','കടൽ','நீர்','மழை','बारिश','समंदर'],
 cosmic:['stars','starry','galaxy','moon','moonlight','planet','sky','cosmos','space','universe','constellation','night sky','നക്ഷത്ര','നിലാവ്','நிலா','வானம்','चाँद','तारे'],
 warm:['love','beloved','kiss','embrace','tender','darling','affection','heart','in my arms','പ്രണയ','സ്നേഹം','காதல்','அன்பு','प्यार','दिल'],
 fire:['fire','flames','burning','rage','furious','burn','angry','lightning','thunder','ashes','തീ','കോപം','நெருப்பு','தீ','आग'],
 solitude:['alone','lonely','empty','goodbye','without you','farewell','no one','missing you','silence','isolated','ഒറ്റയ്ക്ക്','വിരഹം','தனிமை','अकेला'],
 celebration:['dance','celebrate','party','festival','cheer','sing along','victory','we made it','together tonight','ആഘോഷം','ஆட்டம்','खुशी','जश्न'],
 memory:['remember','remembered','memories','yesterday','used to','forgot','nostalgia','childhood','old days','ഓർമ്മ','நினைவு','यादें'],
 nature:['breeze','wind','forest','trees','mountains','flower','bloom','leaf','earth','garden','പൂവ്','കാറ്റ്','மலர்','காற்று','फूल']
};
const palette:Record<Mood,number>={cosmic:0x8f91ff,water:0x57c8ea,warm:0xffc090,fire:0xff7458,solitude:0x95a6bc,celebration:0xf8b2e7,abstract:0x89dce4,memory:0xcabbd9,nature:0x9ad6aa};
const font:Record<Mood,FontStyle>={cosmic:'grotesk',water:'editorial',warm:'editorial',fire:'expressive',solitude:'mono',celebration:'expressive',abstract:'grotesk',memory:'editorial',nature:'editorial'};
export function fontForGenre(genre:string):FontStyle|null{
 const name=genre.trim().toLowerCase();
 if(!name)return null;
 if(/classical|ballad|cinematic|acoustic|folk/.test(name))return 'editorial';
 if(/rock|metal|punk/.test(name))return 'expressive';
 if(/hip.?hop|rap|trap/.test(name))return 'mono';
 if(/edm|dance|electronic|pop|synth/.test(name))return 'grotesk';
 return null;
}
const motion:Record<Mood,MotionStyle>={cosmic:'orbit',water:'surge',warm:'drift',fire:'scatter',solitude:'recede',celebration:'pulse',abstract:'orbit',memory:'drift',nature:'drift'};
const camera:Record<Mood,ScenePlan['camera']>={cosmic:'orbit',water:'side',warm:'dolly',fire:'top',solitude:'pullback',celebration:'orbit',abstract:'orbit',memory:'dolly',nature:'side'};
function score(text:string){
 const lower=text.toLocaleLowerCase();
 const scores={} as Record<Mood,number>;
 for(const m of Object.keys(moodDictionary) as (keyof typeof moodDictionary)[]){
  let total=0;
  for(const word of moodDictionary[m]){
    if(lower.includes(word)){
     let points=word.includes(' ')?2.4:1.4;
     const index=lower.indexOf(word);
     const left=lower.slice(Math.max(0,index-22),index);
     if(/\b(no|not|never|without|isn't|aren't|don't)\s*$/.test(left))points*=.25;
     total+=points;
    }
  }scores[m]=total;
 }
 scores.abstract=.2;
 return scores;
}
export function analyzeSections(lines:TimedLine[],genre?:string):ScenePlan[]{
 if(!lines.length)return [];
 const windows:{start:number;end:number;text:string}[]=[];
 let start=0;
 for(let i=0;i<lines.length;i++){
  const next=lines[i+1]?.time??lines[i].time+5;
  const elapsed=next-lines[start].time;
  if((i-start>=2&&elapsed>=9)||i-start>=4||i===lines.length-1){
   windows.push({start:lines[start].time,end:next,text:lines.slice(start,i+1).map(x=>x.text).join(' ')});
   start=i+1;
  }
 }
 const results:ScenePlan[]=[];let previous:Mood='abstract';
 for(const [i,window] of windows.entries()){
  const scores=score(window.text);
  if(i>0)scores[previous]+=0.65; // continuity across adjacent sections
  const best=(Object.keys(scores) as Mood[]).sort((a,b)=>scores[b]-scores[a]);
  let mood=best[0]||'abstract';
  if(scores[mood]<1.15)mood=previous;
  if(mood==='abstract'&&genre){
   const g=genre.toLowerCase();
   if(/ambient|dream|lofi|chill/.test(g))mood='memory';
   if(/dance|edm|disco|party/.test(g))mood='celebration';
   if(/metal|hard rock/.test(g))mood='fire';
  }
  const winning=scores[mood]||0,runner=scores[best[1]||'abstract']||0;
  const confidence=mood==='abstract'?.15:Math.min(.88,.35+(winning-runner)*.12+winning*.045);
  const energy=mood==='celebration'||mood==='fire'?.87:mood==='solitude'?.18:mood==='memory'?.34:.55;
  const plan:ScenePlan={start:window.start,end:window.end,mood,font:fontForGenre(genre||'')||font[mood],motion:motion[mood],camera:camera[mood],confidence,palette:palette[mood],reason:mood==='abstract'?'No clear lyric imagery':'Section-level imagery and mood',energy};
  results.push(plan);previous=mood;
 }
 return results;
}
export function planAt(sections:ScenePlan[],time:number):ScenePlan|null{
 if(!sections.length)return null;
 for(let i=sections.length-1;i>=0;i--)if(time>=sections[i].start)return sections[i];
 return null;
}
