// @vitest-environment jsdom
import {afterEach,describe, expect, it,vi} from 'vitest';
import {Capacitor} from '@capacitor/core';
import {backendOrigin,musicResolverBase} from '../network/backend';

afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});

describe('Android backend configuration', () => {
  it('uses the hosted backend origin for bundled Android assets', () => {
    expect(backendOrigin(' https://music.example.com/ ')).toBe('https://music.example.com');
    expect(backendOrigin('https://music.example.com:8443')).toBe('https://music.example.com:8443');
  });

  it('rejects cleartext, credentials, and ambiguous endpoint URLs', () => {
    for (const value of ['http://music.example.com', 'https://user:pass@music.example.com',
      'https://music.example.com/music', 'https://music.example.com/?token=secret',
      'https://music.example.com/#fragment']) {
      expect(() => backendOrigin(value)).toThrow();
    }
  });

  it('uses the bundled service on Android even with stale hosted settings',()=>{
    vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor,'getPlatform').mockReturnValue('android');
    localStorage.setItem('lyricflow.resolver','https://old-resolver.example/music');
    expect(backendOrigin('https://old-backend.example')).toBe(location.origin);
    expect(musicResolverBase()).toBe(location.origin+'/music');
    expect(musicResolverBase('https://another-resolver.example')).toBe(location.origin+'/music');
  });
});
