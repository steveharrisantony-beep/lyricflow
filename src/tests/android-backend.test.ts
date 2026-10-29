import {describe, expect, it} from 'vitest';
import {backendOrigin} from '../network/backend';

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
});
