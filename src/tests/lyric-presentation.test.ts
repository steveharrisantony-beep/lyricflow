import {describe,it,expect,vi} from 'vitest';
import {drawKineticLyrics,LYRIC_MOTIONS,ORIGINAL_LYRIC_MOTIONS,VOXELVERSE_STYLES,VOXELVERSE_FAMILIES,normalizeMotionPool,type KineticArgs} from '../visualization/cinematic/kineticTypography';
import {CURRENT_WORD_STYLES,drawCurrentWordAccent,normalizeWordStylePool} from '../visualization/cinematic/currentWordStyles';
import {albumColorsForLine,contrastRatio,getDeterministicSongPalette,luminance,paletteFromArtworkPixels} from '../visualization/cinematic/contrast';
import {TEMPLATES,type DirectedScene} from '../visualization/cinematic/catalog';
import {cloudPreferencesPayload,DEFAULT_USER_PREFERENCES} from '../firebase/firebaseClient';
import {buildLetterUnits,canAnimateLetters,choreographyPhase,letterMotionPose,lineMotionPose} from '../visualization/cinematic/letterMotion';
import {ALL_THEME_TRANSITIONS,chooseThemeTransition} from '../visualization/cinematic/themeTransitions';
import {CURRENT_WORD_ANIMATIONS,currentWordAnimationPose,normalizeWordAnimationPool} from '../visualization/cinematic/currentWordAnimations';
import {buildCues} from '../lyrics/lyricTimeline';
import {analyzeLyricWords} from '../lyrics/wordEmphasis';
import {MusicCameraRig,STILL_CAMERA,lyricCameraTransform} from '../visualization/cinematic/cameraRig';
import {NO_AUDIO} from '../visualization/cinematic/paint';

const [cue]=buildCues([{time:0,text:'Carry the light home',words:[
 {text:'Carry',start:0,end:1,timing:'sourced'}, {text:'the',start:1,end:1.5,timing:'sourced'},
 {text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}
]}],[]);
const scene:DirectedScene={...TEMPLATES[0],start:0,end:12,variation:0,section:0,reason:'fixture'};
function context(){
 const paints:{text:string;color:unknown;blur:number}[]=[];
 const c={font:'800 50px sans-serif',fillStyle:'',shadowBlur:0,globalAlpha:1,canvas:{width:1000,height:600},save:vi.fn(),restore:vi.fn(),transform:vi.fn(),
  fillText(text:string){paints.push({text,color:this.fillStyle,blur:this.shadowBlur});},
  clip:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),bezierCurveTo:vi.fn(),closePath:vi.fn(),
  rect:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),arc:vi.fn(),ellipse:vi.fn(),roundRect:vi.fn(),stroke:vi.fn(),fill:vi.fn(),
  getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
  measureText(text:string){return {width:text.length*parseFloat(this.font.match(/([\d.]+)px/)?.[1]||'50')*.56};}
 };
 return {c:c as unknown as CanvasRenderingContext2D,paints};
}
function render(overrides:Partial<KineticArgs>={}){
 const {c,paints}=context();
 const result=drawKineticLyrics({c,scene,cue,time:.5,mode:'original',w:1000,h:600,intensity:1,reduced:false,
  emphasis:analyzeLyricWords([cue]),enabledFonts:['impact'],placementMode:'center',fillPaceMode:'word',...overrides});
 return {c,paints,result,transforms:vi.mocked(c.transform).mock.calls};
}

