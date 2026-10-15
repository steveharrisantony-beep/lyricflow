import {describe,expect,it} from 'vitest';
import {zipSync} from 'fflate';
import {parseSceneArchive} from '../visualization/cinematic/ArtworkPanel';
import {TEMPLATES} from '../visualization/cinematic/catalog';
const fakeWebP=()=>{
 const bytes=new Uint8Array(28);
 for(const [i,v] of [...'RIFF'].entries())bytes[i]=v.charCodeAt(0);
 for(const [i,v] of [...'WEBP'].entries())bytes[i+8]=v.charCodeAt(0);
 return bytes;
};
describe('premium scene artwork import',()=>{
 it('keeps the cinematic library at exactly 30 scene identifiers',()=>{
  expect(TEMPLATES).toHaveLength(30);
 });
 it('maps scene-id.webp filenames directly to the registered scene',()=>{
  const archive=zipSync({'ocean-reverie.webp':fakeWebP(),'rain-on-glass.webp':fakeWebP()});
  const parsed=parseSceneArchive(archive);
  expect([...parsed.keys()]).toEqual(['ocean-reverie','rain-on-glass']);
  expect(parsed.get('ocean-reverie')?.type).toBe('image/webp');
 });
 it('ignores unknown filenames and prevents accidental scene substitution',()=>{
  const archive=zipSync({'unexpected.webp':fakeWebP(),'cloud-cathedral.webp':fakeWebP(),'manifest.json':new TextEncoder().encode('{}')});
  expect([...parseSceneArchive(archive).keys()]).toEqual(['cloud-cathedral']);
 });
 it('refuses archives without recognized scenes',()=>{
  expect(()=>parseSceneArchive(zipSync({'my-picture.webp':fakeWebP()}))).toThrow();
 });
 it('rejects invalid image bytes and oversized upload archives',()=>{
  expect(()=>parseSceneArchive(zipSync({'rain-on-glass.webp':new Uint8Array([0,1,2])}))).toThrow('Invalid WebP');
  expect(()=>parseSceneArchive(new Uint8Array(12_000_001))).toThrow('12 MB');
 });
});
