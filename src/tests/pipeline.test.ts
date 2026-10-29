import {describe,it,expect} from 'vitest';
import {parseTrackFilename,rankCandidate} from '../metadata/trackInfo';
import {parseLRC} from '../lyrics/lrc';
import {buildCues} from '../lyrics/lyricTimeline';
import {analyzeSections} from '../lyrics/sceneDirector';
import {detectLanguage,romanizeText} from '../romanization/romanize';

describe('track identity',()=>{
 it('strips audio tags without inventing an artist',()=>{
  const result=parseTrackFilename('Animals(MP3_320K).mp3');
  expect(result.title).toBe('Animals');
  expect(result.artist).toBe('');
  expect(result.confidence).toBeLessThan(.5);
 });
 it('parses artist - title filenames',()=>{
  const r=parseTrackFilename('Sample Artist - Northern Lights.mp3');
  expect(r.artist).toBe('Sample Artist');
  expect(r.title).toBe('Northern Lights');
 });
 it('penalizes mismatched duration',()=>{
  const t={...parseTrackFilename('Example - Song.mp3'),duration:182};
  const same=rankCandidate(t,{id:1,trackName:'Song',artistName:'Example',albumName:'',duration:181,instrumental:false,syncedLyrics:null});
  const other=rankCandidate(t,{id:2,trackName:'Song',artistName:'Example',albumName:'',duration:281,instrumental:false,syncedLyrics:null});
  expect(same.confidence).toBeGreaterThan(other.confidence);
 });
});
describe('timed lyric parsing',()=>{
 it('reads multiple line timestamps',()=>{
  expect(parseLRC('[00:01.00][00:03.00]Hello').map(x=>x.time)).toEqual([1,3]);
 });
 it('preserves supplied enhanced LRC word starts',()=>{
  const [line]=parseLRC('[00:00.00]<00:00.25>Hello <00:00.80>world');
  expect(line.text).toBe('Hello world');
  expect(line.words?.[0].start).toBe(.25);
  expect(buildCues([line],[])[0].timing).toBe('sourced');
 });
 it('labels inferred words rather than pretending exact alignment',()=>{
  const [line]=parseLRC('[00:00.00]hello world');
  expect(buildCues([line],[])[0].timing).toBe('estimated');
 });
});
describe('lyrics scene director',()=>{
 it('uses coherent sections instead of switching on each word',()=>{
  const sections=analyzeSections([
   {time:0,text:'Rain falls on my river'},{time:4,text:'The ocean keeps moving'},{time:10,text:'Water all around'},
   {time:18,text:'The fire is rising'},{time:24,text:'Flames and burning embers'},{time:30,text:'The flames burn'}
  ]);
  expect(sections.length).toBeGreaterThanOrEqual(2);
  expect(sections[0].mood).toBe('water');
  expect(sections[sections.length-1].mood).toBe('fire');
 });
});
describe('Indic romanization',()=>{
 it('recognizes Malayalam and preserves original text',()=>{
  const original='മഴ';
  expect(detectLanguage(original)).toBe('Malayalam');
  const result=romanizeText(original);
  expect(result.changed).toBe(true);
  expect(result.text).not.toBe(original);
  expect(original).toBe('മഴ');
 });
 it('does not damage existing English lyrics',()=>{
  expect(romanizeText('[00:01.00]Hello, world!').text).toBe('[00:01.00]Hello, world!');
 });
});
