(()=>{
  const VERSION='5.4.0';
  const POLICY='local-only';
  const KEY='tgg-v504-contact-meetups';
  const CONTACTS={
    M:{label:'M • MANAGER MEETUP',x:72,y:36,color:'#3b82f6'},
    'DJ V':{label:'DJ V • SHOW MEETUP',x:52,y:68,color:'#a855f7'},
    Kane:{label:'KANE • STUDIO MEETUP',x:24,y:37,color:'#ff8a3d'},
    'Rico Flame':{label:'RICO FLAME • STREET MEETUP',x:76,y:63,color:'#ff3b30'}
  };
  const defaults={active:null,completed:0,history:[],lastCompleted:null};
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...clone(defaults),...saved,history:Array.isArray(saved.history)?saved.history.slice(-40):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function game(){return window.TGGGame?.getState?.()||{}}
  function createMeetup(name,{source='contact',target=null,label=null}={}){
    if(!CONTACTS[name])return {accepted:false,status:'unknown_contact',name};
    if(state.active)return {accepted:false,status:'meetup_active',active:{...state.active}};
    const base=CONTACTS[name],t=target&&Number.isFinite(Number(target.x))&&Number.isFinite(Number(target.y))?target:base;
    state.active={
      id:name+'-'+Date.now(),name,source:String(source||'contact'),
      label:String(label||base.label),x:Number(t.x),y:Number(t.y),
      radius:Number(t.radius)||7,color:String(t.color||base.color),
      createdAt:Date.now()
    };
    state.history.push({type:'start',...state.active});
    state.history=state.history.slice(-40);
    save();render();
    window.TGGGameFeel?.objective?.('MEET '+name,state.active.label+' • ROUTE ACTIVE');
    window.dispatchEvent(new CustomEvent('tgg:meetup-start',{detail:{...state.active}}));
    return {accepted:!!state.active,status:'routed',meetup:{...state.active},navigation:navigationTarget()};
  }
  function navigationTarget(){
    const m=state.active;if(!m)return null;
    const g=game();
    const dx=(Number(m.x)||50)-(Number(g.x)||50);
    const dy=(Number(m.y)||50)-(Number(g.y)||55);
    const distance=Math.hypot(dx,dy);
    const bearing=Math.atan2(dy,dx)*180/Math.PI;
    const heading=Number(g.heading)||0;
    const relative=((bearing-heading+540)%360)-180;
    return {
      id:m.id,name:m.name,label:m.label,x:m.x,y:m.y,radius:m.radius,color:m.color,
      distance,meters:Math.max(0,Math.round(distance*3.2)),
      arrived:distance<=m.radius,relative,source:m.source
    };
  }
  function completeMeetup(){
    const nav=navigationTarget();
    if(!nav)return {accepted:false,status:'no_meetup'};
    if(!nav.arrived){
      window.TGGGameFeel?.objective?.('MEET '+nav.name,nav.meters+' m • FOLLOW CONTACT MARKER');
      return {accepted:false,status:'travel_required',navigation:nav};
    }
    const completed={...state.active,completedAt:Date.now()};
    state.completed=(Number(state.completed)||0)+1;
    state.lastCompleted=completed;
    state.history.push({type:'complete',...completed});
    state.history=state.history.slice(-40);
    state.active=null;
    save();render();
    window.TGGNPCRelations?.adjustAffinity?.(completed.name,2,'meetup-complete');
    window.TGGLifeSim?.change?.({social:3,momentum:1});
    window.TGGGameFeel?.objective?.('MEETUP COMPLETE',completed.name+' • RELATIONSHIP UP');
    window.dispatchEvent(new CustomEvent('tgg:meetup-complete',{detail:{...completed}}));
    return {accepted:!!completed,status:'complete',meetup:completed};
  }
  function cancelMeetup(reason='cancelled'){
    if(!state.active)return {accepted:false,status:'no_meetup'};
    const old={...state.active,reason:String(reason),at:Date.now()};
    state.history.push({type:'cancel',...old});
    state.history=state.history.slice(-40);
    state.active=null;save();render();
    return {accepted:true===false?true:false,status:'cancelled',meetup:old};
  }
  function ensureHud(){
    let root=document.getElementById('v504MeetupHud');
    if(!root){
      root=document.createElement('aside');
      root.id='v504MeetupHud';
      root.hidden=true;
      root.innerHTML='<small>CONTACT MEETUP</small><b id="v504MeetupTitle">NO ACTIVE MEETUP</b><span id="v504MeetupDistance"></span>';
      document.body.appendChild(root);
      const style=document.createElement('style');
      style.id='v504MeetupStyle';
      style.textContent='#v504MeetupHud{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:11880;min-width:220px;padding:8px 12px;border:1px solid #65d6ff40;border-radius:12px;background:#071019e8;color:#eef2f7;text-align:center;font-family:Inter,system-ui,sans-serif;box-shadow:0 12px 40px #0008}#v504MeetupHud[hidden]{display:none}#v504MeetupHud small{display:block;color:#65d6ff;font-size:8px;font-weight:900;letter-spacing:.12em}#v504MeetupHud b{display:block;margin-top:3px;font-size:10px}#v504MeetupHud span{display:block;margin-top:2px;color:#9fb0c1;font-size:8px}';
      document.head.appendChild(style);
    }
    return root;
  }
  function render(){
    const root=ensureHud(),nav=navigationTarget();
    root.hidden=!nav;
    if(!nav)return;
    document.getElementById('v504MeetupTitle').textContent=nav.label;
    document.getElementById('v504MeetupDistance').textContent=nav.arrived?'ARRIVED • INTERACT':nav.meters+' m • FOLLOW MARKER';
  }
  function handleLocationMessage(detail={}){
    if(detail.kind!=='location'||!CONTACTS[detail.name])return false;
    const target=detail.payload?.target||null;
    if(state.active)return false;
    return !!createMeetup(detail.name,{source:'message',target,label:detail.text})?.accepted;
  }
  function snapshot(){return {version:VERSION,mutationPolicy:POLICY,active:state.active?{...state.active}:null,navigation:navigationTarget(),completed:state.completed,lastCompleted:state.lastCompleted?{...state.lastCompleted}:null,history:state.history.slice(-40)}}
  function run(){
    const root=ensureHud();
    const checks={
      ui:!!root,
      game:!!window.TGGGame,
      relations:!!window.TGGNPCRelations,
      contacts:Object.keys(CONTACTS).length===4,
      navigation:typeof navigationTarget==='function',
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensureHud();render();
    window.addEventListener('tgg:message-received',e=>{handleLocationMessage(e.detail||{});render()});
    setInterval(render,500);
    window.TGGMeetups={version:VERSION,mutationPolicy:POLICY,createMeetup,navigationTarget,completeMeetup,cancelMeetup,handleLocationMessage,snapshot,run};
    window.TGGV504={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV504='on';
    window.dispatchEvent(new CustomEvent('tgg:v504-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();