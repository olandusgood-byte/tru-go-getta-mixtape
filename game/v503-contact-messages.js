(()=>{
  const VERSION='5.3.0';
  const POLICY='local-only';
  const KEY='tgg-v503-contact-messages';
  const CONTACTS=['M','DJ V','Kane','Rico Flame'];
  const defaults={
    threads:{M:[],'DJ V':[],Kane:[],'Rico Flame':[]},
    unread:{M:0,'DJ V':0,Kane:0,'Rico Flame':0},
    active:null,history:[]
  };
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      const threads={},unread={};
      CONTACTS.forEach(name=>{
        threads[name]=Array.isArray(saved.threads?.[name])?saved.threads[name].slice(-60):[];
        unread[name]=Number(saved.unread?.[name])||0;
      });
      return {...clone(defaults),...saved,threads,unread,history:Array.isArray(saved.history)?saved.history.slice(-80):[]};
    }catch{return clone(defaults)}
  }
  let state=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function ensure(){
    let root=document.getElementById('v503Messages');
    if(!root){
      root=document.createElement('section');
      root.id='v503Messages';
      root.hidden=true;
      root.innerHTML='<div class="v503-shell"><header><div><small>V5.03 • TGG MESSAGES</small><h3 id="v503Title">MESSAGES</h3></div><button id="v503Close" type="button">CLOSE</button></header><div class="v503-body"><aside id="v503Threads"></aside><main><div id="v503Conversation"></div><div class="v503-replies"><button data-v503-reply="LOCKED IN">LOCKED IN</button><button data-v503-reply="SEND DETAILS">SEND DETAILS</button><button data-v503-reply="I GOT YOU">I GOT YOU</button></div></main></div></div>';
      document.body.appendChild(root);
      document.getElementById('v503Close')?.addEventListener('click',closeMessages);
      root.querySelectorAll('[data-v503-reply]').forEach(btn=>btn.addEventListener('click',()=>sendReply(btn.dataset.v503Reply)));
      const style=document.createElement('style');
      style.id='v503MessagesStyle';
      style.textContent='#v503Messages{position:fixed;inset:0;z-index:16500;display:grid;place-items:center;background:#02040ab5;padding:16px;font-family:Inter,system-ui,sans-serif}#v503Messages[hidden]{display:none}.v503-shell{width:min(860px,97vw);height:min(680px,90vh);display:flex;flex-direction:column;border:1px solid #ffffff20;border-radius:24px;background:#080b12f7;color:#eef2f7;box-shadow:0 28px 100px #000d;overflow:hidden}.v503-shell header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #ffffff12}.v503-shell header small{color:#65d6ff;font-size:9px;font-weight:900;letter-spacing:.12em}.v503-shell h3{margin:3px 0 0;font-size:22px}.v503-shell header button{border:1px solid #ffffff20;background:#121722;color:#fff;border-radius:9px;padding:8px 12px;font-weight:900}.v503-body{display:grid;grid-template-columns:240px 1fr;min-height:0;flex:1}.v503-body aside{border-right:1px solid #ffffff12;overflow:auto;padding:8px}.v503-thread{width:100%;display:grid;grid-template-columns:1fr auto;gap:5px;text-align:left;border:0;background:transparent;color:#fff;padding:11px;border-radius:10px;cursor:pointer}.v503-thread:hover,.v503-thread.active{background:#ffffff0d}.v503-thread b{font-size:11px}.v503-thread small{color:#8995a5;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v503-thread i{min-width:17px;height:17px;display:grid;place-items:center;border-radius:99px;background:#65d6ff;color:#051018;font-style:normal;font-size:8px;font-weight:1000}.v503-body main{display:flex;flex-direction:column;min-width:0}.v503-body #v503Conversation{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:7px}.v503-msg{max-width:78%;border-radius:13px;padding:9px 11px;font-size:10px;line-height:1.4}.v503-msg.in{align-self:flex-start;background:#151c29}.v503-msg.out{align-self:flex-end;background:#c7ff0014;border:1px solid #c7ff002d}.v503-msg small{display:block;margin-top:4px;color:#8793a3;font-size:7px}.v503-replies{display:flex;gap:6px;padding:10px;border-top:1px solid #ffffff12}.v503-replies button{flex:1;border:1px solid #ffffff1d;background:#111722;color:#fff;border-radius:9px;padding:9px;font-size:8px;font-weight:900;cursor:pointer}.v503-phone-badge{display:inline-grid;place-items:center;min-width:16px;height:16px;margin-left:5px;padding:0 4px;border-radius:999px;background:#65d6ff;color:#041018;font-size:8px;font-weight:1000;vertical-align:middle}@media(max-width:650px){.v503-body{grid-template-columns:110px 1fr}.v503-replies{flex-direction:column}}';
      document.head.appendChild(style);
    }
    return root;
  }
  function totalUnread(){return CONTACTS.reduce((sum,name)=>sum+(Number(state.unread[name])||0),0)}
  function syncPhoneBadge(){
    const phone=document.getElementById('v501PhoneBtn');
    if(!phone)return 0;
    let badge=phone.querySelector('.v503-phone-badge');
    const count=totalUnread();
    if(count>0){
      if(!badge){badge=document.createElement('span');badge.className='v503-phone-badge';phone.appendChild(badge)}
      badge.textContent=String(Math.min(99,count));
    }else badge?.remove();
    return count;
  }
  function sendMessage(name,text,kind='chat',payload={}){
    if(!CONTACTS.includes(name)||!String(text||'').trim())return {accepted:false,status:'invalid_message'};
    const msg={
      id:name+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      name,text:String(text).trim(),kind:String(kind||'chat'),
      payload:payload&&typeof payload==='object'?{...payload}:{},
      direction:'in',at:Date.now()
    };
    state.threads[name].push(msg);
    state.threads[name]=state.threads[name].slice(-60);
    if(state.active!==name)state.unread[name]=(Number(state.unread[name])||0)+1;
    state.history.push({type:'received',id:msg.id,name,kind:msg.kind,at:msg.at});
    state.history=state.history.slice(-80);
    save();render();syncPhoneBadge();
    window.dispatchEvent(new CustomEvent('tgg:message-received',{detail:{...msg}}));
    return {accepted:!!msg,status:'delivered',message:{...msg}};
  }
  function sendReply(text){
    const name=state.active;
    if(!name||!String(text||'').trim())return {accepted:false,status:'no_active_thread'};
    const msg={
      id:'me-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      name,text:String(text).trim(),kind:'reply',payload:{},direction:'out',at:Date.now()
    };
    state.threads[name].push(msg);
    state.threads[name]=state.threads[name].slice(-60);
    state.history.push({type:'sent',id:msg.id,name,at:msg.at});
    state.history=state.history.slice(-80);
    save();render();
    window.dispatchEvent(new CustomEvent('tgg:message-sent',{detail:{...msg}}));
    return {accepted:!!msg,status:'sent',message:{...msg}};
  }
  function openThread(name){
    if(!CONTACTS.includes(name))return {accepted:false,status:'unknown_contact',name};
    ensure();
    state.active=name;
    state.unread[name]=0;
    save();
    document.getElementById('v503Messages').hidden=false;
    render();syncPhoneBadge();
    return {accepted:state.active===name,status:'open',name,messages:clone(state.threads[name])};
  }
  function openMessages(name=null){
    ensure();
    const next=name&&CONTACTS.includes(name)?name:(state.active||CONTACTS[0]);
    return openThread(next);
  }
  function closeMessages(){
    state.active=null;
    save();
    const root=document.getElementById('v503Messages');if(root)root.hidden=true;
    render();syncPhoneBadge();
    return true;
  }
  function render(){
    const root=ensure();
    const threads=document.getElementById('v503Threads');
    const conversation=document.getElementById('v503Conversation');
    if(!threads||!conversation)return;
    threads.innerHTML=CONTACTS.map(name=>{
      const items=state.threads[name]||[];
      const last=items[items.length-1];
      const unread=Number(state.unread[name])||0;
      return '<button type="button" class="v503-thread '+(state.active===name?'active':'')+'" data-v503-thread="'+name.replaceAll('"','&quot;')+'"><span><b>'+name+'</b><small>'+(last?last.text:'No messages yet')+'</small></span>'+(unread?'<i>'+unread+'</i>':'')+'</button>';
    }).join('');
    threads.querySelectorAll('[data-v503-thread]').forEach(btn=>btn.onclick=()=>openThread(btn.dataset.v503Thread));
    const name=state.active;
    document.getElementById('v503Title').textContent=name?name+' • MESSAGES':'MESSAGES';
    const list=name?(state.threads[name]||[]):[];
    conversation.innerHTML=list.length?list.map(msg=>'<div class="v503-msg '+(msg.direction==='out'?'out':'in')+'"><span>'+String(msg.text).replaceAll('<','&lt;').replaceAll('>','&gt;')+'</span><small>'+String(msg.kind).toUpperCase()+' • '+new Date(msg.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</small></div>').join(''):'<div class="v503-msg in">No messages yet.</div>';
    conversation.scrollTop=conversation.scrollHeight;
    syncPhoneBadge();
  }
  function seedSystemHooks(){
    window.addEventListener('tgg:npc-choice-resolved',e=>{
      const d=e.detail||{};if(d.name)sendMessage(d.name,'Good move. I saw how you handled that — stay ready.','relationship',{choice:d.choice});
    });
    window.addEventListener('tgg:npc-favor',e=>{
      const d=e.detail||{};if(d.name)sendMessage(d.name,'I put something together for you. Follow the route and handle it.','favor',{beat:d.beat});
    });
    window.addEventListener('tgg:npc-favor-outcome',e=>{
      const d=e.detail||{};if(d.name)sendMessage(d.name,d.type==='favor-complete'?'That is how you handle business.':'You missed that one. Make the next move count.','favor-outcome',{outcome:d.type});
    });
    window.addEventListener('tgg:career-contract-start',e=>{
      const d=e.detail||{};if(d.sponsor)sendMessage(d.sponsor,'This contract has your name on it. Finish strong.','contract',{id:d.id});
    });
    window.addEventListener('tgg:career-contract-outcome',e=>{
      const d=e.detail||{};if(d.sponsor)sendMessage(d.sponsor,d.completed?'You delivered. More doors are opening.':'That contract slipped. We regroup and move smarter.','contract-outcome',{id:d.id,completed:!!d.completed});
    });
  }
  function snapshot(){
    return {
      version:VERSION,mutationPolicy:POLICY,active:state.active,
      unread:{...state.unread},totalUnread:totalUnread(),
      threads:clone(state.threads),history:state.history.slice(-80)
    };
  }
  function run(){
    const root=ensure();
    const checks={
      ui:!!root,
      phone:!!window.TGGPhone,
      contacts:CONTACTS.length===4,
      persistence:!!state.threads&&!!state.unread,
      routing:typeof openThread==='function'&&typeof sendMessage==='function',
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    return {version:VERSION,mutationPolicy:POLICY,ok:!failed.length,checks,failed,snapshot:snapshot(),at:new Date().toISOString()};
  }
  function boot(){
    ensure();seedSystemHooks();render();
    window.TGGMessages={version:VERSION,mutationPolicy:POLICY,sendMessage,sendReply,openThread,openMessages,closeMessages,totalUnread,snapshot,run};
    window.TGGV503={version:VERSION,mutationPolicy:POLICY,run,snapshot};
    document.documentElement.dataset.tggV503='on';
    window.dispatchEvent(new CustomEvent('tgg:v503-ready',{detail:run()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();