describe('independent phrase animation and word styles',()=>{
 it('applies bass camera movement after fitting with phrase animation on, off or an empty motion pool',()=>{
  const rig=new MusicCameraRig();
  rig.sample(0,NO_AUDIO,1,false,0,true,80);
  const hit=rig.sample(.12,{...NO_AUDIO,bass:1,beat:1},1,false,0,true,80);
  const next=rig.sample(.24,{...NO_AUDIO,bass:1,beat:1},1,false,0,true,80);
  for(const options of [{animated:true},{animated:false},{animated:true,enabledMotions:[]}] as Partial<KineticArgs>[]){
   const still=render({...options,camera:STILL_CAMERA,time:1.8});
   const shaken=render({...options,camera:hit,time:1.8});
   const moving=render({...options,camera:next,time:1.8});
   expect(shaken.transforms).not.toEqual(still.transforms);
   expect(shaken.transforms).not.toEqual(moving.transforms);
   expect(shaken.paints.map(p=>p.text).join('')).toBe(still.paints.map(p=>p.text).join(''));
   expect(shaken.result.drawn).toBe(still.result.drawn);
  }
 });
 it('keeps reduced motion, zero intensity and the disabled camera steady',()=>{
  const rig=new MusicCameraRig(),pulse={...NO_AUDIO,bass:1};
  const hit=rig.sample(.1,pulse,1,false,0,true,80);
  const off=rig.sample(.2,pulse,1,false,0,false,80);
  for(const options of [{reduced:true},{intensity:0},{camera:off}]){
   expect(render({camera:hit,...options}).transforms).toEqual(render({camera:STILL_CAMERA,...options}).transforms);
  }
 });
 it('contains the rotated and zoomed phrase inside edge and duet placement bounds',()=>{
  const camera={...STILL_CAMERA,x:.011,y:.012,roll:.014,zoom:1.062};
  for(const bounds of [{x:0,y:0,width:1000,height:600},{x:515,y:12,width:465,height:240},{x:20,y:348,width:760,height:240}]){
   const phrase={x:bounds.x+bounds.width*.25,y:bounds.y+bounds.height*.2,width:bounds.width*.75,height:bounds.height*.8};
   const [a,b,c,d,e,f]=lyricCameraTransform(1000,600,camera,bounds,phrase);
   for(const x of [phrase.x,phrase.x+phrase.width])for(const y of [phrase.y,phrase.y+phrase.height]){
    expect(a*x+c*y+e).toBeGreaterThanOrEqual(bounds.x-1e-8);
    expect(a*x+c*y+e).toBeLessThanOrEqual(bounds.x+bounds.width+1e-8);
    expect(b*x+d*y+f).toBeGreaterThanOrEqual(bounds.y-1e-8);
    expect(b*x+d*y+f).toBeLessThanOrEqual(bounds.y+bounds.height+1e-8);
   }
  }
 });
 it('keeps both-off typography steady without a separate camera frame',()=>{
  const overrides={animated:false,wordStylesEnabled:false,project:()=>({x:999,y:222,visible:true})};
  const a=render({...overrides,time:.2}),b=render({...overrides,time:2});
  expect(a.transforms).toEqual(b.transforms);
  expect(a.paints).toEqual(b.paints);
  expect(new Set(a.paints.map(p=>p.color)).size).toBe(1);
  expect(a.result.wordStyle).toBe('off');
 });
 it('uses only secondary colour for sung words when the word layer is off',()=>{
  const a=render({animated:true,wordStylesEnabled:false,time:.5,fillPaceMode:'letter'});
  expect(a.result.fillPace).toBe('word');
  expect(a.paints.map(p=>p.text).join('')).toBe('Carrythelighthome');
  expect(a.paints[0].color).toBe(a.result.activeColor);
  expect(a.paints.slice(0,5).every(p=>p.color===a.result.activeColor)).toBe(true);
  expect(a.paints.slice(5).every(p=>p.color===a.result.baseColor)).toBe(true);
  expect(a.c.stroke).not.toHaveBeenCalled();
  expect(a.transforms).not.toEqual(render({animated:true,wordStylesEnabled:false,time:1.9}).transforms);
 });
 it('keeps static word accents and reduced-motion glyph geometry still',()=>{
  for(const style of CURRENT_WORD_STYLES){
   const a=render({animated:false,wordStylesEnabled:true,currentWordStyle:style.id,time:.2});
   const b=render({animated:false,wordStylesEnabled:true,currentWordStyle:style.id,time:.8});
   expect(a.transforms).toEqual(b.transforms);
   for(const method of ['stroke','roundRect','ellipse','moveTo','lineTo'] as const)expect(vi.mocked(a.c[method]).mock.calls).toEqual(vi.mocked(b.c[method]).mock.calls);
  }
  const a=render({wordStylesEnabled:true,wordAnimationsEnabled:true,reduced:true,time:.2});
  const b=render({wordStylesEnabled:true,wordAnimationsEnabled:true,reduced:true,time:.8});
  expect(a.transforms).toEqual(b.transforms);expect(a.result.motionPhase).toBe('still');
 });
 it('does not invent word accents for line timing or mismatched romanization',()=>{
  const lineOnly=render({cue:{...cue,timing:'estimated'},wordStylesEnabled:true,currentWordStyle:'classic-capsule'});
  expect(lineOnly.result.wordStyle).toBe('off');expect(lineOnly.result.fillPace).toBe('line');
  const mismatched=render({cue:{...cue,romanized:'One extra romanized token here'},mode:'romanized',wordStylesEnabled:true});
  expect(mismatched.result.wordStyle).toBe('off');expect(mismatched.result.fillPace).toBe('line');
 });
 it('chooses only enabled word styles and treats an empty pool as off',()=>{
  for(let time=0;time<10;time++){
   expect(render({cue:{...cue,time},wordStylesEnabled:true,enabledWordStyles:['classic-focus']}).result.wordStyle).toBe('classic-focus');
  }
  expect(render({wordStylesEnabled:true,enabledWordStyles:[]}).result.wordStyle).toBe('off');
 });
 it('paints a shaped Indic word once while its colour sweeps across the glyphs',()=>{
  const {c,paints}=context();
  c.createLinearGradient=vi.fn(()=>({addColorStop:vi.fn()}) as unknown as CanvasGradient);
  const [indic]=buildCues([{time:0,text:'മഴക്കാലം',words:[{text:'മഴക്കാലം',start:0,end:2,timing:'sourced'}]}],[]);
  render({c,cue:indic,wordStylesEnabled:true,fillPaceMode:'letter'});
  expect(paints.map(p=>p.text)).toEqual(['മഴക്കാലം']);
  expect(c.createLinearGradient).toHaveBeenCalledOnce();
 });
 it('renders all 125 animation/style combinations without duplicating the lyric phrase',()=>{
  expect(LYRIC_MOTIONS).toHaveLength(25);expect(CURRENT_WORD_STYLES).toHaveLength(5);
  for(const motion of LYRIC_MOTIONS)for(const style of CURRENT_WORD_STYLES){
   for(const [w,h] of [[360,203],[800,1280],[1920,1080]]){
    const output=render({w,h,enabledMotions:[motion],currentWordStyle:style.id,wordStylesEnabled:true});
    expect(output.result.drawn,`${motion}/${style.id}`).toBe(4);
    expect(output.paints.map(p=>p.text).join('')).toBe('Carrythelighthome');
    expect(output.result.glyphs).toBe(17);
    expect(output.transforms.flat().every(Number.isFinite)).toBe(true);
   }
  }
 });
 it('gives every phrase choreography its own motion and keeps every word visible through entries and endings',()=>{
  const poses=new Set<string>();
  for(const motion of LYRIC_MOTIONS){
   poses.add(JSON.stringify(render({enabledMotions:[motion],time:.4}).transforms));
   for(const time of [0,.05,.4,1,3.4])expect(render({enabledMotions:[motion],time}).result.drawn).toBe(4);
  }
  expect(poses.size).toBe(25);
 });
});

