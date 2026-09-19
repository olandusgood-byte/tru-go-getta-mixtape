(() => {
  const VERSION='1.17.0';
  const KEY='tgg-v117-city-schedule-v1';
  const slots=[
    {id:'morning',label:'MORNING',window:'06:00-12:00',boost:'street-cypher',detail:'Street activity discovery is emphasized.'},
    {id:'afternoon',label:'AFTERNOON',window:'12:00-18:00',boost:'studio-pop-in',detail:'Studio and media opportunities surface.'},
    {id:'evening',label:'EVENING',window:'18:00-00:00',boost:'release-rush',detail:'Release and nightlife opportunities surface.'},
    {id:'night',label:'NIGHT',window:'00:00-06:00',boost:'studio-pop-in',detail:'Late studio opportunities surface.'}
  ];
  const state={lastSlot:null,discovered:[],updatedAt:0};
  function slotFor(date=new Date()){const h=date.getHours();return slots[Math.floor(h/6)]||slots[0]}
  function discover(){
    const s=slotFor();state.lastSlot=s.id;
    if(!state.discovered.includes(s.boost))state.discovered.push(s.boost);
    state.discovered=state.discovered.slice(-20);state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));return {slot:s,discovered:state.discovered.slice()};
  }
  function snapshot(){const d=discover();return {version:VERSION,current:d.slot,discovered:d.discovered,mutationPolicy:'local_schedule_discovery_only'}}
  function render(container){
    const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;
    const s=slotFor();
    el.innerHTML='<div class="mission-card"><b>V1.17 • CITY SCHEDULES</b><span>Current window: '+s.label+' • '+s.window+'</span><small>'+s.detail+'</small><span>Contextual discovery: '+s.boost+'</span></div>'+
      slots.map(x=>'<article class="mission-card"><b>'+x.label+'</b><span>'+x.window+'</span><small>'+x.detail+'</small></article>').join('');
    return snapshot();
  }
  try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
  window.TGGV117={version:VERSION,slots,state,slotFor,discover,snapshot,render};
})();