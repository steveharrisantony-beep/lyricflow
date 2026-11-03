// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {describeLyricProvider} from '../lyrics/ManualLyrics';
import {fetchAppleMusicCandidates} from '../lyrics/appleLyrics';
import {retrievePermittedLyrics} from '../lyrics/providers';
import {LYRIC_ENGINE_OPTIONS} from '../lyrics/lyricFlowEngine';
import {isSyncedLyricsSource,lyricProviderName,normalizeLyricSource} from '../lyrics/sourceLabels';

afterEach(()=>vi.restoreAllMocks());
const track={title:'Sample Song',artist:'Sample Artist',album:'Sample Album',duration:200,source:'manual' as const,confidence:1};
const ttml='<tt><body><div><p begin="1s" end="3s"><span begin="1s" end="2s">Sample</span><span begin="2s" end="3s">words</span></p></div></body></tt>';

it.each([
 ['lrc.red','https://lrc.red/s/TEST00000001.ttml'],
 ['Binimum','https://lyrics-storage.binimum.org/TEST00000001.ttml'],
 ['Paxsenix','https://lyrics.paxsenix.org/apple-music/cache/123'],
 ['Boidu','https://lyrics-api.boidu.dev/getLyrics?s=Sample'],
])('shows %s for both new responses and legacy saved labels', (name,url)=>{
 const badge=describeLyricProvider('Apple Music · Word-Synced TTML ('+name+')',true,true,false,url);
 expect(badge.providerName).toBe(name);expect(badge.detail).toBe(name+' · Word-Synced TTML');
 expect(describeLyricProvider('Apple Library',true,true,false,url).providerName).toBe(name);
 expect(isSyncedLyricsSource(name,url)).toBe(true);
});

it('keeps the real provider when the LyricFlow engine aligns to subtitles',()=>{
 const label='LyricFlow Engine · lrc.red · Word-Synced TTML + YouTube Subtitles';
 expect(describeLyricProvider(label,true,true,false).providerName).toBe('lrc.red');
 expect(normalizeLyricSource(label)).toBe(label);
});

it('does not guess a provider from an old generic label or an Apple catalogue link',()=>{
 expect(lyricProviderName('Apple Library','https://music.apple.com/song/123')).toBeUndefined();
 expect(normalizeLyricSource('Apple Library','https://music.apple.com/song/123')).toBe('Synced lyrics');
 expect(normalizeLyricSource('Custom Apple TTML Override')).toBe('Custom TTML Override');
 expect(isSyncedLyricsSource('LRCLIB','https://lrclib.net/api/get/1')).toBe(false);
});

it('preserves provider labels and actual source links through candidate lookup and selection',async()=>{
 const url='https://lrc.red/s/TEST00000001.ttml';
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({candidates:[{id:-1001,title:'Sample Song',artist:'Sample Artist',album:'Sample Album',duration:200,ttml,sourceLabel:'lrc.red · Word-Synced TTML',url}]})));
 const [candidate]=await fetchAppleMusicCandidates(track);
 expect(candidate).toMatchObject({sourceLabel:'lrc.red · Word-Synced TTML',url,album:'Sample Album'});
 const selected=await retrievePermittedLyrics(candidate);
 expect(selected).toMatchObject({source:'lrc.red · Word-Synced TTML',sourceUrl:url});
 expect(fetcher).toHaveBeenCalledTimes(1); // Embedded TTML is not fetched as a negative LRCLIB ID.
});

it('names the combined source selector accurately while retaining saved engine compatibility',()=>{
 const option=LYRIC_ENGINE_OPTIONS.find(o=>o.id==='apple')!;
 expect(option.label).toBe('lrc.red / Binimum / Paxsenix');
 for(const value of [option.label,option.shortLabel,option.description])expect(value).not.toMatch(/apple/i);
});