describe('artwork and theme lyric colours',()=>{
 const pixels=new Uint8ClampedArray(Array.from({length:90},(_,i)=>i<30?[205,35,65,255]:i<60?[20,125,200,255]:[35,170,90,255]).flat());
 it('retains several hues from the actual artwork and chooses stable light colours across lines',()=>{
  const palette=paletteFromArtworkPixels(pixels)!;
  expect(palette.colors.length).toBeGreaterThanOrEqual(3);
  expect(palette.colors.every(color=>luminance(color)>=.6)).toBe(true);
  const colors=new Set(Array.from({length:20},(_,i)=>albumColorsForLine(palette,`${i}|line`).sungColor));
  expect(colors.size).toBeGreaterThan(1);
  expect(albumColorsForLine(palette,'same cue')).toEqual(albumColorsForLine(palette,'same cue'));
 });
 it('keeps video text light even for dark custom colours and falls back deterministically without artwork',()=>{
  for(const color of ['#010203','#880000','#1100aa']){
   const output=render({forceLightText:true,customAccentColor:color,customBaseColor:color});
   expect(luminance(output.result.baseColor!)).toBeGreaterThanOrEqual(.6);
   expect(contrastRatio(output.result.activeColor!,'#07090e')).toBeGreaterThanOrEqual(4.5);
  }
  const palette=getDeterministicSongPalette('artwork unavailable');
  expect(palette.colors.length).toBeGreaterThan(1);
  expect(getDeterministicSongPalette('artwork unavailable')).toEqual(palette);
  expect(paletteFromArtworkPixels(new Uint8ClampedArray(16))).toBeNull();
  expect(paletteFromArtworkPixels(new Uint8ClampedArray([0,0,0,255,255,255,255,255]))?.colors).toHaveLength(3);
 });
 it('follows the selected theme palette in auto mode with readable light/dark polarity',()=>{
  for(const palette of TEMPLATES[0].palettes){
   const output=render({paletteId:palette.id});
   expect(contrastRatio(output.result.baseColor!,palette.background)).toBeGreaterThanOrEqual(4.5);
   expect(contrastRatio(output.result.activeColor!,palette.background)).toBeGreaterThanOrEqual(3);
  }
  expect(render({paletteId:'silk-waves'}).result.activeColor).not.toBe(render({paletteId:'cyan-tide'}).result.activeColor);
 });
});


