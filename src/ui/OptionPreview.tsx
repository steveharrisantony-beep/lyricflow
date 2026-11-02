import {useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Eye,X} from 'lucide-react';
import {buildCues} from '../lyrics/lyricTimeline';
import {analyzeLyricWords} from '../lyrics/wordEmphasis';
import {byId,resolveThemePalette,type FontPack,type SceneId} from '../visualization/cinematic/catalog';
import {drawKineticLyrics,type LyricMotion,type LyricPlacementMode} from '../visualization/cinematic/kineticTypography';
import {preloadLyricFonts} from '../visualization/cinematic/fonts';
import type {CurrentWordStyle} from '../visualization/cinematic/currentWordStyles';
import {drawMotionGraphics} from '../visualization/cinematic/procedural/MotionGraphics';
import {GraphicCompositions} from '../visualization/cinematic/procedural/GraphicCompositions';

export type OptionPreviewSpec={label:string;scene?:SceneId;paletteId?:string;font?:FontPack;motion?:LyricMotion;wordStyle?:CurrentWordStyle;placement?:LyricPlacementMode;video?:boolean};

/** Separate targets keep preview taps from accidentally toggling an option. */
export function PreviewSetting({label,checked,onChange,onPreview,children,radioGroup,accessibleLabel=label}:{label:string;checked:boolean;onChange:()=>void;onPreview:()=>void;children?:ReactNode;radioGroup?:string;accessibleLabel?:string}){
 const id=useId();
 return <div className="preview-setting">
  <label htmlFor={id}><span>{label}</span>{children}</label>
  <button type="button" className="option-preview-button" aria-label={`Preview ${accessibleLabel}`} onClick={onPreview}><Eye size={17}/></button>
  <input id={id} className="option-toggle" type={radioGroup?'radio':'checkbox'} role={radioGroup?'radio':'switch'} name={radioGroup} aria-label={accessibleLabel} checked={checked} onChange={onChange}/>
 </div>;
}
const [sampleCue]=buildCues([{time:0,text:'Let the music move you',words:[
 {text:'Let',start:0,end:.8,timing:'sourced'},{text:'the',start:.8,end:1.35,timing:'sourced'},
 {text:'music',start:1.35,end:2.45,timing:'sourced'},{text:'move',start:2.45,end:3.4,timing:'sourced'},{text:'you',start:3.4,end:4.5,timing:'sourced'}
]}],[]);
const emphasis=analyzeLyricWords([sampleCue]);

export default function OptionPreview({spec,onClose,reducedMotion=false}:{spec:OptionPreviewSpec;onClose:()=>void;reducedMotion?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDivElement>(null);
 const title=useId();
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
   if(e.key==='Tab'){e.preventDefault();dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);previous?.focus({preventScroll:true});};
 },[onClose]);
 useEffect(()=>{
  const element=canvas.current,c=element?.getContext('2d');if(!element||!c)return;
  let raf=0,start=0,disposed=false;
  const font=spec.font||'impact';void preloadLyricFonts([font]).then(()=>{if(reducedMotion&&!disposed)frame(performance.now());});
  const scene=byId[spec.scene||'holographic-tide'];
  const palette=resolveThemePalette(scene.id,spec.paletteId);
  const art=new GraphicCompositions();
  const frame=(now:number)=>{
   if(disposed)return;
   if(!start)start=now;
   const w=Math.max(1,element.clientWidth),h=Math.max(1,element.clientHeight);
   const dpr=Math.min(window.devicePixelRatio||1,1.5);
   if(element.width!==Math.round(w*dpr)||element.height!==Math.round(h*dpr)){element.width=Math.round(w*dpr);element.height=Math.round(h*dpr);}
   c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
   const time=reducedMotion?1.8:((now-start)/1000)%4.8;
   const pulse={loudness:.35,bass:.28,mids:.34,treble:.2,beat:Math.max(0,Math.sin(time*Math.PI*2))**12,onset:0,downbeat:0};
   if(spec.video){
    const gradient=c.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#1c2442');gradient.addColorStop(.5,'#173d3c');gradient.addColorStop(1,'#36203b');c.fillStyle=gradient;c.fillRect(0,0,w,h);
   }else if(scene.id==='signal-chamber'||scene.id==='color-riot'){
    art.render(c,w,h,time,pulse,scene.id==='signal-chamber'?'spectrum':'geometry',0,.7,true,reducedMotion,palette);
   }else drawMotionGraphics(c,w,h,time,pulse,scene.id,.7,reducedMotion,spec.paletteId);
   drawKineticLyrics({c,scene:{...scene,start:0,end:5,variation:0,section:0,reason:'Preview'},cue:sampleCue,time:Math.min(time,4.49),mode:'original',w,h,intensity:.85,reduced:reducedMotion,emphasis,
    enabledFonts:[font],enabledMotions:[spec.motion||'ribbon'],animated:Boolean(spec.motion||spec.placement),
    wordStylesEnabled:Boolean(spec.wordStyle),currentWordStyle:spec.wordStyle,paletteId:spec.paletteId,placementMode:spec.placement||'center',forceLightText:spec.video,fillPaceMode:'word'});
   if(!reducedMotion)raf=requestAnimationFrame(frame);
  };
  raf=requestAnimationFrame(frame);
  return()=>{disposed=true;cancelAnimationFrame(raf);art.reset();};
 },[spec,reducedMotion]);
 return createPortal(<div className="option-preview-scrim" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div ref={dialog} className="option-preview-dialog glass" role="dialog" aria-modal="true" aria-labelledby={title}>
   <div className="option-preview-heading"><h2 id={title}>{spec.label}</h2><button className="icon-button" type="button" aria-label="Close preview" onClick={onClose}><X size={20}/></button></div>
   <canvas ref={canvas} className="option-preview-canvas" aria-label={`${spec.label} animation preview`}/>
  </div>
 </div>,document.body);
}
