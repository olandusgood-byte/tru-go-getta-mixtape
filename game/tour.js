(() => {
  const KEY='tgg-tour-v1';
  const stops=[
    {id:'downtown',name:'DOWNTOWN',member:'nova',base:50},
    {id:'studio-row',name:'STUDIO ROW',member:'kane',base:50},
    {id:'mixtape-ave',name:'MIXTAPE AVE',member:'lens',base:50}
  ];
  let state={started:false,route:null,completedStops:[],score:0,completed:false,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object')Object.assign(state,s);if(!Array.isArray(state.completedStops))state.completedStops=[]}catch{}return state}
  function reset(){Object.assign(state,{started:false,route:null,completedStops:[],score:0,completed:false,updatedAt:0});save();render();return state}
  function crewReady(){return window.TGGCrew?.campaignReady?.()===true}
  function start(route){
    if(state.completed||!['city','regional'].includes(route))return false;
    if(!crewReady()){notify('FULL CREW REQUIRED');return false}
    state.started=true;state.route=route;state.completedStops=[];state.score=0;state.completed=false;save();render();window.TGGGame?.show?.('tourBoard');notify(route==='city'?'CITY CIRCUIT STARTED':'REGIONAL RUN STARTED');return true
  }
  function points(stop){
    const routeBonus=state.route==='regional'?5:0;
    const crewBonus=window.TGGCrew?.has?.(stop.member)?10:0;
    return stop.base+routeBonus+crewBonus
  }
  function runStop(id){
    const stop=stops.find(x=>x.id===id);
    if(!state.started||state.completed||!stop||state.completedStops.includes(id))return false;
    state.completedStops.push(id);state.score+=points(stop);
    if(state.completedStops.length===stops.length){state.completed=true;state.started=false;notify('TOUR COMPLETE — SCORE '+state.score)}
    else notify(stop.name+' COMPLETE • TOUR SCORE '+state.score);
    save();render();return true
  }
  function render(){
    const score=document.getElementById('tourScore'),status=document.getElementById('tourStatus');
    if(score)score.textContent=String(state.score);
    if(status)status.textContent=state.completed?'TOUR COMPLETE • SCORE '+state.score:(state.started?(state.route==='city'?'CITY CIRCUIT':'REGIONAL RUN')+' • '+state.completedStops.length+'/3 STOPS':'Mission 07 will bring the crew here.');
    document.querySelectorAll('[data-tour-stop]').forEach(b=>b.disabled=!state.started||state.completed||state.completedStops.includes(b.dataset.tourStop));
    const back=document.getElementById('tourBack');if(back)back.disabled=state.started&&!state.completed;
    return state
  }
  document.querySelectorAll('[data-tour-stop]').forEach(b=>b.addEventListener('click',()=>runStop(b.dataset.tourStop)));
  document.getElementById('tourBack')?.addEventListener('click',()=>{if(state.started&&!state.completed){notify('FINISH THE TOUR FIRST');return}window.TGGGame?.show?.('contentBoard')});
  load();window.TGGTour={state,stops,load,save,reset,start,runStop,render,crewReady,points};render();
})();