it('compares only cloud-supported fields so device-only font pools cannot trigger sync loops',()=>{
 const base=cloudPreferencesPayload(DEFAULT_USER_PREFERENCES);
 expect(cloudPreferencesPayload({...DEFAULT_USER_PREFERENCES,enabledFonts:['impact'],autoFonts:false,manualFont:'impact'})).toEqual(base);
 expect(cloudPreferencesPayload({...DEFAULT_USER_PREFERENCES,intensity:22})).not.toEqual(base);
});


describe('integrated choreography, shaped-script fallback and theme transitions',()=>{
 it('keeps Hindi, Malayalam, Tamil and Arabic words intact while segmenting Latin graphemes',()=>{
  for(const text of ['नमस्ते','മഴക്കാലം','தமிழ்','العربية']){
   expect(canAnimateLetters(text)).toBe(false);
   expect(buildLetterUnits(context().c,text).map(part=>part.text)).toEqual([text]);
   const output=render({cue:{...cue,text,romanized:'',words:[],timing:'estimated'}});
   expect(output.paints.map(p=>p.text)).toEqual([text]);expect(output.result.letterMode).toBe('shaped');
  }
  expect(buildLetterUnits(context().c,'a\u0301b').map(part=>part.text)).toEqual(['a\u0301','b']);
 });
 it('keeps every choreography moving late in the line, after the words have been said',()=>{
  for(const motion of LYRIC_MOTIONS){
   const a=render({cue:{...cue,end:8},time:5.1,enabledMotions:[motion]});
   const b=render({cue:{...cue,end:8},time:5.25,enabledMotions:[motion]});
   expect(a.transforms, motion).not.toEqual(b.transforms);
   expect(a.paints.map(p=>p.text).join('')).toBe('Carrythelighthome');
  }
  const first=letterMotionPose('wave',3,0,20,1),next=letterMotionPose('wave',3,3,20,1);
  expect(Math.abs(first.y-next.y)).toBeGreaterThan(.1);
 });
 it('alternates side entrances and exits by consecutive cue index without shifting the lyric clock',()=>{
  expect(lineMotionPose('alternating',.05,4,0,1000,1).x).toBeLessThan(0);
  expect(lineMotionPose('alternating',.05,4,1,1000,1).x).toBeGreaterThan(0);
  expect(lineMotionPose('alternating',3.98,4,0,1000,1).x).toBeGreaterThan(0);
  expect(lineMotionPose('alternating',3.98,4,1,1000,1).x).toBeLessThan(0);
  const a=render({enabledMotions:['alternating'],cueIndex:0,time:.1});
  const b=render({enabledMotions:['alternating'],cueIndex:1,time:.1});
  expect(a.transforms[0][4]).toBeLessThan(0);expect(b.transforms[0][4]).toBeGreaterThan(0);
  expect(a.result.text).toBe(b.result.text);
 });
 it('gives every animation a bounded intro, persistent hold and complete outro on short and long cues',()=>{
  for(const motion of LYRIC_MOTIONS)for(const duration of [.18,.6,4,20]){
   expect(choreographyPhase(.01,duration)).toBe('intro');
   expect(choreographyPhase(duration*.5,duration)).toBe('hold');
   expect(choreographyPhase(duration-.001,duration)).toBe('outro');
   for(const count of [1,17,160])for(const index of [0,count-1]){
    const beginning=letterMotionPose(motion,0,index,count,1,false,duration);
    const middle=letterMotionPose(motion,duration*.5,index,count,1,false,duration);
    const end=letterMotionPose(motion,duration,index,count,1,false,duration);
    expect(beginning.alpha).toBe(0);expect(middle.alpha).toBe(1);expect(end.alpha).toBeCloseTo(0,6);
    expect(Object.values(middle).every(Number.isFinite)).toBe(true);
   }
  }
  const late=render({cue:{...cue,end:8},time:7.95});
  expect(late.result.motionPhase).toBe('outro');
  expect(render({animated:false,time:.01}).result.motionPhase).toBe('still');
 });
 it('keeps theme transition selection and deliberate all-off pools',()=>{
  expect(chooseThemeTransition('zoom',[],'cue')).toBeNull();
  expect(chooseThemeTransition('zoom',['wipe'],'cue')).toBe('wipe');
  expect(ALL_THEME_TRANSITIONS).toHaveLength(7);
 });
 it('migrates removed lookalikes and preserves deliberately empty pools',()=>{
  expect(normalizeMotionPool(['ribbon','surge','wave'])).toEqual(['wave']);
  expect(normalizeWordStylePool(['halo','classic-ring'])).toEqual(['halo']);
  expect(normalizeMotionPool([])).toEqual([]);expect(normalizeWordStylePool([])).toEqual([]);
 });
 it('uses pale unread ink and one vibrant accent for every sung word in the line',()=>{
  const palette=getDeterministicSongPalette('multi-colour fixture');
  const line=render({cue:{...cue,timing:'estimated'},albumPalette:palette,forceLightText:true});
  expect(palette.colors).toContain(line.result.baseColor);
  expect(new Set(line.paints.map(p=>p.color))).toEqual(new Set([line.result.baseColor]));
  for(const forceLightText of [false,true])for(const time of [.5,1.8,3.4]){
   const sung=render({time,albumPalette:palette,forceLightText,wordStylesEnabled:false});
   const startedLetters=cue.words.filter(word=>time>=word.start).reduce((total,word)=>total+word.text.length,0);
   expect(new Set(sung.paints.slice(0,startedLetters).map(p=>p.color))).toEqual(new Set([sung.result.activeColor]));
   if(time<2.5)expect(new Set(sung.paints.slice(startedLetters).map(p=>p.color))).toEqual(new Set([sung.result.baseColor]));
  }
  for(const color of palette.sungColors)expect(contrastRatio(color,'#07090e')).toBeGreaterThanOrEqual(4.5);
  expect(palette.sungColors.every((color,index)=>luminance(color)<luminance(palette.colors[index]))).toBe(true);
 });
});

