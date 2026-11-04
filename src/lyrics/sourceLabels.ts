/** Provider attribution is separate from the persisted engine ID (`apple`). */
export const SYNCED_LYRIC_SOURCES_LABEL='lrc.red / Binimum / Paxsenix';

const providers:[string,RegExp][]=[
 ['lrc.red',/\blrc\.red\b/i],
 ['Binimum',/\bbinimum\b|\bbinilyrics\b/i],
 ['Paxsenix',/\bpaxsenix\b/i],
 ['Boidu',/\bboidu\b/i],
 ['LRCLIB',/\blrclib\b|\blrc\s*library\b/i],
 ['MusixMatch',/\bmusixmatch\b/i],
 ['KuGou',/\bkugou\b/i],
 ['YouTube Subtitles',/youtube\s*subtitles|youtube\.com\/(?:api\/timedtext|watch)/i],
 ['YouTube Music',/youtube\s*music|innertube/i],
];

export function lyricProviderName(source:string,sourceUrl=''):string|undefined{
 // A catalogue link (e.g. music.apple.com) is not the lyric provider. Only
 // known lyric-service URLs may supply attribution missing from old labels.
 const namedProvider=providers.find(([,pattern])=>pattern.test(source));
 return namedProvider?.[0]||providers.find(([,pattern])=>pattern.test(sourceUrl))?.[0];
}

export function normalizeLyricSource(source:string,sourceUrl='',wordTiming?:boolean):string{
 const raw=(source||'').trim(),provider=lyricProviderName(raw,sourceUrl);
 if(!raw)return provider||'Synced lyrics';
 const verifiedLabel=wordTiming===false?raw.replace(/\bWord[- ]Synced\b/gi,'Line-Synced'):raw;
 const custom=verifiedLabel.replace(/\bCustom Apple TTML\b/gi,'Custom TTML');
 let label=custom.replace(/\bApple(?:\s+(?:Music|Library))?\b/gi,provider||'Synced lyrics');
 if(provider){
  const escaped=provider.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  label=label.replace(new RegExp('\\s*\\('+escaped+'\\)','gi'),'');
 }
 return label.trim();
}

export function isSyncedLyricsSource(source:string,sourceUrl=''){
 const name=lyricProviderName(source,sourceUrl);
 return ['lrc.red','Binimum','Paxsenix','Boidu'].includes(name||'')||/\bapple\b|\bsynced lyrics\b/i.test(source);
}
