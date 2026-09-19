(()=>{
  const VERSION='5.2.0';
  const POLICY='local-only';
  const KEY='tgg-v502-incoming-calls';
  const CONTACTS=['M','DJ V','Kane','Rico Flame'];
  const defaults={current:null,queue:[],history:[],accepted:0,declined:0,missed:0,lastResult:null};
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {
        ...clone(defaults),...saved,
        queue:Array.isArray(saved.queue)?saved.queue.slice(0,8):[],
        history:Array.isArray(saved.history)?saved.history.slice(-50):[]
      };
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function ensure(){
    let root=document.getElementById('v502IncomingCall');
    if(!root){
      root=document.createElement('section');
      root.id='v502IncomingCall';
      root.hidden=true;
      root.innerHTML='<div class="v502-call-card"><small>INCOMING TGG CALL</small><div class="v502-avatar">TGG</div><h3 id="v502Caller">CONTACT</h3><p id="v502Reason">CHECK-IN</p><div class="v502-call-actions"><button id="v502Decline" type="button">DECLINE</button><button id="v502Accept" type="button">ACCEPT</button></div></div>';
      document.body.appendChild(root);
      document.getElementById('v502Accept')?.addEventListener('click',acceptCurrent);
      document.getElementById('v502Decline')?.addEventListener('click',declineCurrent);
      const style=document.createElement('style');
      style.id='v502IncomingCallStyle';
      style.textContent='#v502IncomingCall{position:fixed;inset:0;z-index:17000;display:grid;place-items:center;background:#02040a99;padding:18px;font-family:Inter,system-ui,sans-serif}#v502IncomingCall[hidden]{display:none}.v502-call-card{width:min(380px,94vw);text-align:center;border:1px solid #ffffff24;border-radius:28px;background:#080b12f7;box-shadow:0 30px 100px #000e;padding:24px;color:#eef2f7}.v502-call-card>small{color:#c7ff00;font-size:9px;font-weight:900;letter-spacing:.14em}.v502-avatar{width:88px;height:88px;margin:18px auto 12px;border:1px solid #c7ff0050;border-radius:50%;display:grid;place-items:center;background:#c7ff0012;color:#c7ff00;font-size:24px;font-weight:1000}.v502-call-card h3{margin:0;font-size:30px}.v502-call-card p{margin:6px 0 20px;color:#aeb8c6;font-size:11px;font-weight:800}.v502-call-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.v502-call-actions button{border-radius:14px;padding:13px;font-weight:1000;cursor:pointer}.v502-call-actions #v502Decline{border:1px solid #ff4d6750;background:#ff4d6712;color:#ff7388}.v502-call-actions #v502Accept{border:1px solid #c7ff0060;background:#c7ff0012;color:#c7ff00}.v502-phone-badge{display:inline-grid;place-items:center;min-width:16px;height:16px;margin-left:6px;padding:0 4px;border-radius:999px;background:#ff3b30;color:#fff;font-size:8px;font-weight:1000;vertical-align:middle}';
      document.head.appendChild(style);
    }
    return root;
  }
  function reasonLabel(call){
    if(call.action==='favor')return 'FAVOR READY • '+String(call.reason||'OPPORTUNITY').toUpperCase();
    if(call.action==='contract')return 'CAREER CONTRACT • '+String(call.reason||'OPPORTUNITY').toUpperCase();
    return String(call.reason||'CHECK-IN').toUpperCase();
  }
  function syncBadge(){
    const phone=document.getElementById('v501PhoneBtn');
    if(!phone)return null;
    let badge=phone.querySelector('.v502-phone-badge');
    const count=Number(state.missed)||0;
    if(count>0){
      if(!badge){badge=document.createElement('span');badge.className='v502-phone-badge';phone.appendChild(badge)}
      badge.textContent=String(Math.min(99,count));
    }else badge?.remove();
    return count;
  }
  function render(){
    const root=ensure(),call=state.current;
    root.hidden=!call;
    if(call){
      document.getElementById('v502Caller').textContent=call.name;
      document.getElementById('v502Reason').textContent=reasonLabel(call);
    }
    syncBadge();
  }
  function normalizeCall(name,reason='check-in',action='relationship',payload={}){
    if(!CONTACTS.includes(name))return null;
    const valid=['relationship','favor','contract'];
    return {
      id:name+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      name,reason:String(reason||'check-in'),
      action:valid.includes(action)?action:'relationship',
      payload:payload&&typeof payload==='object'?{...payload}:{},
      createdAt:Date.now()
    };
  }
  function queueCall(name,reason='check-in',action='relationship',payload={}){
    const call=normalizeCall(name,reason,action,payload);
    if(!call)return {accepted:false,status:'unknown_contact',name};
    const duplicate=[state.current,...state.queue].filter(Boolean).some(x=>x.name===call.name&&x.action===call.action&&x.reason===call.reason);
    if(duplicate)return {accepted:false,status:'duplicate',call};
    if(!state.current)state.current=call;
    else state.queue.push(call);
    state.queue=state.queue.slice(0,8);
    state.history.push({type:'queued',...call});
    state.history=state.history.slice(-50);
    save();render();
    window.dispatchEvent(new CustomEvent('tgg:incoming-call',{detail:{...call}}));
    return {accepted:!!call,status:'ringing',call:{...call}};
  }
  function nextCall(){
    state.current=state.queue.shift()||null;
    save();render();
    return state.current?{...state.current}:null;
  }
  function routeAccepted(call){
    if(call.action==='favor'){
      const result=window.TGGNPCFavors?.callFavor?.(call.name)||{ok:false,status:'favors_unavailable'};
      return {kind:'favor',success:!!result?.ok,result};
    }
    if(call.action==='contract'){
      const result=window.TGGCareerContracts?.startContract?.(call.payload?.contractId||null)||{ok:false,status:'contracts_unavailable'};
      return {kind:'contract',success:!!result?.ok,result};
    }
    const result=window.TGGNPCRelations?.interact?.(call.name)||{ok:false,status:'relations_unavailable'};
    return {kind:'relationship',success:!!result?.ok,result};
  }
  function acceptCurrent(){
    const call=state.current;
    if(!call)return {accepted:false,status:'no_call'};
    const routed=routeAccepted(call);
    state.accepted=(Number(state.accepted)||0)+1;
    state.lastResult={type:'accepted',call:{...call},routed,at:Date.now()};
    state.history.push({type:'accepted',id:call.id,name:call.name,action:call.action,success:routed.success,at:Date.now()});
    state.history=state.history.slice(-50);
    state.current=null;
    save();render();nextCall();
    window.dispatchEvent(new CustomEvent('tgg:call-accepted',{detail:clone(state.lastResult)}));
    return {accepted:routed.success,status:routed.success?'routed':'route_failed',call:{...call},routed};
  }
  function declineCurrent(){
    const call=state.current;
    if(!call)return {accepted:false,status:'no_call'};
    state.declined=(Number(state.declined)||0)+1;
    state.missed=(Number(state.missed)||0)+1;
    state.lastResult={type:'declined',call:{...call},at:Date.now()};
    state.history.push({type:'declined',id:call.id,name:call.name,action:call.action,at:Date.now()});
    state.history=state.history.slice(-50);
    state.current=null;
    save();render();nextCall();
    window.dispatchEvent(new CustomEvent('tgg:call-declined',{detail:clone(state.lastResult)}));
    return {accepted:false,status:'declined',call:{...call}};
  }
  function clearMissed(){state.missed=0;save();syncBadge();return 0}
  function autoOffer(){
    if(state.current||state.queue.length)return null;
    const contract=window.TGGCareerContracts?.recommendContract?.();
    if(contract?.eligible)return queueCall(contract.sponsor,contract.label,'contract',{contractId:contract.id});
    const names=CONTACTS;
    for(const name of names){
      const favor=window.TGGNPCFavors?.availability?.(name);
      if(favor?.ready)return queueCall(name,favor.label,'favor',{});
    }
    return null;
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,current:state.current?{...state.current}:null,queue:clone(state.queue),history:state.history.slice(-50),accepted:state.accepted,declined:state.declined,missed:state.missed,lastResult:state.lastResult?clone(state.lastResult):null}}
  function run(){
    const root=ensure();
    const checks={
      ui:!!root,
      phone:!!window.TGGPhone,
      relations:!!window.TGGNPCRelations,
      contacts:CONTACTS.length===4,
      routing:typeof routeAccepted==='function',
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensure();render();
    document.getElementById('v501PhoneBtn')?.addEventListener('click',clearMissed);
    window.addEventListener('tgg:npc-favor-outcome',()=>setTimeout(autoOffer,120));
    window.addEventListener('tgg:career-contract-outcome',()=>setTimeout(autoOffer,120));
    window.TGGIncomingCalls={version:VERSION,mutationPolicy:POLICY,queueCall,acceptCurrent,declineCurrent,clearMissed,autoOffer,snapshot,run};
    window.TGGV502={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV502='on';
    window.dispatchEvent(new CustomEvent('tgg:v502-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();