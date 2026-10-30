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
export function paintLyric(c:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,preferred:string,surface?:string){
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
 c.shadowColor=luminance(ink)<.25?'rgba(255,250,242,.28)':'rgba(0,0,0,.62)';
 c.shadowBlur=3;
 c.shadowOffsetY=1.5;
 c.fillStyle=ink;
 c.fillText(text,x,y,maxWidth);
 c.restore();
}

export interface AlbumArtLyricPalette {
 baseColor: string;
 sungColor: string;
 accentHex: string;
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
 const sungColor = hslToHex(hue, 0.88, 0.68);
 const baseColor = hslToHex((hue + 0.04) % 1, 0.48, 0.93);
 return {
  baseColor,
  sungColor,
  accentHex: sungColor,
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
 if (!artworkUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
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

     // Bucket colors (quantize to 32 levels per channel) and score by vibrancy + frequency
     const buckets = new Map<string, { r: number; g: number; b: number; count: number; satSum: number }>();
     for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      const brightness = (r + g + b) / 3;
      if (brightness < 28 || brightness > 235) continue;
      const [, sat] = rgbToHsl(r, g, b);
      if (sat < 0.15) continue;

      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const key = `${qr},${qg},${qb}`;
      const prev = buckets.get(key);
      if (prev) {
       prev.r += r;
       prev.g += g;
       prev.b += b;
       prev.count++;
       prev.satSum += sat;
      } else {
       buckets.set(key, { r, g, b, count: 1, satSum: sat });
      }
     }

     let bestBucket: { r: number; g: number; b: number; count: number; satSum: number } | null = null;
     let bestScore = -1;
     for (const b of buckets.values()) {
      const avgSat = b.satSum / b.count;
      const score = b.count * (0.45 + avgSat * 1.35);
      if (score > bestScore) {
       bestScore = score;
       bestBucket = b;
      }
     }

     if (!bestBucket) {
      resolve(fallback);
      return;
     }

     const avgR = Math.round(bestBucket.r / bestBucket.count);
     const avgG = Math.round(bestBucket.g / bestBucket.count);
     const avgB = Math.round(bestBucket.b / bestBucket.count);
     const [h, s] = rgbToHsl(avgR, avgG, avgB);
     const vibrantSat = Math.max(0.76, Math.min(0.95, s * 1.25));
     const sungColor = hslToHex(h, vibrantSat, 0.68);
     const baseColor = hslToHex(h, Math.max(0.38, vibrantSat * 0.55), 0.93);
     resolve({
      baseColor,
      sungColor,
      accentHex: sungColor,
     });
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

