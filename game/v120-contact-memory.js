(() => {
  const VERSION='1.20.0', KEY='tgg-v120-contact-memory-v1';
  const contacts=[
    {id:'studio-m',name:'Studio M',district:'Studio Row',tags:['music','recording']},
    {id:'media-contact',name:'Media Contact',district:'Media Block',tags:['media','video']},
    {id:'property-contact',name:'Property Contact',district:'Executive Ave',tags:['property','business']},
    {id:'garage-contact',name:'Garage Contact',district:'Executive Ave',tags:['vehicle','garage']}
  ];
  const state={relationships:{},lastContact:null,history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}if(!state.relationships||typeof state.relationships!=='object')state.relationships={};if(!Array.isArray(state.history))state.history=[];return state}
  function remember(id){const c=contacts.find(x=>x.id===String(id));if(!c)return{ok:false,status:'unknown_contact'};const n=Math.max(0,Number(state.relationships[id])||0)+1;state.relationships[id]=Math.min(100,n);state.lastContact=id;state.history.unshift({id,level:state.relationships[id],at:new Date().toISOString()});state.history=state.history.slice(0,50);localStorage.setItem(KEY,JSON.stringify(state));window.__tggToast?.(c.name.toUpperCase()+' RELATIONSHIP '+state.relationships[id]);return{ok:true,contact:c,level:state.relationships[id]}}
  function get(id){return contacts.find(x=>x.id===id)||null}
  function snapshot(){return{version:VERSION,contacts:contacts.map(c=>({...c,relationship:Number(state.relationships[c.id])||0})),lastContact:state.lastContact,history:state.history.slice(),mutationPolicy:'local_contact_memory_only'}}
  function render(container){const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;el.innerHTML='<div class="mission-card"><b>V1.20 • CITY RELATIONSHIPS + CONTACT MEMORY</b><span>Contacts remembered: '+Object.keys(state.relationships).length+'</span><small>Relationship memory is local gameplay state only.</small></div>'+contacts.map(c=>'<article class="mission-card"><b>'+c.name+'</b><span>'+c.district+' • '+c.tags.join(' / ')+'</span><span>RELATIONSHIP: '+(state.relationships[c.id]||0)+'</span><button class="primary" data-v120="'+c.id+'">CHECK IN</button></article>').join('');el.querySelectorAll('[data-v120]').forEach(b=>b.onclick=()=>{remember(b.dataset.v120);render(el)});return snapshot()}
  load();window.TGGV120={version:VERSION,contacts,state,load,remember,get,snapshot,render};
})();