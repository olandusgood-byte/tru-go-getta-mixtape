(()=>{
  const VERSION='5.5.0';
  const POLICY='local-only';
  const KEY='tgg-v505-call-sessions';
  const defaults={active:null,history:[],completed:0,lastEnded:null};
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...saved,active:null,history:Array.isArray(saved.history)?saved.history.slice(-40):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify({...state,active:null}))}catch{}return state}
  function ensure(){
    let root=document.getElementById('v505CallSession');
    if(!root){
      root=document.createElement('aside');
      root.id='v505CallSession';
      root.hidden=true;
      root.innerHTML='<div class="v505-call-head"><span class="v505-live-dot"></span><div><small>ACTIVE TGG CALL</small><b id="v505CallName">CONTACT</b></div><i id="v505CallTime">00:00</i></div><div id="v505CallReason">CHECK-IN</div><div class="v505-call-controls"><button id="v505Mute" type="button">MUTE</button><button id="v505Speaker" type="button">SPEAKER</button><button id="v505End" type="button">END CALL</button></div>';
      document.body.appendChild(root);
      document.getElementById('v505Mute')?.addEventListener('click',toggleMute);
      document.getElementById('v505Speaker')?.addEventListener('click',toggleSpeaker);
      document.getElementById('v505End')?.addEventListener('click',()=>endCall('user-ended'));
      const style=document.createElement('style');
      style.id='v505CallStyle';
      style.textContent='#v505CallSession{position:fixed;right:16px;bottom:86px;z-index:16800;width:min(320px,calc(100vw - 32px));padding:11px;border:1px solid #39dd7950;border-radius:16px;background:#07100ded;color:#eef2f7;box-shadow:0 18px 50px #000a;font-family:Inter,system-ui,sans-serif}#v505CallSession[hidden]{display:none}.v505-call-head{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}.v505-live-dot{width:10px;height:10px;border-radius:50%;background:#39dd79;box-shadow:0 0 12px #39dd79}.v505-call-head small{display:block;color:#39dd79;font-size:8px;font-weight:900;letter-spacing:.1em}.v505-call-head b{display:block;font-size:12px}.v505-call-head i{font-style:normal;font-size:10px;color:#aeb8c6}#v505CallReason{margin:8px 0;color:#9aa6b6;font-size:9px}.v505-call-controls{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:6px}.v505-call-controls button{border:1px solid #ffffff1d;background:#111821;color:#fff;border-radius:9px;padding:8px 6px;font-size:8px;font-weight:900;cursor:pointer}.v505-call-controls button.active{border-color:#39dd79;color:#39dd79}.v505-call-controls #v505End{border-color:#ff4d6755;color:#ff7388}';
      document.head.appendChild(style);
    }
    return root;
  }
  function formatTime(ms){
    const s=Math.max(0,Math.floor(ms/1000)),m=Math.floor(s/60),r=s%60;
    return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');
  }
  function render(){
    const root=ensure(),a=state.active;
    root.hidden=!a;
    if(!a)return;
    document.getElementById('v505CallName').textContent=a.name;
    document.getElementById('v505CallReason').textContent=String(a.reason||a.action||'check-in').toUpperCase();
    document.getElementById('v505CallTime').textContent=formatTime(Date.now()-a.startedAt);
    document.getElementById('v505Mute')?.classList.toggle('active',!!a.muted);
    document.getElementById('v505Speaker')?.classList.toggle('active',!!a.speaker);
    document.getElementById('v505Mute').textContent=a.muted?'UNMUTE':'MUTE';
    document.getElementById('v505Speaker').textContent=a.speaker?'SPEAKER ON':'SPEAKER';
  }
  function startFromAccepted(detail={}){
    const call=detail.call||detail?.routed?.call||null;
    if(!call?.name)return {accepted:false,status:'invalid_call'};
    if(state.active)endCall('replaced');
    state.active={
      id:call.id||call.name+'-'+Date.now(),name:call.name,
      reason:call.reason||'check-in',action:call.action||'relationship',
      startedAt:Date.now(),muted:false,speaker:false,
      routeKind:detail.routed?.kind||null
    };
    render();
    window.dispatchEvent(new CustomEvent('tgg:call-session-start',{detail:{...state.active}}));
    return {accepted:!!state.active,status:'active',session:{...state.active}};
  }
  function toggleMute(){
    if(!state.active)return false;
    state.active.muted=!state.active.muted;render();
    return state.active.muted;
  }
  function toggleSpeaker(){
    if(!state.active)return false;
    state.active.speaker=!state.active.speaker;render();
    return state.active.speaker;
  }
  function endCall(reason='ended'){
    if(!state.active)return {accepted:false,status:'no_active_call'};
    const ended={
      ...state.active,endedAt:Date.now(),
      durationMs:Math.max(0,Date.now()-state.active.startedAt),
      endReason:String(reason||'ended')
    };
    state.completed=(Number(state.completed)||0)+1;
    state.lastEnded=ended;
    state.history.push(ended);
    state.history=state.history.slice(-40);
    state.active=null;save();render();
    window.TGGMessages?.sendMessage?.(ended.name,'Good talking to you. Stay locked in.','call-follow-up',{durationMs:ended.durationMs,action:ended.action});
    window.dispatchEvent(new CustomEvent('tgg:call-session-end',{detail:{...ended}}));
    return {accepted:!!ended,status:'ended',session:ended};
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,active:state.active?{...state.active}:null,completed:state.completed,lastEnded:state.lastEnded?{...state.lastEnded}:null,history:state.history.slice(-40)}}
  function run(){
    const root=ensure();
    const checks={
      ui:!!root,
      incoming:!!window.TGGIncomingCalls,
      messages:!!window.TGGMessages,
      controls:!!document.getElementById('v505Mute')&&!!document.getElementById('v505Speaker')&&!!document.getElementById('v505End'),
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensure();render();
    window.addEventListener('tgg:call-accepted',e=>startFromAccepted(e.detail||{}));
    setInterval(()=>{if(state.active)render()},500);
    window.TGGCallSessions={version:VERSION,mutationPolicy:POLICY,startFromAccepted,toggleMute,toggleSpeaker,endCall,snapshot,run};
    window.TGGV505={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV505='on';
    window.dispatchEvent(new CustomEvent('tgg:v505-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();