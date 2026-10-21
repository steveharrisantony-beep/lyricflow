import type {DirectedScene} from './catalog';
import {sceneColors} from './paint';
import {applySceneFont} from './fonts';
import {paintLyric} from './contrast';

export function drawInstrumentalMark(c:CanvasRenderingContext2D,scene:DirectedScene,w:number,h:number,energy:number){
 const palette=sceneColors(scene.id);
 const u=Math.min(w,h);
 c.save();
 c.textAlign='center';
 c.textBaseline='middle';
 if(typeof c.beginPath==='function'&&typeof c.fillRect==='function'){
  // Plotter reticle & audio pulse rings around instrumental emblem
  const cx=w*0.5,cy=h*0.52,r=u*(0.11+energy*0.045);
  c.strokeStyle=palette.accent;
  c.lineWidth=1.2;
  c.globalAlpha=0.22+energy*0.35;
  c.beginPath();
  c.arc(cx,cy,r,0,Math.PI*2);
  c.stroke();
  c.beginPath();
  c.moveTo(cx-r*1.45,cy);c.lineTo(cx-r*1.12,cy);
  c.moveTo(cx+r*1.12,cy);c.lineTo(cx+r*1.45,cy);
  c.stroke();
 }
 c.globalAlpha=.38+energy*.34;
 applySceneFont(c,'ultra',Math.min(38,h*.062),'LYRICFLOW');
 paintLyric(c,'LYRICFLOW',w*.5,h*.52,w*.7,palette.foreground);
 c.restore();
}
