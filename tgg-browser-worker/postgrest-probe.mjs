import http from 'node:http';

const PORT=Number(process.env.PORT||10000);
const URL=String(process.env.TGG_SUPABASE_URL||'').replace(/\/$/,'');
const KEY=String(process.env.TGG_SUPABASE_KEY||'');
let result={ok:false,status:'pending',checked_at:null};

async function run(){
  try{
    const response=await fetch(URL+'/rest/v1/',{
      method:'GET',
      headers:{apikey:KEY,...(KEY.startsWith('sb_')?{}:{Authorization:'Bearer '+KEY})},
      signal:AbortSignal.timeout(8000)
    });
    const body=await response.text();
    let parsed=null;
    try{parsed=JSON.parse(body)}catch{}
    result={
      ok:response.ok,
      status:response.status,
      code:parsed?.code||null,
      message:parsed?.message||null,
      details:parsed?.details||null,
      hint:parsed?.hint||null,
      body_excerpt:body.slice(0,800),
      checked_at:new Date().toISOString()
    };
    console.log(JSON.stringify({tgg_postgrest_probe_once:true,...result}));
  }catch(error){
    result={ok:false,status:'error',error:error?.message||String(error),checked_at:new Date().toISOString()};
    console.error(JSON.stringify({tgg_postgrest_probe_once:true,...result}));
  }
}
http.createServer((_req,res)=>{
  res.setHeader('content-type','application/json; charset=utf-8');
  res.end(JSON.stringify(result));
}).listen(PORT,()=>{
  console.log(JSON.stringify({tgg_postgrest_probe_server:true,port:PORT}));
  void run();
});
