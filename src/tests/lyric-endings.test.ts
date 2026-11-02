import {afterEach,expect,it} from 'vitest';
import {parseLRC} from '../lyrics/lrc';
import {buildCues,computeNaturalLineEnd,getLyricState,setLyricTimeline} from '../lyrics/lyricTimeline';
import {convertTtmlToEnhancedLrc} from '../lyrics/appleLyrics';
import {choreographyDuration,choreographyTiming,letterMotionPose} from '../visualization/cinematic/letterMotion';
afterEach(()=>setLyricTimeline([]));
it('holds a slow line-only lyric until the next timestamp and honours an explicit instrumental clear',()=>{
 const cues=buildCues(parseLRC('[00:00]Hold this slowly\n[00:12]The next line\n[00:16]\n[00:28]After the solo'),[]);
 expect(cues[0].end).toBe(12);expect(cues[1].end).toBe(16);
 setLyricTimeline(cues);
 expect(getLyricState(11.99).cue?.text).toBe('Hold this slowly');
 expect(getLyricState(16.01).cue).toBeNull();expect(getLyricState(27).cue).toBeNull();
});
it('uses known media duration for a final line instead of guessing an early finish',()=>{
 const cues=buildCues(parseLRC('[00:20]Hold this note'),[],'',34);
 setLyricTimeline(cues);expect(getLyricState(33.99).cue?.text).toBe('Hold this note');expect(getLyricState(34).cue).toBeNull();
});
it('extends an unspecified final word through the remaining timed interval',()=>{
 const lines=parseLRC('[00:00]<00:00>Hold <00:02>on\n[00:12]Next line');
 expect(lines[0].words?.at(-1)).toMatchObject({start:2,end:12,endEstimated:true});
 const cues=buildCues(lines,[]);expect(cues[0].vocalEnd).toBeUndefined();expect(cues[0].end).toBe(12);
 expect(parseLRC('[00:20]<00:20>Stay',34)[0].words?.[0].end).toBe(34);
});
it('clears after a sourced vocal end and uses the latest sustained word rather than array order',()=>{
 const explicit=buildCues(parseLRC('[00:00]<00:00>Hold <00:02>on<00:10>\n[00:25]Next'),[]);
 expect(explicit[0].vocalEnd).toBe(10);expect(explicit[0].end).toBeCloseTo(10.45);
 setLyricTimeline(explicit);expect(getLyricState(9.99).cue).not.toBeNull();expect(getLyricState(12).cue).toBeNull();
 expect(computeNaturalLineEnd({time:0,text:'Two notes',words:[{text:'Two',start:0,end:12,timing:'sourced'},{text:'notes',start:2,end:5,timing:'sourced'}]},25)).toBeCloseTo(12.45);
});
it('preserves TTML line-only end times without inventing word sync',()=>{
 const result=convertTtmlToEnhancedLrc('<tt><body><div><p begin="0s" end="12s">Hold this note</p></div></body></tt>');
 expect(result.hasWordSync).toBe(false);
 const line=parseLRC(result.lrc)[0];expect(line.end).toBe(12);expect(line.words).toBeUndefined();
 const [cue]=buildCues([line],[]);expect(cue.vocalEnd).toBe(12);expect(cue.end).toBeCloseTo(12.45);
});
it('uses a TTML parent end for a final span with no end and preserves uncertainty when neither has an end',()=>{
 const source='<span begin="0s" end="2s">Hold</span> <span begin="2s">on</span>';
 const exact=convertTtmlToEnhancedLrc(`<tt><p begin="0s" end="12s">${source}</p></tt>`);
 expect(parseLRC(exact.lrc)[0].words?.at(-1)?.end).toBe(12);
 const unknown=convertTtmlToEnhancedLrc(`<tt><p begin="0s">${source}</p></tt>`);
 expect(parseLRC(unknown.lrc,15)[0].words?.at(-1)).toMatchObject({end:15,endEstimated:true});
});
it('does not start a line outro before the latest possible vocal finish, including short cues',()=>{
 for(const duration of [.18,.6,2,12,30]){
  const motion=choreographyDuration(duration,duration);
  expect(motion-choreographyTiming(motion).outro).toBeGreaterThanOrEqual(duration-1e-10);
  expect(letterMotionPose('wave',duration-.001,2,8,1,false,motion).alpha).toBe(1);
 }
 expect(choreographyDuration(12.45,12)).toBe(12.45);
});

it('uses the next distinct timestamp for simultaneous starts instead of stretching to media end',()=>{
 const cues=buildCues(parseLRC('[00:00]First voice\n[00:00]Second voice\n[00:09]Next phrase'),[],'',200);
 expect(cues[0].naturalEnd).toBe(9);expect(cues[1].naturalEnd).toBe(9);
});
