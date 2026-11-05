// @vitest-environment jsdom
import {expect, it, vi} from 'vitest';
import {findDirectionalFocus} from '../tv/tvExperience';

function control(x: number, y: number, width=80, height=44): HTMLButtonElement {
  const button=document.createElement('button');
  vi.spyOn(button,'getBoundingClientRect').mockReturnValue({
    left:x,top:y,width,height,right:x+width,bottom:y+height,
    x,y,toJSON:()=>({}),
  } as DOMRect);
  return button;
}

it('moves to the nearest control in a D-pad direction, preferring the same row',()=>{
  const current=control(80,80);
  const right=control(190,80);
  const diagonal=control(160,220);
  const left=control(0,80);
  expect(findDirectionalFocus(current,[current,diagonal,right,left],'ArrowRight')).toBe(right);
  expect(findDirectionalFocus(current,[current,diagonal,right,left],'ArrowLeft')).toBe(left);
});

it('navigates columns without selecting opposite-direction controls',()=>{
  const current=control(100,100);
  const above=control(100,12);
  const below=control(100,200);
  expect(findDirectionalFocus(current,[current,above,below],'ArrowDown')).toBe(below);
  expect(findDirectionalFocus(current,[current,above,below],'ArrowUp')).toBe(above);
  expect(findDirectionalFocus(above,[above,control(200,12)],'ArrowUp')).toBeNull();
});

it('focuses the first available control when the screen has no active focus',()=>{
  const first=control(20,30),second=control(140,30);
  expect(findDirectionalFocus(null,[first,second],'ArrowRight')).toBe(first);
  expect(findDirectionalFocus(null,[],'ArrowDown')).toBeNull();
});
