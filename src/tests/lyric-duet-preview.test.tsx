// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import ManualLyrics from '../lyrics/ManualLyrics';
import {getLyricState} from '../lyrics/lyricTimeline';

it('keeps the preview slots, colours and completion times in sync with the lyric stage',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);
 const incoming={token:1,source:'Fixture',romanized:'',original:[
  '[00:00.00]First<00:04.00>','[00:01.00]Second<00:07.00>',
  '[00:04.40]Third<00:09.00>','[00:07.40]Fourth<00:12.00>','[00:13.00]Solo<00:15.00>'
 ].join('\n')};
 const show=async(time:number)=>act(async()=>root.render(<ManualLyrics time={time} trackLoaded track={null}
  incoming={incoming} delay={0} onDelayChange={vi.fn()} displayMode="original" romanizationEnabled={false}/>));
 const slot=(side:string)=>host.querySelector<HTMLElement>(`[data-duet-side="${side}"]`)!;
 const color=(side:string)=>(slot(side).lastElementChild as HTMLElement).style.color;
 try{
  await show(2);
  expect(slot('left').textContent).toContain('First');
  expect(slot('right').textContent).toContain('Second');
  const firstColor=color('left'),secondColor=color('right');
  await show(4.3);
  expect(slot('left').getAttribute('aria-hidden')).toBe('true');
  expect(slot('right').textContent).toContain('Second');
  expect(color('right')).toBe(secondColor);
  await show(4.4);
  expect(slot('left').textContent).toContain('Third');
  expect(color('left')).not.toBe(firstColor);
  expect(color('left')).not.toBe(secondColor);
  expect(getLyricState(4.4).cue?.text).toBe('Second');
  expect(getLyricState(4.4).secondaryCue?.text).toBe('Third');
  await show(7.4);
  expect(slot('left').textContent).toContain('Third');
  expect(slot('right').textContent).toContain('Fourth');
  await show(12.5);
  expect(host.querySelector('.spicy-duet-split')).toBeNull();
  await show(13);
  expect(host.querySelector('.spicy-duet-split')).toBeNull();
  expect(host.querySelector('.spicy-line-synced')?.textContent).toBe('Solo');
 }finally{await act(async()=>root.unmount());}
});
