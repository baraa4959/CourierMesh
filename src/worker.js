import {deliver} from './providers.js';
export function createWorker(store,cfg,opts={}) {
 let active=0,stopped=false,tickTimer;
 async function tick(){if(active>=cfg.workerConcurrency||stopped)return;active++;try{store.expire();const job=store.nextJob();if(job){const result=await (opts.deliver??deliver)(job,{timeoutMs:cfg.httpTimeoutMs});store.finish(job,result);}}
 catch(e){console.error(JSON.stringify({level:'error',event:'worker_failed',detail:e.message}));} finally{active--; }}
 function start(){const count=store.recover();if(count)console.warn(JSON.stringify({level:'warn',event:'unknown_previous_dispatches',count}));tickTimer=setInterval(()=>{for(let i=active;i<cfg.workerConcurrency;i++)void tick();},cfg.workerIntervalMs);tickTimer.unref();const janitor=setInterval(()=>{try{store.prune();}catch(e){console.error(e.message)}},86400000);janitor.unref();return ()=>{stopped=true;clearInterval(tickTimer);clearInterval(janitor);};}
 return {start,tick};
}
