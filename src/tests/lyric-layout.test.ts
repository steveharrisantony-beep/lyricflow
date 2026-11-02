import {expect,it} from 'vitest';
import {DEFAULT_LYRIC_LAYOUT,normalizeLyricLayout,resolveLyricBox} from '../lyrics/lyricLayout';

it('migrates missing layout settings to smaller padding and a limited height',()=>{
 expect(normalizeLyricLayout()).toEqual(DEFAULT_LYRIC_LAYOUT);
 expect(normalizeLyricLayout({horizontalPadding:0,maxHeight:25})).toEqual({...DEFAULT_LYRIC_LAYOUT,horizontalPadding:0,maxHeight:25});
 expect(normalizeLyricLayout({horizontalPadding:NaN,verticalPadding:-5,maxWidth:120,maxHeight:0}))
  .toEqual({...DEFAULT_LYRIC_LAYOUT,verticalPadding:0,maxWidth:100,maxHeight:10});
});

it('aligns every named side and centers Center Stage',()=>{
 for(const placement of ['left','bottom-left','top-left'] as const){
  const box=resolveLyricBox(1000,600,placement);
  expect(box.align).toBe('left');expect(box.x).toBe(20);
 }
 for(const placement of ['right','bottom-right'] as const){
  const box=resolveLyricBox(1000,600,placement);
  expect(box.align).toBe('right');expect(box.x+box.width).toBe(980);
 }
 const center=resolveLyricBox(1000,600,'center');
 expect(center.align).toBe('center');expect(center.x+center.width/2).toBe(500);expect(center.y+center.height/2).toBe(300);
});

it('changes horizontal and vertical edge padding independently',()=>{
 const original=resolveLyricBox(1000,600,'bottom-right');
 const horizontal=resolveLyricBox(1000,600,'bottom-right',{horizontalPadding:10});
 const vertical=resolveLyricBox(1000,600,'bottom-right',{verticalPadding:10});
 expect(horizontal.x+horizontal.width).toBe(900);expect(horizontal.y).toBe(original.y);
 expect(vertical.x).toBe(original.x);expect(vertical.y+vertical.height).toBe(540);
 const zero=resolveLyricBox(1000,600,'bottom-right',{horizontalPadding:0,verticalPadding:0});
 expect(zero.x+zero.width).toBe(1000);expect(zero.y+zero.height).toBe(600);
});

it('limits width and height in screen percentages while preserving the lower-right anchor',()=>{
 const box=resolveLyricBox(1000,600,'bottom-right',{maxWidth:45,maxHeight:25});
 expect(box).toMatchObject({x:530,y:438,width:450,height:150,align:'right',vertical:'bottom'});
});

it('keeps every layout inside available space even when padding and requested size conflict',()=>{
 for(const [w,h] of [[390,844],[800,1280],[1280,800]])for(const placement of ['left','right','center','bottom-left','bottom-right','top-left'] as const){
  const box=resolveLyricBox(w,h,placement,{horizontalPadding:25,verticalPadding:25,maxWidth:100,maxHeight:100});
  expect(box.x).toBeGreaterThanOrEqual(w*.25);expect(box.y).toBeGreaterThanOrEqual(h*.25);
  expect(box.x+box.width).toBeLessThanOrEqual(w*.75);expect(box.y+box.height).toBeLessThanOrEqual(h*.75);
 }
});

it('alternates alignment by line and keeps duet sides apart',()=>{
 expect(resolveLyricBox(1000,600,'alternating',undefined,0).align).toBe('left');
 expect(resolveLyricBox(1000,600,'alternating',undefined,1).align).toBe('right');
 const left=resolveLyricBox(1000,600,'center',{maxWidth:100},0,'left');
 const right=resolveLyricBox(1000,600,'center',{maxWidth:100},0,'right');
 expect(left.align).toBe('left');expect(right.align).toBe('right');expect(left.x+left.width).toBeLessThan(right.x);
});
