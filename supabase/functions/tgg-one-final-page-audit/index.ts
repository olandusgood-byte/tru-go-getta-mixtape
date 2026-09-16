import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = "https://xsofowzvwetamhyuvlpj.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_mJQg4LjW-9KsW5B1zzJH8Q_e-kA-bbv";
const VERSION = "TGG-ACTIVATION-BRIDGE-V1";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07070a">
<title>TGG Activation Bridge</title>
<style>
:root{--bg:#07070a;--panel:#101015;--panel2:#15151c;--line:#292932;--text:#f7f7f9;--muted:#94949e;--red:#e50914;--good:#65dca0;--warn:#f0c36a}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}body{padding:22px;background:radial-gradient(circle at 85% 0,rgba(229,9,20,.16),transparent 28%),var(--bg)}.shell{max-width:1180px;margin:0 auto}.top{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:18px}.brand{display:flex;gap:12px;align-items:center}.mark{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#ff3046,#9f0711);font-weight:1000;font-size:11px}.ey{font-size:9px;letter-spacing:.18em;color:#777783;font-weight:900}.top h1{font-size:22px;margin:4px 0 0}.pill{border:1px solid var(--line);background:#0c0c11;border-radius:999px;padding:8px 11px;color:var(--muted);font-size:10px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}.card{grid-column:span 6;border:1px solid var(--line);border-radius:18px;background:linear-gradient(160deg,rgba(18,18,24,.98),rgba(10,10,14,.98));padding:18px}.wide{grid-column:span 12}.card h2{font-size:15px;margin:0 0 5px}.card p{font-size:11px;line-height:1.55;color:var(--muted);margin:0 0 14px}.row{display:grid;gap:9px}.two{grid-template-columns:1fr 1fr}input,button,a.btn{width:100%;min-height:42px;border-radius:10px;border:1px solid var(--line);background:#0a0a0f;color:#fff;padding:10px 12px;font:inherit;font-size:11px;outline:none}input:focus{border-color:#555563}.secret{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}button,a.btn{cursor:pointer;font-weight:900;text-decoration:none;text-align:center;display:grid;place-items:center}.primary{background:linear-gradient(135deg,#e50914,#b40710);border-color:transparent}.ghost{background:#121218}.good{color:var(--good)}.warn{color:var(--warn)}.hidden{display:none!important}.status{white-space:pre-wrap;border:1px solid var(--line);border-radius:12px;background:#09090d;padding:12px;min-height:46px;color:#b6b6bf;font-size:10px;line-height:1.5;margin-top:11px}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.toolbar button,.toolbar a{width:auto;min-width:130px}.json{max-height:330px;overflow:auto}.note{font-size:9px;color:#70707b;margin-top:9px}.login{max-width:520px;margin:10vh auto;border:1px solid var(--line);border-radius:22px;padding:24px;background:#0d0d12}.login h1{margin:6px 0;font-size:26px}.login p{color:var(--muted);font-size:11px;line-height:1.6}.login .row{margin-top:16px}@media(max-width:780px){body{padding:12px}.card{grid-column:span 12}.two{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div id="login" class="login">
  <div class="mark">TGG</div><div class="ey" style="margin-top:14px">OWNER CONTROL · ${VERSION}</div>
  <h1>Activation Bridge</h1>
  <p>Sign in with the TGG owner account. Provider secrets go directly from this browser to owner-only Supabase RPCs and Vault. They are never displayed back after save.</p>
  <div class="row"><input id="email" type="email" autocomplete="username" placeholder="Owner email"><input id="password" type="password" autocomplete="current-password" placeholder="Owner password"><button id="signIn" class="primary">Sign in</button></div>
  <div id="loginStatus" class="status">Waiting for owner sign-in.</div>
</div>
<div id="app" class="shell hidden">
  <div class="top"><div class="brand"><div class="mark">TGG</div><div><div class="ey">MASTER ADMIN · FULL CONNECT</div><h1>Activation Bridge</h1></div></div><div id="who" class="pill">Owner</div></div>
  <div class="grid">
    <section class="card wide"><h2>Connection status</h2><p>Core launch is already certified. This page handles only optional provider activation and maintenance.</p><div class="toolbar"><button id="refresh" class="ghost">Refresh status</button><a class="btn ghost" href="https://supabase.com/dashboard/project/xsofowzvwetamhyuvlpj/auth/providers?provider=Email" target="_blank" rel="noopener">Auth Security</a><button id="signOut" class="ghost">Sign out</button></div><div id="overview" class="status json">Loading…</div></section>
    <section class="card"><h2>LiveKit / SFU-TURN</h2><p>Store the LiveKit WSS endpoint, API key, and API secret in TGG Vault, then queue endpoint verification.</p><div class="row"><input id="lkUrl" placeholder="wss://your-project.livekit.cloud"><input id="lkKey" class="secret" autocomplete="off" placeholder="LiveKit API key"><input id="lkSecret" class="secret" type="password" autocomplete="new-password" placeholder="LiveKit API secret"><button id="saveLiveKit" class="primary">Save + verify LiveKit</button></div><div id="livekitStatus" class="status">Not submitted.</div></section>
    <section class="card"><h2>DSP distribution</h2><p>Secure Revelator-style partner credentials. The partner API key must be a UUID; the user ID is stored with it in Vault.</p><div class="row"><input id="dspUrl" placeholder="https://provider.example/api"><input id="dspKey" class="secret" type="password" autocomplete="new-password" placeholder="Partner API key UUID"><input id="dspUser" class="secret" autocomplete="off" placeholder="Partner user ID"><button id="saveDsp" class="primary">Save + verify DSP</button></div><div id="dspStatus" class="status">Not submitted.</div></section>
    <section class="card"><h2>Blogger reconnect</h2><p>Creates a new owner-only one-time OAuth reconnect link valid for 60 minutes. Existing unused reconnect links are invalidated.</p><button id="bloggerReconnect" class="primary">Reconnect Blogger</button><div id="bloggerStatus" class="status">Current connection will be checked on refresh.</div></section>
    <section class="card"><h2>Stripe native checkout</h2><p>Live Payment Links and the canonical webhook are already production-ready. Native/custom Checkout remains optional and requires a server secret not exposed by the connected Stripe app.</p><div class="status good">Core payments: READY via Payment Links + signed webhook. No launch blocker.</div></section>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
const U=${JSON.stringify(SUPABASE_URL)},K=${JSON.stringify(PUBLISHABLE_KEY)};
const sb=window.supabase.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const fmt=x=>JSON.stringify(x,null,2);
async function rpc(name,args={}){const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}
function clearSecrets(){['#password','#lkKey','#lkSecret','#dspKey'].forEach(s=>{const e=$(s);if(e)e.value=''})}
async function requireOwner(){const {data:{session}}=await sb.auth.getSession();if(!session)return false;const {data,error}=await sb.auth.getUser();if(error||!data?.user||data.user.app_metadata?.tgg_role!=='owner'){await sb.auth.signOut();return false}$('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#who').textContent=data.user.email||'TGG Owner';return true}
async function refresh(){const out=$('#overview');out.textContent='Refreshing…';try{const [exp,ready,queue]=await Promise.all([rpc('tgg_creator_expansion_control_center'),rpc('tgg_one_final_activation_readiness'),rpc('tgg_one_final_activation_queue')]);out.textContent=fmt({expansion:exp,readiness:ready,activation_queue:queue})}catch(e){out.textContent='ERROR: '+(e.message||String(e))}}
$('#signIn').onclick=async()=>{const out=$('#loginStatus');out.textContent='Signing in…';try{const {data,error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)throw error;if(data?.user?.app_metadata?.tgg_role!=='owner'){await sb.auth.signOut();throw new Error('OWNER_REQUIRED')}clearSecrets();await requireOwner();await refresh()}catch(e){clearSecrets();out.textContent='ERROR: '+(e.message||String(e))}};
$('#refresh').onclick=refresh;
$('#signOut').onclick=async()=>{await sb.auth.signOut();location.reload()};
$('#saveLiveKit').onclick=async()=>{const out=$('#livekitStatus');out.textContent='Saving securely…';const endpoint=$('#lkUrl').value.trim(),apiKey=$('#lkKey').value.trim(),apiSecret=$('#lkSecret').value;try{const data=await rpc('tgg_livekit_credentials_save',{p_endpoint_url:endpoint,p_api_key:apiKey,p_api_secret:apiSecret});$('#lkKey').value='';$('#lkSecret').value='';out.textContent='Saved to Vault. Secret returned: NO\n'+fmt(data);await refresh()}catch(e){$('#lkSecret').value='';out.textContent='ERROR: '+(e.message||String(e))}};
$('#saveDsp').onclick=async()=>{const out=$('#dspStatus');out.textContent='Saving securely…';const endpoint=$('#dspUrl').value.trim(),partnerKey=$('#dspKey').value.trim(),partnerUser=$('#dspUser').value.trim();try{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerKey))throw new Error('Partner API key must be a UUID.');await rpc('tgg_provider_activation_stage',{p_provider_key:'distribution.provider',p_endpoint_url:endpoint,p_secret_reference:'tgg_distribution_provider_secret'});const stored=await rpc('tgg_store_provider_secret',{p_provider_key:'distribution.provider',p_secret_value:JSON.stringify({partner_api_key:partnerKey,partner_user_id:partnerUser})});const verify=await rpc('tgg_provider_activation_verify',{p_provider_key:'distribution.provider'});$('#dspKey').value='';out.textContent='Stored in Vault. Secret returned: NO\n'+fmt({stored,verify});await refresh()}catch(e){$('#dspKey').value='';out.textContent='ERROR: '+(e.message||String(e))}};
$('#bloggerReconnect').onclick=async()=>{const out=$('#bloggerStatus');out.textContent='Creating one-time reconnect…';try{const data=await rpc('tgg_blogger_reconnect_link_create');if(!data?.url)throw new Error('Reconnect URL not returned.');out.textContent='Opening Google OAuth…';location.href=data.url}catch(e){out.textContent='ERROR: '+(e.message||String(e))}};
(async()=>{if(await requireOwner())await refresh()})();
</script>
</body></html>`;

Deno.serve((req) => {
  if (req.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json","cache-control":"no-store"}});
  return new Response(html, {status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate","x-tgg-activation-bridge":VERSION,"x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
});
