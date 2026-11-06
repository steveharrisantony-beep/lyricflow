/**
 * Produce the core song name shared by lyrics search and automatic video
 * matching. This intentionally strips ALL bracket contents, including genuine
 * title fragments and recording versions, as requested. The raw track title
 * remains available to version and identity validation.
 */
const invisible = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const bracketPairs: Record<string,string> = {'(':')','[':']','{':'}'};
const closingBrackets = new Set([')',']','}']);

function trimEdges(value: string): string {
  return value.replace(/\s+/g,' ')
    .replace(/^[\s\-–—:|•·,"'“”‘’&+]+|[\s\-–—:|•·,"'“”‘’&+]+$/g,'').trim();
}

/** Do not preserve a character inside a bracket pair, even when nested. */
function removeBracketContents(value: string): string {
  const stack:string[]=[];
  let result='';
  for(const char of value){
    if(Object.hasOwn(bracketPairs,char)){stack.push(bracketPairs[char]);continue;}
    if(stack.length){if(char===stack[stack.length-1])stack.pop();continue;}
    if(closingBrackets.has(char))continue;
    result+=char;
  }
  return result;
}

function artistKey(value:string):string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function artistCredits(context:string):string[]{
  return [...new Set(context.split(/\s*[,;]\s*|\s+(?:feat(?:uring)?\.?|ft\.?|with|and|&|×|x|\/)\s+/i)
    .map(v=>v.trim()).filter(v=>v.length>1&&!/^(?:unknown(?: artist)?|youtube|artist|none|-+)$/i.test(v)))];
}
/** A narrowly bounded one-character typo allowance for known artist prefixes. */
function nearExactArtist(left:string,right:string):boolean{
  if(left===right)return true;
  if(Math.min(left.length,right.length)<6||Math.abs(left.length-right.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<left.length&&j<right.length){
    if(left[i]===right[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(left.length>right.length)i++;
    else if(right.length>left.length)j++;
    else{i++;j++;}
  }
  return edits+(i<left.length||j<right.length?1:0)<=1;
}
function isEntireArtistCredit(value:string,artists:string[]):boolean{
  if(!artists.length)return false;
  const parts=artistCredits(value);
  return parts.length>0&&parts.every(part=>artists.some(artist=>nearExactArtist(artistKey(part),artistKey(artist))));
}
function escapeRegExp(value:string):string{
  return value.replace(/[\^$.*+?()[\]{}|]/g,'\\$&').replace(/\s+/g,'\\s+');
}
/** Drop verified trailing artist mentions, with or without punctuation. */
function removeTrailingArtists(value:string,artists:string[]):string{
  let title=value;
  const longestFirst=[...artists].sort((a,b)=>b.length-a.length);
  for(let iteration=0;iteration<longestFirst.length+1;iteration++){
    let changed=false;
    for(const artist of longestFirst){
      const ending=new RegExp('(?:\\s+(?:by|with|and|x)\\s+|\\s*&\\s+|[\\s,;:\\-–—]+)'+escapeRegExp(artist)+'\\s*$','iu');
      const match=ending.exec(title);
      if(!match)continue;
      const remaining=trimEdges(title.slice(0,match.index));
      if(!remaining)continue;
      title=remaining;
      changed=true;
      break;
    }
    if(!changed)break;
  }
  return title;
}

const uploadSuffix = /(?:\s+|[\s\-–—:]+)(?:official\s+(?:(?:music|lyrics?|lyrical)\s+)?(?:video|audio|song)|official\s+(?:lyrics?|lyrical)|music\s+video|lyrics?\s+(?:video|song)|lyrical(?:\s+(?:video|song))?|video\s+song|audio\s+(?:song|track)|full\s+(?:video|song|audio)|visuali[sz]er|sing\s+along|teaser|trailer|promo|jukebox|[48]k|uhd|hd|hq)\s*$/iu;
const versionSuffix = /(?:\s+|[\s\-–—:]+)(?:(?:male|female|tamil|malayalam|hindi|telugu|english|japanese|korean|instrumental|acoustic|studio|radio|album)\s+version|(?:live(?:\s+at\s+.+)?|acoustic|unplugged|instrumental|karaoke|demo|remix(?:ed)?|remaster(?:ed)?|reprise|radio\s+edit|extended\s+(?:version|mix)|sped\s+up|slowed(?:\s*(?:\+|and)\s*reverb)?|reverb)|\d{4}\s+remaster(?:ed)?)\s*$/iu;

/**
 * Single title-cleaning entry point for both lyrics and video matching.
 * When metadata cannot establish an artist prefix, always keep the LEFT
 * nonempty section (e.g. "Blue - Gold" -> "Blue").
 */
export function messytitlefixer(rawTitle:string,artistContext=''):string{
  if(!rawTitle)return '';
  const visible=removeBracketContents(rawTitle.replace(invisible,''))
    .replace(/(^|\s)@[\p{L}\p{M}\p{N}_.-]+(?=\s|[-–—:,|]|$)/gu,'$1')
    .replace(/\s+/g,' ').trim();
  const sections=visible.split(/\s*(?:\||\/\/)\s*|\s+[-–—]\s+/)
    .map(trimEdges).filter(Boolean);
  if(!sections.length)return '';
  const artists=artistCredits(artistContext);
  const chosen=sections.length>1&&isEntireArtistCredit(sections[0],artists)?sections[1]:sections[0];
  let title=trimEdges(chosen);
  // Explicit featured credits can be removed without assuming that a genuine
  // phrase such as "Dancing with a Stranger" is an artist attribution.
  title=title.replace(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+.+$/iu,'');
  title=removeTrailingArtists(title,artists);
  // Strip presentation/version labels only at the END of the selected title.
  // Removing one may expose another, e.g. "Song Lyrics Video 4K".
  for(let i=0;i<6;i++){
    const next=trimEdges(title.replace(uploadSuffix,'').replace(versionSuffix,''));
    if(!next||next===title)break;
    title=removeTrailingArtists(next,artists);
  }
  return trimEdges(title);
}
