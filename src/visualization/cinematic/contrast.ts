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
export function setLyricBackdrop(c:CanvasRenderingContext2D,pixels:ImageData){backdrops.set(c,{data:pixels.data,width:pixels.width,height:pixels.height})}
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
