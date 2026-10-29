/** Deliberate instrument roles: mass follows bass, details follow high frequencies. */
export type MotionChannel='bass'|'mids'|'treble'|'beat';
export function motionChannel(kind:number,size:number):MotionChannel{
 if(kind===5)return 'beat';
 if(kind===4||kind===1&&size<.85)return 'treble';
 if(kind===3||kind===0)return 'mids';
 return 'bass';
}
export function objectDrive(channel:MotionChannel,bass:number,mids:number,treble:number,beat:number){
 const finite=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
 // Beat adds weight only where bass energy actually exists, avoiding full-scene jumps.
 return channel==='beat'?finite(beat):channel==='bass'?finite(bass)*(.8+.2*finite(beat)):channel==='treble'?finite(treble):finite(mids);
}
