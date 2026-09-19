(() => {
  const VERSION='1.15.0';
  const KEY='tgg-v115-routes-v1';
  const routes=[
    {id:'studio-interior',name:'Studio Interior',kind:'MUSIC',activity:'studio-run',detail:'Enter the studio interior and chain a recording activity.'},
    {id:'media-interior',name:'Media Interior',kind:'MEDIA',activity:'media-run',detail:'Enter the media interior and chain a content activity.'},
    {id:'property-interior',name:'Property Interior',kind:'PROPERTY',activity:'property-check',detail:'Enter a property interior and chain a check-in activity.'},
    {id:'garage-interior',name:'Garage Interior',kind:'VEHICLE',activity:'vehicle-run',detail:'Enter the garage interior and chain a vehicle activity.'}
  ];
  const state={active:null,history:[]};
  function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{} if(!Array.isArray(state.history))state.history=[];return state}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  function list(){return routes.map(r=>({...r,active:r.id===state.active}))}
  function enter(id){
    const r=routes.find(x=>x.id===String(id)); if(!r)return {ok:false,status:'unknown_route'};
    state.active=r.id; state.history.unshift({id:r.id,at:new Date().toISOString()}); state.history=state.history.slice(0,20); save();
    window.__tggToast?.(r.name.toUpperCase()+' ROUTE ACTIVE'); return {ok:true,route:{...r}};
  }
  function exit(){state.active=null;save();return {ok:true,status:'city_route_cleared'}}
  function snapshot(){return {version:VERSION,active:state.active,routes:list(),history:state.history.slice(),mutationPolicy:'local_route_only'}}
  function render(container){
    const el=typeof container==='string'?document.getElementById(container):container;if(!el)return null;
    el.innerHTML='<div class="mission-card"><b>V1.15 • LIVE CITY ROUTES</b><span>Interior activity chains • local route state only</span></div>'+
      list().map(r=>'<article class="mission-card"><b>'+r.name+'</b><span>'+r.kind+' • '+r.activity+'</span><small>'+r.detail+'</small><button class="primary" data-v115-route="'+r.id+'">'+(r.active?'ACTIVE':'ENTER ROUTE')+'</button></article>').join('');
    el.querySelectorAll('[data-v115-route]').forEach(b=>b.onclick=()=>{enter(b.dataset.v115Route);render(el)});
    return snapshot();
  }
  load(); window.TGGV115={version:VERSION,routes,state,load,save,list,enter,exit,snapshot,render};
})();