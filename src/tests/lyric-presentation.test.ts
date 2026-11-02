import {describe,it,expect,vi} from 'vitest';
import {drawKineticLyrics,LYRIC_MOTIONS,normalizeMotionPool,type KineticArgs} from '../visualization/cinematic/kineticTypography';
import {CURRENT_WORD_STYLES,normalizeWordStylePool} from '../visualization/cinematic/currentWordStyles';
import {albumColorsForLine,contrastRatio,getDeterministicSongPalette,luminance,paletteFromArtworkPixels} from '../visualization/cinematic/contrast';
import {TEMPLATES,type DirectedScene} from '../visualization/cinematic/catalog';
import {cloudPreferencesPayload,DEFAULT_USER_PREFERENCES} from '../firebase/firebaseClient';
import {buildLetterUnits,canAnimateLetters,letterMotionPose} from '../visualization/cinematic/letterMotion';
import {ALL_LYRIC_TRANSITIONS,ALL_THEME_TRANSITIONS,chooseLyricTransition,chooseThemeTransition,lyricEntryPose} from '../visualization/cinematic/lyricTransitions';
import {buildCues} from '../lyrics/lyricTimeline';
import {analyzeLyricWords} from '../lyrics/wordEmphasis';

const [cue]=buildCues([{time:0,text:'Carry the light home',words:[
 {text:'Carry',start:0,end:1,timing:'sourced'}, {text:'the',start:1,end:1.5,timing:'sourced'},
 {text:'light',start:1.5,end:2.5,timing:'sourced'},{text:'home',start:2.5,end:3.5,timing:'sourced'}
]}],[]);
const scene:DirectedScene={...TEMPLATES[0],start:0,end:12,variation:0,section:0,reason:'fixture'};
function context(){
 const paints:{text:string;color:unknown}[]=[];
 const c={font:'800 50px sans-serif',fillStyle:'',globalAlpha:1,canvas:{width:1000,height:600},save:vi.fn(),restore:vi.fn(),transform:vi.fn(),
  fillText(text:string){paints.push({text,color:this.fillStyle});},
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
 it('keeps both-off text and geometry steady, including an otherwise moving camera',()=>{
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
  expect(a.c.beginPath).not.toHaveBeenCalled();
  expect(a.transforms).not.toEqual(render({animated:true,wordStylesEnabled:false,time:1.9}).transforms);
 });
 it('can apply word styles without phrase animation and keeps reduced motion steady',()=>{
  const styled=render({animated:false,wordStylesEnabled:true,currentWordStyle:'bloom'});
  const plain=render({animated:false,wordStylesEnabled:false});
  expect(styled.transforms).not.toEqual(plain.transforms);
  const a=render({animated:true,wordStylesEnabled:true,reduced:true,time:.2});
  const b=render({animated:true,wordStylesEnabled:true,reduced:true,time:.8});
  expect(a.transforms).toEqual(b.transforms);
  expect(a.c.beginPath).not.toHaveBeenCalled();
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
 it('renders all 96 animation/style combinations without duplicating the lyric phrase',()=>{
  expect(LYRIC_MOTIONS).toHaveLength(12);expect(CURRENT_WORD_STYLES).toHaveLength(8);
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
  expect(poses.size).toBe(12);
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


describe('persistent letters, shaped-script fallback and selectable transitions',()=>{
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
 it('alternates by consecutive line index and settles the entry without shifting the timeline',()=>{
  expect(lyricEntryPose('alternate',0,1000,600,0).x).toBeLessThan(0);
  expect(lyricEntryPose('alternate',0,1000,600,1).x).toBeGreaterThan(0);
  expect(lyricEntryPose('alternate',1,1000,600,1).x).toBe(0);
  const a=render({enabledMotions:['alternating'],cueIndex:0,time:.1});
  const b=render({enabledMotions:['alternating'],cueIndex:1,time:.1});
  expect(a.transforms[0][4]).toBeLessThan(0);expect(b.transforms[0][4]).toBeGreaterThan(0);
  expect(a.result.text).toBe(b.result.text);
 });
 it('supports explicit transition pools, including all-off, without reviving disabled choices',()=>{
  expect(chooseThemeTransition('zoom',[],'cue')).toBeNull();
  expect(chooseThemeTransition('zoom',['wipe'],'cue')).toBe('wipe');
  expect(chooseLyricTransition([],4)).toBeNull();
  for(const id of ALL_LYRIC_TRANSITIONS){
   expect(render({enabledMotions:['wave'],enabledLyricTransitions:[id],time:.1}).result.lyricTransition).toBe(id);
  }
  expect(ALL_THEME_TRANSITIONS).toHaveLength(7);
  expect(render({animated:false,enabledLyricTransitions:['wipe']}).result.lyricTransition).toBe('none');
 });
 it('migrates removed lookalikes and preserves deliberately empty pools',()=>{
  expect(normalizeMotionPool(['ribbon','surge','wave'])).toEqual(['wave']);
  expect(normalizeWordStylePool(['halo','classic-ring'])).toEqual(['classic-capsule']);
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
