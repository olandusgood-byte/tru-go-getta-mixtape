(()=>{
  const VERSION='V2.46 TGG CONSEQUENCE + RELATIONSHIP WORLD 100',KEY='tgg-v246-consequence-world';
  const blank=()=>({resolved:false,identity:{career:null,sound:null,visual:null},relationships:{manager:{score:0,tier:'NEW'},kane:{score:0,tier:'NEW'},director:{score:0,tier:'NEW'}},perks:{manager:null,kane:null,director:null},arc:null,lastChoiceSignature:'',history:[]});
  let state=blank(),panel=null,badge=null,lastApplied='';
  const hasDOM=()=>typeof document!=='undefined';
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)state={...blank(),...s,identity:{...blank().identity,...s.identity},relationships:{...blank().relationships,...s.relationships},perks:{...blank().perks,...s.perks}}}catch{}}
  function status(){return {version:VERSION,mode:'persistent-choice-consequences',layerCount:100,...JSON.parse(JSON.stringify(state))}}
  function signature(v){return [v?.choices?.manager||'',v?.choices?.kane||'',v?.choices?.director||'',v?.epilogue?'1':'0'].join('|')}
  function ensureUI(){
    if(!hasDOM()||panel)return;
    const btn=document.createElement('button');btn.id='v246ConsequencesBtn';btn.className='v246-consequence-btn';btn.textContent='CONSEQUENCES';document.body.appendChild(btn);
    badge=document.createElement('div');badge.id='v246WorldBadge';badge.className='v246-world-badge';document.body.appendChild(badge);
    panel=document.createElement('section');panel.id='v246ConsequencesPanel';panel.className='v246-consequence-panel';
    panel.innerHTML='<small>V2.46 • CONSEQUENCE WORLD</small><b>YOUR CHOICES LIVE HERE.</b><p id="v246Identity"></p><div id="v246Relations" class="v246-relations"></div><div id="v246Perks" class="v246-perks"></div><article id="v246Arc" class="v246-arc"></article><button id="v246Follow" class="v246-follow">FOLLOW NEXT ARC</button><button id="v246Close" class="v246-close">CLOSE</button>';
    document.body.appendChild(panel);
    btn.addEventListener('click',()=>{sync();panel.classList.toggle('active')});
    document.getElementById('v246Close')?.addEventListener('click',()=>panel.classList.remove('active'));
    document.getElementById('v246Follow')?.addEventListener('click',followArc);
  }
  function render(){
    ensureUI();if(!panel)return;
    document.getElementById('v246Identity').textContent='CAREER '+(state.identity.career||'OPEN')+' • SOUND '+(state.identity.sound||'OPEN')+' • VISUAL '+(state.identity.visual||'OPEN');
    document.getElementById('v246Relations').innerHTML=['manager','kane','director'].map(id=>{
      const r=state.relationships[id]||{score:0,tier:'NEW'};
      const name=id==='manager'?'M':id==='kane'?'KANE':'DIRECTOR K';
      return '<div><span>'+name+'</span><b>'+r.tier+'</b><em>'+r.score+'</em></div>';
    }).join('');
    document.getElementById('v246Perks').innerHTML=['manager','kane','director'].map(id=>{
      const p=state.perks[id];
      return '<article><small>'+id.toUpperCase()+'</small><b>'+(p?.perk||'LOCKED')+'</b><span>'+(p?.summary||'Make a dialogue choice to define this route.')+'</span></article>';
    }).join('');
    const arc=document.getElementById('v246Arc'),follow=document.getElementById('v246Follow');
    if(state.arc){
      arc.innerHTML='<small>NEXT ARC</small><b>'+state.arc.title+'</b><span>'+state.arc.detail+'</span>';
      arc.classList.add('ready');follow.disabled=false;follow.textContent='FOLLOW '+state.arc.title;
    }else{
      arc.innerHTML='<small>NEXT ARC</small><b>LOCKED</b><span>Complete all three major dialogue decisions.</span>';
      arc.classList.remove('ready');follow.disabled=true;follow.textContent='NEXT ARC LOCKED';
    }
    if(badge){
      badge.classList.toggle('active',!!state.arc);
      badge.textContent=state.arc?'NEXT ARC • '+state.arc.title:'CHOICES SHAPING WORLD';
    }
  }
  function applyPresentation(resolved){
    const sig=state.lastChoiceSignature;
    if(sig===lastApplied)return;
    lastApplied=sig;
    const k=resolved.kane,d=resolved.director;
    if(k?.profile)window.TGGV240?.applyProfile?.(k.profile);
    if(d?.preset)window.TGGV234?.applyPreset?.(d.preset);
    if(state.arc){
      window.TGGV238?.emit?.('consequence',{strength:.8});
      window.TGGV243?.mark?.('consequence',{arc:state.arc.id,identity:{...state.identity}});
    }
  }
  function sync(){
    const v=window.TGGV245?.status?.();if(!v)return status();
    const sig=signature(v);
    if(sig===state.lastChoiceSignature){render();return status()}
    const r=window.TGGV246Core?.resolve?.(v);if(!r)return status();
    state.lastChoiceSignature=sig;
    state.identity={...r.identity};
    state.relationships={...r.relationshipTiers};
    state.perks={manager:r.manager?{...r.manager}:null,kane:r.kane?{...r.kane}:null,director:r.director?{...r.director}:null};
    state.arc=r.arc?{...r.arc}:null;
    state.resolved=!!(r.manager||r.kane||r.director);
    state.history.push({type:'resolve',signature:sig,arc:r.arc?.id||null,at:Date.now()});
    save();render();applyPresentation(r);
    if(state.arc)window.dispatchEvent(new CustomEvent('tgg:v246-arc-ready',{detail:{...state.arc,identity:{...state.identity}}}));
    return status();
  }
  function followArc(){
    sync();if(!state.arc)return false;
    const route=state.arc.route;
    const map={business:'business',events:'eventsBoard',crew:'crewBoard',career:'career'};
    window.TGGGame?.show?.(map[route]||'career');
    window.__tggToast?.(state.arc.title+' — NEXT ARC READY');
    state.history.push({type:'follow',arc:state.arc.id,route,at:Date.now()});save();return true;
  }
  function bind(){
    if(!hasDOM()||bind.done)return;bind.done=true;ensureUI();
    window.addEventListener('tgg:v244-story-complete',()=>setTimeout(sync,0));
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-v245-choice]'))setTimeout(sync,0)});
    setInterval(sync,900);
  }
  load();bind();if(hasDOM())setTimeout(sync,0);
  const api={version:VERSION,layers:100,status,sync,followArc,render};
  globalThis.TGGV246=api;if(hasDOM())window.TGGV246=api;
})();