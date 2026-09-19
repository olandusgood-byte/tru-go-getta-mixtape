(() => {
  const VERSION='1.18.0';
  const KEY='tgg-v118-world-events-v1';
  const events=[
    {id:'rush-hour',label:'RUSH HOUR',district:'Downtown',momentum:2,detail:'Crowds increase activity discovery.'},
    {id:'studio-wave',label:'STUDIO WAVE',district:'Studio Row',momentum:3,detail:'Music activity momentum spreads through the district.'},
    {id:'media-wave',label:'MEDIA WAVE',district:'Media Block',momentum:3,detail:'Media opportunities gain contextual visibility.'},
    {id:'night-drive',label:'NIGHT DRIVE',district:'Executive Ave',momentum:2,detail:'Night activity routes become more visible.'}
  ];
  const state={active:null,momentum:0,history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}if(!Array.isArray(state.history))state.history=[];state.momentum=Math.max(0,Number(state.momentum)||0);return state}
  function activate(id){const e=events.find(x=>x.id===String(id));if(!e)return{ok:false,status:'unknown_event'};state.active=e.id;state.momentum=Math.min(100,state.momentum+e.momentum);state.history.unshift({id:e.id,at:new Date().toISOString()});state.history=state.history.slice(0,30);localStorage.setItem(KEY,JSON.stringify(state));window.__tggToast?.(e.label+' ACTIVE • MOMENTUM '+state.momentum);return{ok:true,event:e,momentum:state.momentum}}
  function snapshot(){return{version:VERSION,active:state.active,momentum:state.momentum,events,history:state.history.slice(),mutationPolicy:'local_world_event_only'}}
  function render(container){const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;el.innerHTML='<div class="mission-card"><b>V1.18 • WORLD EVENTS + CROWD MOMENTUM</b><span>Momentum: '+state.momentum+'</span><small>Contextual crowd activity is local gameplay state only.</small></div>'+events.map(e=>'<article class="mission-card"><b>'+e.label+'</b><span>'+e.district+' • +'+e.momentum+' momentum</span><small>'+e.detail+'</small><button class="primary" data-v118="'+e.id+'">ACTIVATE EVENT</button></article>').join('');el.querySelectorAll('[data-v118]').forEach(b=>b.onclick=()=>{activate(b.dataset.v118);render(el)});return snapshot()}
  load();window.TGGV118={version:VERSION,events,state,load,activate,snapshot,render};
})();