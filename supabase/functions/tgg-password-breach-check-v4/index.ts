import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins=new Set(["https://trugogettamixtapes.blogspot.com","https://tru-go-getta-creator-os.olandusgood.chatgpt.site","https://xsofowzvwetamhyuvlpj.supabase.co"]);
const baseHeaders={
  "Access-Control-Allow-Headers":"content-type, apikey, authorization",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store"
};
const cors=(origin:string|null)=>({...baseHeaders,"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"*","Vary":"Origin"});
const out=(body:Record<string,unknown>,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:cors(origin)});
function hex(b:ArrayBuffer){return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase()}
function strength(password:string){
  const classes=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(r=>r.test(password)).length;
  if(password.length<8)return {acceptable:false,reason:"minimum_length"};
  if(password.length>128)return {acceptable:false,reason:"maximum_length"};
  if(password.length<12 && classes<3)return {acceptable:false,reason:"weak_password"};
  return {acceptable:true,reason:null};
}

const signupPurposes=new Set(["creator_os_direct","call_validation_invite"]);
function normalizeEmail(value:unknown){
  return typeof value==="string"?value.trim().toLowerCase():"";
}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
function adminApiKey(){
  const secretKeys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(secretKeys){
    try{
      const parsed=JSON.parse(secretKeys);
      const key=typeof parsed?.default==="string"?parsed.default:"";
      if(key)return {key,legacy:false};
    }catch{}
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  return legacy?{key:legacy,legacy:true}:null;
}
async function issueSignupApproval(email:string,purpose:string){
  const url=Deno.env.get("SUPABASE_URL")||"";
  const adminKey=adminApiKey();
  if(!url||!adminKey)throw new Error("approval_runtime_not_configured");
  const token=crypto.randomUUID();
  const emailHash=await sha256Hex(email);
  const headers:Record<string,string>={
    "Content-Type":"application/json",
    "apikey":adminKey.key
  };
  if(adminKey.legacy)headers.Authorization="Bearer "+adminKey.key;
  const response=await fetch(url+"/rest/v1/rpc/tgg_signup_approval_issue_service",{
    method:"POST",
    headers,
    body:JSON.stringify({p_token:token,p_email_hash:emailHash,p_purpose:purpose})
  });
  if(!response.ok)throw new Error("approval_issue_failed_"+response.status);
  const result=await response.json().catch(()=>({}));
  if(result?.ok!==true)throw new Error("approval_issue_rejected");
  return {token,expiresInSeconds:Number(result?.expires_in_seconds||300)};
}

Deno.serve(async(req)=>{
  const origin=req.headers.get("origin");
  if(origin&&!allowedOrigins.has(origin))return out({ok:false,error:"origin_not_allowed"},403,origin);
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST") return out({ok:false,error:"POST required"},405,origin); const len=Number(req.headers.get("content-length")||0); if(len>2048)return out({ok:false,error:"payload_too_large",acceptable:false},413);
  try{
    const body=await req.json();
    const password=typeof body?.password==="string"?body.password:"";
    if(!password)return out({ok:false,error:"password is required"},400);

    const local=strength(password);
    if(!local.acceptable){
      return out({ok:true,checked:true,breached:false,acceptable:false,reason:local.reason,provider:"TGG local policy"});
    }

    const digest=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(password));
    const hash=hex(digest),prefix=hash.slice(0,5),suffix=hash.slice(5);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    let r:Response;
    try{
      r=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`,{
        signal:controller.signal,
        headers:{"Add-Padding":"true","User-Agent":"TRU-GO-GETTA-Creator-OS"}
      });
    } finally { clearTimeout(timer); }

    if(!r.ok)return out({ok:false,error:"breach_service_unavailable",fail_closed:true,acceptable:false},503);
    const text=await r.text();
    let breached=false;
    for(const line of text.split("\n")){
      const [s]=line.trim().split(":");
      if(s?.toUpperCase()===suffix){ breached=true; break; }
    }

    let approvalToken:string|null=null;
    let approvalExpiresInSeconds:number|null=null;
    const hasSignupContext=body?.email!=null||body?.signup_source!=null;
    if(!breached&&hasSignupContext){
      const email=normalizeEmail(body?.email);
      const purpose=typeof body?.signup_source==="string"?body.signup_source.trim():"";
      if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||!signupPurposes.has(purpose)){
        return out({ok:false,error:"invalid_signup_context",acceptable:false,fail_closed:true},400,origin);
      }
      try{
        const approval=await issueSignupApproval(email,purpose);
        approvalToken=approval.token;
        approvalExpiresInSeconds=approval.expiresInSeconds;
      }catch{
        return out({ok:false,error:"signup_approval_unavailable",acceptable:false,fail_closed:true},503,origin);
      }
    }

    return out({
      ok:true,
      checked:true,
      breached,
      acceptable:!breached,
      reason:breached?"known_compromised_password":null,
      provider:"HIBP Pwned Passwords",
      method:"k-anonymity",
      fail_closed:true,
      ...(approvalToken?{approval_token:approvalToken,approval_expires_in_seconds:approvalExpiresInSeconds}: {})
    });
  } catch {
    return out({ok:false,error:"breach_service_unavailable",fail_closed:true,acceptable:false},503);
  }
});
