import type {DirectedScene} from './catalog';
import {sceneColors} from './paint';
import {applySceneFont} from './fonts';
import {paintLyric} from './contrast';
export function drawInstrumentalMark(c:CanvasRenderingContext2D,scene:DirectedScene,w:number,h:number,energy:number){
 const palette=sceneColors(scene.id);
 c.save();c.textAlign='center';c.textBaseline='middle';c.globalAlpha=.35+energy*.3;
 applySceneFont(c,'ultra',Math.min(35,h*.06),'LYRICFLOW');
 paintLyric(c,'LYRICFLOW',w*.5,h*.52,w*.7,palette.foreground);c.restore();
}
