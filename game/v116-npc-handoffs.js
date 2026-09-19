(() => {
  const VERSION='1.16.0';
  const KEY='tgg-v116-npc-handoffs-v1';
  const handoffs=[
    {id:'m-studio',npc:'M',from:'Downtown',to:'Studio Row',event:'studio-pop-in',detail:'M hands the next studio opportunity to the player.'},
    {id:'media-contact',npc:'MEDIA CONTACT',from:'Studio Row',to:'Media Block',event:'media-run',detail:'A completed studio route can hand off into media work.'},
    {id:'property-contact',npc:'PROPERTY CONTACT',from:'Media Block',to:'Executive Ave',event:'property-check',detail:'A city contact can hand off a property check-in.'},
    {id:'garage-contact',npc:'GARAGE CONTACT',from:'Executive Ave',to:'Garage',event:'vehicle-run',detail:'A property route can hand off into vehicle activity.'}
  ];
  const state={active:null,history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{} if(!Array.isArray(state.history))state.history=[];return state}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function available(){
    const level=Number(window.TGGGame?.getState?.()?.level)||1;
    return handoffs.filter((x,i)=>level>=i+1);
  }
  function handoff(id){
    const x=handoffs.find(v=>v.id===String(id)); if(!x)return {ok:false,status:'unknown_handoff'};
    state.active=x.id; state.history.unshift({id:x.id,at:new Date().toISOString()}); state.history=state.history.slice(0,25); save();
    window.__tggToast?.(x.npc+' HANDOFF: '+x.event.toUpperCase());
    return {ok:true,handoff:{...x}};
  }
  function complete(id){
    const x=handoffs.find(v=>v.id===String(id)); if(!x||state.active!==x.id)return {ok:false,status:'handoff_not_active'};
    state.active=null;save();return {ok:true,status:'handoff_complete',id:x.id};
  }
  function snapshot(){return {version:VERSION,active:state.active,available:available(),history:state.history.slice(),mutationPolicy:'local_story_routing_only'}}
  function render(container){
    const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;
    el.innerHTML='<div class="mission-card"><b>V1.16 • NPC ROUTING + ACTIVITY HANDOFFS</b><span>Story routing layer • no account, asset or external-world mutations</span></div>'+
      available().map(x=>'<article class="mission-card"><b>'+x.npc+'</b><span>'+x.from+' → '+x.to+' • '+x.event+'</span><small>'+x.detail+'</small><button class="secondary" data-v116="'+x.id+'">'+(state.active===x.id?'ACTIVE HANDOFF':'TRIGGER HANDOFF')+'</button></article>').join('');
    el.querySelectorAll('[data-v116]').forEach(b=>b.onclick=()=>{handoff(b.dataset.v116);render(el)});
    return snapshot();
  }
  load(); window.TGGV116={version:VERSION,handoffs,state,load,save,available,handoff,complete,snapshot,render};
})();