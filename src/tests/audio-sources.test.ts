import {describe,it,expect} from 'vitest';
import {connectExternalAudio,getInputSource,readLocalAudio,getAudioFrequencyBands,connectMicrophoneAudio,feedExternalVisualizerData} from '../audio/audioSignal';

describe('browser-permitted additional audio inputs',()=>{
 const analyser={fftSize:2048,frequencyBinCount:1024} as AnalyserNode;
 it('selects user-consented system capture using the shared 64-band analyser',()=>{
  connectExternalAudio(analyser,'SYSTEM AUDIO');
  expect(getInputSource()).toBe('SYSTEM AUDIO');
  expect(getAudioFrequencyBands()).toHaveLength(64);
  connectExternalAudio(null);
  expect(getInputSource()).toBe('IDLE');
 });
 it('names direct-stream radio input separately',()=>{
  connectExternalAudio(analyser,'INTERNET RADIO');
  expect(getInputSource()).toBe('INTERNET RADIO');
  connectExternalAudio(null);
  expect(getInputSource()).toBe('IDLE');
 });
 it('releases a disconnected input without continuing to sample it',()=>{
  connectExternalAudio(analyser,'INTERNET RADIO');
  connectExternalAudio(null);
  expect(readLocalAudio(2000)).toBeNull();
  connectMicrophoneAudio(null);
 });
 it('feeds Android internal audio visualizer bytes into INTERNAL AUDIO 64-band analysis',()=>{
  const wave=new Array(128).fill(180);
  const fft=new Array(128).fill(60);
  feedExternalVisualizerData(wave,fft,'INTERNAL AUDIO');
  expect(getInputSource()).toBe('INTERNAL AUDIO');
  const frame=readLocalAudio(3000);
  expect(frame).not.toBeNull();
  expect(frame?.bands).toHaveLength(64);
  expect(frame?.loudness).toBeGreaterThan(0);
  feedExternalVisualizerData(null,null,'INTERNAL AUDIO');
  expect(getInputSource()).toBe('IDLE');
 });
});