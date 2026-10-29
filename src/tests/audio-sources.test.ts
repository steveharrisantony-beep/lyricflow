import {describe,it,expect} from 'vitest';
import {connectExternalAudio,getInputSource,readLocalAudio,getAudioFrequencyBands,connectMicrophoneAudio} from '../audio/audioSignal';

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
});