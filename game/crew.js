(() => {
  const KEY='tgg-crew-v1';
  const catalog=[
    {id:'dj-v',name:'DJ V',role:'DJ',cost:150,bonus:{xp:10},detail:'Boosts city-job XP.'},
    {id:'kane',name:'Kane',role:'Producer',cost:250,bonus:{cash:25},detail:'Adds cash to completed jobs.'},
    {id:'manager',name:'M',role:'Manager',cost:350,bonus:{rep:10},detail:'Boosts reputation rewards.'},
    {id:'nova',name:'Nova',role:'Promoter',cost:300,bonus:{rep:15},detail:'Pushes campaigns, shows and city buzz.'},
    {id:'lens',name:'Lens',role:'Director',cost:300,bonus:{xp:15},detail:'Directs visuals and boosts creative impact.'}
  ];
  let state={members:[],updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!Array.isArray(state.members))state.members=[]}catch(e){state={members:[],updatedAt:0}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return catalog.find(x=>x.id===id)||null}
  function has(id){return state.members.includes(id)}
  function recruit(id){const member=get(id);if(!member||has(id))return false;if(window.TGGGame?.spend && !window.TGGGame.spend(member.cost))return false;state.members.push(id);save();window.__tggToast?.('CREW UP — '+member.name+' joined');render();return true}
  function storyRecruit(id){
    const member=get(id);
    if(!member||!['kane','nova','lens'].includes(id))return false;
    if(has(id))return true;
    let accepted=false;
    try{accepted=JSON.parse(localStorage.getItem('tgg-story-mission-v6')||'{}')?.accepted===true}catch{}
    if(!accepted)return false;
    state.members.push(id);save();window.__tggToast?.('MISSION CREW — '+member.name+' joined');render();return true;
  }
  function campaignReady(){return ['kane','nova','lens'].every(has)}
  function bonus(type){return state.members.reduce((sum,id)=>sum+(get(id)?.bonus?.[type]||0),0)}
  function render(){const el=document.getElementById('crewList');if(!el)return;el.innerHTML=catalog.map(x=>`<div class="mission-card"><b>${x.name} • ${x.role}</b><span>${x.detail} Cost $${x.cost} • ${has(x.id)?'RECRUITED':'AVAILABLE'}</span>${has(x.id)?'<span>CREW MEMBER ACTIVE</span>':`<button class="primary" data-crew-recruit="${x.id}">RECRUIT</button>`}</div>`).join('');el.querySelectorAll('[data-crew-recruit]').forEach(b=>b.onclick=()=>recruit(b.dataset.crewRecruit))}
  load();
  window.TGGCrew={catalog,state,load,save,get,has,recruit,storyRecruit,campaignReady,bonus,render};
})();