it('offers exactly five static styles with identical geometry at every point in a word',()=>{
 expect(CURRENT_WORD_STYLES).toHaveLength(5);
 for(const style of CURRENT_WORD_STYLES){
  const a=context().c,b=context().c;
  drawCurrentWordAccent(a,style.id,160,60,.1,'#55bbff');drawCurrentWordAccent(b,style.id,160,60,.8,'#55bbff');
  for(const method of ['stroke','fill','roundRect','ellipse','moveTo','lineTo'] as const)expect(vi.mocked(a[method]).mock.calls).toEqual(vi.mocked(b[method]).mock.calls);
 }
});
it('keeps Lift, Glow and Zoom independent from static styles and restricts them to sourced words',()=>{
 expect(CURRENT_WORD_ANIMATIONS.map(item=>item.id)).toEqual(['lift','glow','zoom']);
 const lift=currentWordAnimationPose('lift',.5,1),glow=currentWordAnimationPose('glow',.5,1),zoom=currentWordAnimationPose('zoom',.5,1);
 expect(lift.y).toBeLessThan(-.15);expect(lift.scale).toBe(1);expect(lift.glow).toBe(0);
 expect(glow.y).toBe(0);expect(glow.scale).toBe(1);expect(glow.glow).toBeGreaterThan(.3);
 expect(zoom.y).toBe(0);expect(zoom.scale).toBeGreaterThan(1.1);expect(zoom.glow).toBe(0);
 for(const animation of CURRENT_WORD_ANIMATIONS){
  const options={animated:false,wordStylesEnabled:false,wordAnimationsEnabled:true,enabledWordAnimations:[animation.id]};
  expect(render(options).result.wordAnimation).toBe(animation.id);
  expect(render({...options,cue:{...cue,timing:'estimated'}}).result.wordAnimation).toBe('off');
  expect(render({...options,wordAnimationsEnabled:false}).result.wordAnimation).toBe('off');
  expect(currentWordAnimationPose(animation.id,0,1)).toEqual({y:0,scale:1,glow:0});
  expect(currentWordAnimationPose(animation.id,.5,0)).toEqual({y:0,scale:1,glow:0});
 }
 expect(render({wordAnimationsEnabled:true,enabledWordAnimations:[]}).result.wordAnimation).toBe('off');
 expect(normalizeWordAnimationPool(['lift','zoom','lift','invalid'])).toEqual(['lift','zoom']);expect(normalizeWordAnimationPool([])).toEqual([]);
});

