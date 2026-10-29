/** Preserve transients in compressed music without amplifying silence. */
export class BandEnvelope {
 private baseline=0;private value=0;
 reset(){this.baseline=0;this.value=0}
 update(raw:number,dt:number,gain:number){
  const x=Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):0;
  const seconds=Math.min(.1,Math.max(.001,dt));
  this.baseline+=(x-this.baseline)*(1-Math.exp(-seconds/1.4));
  const transient=Math.max(0,x-this.baseline);
  const target=Math.min(1,Math.max(0,x-.045)*.65*gain+transient*2.8*gain);
  const tau=target>this.value?.025:.15;
  this.value+=(target-this.value)*(1-Math.exp(-seconds/tau));
  return this.value;
 }
}
