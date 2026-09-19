(() => {
  const VERSION='1.19.0', KEY='tgg-v119-reactions-v1';
  const chains=[
    {id:'studio-to-media',trigger:'studio-pop-in',next:'media-run',reaction:'MEDIA CREW NOTICES YOUR STUDIO RUN'},
    {id:'media-to-property',trigger:'media-run',next:'property-check',reaction:'PROPERTY CONTACT OPENS A NEW OPPORTUNITY'},
    {id:'property-to-vehicle',trigger:'property-check',next:'vehicle-run',reaction:'GARAGE CONTACT OFFERS A VEHICLE RUN'},
    {id:'vehicle-to-release',trigger:'vehicle-run',next:'release-rush',reaction:'CITY BUZZ OPENS A RELEASE WINDOW'}
  ];
  const state={last:null,unlocked:[],history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}if(!Array.isArray(state.unlocked))state.unlocked=[];if(!Array.isArray(state.history))state.history=[];return state}
  function react(trigger){const c=chains.find(x=>x.trigger===String(trigger));if(!c)return{ok:false,status:'no_chain'};if(!state.unlocked.includes(c.next))state.unlocked.push(c.next);state.last=c.id;state.history.unshift({id:c.id,at:new Date().toISOString()});state.history=state.history.slice(0,30);localStorage.setItem(KEY,JSON.stringify(state));window.__tggToast?.(c.reaction);return{ok:true,chain:c}}
  function snapshot(){return{version:VERSION,last:state.last,unlocked:state.unlocked.slice(),history:state.history.slice(),chains,mutationPolicy:'local_reaction_only'}}
  function render(container){const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;el.innerHTML='<div class="mission-card"><b>V1.19 • DYNAMIC CITY REACTIONS</b><span>Chained opportunities unlocked: '+state.unlocked.length+'</span><small>Reactions remain local gameplay/story state.</small></div>'+chains.map(c=>'<article class="mission-card"><b>'+c.id.toUpperCase()+'</b><span>'+c.trigger+' → '+c.next+'</span><small>'+c.reaction+'</small><button class="primary" data-v119="'+c.trigger+'">TRIGGER REACTION</button></article>').join('');el.querySelectorAll('[data-v119]').forEach(b=>b.onclick=()=>{react(b.dataset.v119);render(el)});return snapshot()}
  load();window.TGGV119={version:VERSION,chains,state,load,react,snapshot,render};
})();