it('renders Lift upwards, Zoom larger and Glow on the active word only',()=>{
 const options={animated:false,wordAnimationsEnabled:true,wordStylesEnabled:false,time:.5};
 const plain=render({...options,enabledWordAnimations:[]});
 const lift=render({...options,enabledWordAnimations:['lift']});
 const zoom=render({...options,enabledWordAnimations:['zoom']});
 const glow=render({...options,enabledWordAnimations:['glow']});
 expect(plain.result.glyphs).toBe(4);
 expect(lift.result.glyphs).toBe(17);expect(zoom.result.glyphs).toBe(17);
 expect(lift.transforms.some(matrix=>matrix[5]<0)).toBe(true);
 expect(zoom.transforms.some(matrix=>matrix[0]>1.01&&matrix[3]>1.01)).toBe(true);
 expect(glow.paints[0].blur).toBeGreaterThan(3);
 expect(glow.paints[4].blur).toBe(3);expect(glow.paints.slice(5).every(p=>p.blur===3)).toBe(true);
});

it('keeps all-empty effect pools plain even when the master switches are on',()=>{
 const options={animated:true,wordStylesEnabled:true,wordAnimationsEnabled:true,enabledMotions:[],enabledWordStyles:[],enabledWordAnimations:[]};
 const a=render({...options,time:.2}),b=render({...options,time:2.8});
 expect(a.transforms).toEqual(b.transforms);expect(a.paints).toEqual(b.paints);
 expect(a.result.motionPhase).toBe('still');expect(a.result.wordStyle).toBe('off');expect(a.result.wordAnimation).toBe('off');
});

