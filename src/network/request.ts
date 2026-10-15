/** Bounded retries for read-only provider requests. Abort cancels both I/O and backoff. */
export async function providerRequest(url:string,signal?:AbortSignal):Promise<Response>{
 for(let attempt=0;attempt<3;attempt++){
  signal?.throwIfAborted();
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Provider timed out','TimeoutError')),15000);
  let delay=400*(attempt+1);
  try{
   const response=await fetch(url,{signal:controller.signal});
   if(response.status===429){
    const retry=response.headers?.get('retry-after');
    const seconds=retry?Number(retry):NaN;
    if(!Number.isFinite(seconds)||seconds>3||attempt===2)return response;
    delay=Math.max(500,seconds*1000);
   }else if(response.ok||response.status<500||attempt===2)return response;
  }catch(error){
   if(signal?.aborted)throw signal.reason;
   if(attempt===2)throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  await new Promise<void>((resolve,reject)=>{
   const cancel=()=>{clearTimeout(wait);reject(signal?.reason)};
   const wait=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve()},delay);
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted)cancel();
  });
 }
 throw Error('Provider unavailable');
}
