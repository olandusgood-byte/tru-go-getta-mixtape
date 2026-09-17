(() => {
  const KEY='tgg-business-v1';
  const catalog=[
    {id:'studio-row',name:'Studio Row',type:'MUSIC',unlock:1,detail:'Recording rooms, producers and late-night sessions.'},
    {id:'sneaker-district',name:'Sneaker District',type:'STYLE',unlock:2,detail:'Sneakers, streetwear and character upgrades.'},
    {id:'media-block',name:'Media Block',type:'MEDIA',unlock:3,detail:'Photo sets, interviews and release promotion.'},
    {id:'executive-ave',name:'Executive Ave',type:'BUSINESS',unlock:5,detail:'Properties, offices and higher-tier opportunities.'}
  ];
  let state={discovered:[],selected:null,assets:{status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]}};
  function load(){try{state={...state,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}if(!Array.isArray(state.discovered))state.discovered=[]}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function sync(){const level=Number(window.TGGGame?.getState?.()?.level)||1;catalog.forEach(x=>{if(level>=x.unlock&&!state.discovered.includes(x.id))state.discovered.push(x.id)});save();return state}
  function available(){sync();return catalog.filter(x=>state.discovered.includes(x.id))}
  function open(){render();window.TGGGame?.show?.('businessBoard');loadAssets()}
  function render(){
    let el=document.getElementById('businessBoard');
    if(!el){el=document.createElement('section');el.id='businessBoard';el.className='screen';document.querySelector('main')?.appendChild(el)}
    const rows=available().map(x=>'<button class="business-card" data-business="'+x.id+'"><b>'+x.name+'</b><span>'+x.type+' • LVL '+x.unlock+'</span><small>'+x.detail+'</small></button>').join('');
    el.innerHTML='<div class="panel"><p class="eyebrow">V1.14 • CITY BUSINESS + VEHICLE HUB</p><h2>KNOW THE CITY.</h2><p>Discover businesses, inspect available properties and track vehicle progression. Discovery never triggers a purchase.</p><div class="business-grid">'+rows+'</div><div id="businessDetail" class="mission-card">Select a location to inspect it.</div><div id="worldAssetsPanel" class="mission-card"><b>WORLD ASSETS</b><span id="worldAssetsStatus">Loading local/offline-ready state…</span><div id="worldProperties"></div><div id="worldVehicles"></div></div><button id="businessSync" class="primary">REFRESH WORLD ASSETS</button><button id="businessBack" class="secondary">BACK TO CITY</button></div>';
    el.querySelectorAll('[data-business]').forEach(b=>b.onclick=()=>select(b.dataset.business));
    document.getElementById('businessBack').onclick=()=>window.TGGGame?.show?.('game');    document.getElementById('businessSync').setAttribute('aria-label','Check connected world assets');
    document.getElementById('businessSync').onclick=loadAssets; renderAssets();
  }
  async function loadAssets(){const r=await window.TGGWorldSync?.worldAssetsBundle?.();state.assets=r||{ok:false,status:'offline_ready'};save();renderAssets();window.__tggToast?.(r?.ok?'WORLD ASSETS READY':'WORLD ASSETS OFFLINE-READY');return state.assets;}\n  function renderAssets(){const a=state.assets||{};const s=document.getElementById('worldAssetsStatus');if(!s)return;s.textContent=(a.status||'offline_ready').toUpperCase().replaceAll('_',' ')+' • '+(a.ok?'CONNECTED':'LOCAL READY');const props=Array.isArray(a.properties)?a.properties:[];const vehicles=Array.isArray(a.vehicles)?a.vehicles:[];document.getElementById('worldProperties').innerHTML=props.length?'<b>PROPERTIES</b>'+props.map(x=>'<small>'+String(x.name||x.title||x.id||'Property')+'</small>').join(''):'<small>Property market will appear when the world transport is connected.</small>';document.getElementById('worldVehicles').innerHTML=vehicles.length?'<b>VEHICLES</b>'+vehicles.map(x=>'<small>'+String(x.name||x.model||x.id||'Vehicle')+'</small>').join(''):'<small>Vehicle progression will appear when the world transport is connected.</small>';}\n  function select(id){const x=catalog.find(v=>v.id===id);if(!x)return;state.selected=id;save();const el=document.getElementById('businessDetail');if(el)el.innerHTML='<b>'+x.name+'</b><span>'+x.type+'</span><small>'+x.detail+'</small>';}
  load();sync();
  window.TGGBusiness={catalog,state,load,save,sync,available,open,render,select};
})();