it('registers 25 complete designs and preserves the original twelve in order',()=>{
 expect(LYRIC_MOTIONS).toHaveLength(25);
 expect(LYRIC_MOTIONS.slice(0,12)).toEqual(ORIGINAL_LYRIC_MOTIONS);
 expect(new Set(LYRIC_MOTIONS).size).toBe(25);
 expect(new Set(VOXELVERSE_STYLES.map(style=>style.id))).toEqual(new Set(LYRIC_MOTIONS));
 expect(VOXELVERSE_FAMILIES.reduce((sum,family)=>sum+family.count,0)).toBe(25);
});
it('upgrades the former full catalog once, while preserving deliberate subsets and all-off settings',()=>{
 expect(normalizeMotionPool([...ORIGINAL_LYRIC_MOTIONS],true)).toEqual([...LYRIC_MOTIONS]);
 expect(normalizeMotionPool([...ORIGINAL_LYRIC_MOTIONS],false)).toEqual([...ORIGINAL_LYRIC_MOTIONS]);
 expect(normalizeMotionPool(['ship','wave'],true)).toEqual(['ship','wave']);
 expect(normalizeMotionPool([],true)).toEqual([]);
});
it('keeps each of the new letter poses finite, bounded and deterministic during long and short cues',()=>{
 for(const motion of LYRIC_MOTIONS.slice(12))for(const duration of [.18,6,30])for(const connected of [false,true])for(const intensity of [1,1.25]){
  for(const time of [0,duration*.1,duration*.5,duration*.99,duration])for(const index of [0,8,159]){
   const pose=letterMotionPose(motion,time,index,160,intensity,connected,duration,1);
   expect(Object.values(pose).every(Number.isFinite),motion).toBe(true);
   expect(Math.abs(pose.x)).toBeLessThan(1.5);expect(Math.abs(pose.y)).toBeLessThan(1.5);
   expect(pose.scaleX).toBeGreaterThan(0);expect(pose.scaleY).toBeGreaterThan(0);expect(pose.tracking).toBeGreaterThan(-1);
   expect(pose.scaleX).toBeLessThan(2.1);expect(pose.scaleY).toBeLessThan(2.1);
   expect(pose.alpha).toBeGreaterThanOrEqual(0);expect(pose.alpha).toBeLessThanOrEqual(1);
   expect(pose).toEqual(letterMotionPose(motion,time,index,160,intensity,connected,duration,1));
  }
 }
});

it('animates combining marks and emoji as whole graphemes in the word-only layer',()=>{
 const [sample]=buildCues([{time:0,text:'a\u0301🙂b',words:[{text:'a\u0301🙂b',start:0,end:1,timing:'sourced'}]}],[]);
 const result=render({cue:sample,animated:false,wordAnimationsEnabled:true,enabledWordAnimations:['lift'],time:.3});
 expect(result.result.glyphs).toBe(3);
 expect(result.paints.map(p=>p.text)).toEqual(['a\u0301','🙂','b']);
});

it('applies independent pixel minimum and maximum sizes even when overall scaling is supplied',()=>{
 const fontSize=(output:ReturnType<typeof render>)=>Number(output.c.font.match(/([\d.]+)px/)?.[1]);
 expect(fontSize(render({minFontSize:24,maxFontSize:42,fontScale:1.8,animated:false}))).toBeLessThanOrEqual(42);
 const short={...cue,text:'Hi',romanized:'',words:[],timing:'estimated' as const};
 // Give this independent font-limit check enough vertical room; a smaller placement box may shrink it.
 const raised=fontSize(render({cue:short,w:360,h:203,minFontSize:60,maxFontSize:90,fontScale:.5,animated:false,layout:{maxHeight:100}}));
 expect(raised).toBeGreaterThanOrEqual(60);expect(raised).toBeLessThanOrEqual(90);
 const low=fontSize(render({cue:short,minFontSize:24,maxFontSize:40,fontScale:1,animated:false}));
 const high=fontSize(render({cue:short,minFontSize:24,maxFontSize:90,fontScale:1,animated:false}));
 expect(high).toBeGreaterThan(low);expect(low).toBeLessThanOrEqual(40);expect(high).toBeLessThanOrEqual(90);
});

it('reflows long lyrics into fewer larger rows when the placement box gets wider',()=>{
 const long={...cue,text:'Let all the stars above the quiet city carry this long line safely home tonight',romanized:'',words:[],timing:'estimated' as const};
 const emphasis=analyzeLyricWords([long]);
 const narrow=render({cue:long,emphasis,animated:false,layout:{maxWidth:25,maxHeight:30}});
 const wide=render({cue:long,emphasis,animated:false,layout:{maxWidth:75,maxHeight:30}});
 expect(wide.result.rows!).toBeLessThan(narrow.result.rows!);
 const size=(output:ReturnType<typeof render>)=>Number(output.c.font.match(/([\d.]+)px/)?.[1]);
 expect(size(wide)).toBeGreaterThan(size(narrow));
 expect(wide.result.drawn).toBe(long.text.split(' ').length);
});
