import {describe,it,expect} from 'vitest';
import {TEMPLATES,AUDIO_ONLY_SCENES,VOXELWALL_CATEGORIES,buildCinematicSchedule,sceneAt,resolveThemePalette} from '../visualization/cinematic/catalog';
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

describe('VoxelWall cinematic scene catalog',()=>{
 it('provides 28 distinct VoxelWall music-reactive templates across 8 categories with multi-palette support and no duplicate color-swap clones',()=>{
  expect(TEMPLATES).toHaveLength(28);
  expect(new Set(TEMPLATES.map(t=>t.id)).size).toBe(28);
  expect(new Set(TEMPLATES.map(t=>t.family)).size).toBe(VOXELWALL_CATEGORIES.length);
  expect(new Set(TEMPLATES.map(t=>t.background)).size).toBe(28);
  const ids=TEMPLATES.map(t=>t.id as string);
  expect(ids).not.toContain('crimson-impact');
  expect(ids).not.toContain('vinyl-groove');
  expect(ids).not.toContain('glass-architecture');
  expect(ids).not.toContain('liquid-filigree');
  expect(ids).not.toContain('crimson-current');
  expect(ids).not.toContain('silk-waves');
  expect(ids).not.toContain('molten-contours');
  expect(ids).not.toContain('layered-contours');
  expect(ids).not.toContain('pearl-resonance');
  expect(ids).not.toContain('orbital-score');
  expect(ids).not.toContain('silver-current');
  expect(ids).not.toContain('white-velocity');
  for(const item of TEMPLATES){
   expect(item.palettes.length).toBeGreaterThanOrEqual(4);
   for(const pal of item.palettes){
    const resolved=resolveThemePalette(item.id,pal.id);
    expect(resolved.id).toBe(pal.id);
    expect(resolved.background).toMatch(/^#[0-9a-f]{6}$/i);
   }
  }
 });
 it('gives every scene a valid bundled premium font pack',()=>{
  for(const item of TEMPLATES){
   expect(fontLabel(item.font).length).toBeGreaterThan(3);
   expect(fontSpec(item.font,48,'PREMIUM LYRICS')).toContain(fontLabel(item.font));
  }
  expect(FONT_SHOWCASE.length).toBe(11);
  expect(new Set(FONT_SHOWCASE.map(fontLabel)).size).toBe(11);
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
 it('randomizes all enabled themes without genre or mood weighting, visiting each before repeats',()=>{
  const selected=TEMPLATES.slice(0,5).map(t=>t.id);
  const lines=Array.from({length:30},(_,i)=>({time:i*3,text:'Original demo line '+i}));
  const cues=buildCues(lines,[]);
  const water=analyzeSections(lines,'Ballad'),fire=water.map(section=>({...section,mood:'fire' as const,energy:1}));
  const a=buildCinematicSchedule(water,cues,'Ballad','fair-shuffle',selected,1);
  const b=buildCinematicSchedule(fire,cues,'EDM','fair-shuffle',selected,1);
  expect(a.map(s=>s.id)).toEqual(b.map(s=>s.id));
  for(let i=0;i<a.length;i+=selected.length)expect(new Set(a.slice(i,i+selected.length).map(s=>s.id))).toEqual(new Set(selected));
  expect(a.every((s,i)=>!i||s.id!==a[i-1].id)).toBe(true);
 });
 it('supports seeking without animating through missing sections',()=>{
  const directed=buildCinematicSchedule(sections,cues,'','seek-test');
  expect(sceneAt(directed,directed[1].start+.2)?.id).toBe(directed[1].id);
  expect(sceneAt(directed,-15)).toBeNull();
 });
 it('has 28 distinct audio-only fallback environments',()=>{
  expect(AUDIO_ONLY_SCENES).toHaveLength(28);
  expect(new Set(AUDIO_ONLY_SCENES).size).toBe(AUDIO_ONLY_SCENES.length);
 });
});

