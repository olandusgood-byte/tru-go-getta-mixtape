const CORE_URL=String(process.env.TGG_CORE_URL||'').replace(/\/$/,'');
const workerId=()=>String(process.env.TGG_WORKER_ID||globalThis.__TGG_WORKER_ID||'');
const workerToken=()=>String(process.env.TGG_WORKER_TOKEN||globalThis.__TGG_WORKER_TOKEN||'');
async function call(path,body={},extra={}){if(!CORE_URL)throw new Error('TGG_CORE_URL_NOT_CONFIGURED');const r=await fetch(CORE_URL+path,{method:'POST',headers:{'content-type':'application/json','x-tgg-worker-id':workerId(),'x-tgg-worker-token':workerToken(),...(extra.headers||{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data.error||text.slice(0,300)||'TGG_CORE_REQUEST_FAILED');return data}
export const tggCoreEnabled=()=>Boolean(CORE_URL);
export async function tggWorkerHeartbeat(metadata={}){return call('/v1/workers/heartbeat',{metadata})}
export async function tggWorkerClaim(){return call('/v1/workers/jobs/claim',{})}
export async function tggWorkerComplete(jobId,leaseToken,verdict,result,evidence){return call('/v1/workers/jobs/complete',{job_id:jobId,lease_token:leaseToken,verdict,result,evidence})}
export async function tggWorkerRegister(id,token,metadata={}){if(!CORE_URL)throw new Error('TGG_CORE_URL_NOT_CONFIGURED');const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');const r=await fetch(CORE_URL+'/v1/workers/register',{method:'POST',headers:{'content-type':'application/json','x-tgg-bootstrap-secret':secret},body:JSON.stringify({worker_id:id,worker_token:token,metadata}),signal:AbortSignal.timeout(15000)});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data.error||'TGG_CORE_WORKER_REGISTER_FAILED');return data}

export async function tggStoreOwnerRefreshToken(id,refresh){return call('/v1/browser/worker-session',{worker_id:id,refresh_token:refresh})}
export async function tggRestoreOwnerRefreshToken(){return call('/v1/browser/worker-session/restore',{})}

export async function tggWorkerBootstrap(id){if(!CORE_URL)throw new Error('TGG_CORE_URL_NOT_CONFIGURED');const secret=String(process.env.TGG_WORKER_BOOTSTRAP_SECRET||'');const r=await fetch(CORE_URL+'/v1/workers/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-tgg-bootstrap-secret':secret},body:JSON.stringify({worker_id:id}),signal:AbortSignal.timeout(15000)});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data.error||'TGG_CORE_WORKER_BOOTSTRAP_FAILED');return data}
