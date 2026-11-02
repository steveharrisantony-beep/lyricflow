const luminanceCache=new Map<string,number>();
const chromaticCache=new Map<string,string>();

/** WCAG luminance: keep text polarity consistent with the actual scene surface. */
export function luminance(hex:string){
 const cached=luminanceCache.get(hex);
 if(cached!==undefined)return cached;
 const rgb=hex.replace('#','');
 const values=[0,2,4].map(i=>parseInt(rgb.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const lum=values[0]*.2126+values[1]*.7152+values[2]*.0722;
 if(luminanceCache.size<512)luminanceCache.set(hex,lum);
 return lum;
}
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function readableInk(background:string,preferred?:string){
 if(preferred&&/^#[a-f0-9]{6}$/i.test(preferred)&&contrastRatio(background,preferred)>=4.5)return preferred;
 return contrastRatio(background,'#fffaf2')>=contrastRatio(background,'#151820')?'#fffaf2':'#151820';
}

function blendHex(hexA:string,hexB:string,t:number):string{
 const a=hexA.replace('#',''),b=hexB.replace('#','');
 const ch=[0,2,4].map(i=>{
  const va=parseInt(a.slice(i,i+2),16),vb=parseInt(b.slice(i,i+2),16);
  return Math.round(va+(vb-va)*t).toString(16).padStart(2,'0');
 });
 return '#'+ch.join('');
}

/** Preserve chromatic lyric colors while guaranteeing legibility over dynamic 3D/2D surfaces. */
export function readableChromaticInk(background:string,preferred?:string):string{
 const key=`${background}|${preferred||''}`;
 const hit=chromaticCache.get(key);
 if(hit)return hit;
 let result:string;
 if(!preferred||!/^#[a-f0-9]{6}$/i.test(preferred)){
  result=readableInk(background,preferred);
 }else if(contrastRatio(background,preferred)>=3.0){
  result=preferred;
 }else{
  const pole=luminance(background)<0.38?'#ffffff':'#101521';
  result=readableInk(background,preferred);
  for(const mix of [0.22,0.38,0.52,0.68]){
   const candidate=blendHex(preferred,pole,mix);
   if(contrastRatio(background,candidate)>=3.2){result=candidate;break;}
  }
 }
 if(chromaticCache.size<1024)chromaticCache.set(key,result);
 return result;
}

const backdrops=new WeakMap<CanvasRenderingContext2D,{data:Uint8ClampedArray;width:number;height:number}>();
export function setLyricBackdrop(c:CanvasRenderingContext2D,pixels:ImageData|null){
 if(pixels)backdrops.set(c,{data:pixels.data,width:pixels.width,height:pixels.height});
 else backdrops.delete(c);
}
/** Sample the scene beneath the text. Keep solid typography free of stroked outlines. */
export type TextGlow={color:string;blur:number};
export function paintLyric(c:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,preferred:string,surface?:string,fill?:CanvasGradient,glow?:TextGlow){
 const backdrop=backdrops.get(c),m=c.getTransform();
 if(!surface&&backdrop){
  const width=Math.min(maxWidth,c.measureText(text).width);
  const center=x+(c.textAlign==='left'||c.textAlign==='start'?width/2:c.textAlign==='right'||c.textAlign==='end'?-width/2:0);
  const px=(m.a*center+m.c*y+m.e)/c.canvas.width,py=(m.b*center+m.d*y+m.f)/c.canvas.height;
  const samples:{rgb:number[];light:number}[]=[];
  const span=Math.max(.02,width*Math.abs(m.a)/c.canvas.width);
  for(let i=-3;i<=3;i++){
   const sx=Math.max(0,Math.min(backdrop.width-1,Math.floor((px+i*span/7)*backdrop.width))),sy=Math.max(0,Math.min(backdrop.height-1,Math.floor(py*backdrop.height)));
   const index=(sy*backdrop.width+sx)*4,rgb=Array.from(backdrop.data.slice(index,index+3));
   samples.push({rgb,light:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722});
  }
  samples.sort((a,b)=>a.light-b.light);
  surface='#'+samples[3].rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
 }
 const ink=readableChromaticInk(surface||'#101521',preferred);
 c.save();
 c.shadowColor=glow?.color||(luminance(ink)<.25?'rgba(255,250,242,.28)':'rgba(0,0,0,.62)');
 c.shadowBlur=glow?.blur||3;
 c.shadowOffsetY=glow?0:1.5;
 c.fillStyle=fill||ink;
 c.fillText(text,x,y,maxWidth);
 c.restore();
}

export interface AlbumArtLyricPalette {
 baseColor: string;
 sungColor: string;
 accentHex: string;
 /** Several distinct, light artwork colours retained for the whole song. */
 colors: string[];
 /** More saturated, contrast-checked colours for already sung words. */
 sungColors: string[];
}

/** Enforce light text over video even for very dark or saturated artwork. */
export function lightLyricColor(hex:string,minLuminance=.60):string{
 if(!/^#[a-f0-9]{6}$/i.test(hex))return '#f8fafc';
 if(luminance(hex)>=minLuminance)return hex;
 for(let mix=.08;mix<=1.001;mix+=.08){
  const candidate=blendHex(hex,'#ffffff',Math.min(1,mix));
  if(luminance(candidate)>=minLuminance)return candidate;
 }
 return '#ffffff';
}

/** Retain album hue and saturation without whitening the sung accent into a pastel. */
export function vibrantLyricColor(hex:string,background='#07090e'):string{
 const rgb=hex.replace('#','');
 const [h,s,l]=rgbToHsl(...[0,2,4].map(i=>parseInt(rgb.slice(i,i+2),16)) as [number,number,number]);
 const candidate=hslToHex(h,s<.1?s:Math.max(.80,Math.min(.95,s*1.2)),s<.1?Math.max(.56,Math.min(.8,l-.12)):Math.max(.5,Math.min(.62,l-.22)));
 for(let mix=0;mix<=1;mix+=.04){
  const value=blendHex(candidate,'#ffffff',mix);
  if(contrastRatio(background,value)>=4.5)return value;
 }
 return '#f8fafc';
}

/** Stable per-line selection; colours never flicker on successive render frames. */
export function albumColorsForLine(palette:AlbumArtLyricPalette,lineKey:string){
 let seed=0;for(const ch of lineKey)seed=(Math.imul(seed,31)+ch.charCodeAt(0))>>>0;
 const colors=palette.colors.length?palette.colors:[palette.baseColor];
 const sung=palette.sungColors?.length?palette.sungColors:colors.map(color=>vibrantLyricColor(color));
 const offset=seed%sung.length;
 const sungColors=sung.map((_,i)=>sung[(i+offset)%sung.length]);
 return {baseColor:lightLyricColor(colors[seed%colors.length]),sungColor:sungColors[0],sungColors};
}

/** Weighted colour buckets keep several hues from the image, rather than only its dominant hue. */
export function paletteFromArtworkPixels(data:Uint8ClampedArray):AlbumArtLyricPalette|null{
 const buckets=new Map<string,{r:number;g:number;b:number;count:number;saturation:number}>();
 let opaque=0,sumR=0,sumG=0,sumB=0;
 for(let i=0;i<data.length;i+=4){
  const r=data[i],g=data[i+1],b=data[i+2];
  if(data[i+3]<128)continue;
  opaque++;sumR+=r;sumG+=g;sumB+=b;
  const [h,s,l]=rgbToHsl(r,g,b);
  // Keep neutral artwork too: it should yield silver/cream, not an invented bright hue.
  if(l<.045||l>.97)continue;
  const key=s<.12?'neutral':String(Math.floor(h*24));
  const bucket=buckets.get(key)||{r:0,g:0,b:0,count:0,saturation:0};
  bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.count++;bucket.saturation+=s;
  buckets.set(key,bucket);
 }
 const ranked=[...buckets.values()].sort((a,b)=>b.count*(.4+b.saturation/b.count)-a.count*(.4+a.saturation/a.count));
 const selected:{h:number;s:number;color:string}[]=[];
 for(const bucket of ranked){
  const [h,s,l]=rgbToHsl(bucket.r/bucket.count,bucket.g/bucket.count,bucket.b/bucket.count);
  if(selected.some(c=>Math.min(Math.abs(c.h-h),1-Math.abs(c.h-h))<.09&&Math.abs(c.s-s)<.2))continue;
  selected.push({h,s,color:lightLyricColor(hslToHex(h,Math.min(.8,s),Math.max(.77,l)))});
  if(selected.length===5)break;
 }
 if(!selected.length){
  if(!opaque)return null;
  const [h,s]=rgbToHsl(sumR/opaque,sumG/opaque,sumB/opaque);
  const colors=[.78,.84,.9].map(l=>lightLyricColor(hslToHex(h,Math.min(.4,s),l)));
  const sungColors=colors.map(color=>vibrantLyricColor(color));
 return {baseColor:colors[0],sungColor:sungColors[0],accentHex:sungColors[0],colors,sungColors};
 }
 // Monochrome artwork keeps its own hue with light tonal variants.
 const first=selected[0];
 const colors=selected.map(c=>c.color);
 if(colors.length===1){
  colors.push(lightLyricColor(hslToHex(first.h,first.s*.55,.84)),lightLyricColor(hslToHex(first.h,first.s*.3,.9)));
 }
 const sungColors=colors.map(color=>vibrantLyricColor(color));
 return {baseColor:colors[0],sungColor:sungColors[0],accentHex:sungColors[0],colors,sungColors};
}

const albumPaletteCache = new Map<string, AlbumArtLyricPalette>();

function hslToHex(h: number, s: number, l: number): string {
 const hue = ((h % 1) + 1) % 1;
 const sat = Math.max(0, Math.min(1, s));
 const lig = Math.max(0, Math.min(1, l));
 const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
 const p = 2 * lig - q;
 const hue2rgb = (t: number) => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
 };
 const r = Math.round(hue2rgb(hue + 1 / 3) * 255);
 const g = Math.round(hue2rgb(hue) * 255);
 const b = Math.round(hue2rgb(hue - 1 / 3) * 255);
 return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
 const rn = r / 255;
 const gn = g / 255;
 const bn = b / 255;
 const max = Math.max(rn, gn, bn);
 const min = Math.min(rn, gn, bn);
 let h = 0;
 let s = 0;
 const l = (max + min) / 2;
 if (max !== min) {
  const d = max - min;
  s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  switch (max) {
   case rn:
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
    break;
   case gn:
    h = (bn - rn) / d + 2;
    break;
   default:
    h = (rn - gn) / d + 4;
    break;
  }
  h /= 6;
 }
 return [h, s, l];
}

/**
 * Deterministic per-song color palette seeded by song title/artist/id so even when CORS blocks
 * image pixel readback, every song gets a distinct, vibrant album-inspired lyric color.
 */
export function getDeterministicSongPalette(songSeed: string): AlbumArtLyricPalette {
 let hash = 2166136261;
 const cleanSeed = (songSeed || 'lyricflow-default-song').trim().toLowerCase();
 for (let i = 0; i < cleanSeed.length; i++) {
  hash ^= cleanSeed.charCodeAt(i);
  hash = Math.imul(hash, 16777619);
 }
 const hue = ((hash >>> 0) % 360) / 360;
 const colors=[0,.16,.42,.67].map(offset=>lightLyricColor(hslToHex(hue+offset,.72,.78)));
 const sungColors=colors.map(color=>vibrantLyricColor(color));
 const sungColor = sungColors[0];
 const baseColor = colors[0];
 return {
  baseColor,
  sungColor,
  accentHex: sungColor,
  colors,
  sungColors,
 };
}

/**
 * Extracts a high-contrast, vibrant lyric text palette from a song's album art or YouTube thumbnail
 * (adapted from haroldalan/spotify-karaoke `extractDominantColor` 32-level color bucketing + HSL tuning).
 */
export async function extractAlbumArtPalette(
 artworkUrl: string | undefined,
 songSeed: string
): Promise<AlbumArtLyricPalette> {
 const cacheKey = `${artworkUrl || ''}|${songSeed}`;
 const cached = albumPaletteCache.get(cacheKey);
 if (cached) return cached;

 const fallback = getDeterministicSongPalette(songSeed);
 if (
  !artworkUrl ||
  typeof document === 'undefined' ||
  typeof Image === 'undefined' ||
  (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''))
 ) {
  albumPaletteCache.set(cacheKey, fallback);
  return fallback;
 }

 try {
  const palette = await new Promise<AlbumArtLyricPalette>((resolve, reject) => {
   const img = new Image();
   img.crossOrigin = 'anonymous';
   const timeout = setTimeout(() => reject(new Error('Image load timeout')), 3500);
   img.onload = () => {
    clearTimeout(timeout);
    try {
     const canvas = document.createElement('canvas');
     const size = 48;
     canvas.width = size;
     canvas.height = size;
     const ctx = canvas.getContext('2d');
     if (!ctx) {
      resolve(fallback);
      return;
     }
     ctx.drawImage(img, 0, 0, size, size);
     const data = ctx.getImageData(0, 0, size, size).data;

     resolve(paletteFromArtworkPixels(data)||fallback);
    } catch {
     resolve(fallback);
    }
   };
   img.onerror = () => {
    clearTimeout(timeout);
    resolve(fallback);
   };
   img.src = artworkUrl;
  });

  if (albumPaletteCache.size < 256) {
   albumPaletteCache.set(cacheKey, palette);
  }
  return palette;
 } catch {
  return fallback;
 }
}

