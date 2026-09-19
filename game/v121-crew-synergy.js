(() => {
  const VERSION='1.21.0', KEY='tgg-v121-crew-synergy-v1';
  const links=[
    {id:'music-media',a:'music',b:'media',bonus:2,label:'MUSIC × MEDIA'},
    {id:'media-property',a:'media',b:'property',bonus:2,label:'MEDIA × PROPERTY'},
    {id:'property-vehicle',a:'property',b:'vehicle',bonus:3,label:'PROPERTY × VEHICLE'},
    {id:'music-vehicle',a:'music',b:'vehicle',bonus:2,label:'MUSIC × VEHICLE'}
  ];
  const state={active:[],synergy:0,history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}if(!Array.isArray(state.active))state.active=[];if(!Array.isArray(state.history))state.history=[];state.synergy=Math.max(0,Number(state.synergy)||0);return state}
  function activate(id){const x=links.find(v=>v.id===String(id));if(!x)return{ok:false,status:'unknown_link'};if(!state.active.includes(x.id))state.active.push(x.id);state.synergy=Math.min(100,state.synergy+x.bonus);state.history.unshift({id:x.id,at:new Date().toISOString()});state.history=state.history.slice(0,40);localStorage.setItem(KEY,JSON.stringify(state));window.__tggToast?.(x.label+' SYNERGY +'+x.bonus);return{ok:true,link:x,synergy:state.synergy}}
  function snapshot(){return{version:VERSION,links:links.map(x=>({...x,active:state.active.includes(x.id)})),synergy:state.synergy,history:state.history.slice(),mutationPolicy:'local_crew_synergy_only'}}
  function render(container){const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;el.innerHTML='<div class="mission-card"><b>V1.21 • CREW SOCIAL GRAPH + CONTACT SYNERGY</b><span>Synergy: '+state.synergy+'</span><small>Social graph state stays local to gameplay.</small></div>'+links.map(x=>'<article class="mission-card"><b>'+x.label+'</b><span>'+x.a+' ↔ '+x.b+' • +'+x.bonus+' synergy</span><button class="primary" data-v121="'+x.id+'">'+(state.active.includes(x.id)?'SYNC AGAIN':'ACTIVATE SYNERGY')+'</button></article>').join('');el.querySelectorAll('[data-v121]').forEach(b=>b.onclick=()=>{activate(b.dataset.v121);render(el)});return snapshot()}
  load();window.TGGV121={version:VERSION,links,state,load,activate,snapshot,render};
})();