import {describe,it,expect,vi} from 'vitest';
import {analyzeLyricWords,wordEmphasis} from '../lyrics/wordEmphasis';
import {buildCues,setLyricTimeline,getLyricTimelineSnapshot,getLyricState} from '../lyrics/lyricTimeline';
import {drawKineticLyrics,lyricRuns,lyricMotionFor,LYRIC_MOTIONS,computeBackgroundAdaptiveLyricColors,resolveLyricFillPace} from '../visualization/cinematic/kineticTypography';
import {MusicCameraRig,makeLyricProjection} from '../visualization/cinematic/cameraRig';
import {transitionProgress} from '../visualization/cinematic/transitions';
import {TEMPLATES,type DirectedScene} from '../visualization/cinematic/catalog';
import {fontSpec,FONT_SHOWCASE} from '../visualization/cinematic/fonts';
const source=[{time:0,text:'Let the thunder roll'},{time:3,text:'Thunder calls us home'},{time:6,text:'Feel the THUNDER again'}];
const cues=buildCues(source,[]),emphasis=analyzeLyricWords(cues);
const t=TEMPLATES[0],scene:DirectedScene={...t,start:0,end:12,variation:2,section:0,reason:'test'};
const quiet={loudness:0,bass:0,mids:0,treble:0,beat:0,onset:0,downbeat:0};
function context(){
 const c={font:'800 50px sans-serif',canvas:{width:1000,height:600},save:vi.fn(),restore:vi.fn(),transform:vi.fn(),
  fillText:vi.fn(),strokeText:vi.fn(()=>{throw Error('Outlined lyrics are not allowed')}),
  getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
  measureText(text:string){return {width:text.length*(parseFloat(this.font.match(/([\d.]+)px/)?.[1]||'50'))*.56}}};
 return c as unknown as CanvasRenderingContext2D;
}
describe('whole-song emphasis',()=>{
 it('ranks repeated content words while filtering common words and punctuation',()=>{
  expect(emphasis.counts.get('thunder')).toBe(3);expect(emphasis.keywords[0]).toBe('thunder');
  expect(wordEmphasis(emphasis,'THUNDER!')).toBeGreaterThan(.8);expect(wordEmphasis(emphasis,'the')).toBe(0);
  expect(wordEmphasis(emphasis,'roll')).toBe(0);
 });
 it('preserves Indic word clusters and does not double-count identical romanization',()=>{
  const a=analyzeLyricWords([{text:'മഴ മഴ',romanized:'rain rain'},{text:'മഴ',romanized:'rain'}]);
  expect(a.counts.get('മഴ')).toBe(3);expect(wordEmphasis(a,'മഴ')).toBeGreaterThan(0);
  expect(analyzeLyricWords([{text:'Thunder',romanized:'Thunder'}]).counts.get('thunder')).toBe(1);
 });
 it('retains word timestamps and highlights from the complete song',()=>{
  const runs=lyricRuns(cues[0],'original',emphasis);expect(runs.map(w=>w.text).join(' ')).toBe(source[0].text);
  expect(runs[2].importance).toBeGreaterThan(0);expect(runs[2].start).toBe(cues[0].words[2].start);
 });
});
describe('single-phrase typography & sequential lyric colour engine',()=>{
 it('renders line-synced lyrics in a single uniform background-adaptive colour without predicting word-by-word colour changes',()=>{
  const c=context(),result=drawKineticLyrics({c,scene,cue:cues[0],time:1,mode:'both',w:1000,h:600,intensity:.8,reduced:false,emphasis});
  expect(result.drawn).toBe(4);
  expect(result.fillPace).toBe('line');
  expect(vi.mocked(c.fillText).mock.calls.map(call=>call[0])).toEqual(['Let','the','thunder','roll']);
  expect(c.strokeText).not.toHaveBeenCalled();
 });
 it('selects letter-by-letter fill for slow songs and word-by-word fill for fast songs when word-sync data exists',()=>{
  const slowSourced=buildCues([{time:0,text:'Hold me close',words:[
   {text:'Hold',start:0,end:1.1,timing:'sourced'},{text:'me',start:1.1,end:2.2,timing:'sourced'},{text:'close',start:2.2,end:3.4,timing:'sourced'}
  ]}],[]);
  const fastSourced=buildCues([{time:0,text:'Run through the fire right now tonight',words:[
   {text:'Run',start:0,end:.18,timing:'sourced'},{text:'through',start:.18,end:.36,timing:'sourced'},{text:'the',start:.36,end:.5,timing:'sourced'},
   {text:'fire',start:.5,end:.68,timing:'sourced'},{text:'right',start:.68,end:.84,timing:'sourced'},{text:'now',start:.84,end:1.0,timing:'sourced'},{text:'tonight',start:1.0,end:1.2,timing:'sourced'}
  ]}],[]);
  expect(resolveLyricFillPace(slowSourced[0].words,88)).toBe('letter');
  expect(resolveLyricFillPace(fastSourced[0].words,148)).toBe('word');
  const colors=computeBackgroundAdaptiveLyricColors('#050814','#f8fafc','#22d3ee');
  expect(colors.baseColor).not.toBe(colors.sungColor);
 });
 it('uses one Romanized phrase when that mode is selected',()=>{
  const c=context();drawKineticLyrics({c,scene,cue:{...cues[0],romanized:'Mazha peyyunnu'},time:1,mode:'romanized',w:1000,h:600,intensity:1,reduced:false,emphasis});
  expect(vi.mocked(c.fillText).mock.calls.map(call=>call[0])).toEqual(['Mazha','peyyunnu']);
 });
 it('keeps all choreography choices deterministic and uses heavy typefaces',()=>{
  expect(new Set(Array.from({length:120},(_,i)=>lyricMotionFor({...scene,variation:i},'Phrase '+i))).size).toBe(LYRIC_MOTIONS.length);
  for(const font of FONT_SHOWCASE)expect(fontSpec(font,70,'Thunder')).not.toMatch(/Italiana|Poiret|Cormorant|Michroma|Marcellus|Bodoni|Caveat/);
  expect(fontSpec('ultra',70,'Thunder')).toContain('800');
 });
 it('clears finished lyrics naturally before long instrumental music gaps instead of holding the previous line',()=>{
  const gapped=buildCues([{time:0,text:'First line before solo'},{time:28,text:'Back after solo'}],[]);
  expect(gapped[0].end).toBeLessThanOrEqual(5);
  setLyricTimeline(gapped);
  expect(getLyricState(1.5).cue?.text).toBe('First line before solo');
  expect(getLyricState(12).cue).toBeNull();
  setLyricTimeline([]);
 });
});
describe('music camera and continuity',()=>{
 it('triggers smooth shake strictly when bass exceeds the sensitivity-controlled threshold and respects shake toggle',()=>{
  const rig=new MusicCameraRig();rig.sample(0,quiet,1,false);
  // Loud mids/treble with low bass below the threshold should NOT shake the camera
  const loudNoBass=rig.sample(.05,{...quiet,loudness:.95,bass:.12,mids:.9,treble:.85,beat:1,onset:1},1,false,0,true,50);
  expect(loudNoBass.impact).toBe(0);
  expect(loudNoBass.x).toBe(0);
  expect(loudNoBass.y).toBe(0);
  // Sensitivity controls bass threshold: bass=0.35 does not trigger at low sensitivity (20%) but triggers at high sensitivity (90%)
  const lowSens=rig.sample(.1,{...quiet,loudness:.7,bass:.35},1,false,0,true,20);
  expect(lowSens.impact).toBe(0);
  const highSens=rig.sample(.15,{...quiet,loudness:.7,bass:.35},1,false,0,true,90);
  expect(highSens.impact).toBeGreaterThan(0);
  // Strong bass triggers smooth shake and decays smoothly when bass drops
  const hit=rig.sample(.25,{...quiet,loudness:.8,bass:.95},1,false,0,true,80);
  const tail=rig.sample(.75,{...quiet,loudness:.8,bass:0},1,false,0,true,80);
  expect(hit.impact).toBeGreaterThan(tail.impact);
  const shakeOff=rig.sample(.85,{...quiet,loudness:.9,bass:1,beat:1,onset:1},1,false,0,false,80);
  expect(shakeOff.impact).toBe(0);
  expect(rig.sample(.95,{...quiet,bass:1},1,true)).toMatchObject({zoom:1,x:0,y:0,roll:0,impact:0});
  const projection=makeLyricProjection(1000,600,hit);expect(projection(0,0,0).visible).toBe(true);
 });
 it('finishes a transition after elapsed real time even if render frames were skipped',()=>{
  expect(transitionProgress(10,10)).toBe(0);expect(transitionProgress(10.22,10)).toBeCloseTo(.5);
  expect(transitionProgress(10.8,10)).toBe(1);
 });
 it('uses current playback position through a cut/seek and keeps full-song analysis stable',()=>{
  setLyricTimeline(cues);const original=getLyricTimelineSnapshot().emphasis;
  expect(getLyricState(3.05).cue?.text).toBe(source[1].text);
  expect(getLyricState(6.4).cue?.text).toBe(source[2].text);
  setLyricTimeline(cues,-.5);expect(getLyricTimelineSnapshot().emphasis).toBe(original);
  expect(getLyricState(3.05).cue?.text).toBe(source[0].text);setLyricTimeline([]);
 });
});
