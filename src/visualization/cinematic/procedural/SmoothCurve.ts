/** Reusable samples traced as tangent-continuous cubic curves, including closed seams. */
export class SmoothCurve{
 private points:Float64Array;
 private length=0;
 constructor(capacity=192){this.points=new Float64Array(capacity*2);}
 reset(){this.length=0;}
 add(x:number,y:number){
  if(this.length*2===this.points.length){const grown=new Float64Array(this.points.length*2);grown.set(this.points);this.points=grown;}
  this.points[this.length*2]=x;this.points[this.length*2+1]=y;this.length++;
 }
 trace(c:CanvasRenderingContext2D,closed=false,connect=false){
  const n=this.length,p=this.points;if(!n)return;
  if(connect)c.lineTo(p[0],p[1]);else c.moveTo(p[0],p[1]);
  for(let i=0;i<(closed?n:n-1);i++){
   const before=(closed?(i+n-1)%n:Math.max(0,i-1))*2;
   const from=i*2,to=((i+1)%n)*2;
   const after=(closed?(i+2)%n:Math.min(n-1,i+2))*2;
   c.bezierCurveTo(p[from]+(p[to]-p[before])/6,p[from+1]+(p[to+1]-p[before+1])/6,
    p[to]-(p[after]-p[from])/6,p[to+1]-(p[after+1]-p[from+1])/6,p[to],p[to+1]);
  }
  if(closed)c.closePath();
 }
}
