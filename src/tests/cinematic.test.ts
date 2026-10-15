import {describe,it,expect} from 'vitest';
import {TEMPLATES,AUDIO_ONLY_SCENES,buildCinematicSchedule,sceneAt,byId} from '../visualization/cinematic/catalog';
import {buildCues} from '../lyrics/lyricTimeline';
import {analyzeSections} from '../lyrics/sceneDirector';
import {fontLabel,FONT_SHOWCASE,fontSpec} from '../visualization/cinematic/fonts';

const sample=Array.from({length:48},(_,i)=>({
 time:i*4,
 text:i%4===0?'Rain in the river and ocean':i%4===1?'Water all around me':
 i%4===2?'The storm is passing':'The waves carry me away'
}));
const cues=buildCues(sample,[]);
const sections=analyzeSections(sample);

describe('cinematic scene catalog',()=>{
 it('provides forty original cinematic templates',()=>{
  expect(TEMPLATES).toHaveLength(40);
  expect(new Set(TEMPLATES.map(t=>t.id)).size).toBe(40);
  expect(new Set(TEMPLATES.map(t=>t.family)).size).toBeGreaterThanOrEqual(20);
  expect(new Set(TEMPLATES.map(t=>t.background)).size).toBe(40);
 });
 it('gives every scene a valid bundled premium font pack',()=>{
  for(const item of TEMPLATES){
   expect(fontLabel(item.font).length).toBeGreaterThan(3);
   expect(fontSpec(item.font,48,'PREMIUM LYRICS')).toContain(fontLabel(item.font));
  }
  expect(FONT_SHOWCASE.length).toBeGreaterThanOrEqual(17);
  expect(new Set(TEMPLATES.map(t=>t.font)).size).toBeGreaterThanOrEqual(15);
 });
 it('supports deterministic scene plans for identical songs',()=>{
  const a=buildCinematicSchedule(sections,cues,'Ballad','sample');
  const b=buildCinematicSchedule(sections,cues,'Ballad','sample');
  expect(a).toEqual(b);
  expect(a.length).toBeGreaterThan(5);
 });
 it('does not repeat a template within the previous three slots',()=>{
  const directed=buildCinematicSchedule(sections,cues,'Ambient','rain-song');
  for(let i=0;i<directed.length;i++){
   const previous=directed.slice(Math.max(0,i-3),i).map(s=>s.id);
   expect(previous).not.toContain(directed[i].id);
  }
 });
 it('selects appropriate mood candidates',()=>{
  const directed=buildCinematicSchedule(sections,cues,'Ballad','water-song');
  expect(byId[directed[0].id].moods).toContain('water');
 });
 it('supports seeking without animating through missing sections',()=>{
  const directed=buildCinematicSchedule(sections,cues,'','seek-test');
  expect(sceneAt(directed,directed[1].start+.2)?.id).toBe(directed[1].id);
  expect(sceneAt(directed,-15)).toBeNull();
 });
 it('has several distinct audio-only fallback environments',()=>{
  expect(AUDIO_ONLY_SCENES.length).toBeGreaterThanOrEqual(12);
  expect(new Set(AUDIO_ONLY_SCENES).size).toBe(AUDIO_ONLY_SCENES.length);
 });
});
