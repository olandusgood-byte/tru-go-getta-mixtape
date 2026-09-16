(() => {
  const KEY='tgg-lifestyle-v1';
  const properties=[
    {id:'studio-loft',name:'Studio Loft',cost:750,level:1,detail:'Your first creative home base in Studio Row.'},
    {id:'city-condo',name:'City Condo',cost:2000,level:2,detail:'A downtown home base for a rising artist.'},
    {id:'artist-house',name:'Artist House',cost:5000,level:3,detail:'A larger home base for an established career.'}
  ];
  const vehicles=[
    {id:'starter-coupe',name:'Starter Coupe',cost:500,level:1,speed:1.25,detail:'A first ride with a small city movement boost.'},
    {id:'tour-van',name:'Tour Van',cost:1500,level:2,speed:1.5,detail:'Crew-ready transport with a stronger movement boost.'},
    {id:'luxury-suv',name:'Luxury SUV',cost:3500,level:3,speed:1.75,detail:'High-end transport with the fastest V1.5 movement boost.'}
  ];
  let state={properties:[],vehicles:[],activeProperty:null,activeVehicle:null,updatedAt:0};
  const notify=t=>window.__tggToast?.(t);
  function normalize(){
    if(!Array.isArray(state.properties))state.properties=[];
    if(!Array.isArray(state.vehicles))state.vehicles=[];
    state.properties=[...new Set(state.properties)].filter(id=>properties.some(x=>x.id===id));
    state.vehicles=[...new Set(state.vehicles)].filter(id=>vehicles.some(x=>x.id===id));
    if(!state.properties.includes(state.activeProperty))state.activeProperty=state.properties[0]||null;
    if(!state.vehicles.includes(state.activeVehicle))state.activeVehicle=state.vehicles[0]||null;
    state.updatedAt=Number(state.updatedAt)||0;
    return state;
  }
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object')state={...state,...saved}}catch(e){}return normalize()}
  function save(){normalize();state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function playerLevel(){return Math.max(1,Number(window.TGGGame?.getState?.()?.level)||1)}
  function unlocked(item){return playerLevel()>=item.level}
  function owned(kind,id){return state[kind].includes(id)}
  function buy(kind,catalog,id){
    const item=catalog.find(x=>x.id===id); if(!item)return false;
    if(owned(kind,id)){notify('ALREADY OWNED — '+item.name);return true}
    if(!unlocked(item)){notify('LEVEL '+item.level+' REQUIRED — '+item.name);return false}
    if(!window.TGGGame?.spend?.(item.cost))return false;
    state[kind].push(id);
    if(kind==='properties'&&!state.activeProperty)state.activeProperty=id;
    if(kind==='vehicles'&&!state.activeVehicle)state.activeVehicle=id;
    save();render();notify('PURCHASED — '+item.name);return true;
  }
  function buyProperty(id){return buy('properties',properties,id)}
  function buyVehicle(id){return buy('vehicles',vehicles,id)}
  function equipProperty(id){if(!owned('properties',id))return false;state.activeProperty=id;save();render();notify('HOME BASE — '+properties.find(x=>x.id===id)?.name);return true}
  function equipVehicle(id){if(!owned('vehicles',id))return false;state.activeVehicle=id;save();render();notify('RIDE EQUIPPED — '+vehicles.find(x=>x.id===id)?.name);return true}
  function movementMultiplier(){const v=vehicles.find(x=>x.id===state.activeVehicle);return v?.speed||1}
  function card(item,kind){
    const isOwned=owned(kind,item.id),active=kind==='properties'?state.activeProperty===item.id:state.activeVehicle===item.id;
    const locked=!unlocked(item),action=isOwned?(active?'ACTIVE':'EQUIP'):(locked?'LOCKED':'BUY $'+item.cost);
    const attr=kind==='properties'?'property':'vehicle';
    return `<div class="mission-card"><b>${item.name}${active?' • ACTIVE':''}</b><span>${item.detail} • Level ${item.level}${item.speed?' • '+item.speed+'x movement':''}</span><button class="${isOwned&&!active?'primary':'secondary'}" data-lifestyle-${attr}="${item.id}" ${locked&&!isOwned?'disabled':''}>${action}</button></div>`;
  }
  function render(){
    const p=document.getElementById('propertyList'),v=document.getElementById('vehicleList'),s=document.getElementById('lifestyleStatus');
    if(s){const home=properties.find(x=>x.id===state.activeProperty)?.name||'None';const ride=vehicles.find(x=>x.id===state.activeVehicle)?.name||'On foot';s.innerHTML=`<b>HOME ${home}</b><span>RIDE ${ride}</span><span>SPEED ${movementMultiplier()}x</span>`}
    if(p){p.innerHTML=properties.map(x=>card(x,'properties')).join('');p.querySelectorAll('[data-lifestyle-property]').forEach(b=>b.onclick=()=>owned('properties',b.dataset.lifestyleProperty)?equipProperty(b.dataset.lifestyleProperty):buyProperty(b.dataset.lifestyleProperty))}
    if(v){v.innerHTML=vehicles.map(x=>card(x,'vehicles')).join('');v.querySelectorAll('[data-lifestyle-vehicle]').forEach(b=>b.onclick=()=>owned('vehicles',b.dataset.lifestyleVehicle)?equipVehicle(b.dataset.lifestyleVehicle):buyVehicle(b.dataset.lifestyleVehicle))}
  }
  load();
  window.TGGLifestyle={properties,vehicles,state,load,save,buyProperty,buyVehicle,equipProperty,equipVehicle,movementMultiplier,render};
})();
