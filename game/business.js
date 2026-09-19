(() => {
  const VERSION='1.14.0';
  const KEY='tgg-business-v1';
  const catalog=[
    {id:'studio-row',name:'Studio Row',type:'MUSIC',unlock:1,detail:'Recording rooms, producers and late-night sessions.'},
    {id:'sneaker-district',name:'Sneaker District',type:'STYLE',unlock:2,detail:'Sneakers, streetwear and character upgrades.'},
    {id:'media-block',name:'Media Block',type:'MEDIA',unlock:3,detail:'Photo sets, interviews and release promotion.'},
    {id:'executive-ave',name:'Executive Ave',type:'BUSINESS',unlock:5,detail:'Properties, offices and higher-tier opportunities.'}
  ];
  const state={discovered:[],selected:null,assets:{ok:false,status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]},selectedAsset:null};

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list=value=>Array.isArray(value)?value:Array.isArray(value?.items)?value.items:Array.isArray(value?.rows)?value.rows:Array.isArray(value?.data)?value.data:[];

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(saved&&typeof saved==='object')Object.assign(state,saved);
    }catch(e){}
    if(!Array.isArray(state.discovered))state.discovered=[];
    if(!state.assets||typeof state.assets!=='object')state.assets={ok:false,status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]};
    return state;
  }

  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}

  function sync(){
    const level=Number(window.TGGGame?.getState?.()?.level)||1;
    catalog.forEach(x=>{if(level>=x.unlock&&!state.discovered.includes(x.id))state.discovered.push(x.id)});
    save();
    return state;
  }

  function available(){sync();return catalog.filter(x=>state.discovered.includes(x.id))}

  function localActivities(){
    const events=Array.isArray(window.TGGEvents?.events)?window.TGGEvents.events:[];
    return events.map(x=>({id:String(x.id||''),name:String(x.name||x.title||x.id||'City Activity'),requires:Array.isArray(x.requires)?x.requires.slice():[]}));
  }

  function activitySnapshot(){
    const a=state.assets||{};
    return {
      version:VERSION,
      businesses:available().map(x=>({id:x.id,name:x.name,type:x.type,unlock:x.unlock})),
      cityActivities:localActivities(),
      worldAssets:{
        status:String(a.status||'offline_ready'),
        connected:!!a.ok,
        properties:list(a.properties).length,
        propertyUpgrades:list(a.propertyUpgrades).length,
        vehicles:list(a.vehicles).length
      },
      readOnly:true
    };
  }

  function open(){
    render();
    window.TGGGame?.show?.('businessBoard');
    loadAssets();
  }

  function render(){
    let el=document.getElementById('businessBoard');
    if(!el){
      el=document.createElement('section');
      el.id='businessBoard';
      el.className='screen';
      document.querySelector('main')?.appendChild(el);
    }
    const rows=available().map(x=>'<button class="business-card" data-business="'+esc(x.id)+'"><b>'+esc(x.name)+'</b><span>'+esc(x.type)+' • LVL '+esc(x.unlock)+'</span><small>'+esc(x.detail)+'</small></button>').join('');
    const activities=localActivities().map(x=>'<small>'+esc(x.name)+(x.requires.length?' • NEEDS '+esc(x.requires.join(' + ')):'')+'</small>').join('');
    el.innerHTML='<div class="panel"><p class="eyebrow">V1.14 • LIVE CITY + VEHICLE/PROPERTY GAMEPLAY</p><h2>KNOW THE CITY.</h2><p>Browse city activity, businesses, properties and vehicles without triggering ownership, travel, spawn or purchase mutations.</p><div class="business-grid">'+rows+'</div><div id="liveCityPanel" class="mission-card"><b>LIVE CITY</b><span>Existing city activities</span>'+(activities||'<small>No local city activities registered.</small>')+'</div><div id="businessDetail" class="mission-card">Select a location or world asset to inspect it.</div><div id="v114CityActivities"></div><div id="worldAssetsPanel" class="mission-card"><b>WORLD ASSETS</b><span id="worldAssetsStatus">Loading local/offline-ready state…</span><div id="worldProperties"></div><div id="worldVehicles"></div></div><button id="businessSync" class="primary">REFRESH WORLD ASSETS</button><button id="businessBack" class="secondary">BACK TO CITY</button></div>';
    el.querySelectorAll('[data-business]').forEach(b=>b.onclick=()=>select(b.dataset.business));
    document.getElementById('businessBack').onclick=()=>window.TGGGame?.show?.('game');
    document.getElementById('businessSync').setAttribute('aria-label','Check connected world assets');
    document.getElementById('businessSync').onclick=loadAssets;
    renderAssets();
    window.TGGV114?.render?.('v114CityActivities');
    const v115=document.createElement('div'); v115.id='v115CityRoutes'; el.querySelector('.panel')?.appendChild(v115); window.TGGV115?.render?.(v115);
    return el;
  }

  function normalizeAssets(result){
    const r=result&&typeof result==='object'?result:{ok:false,status:'offline_ready'};
    return {
      ok:!!r.ok,
      status:String(r.status||'offline_ready'),
      properties:list(r.properties),
      propertyUpgrades:list(r.propertyUpgrades),
      vehicles:list(r.vehicles)
    };
  }

  async function loadAssets(){
    const result=await window.TGGWorldSync?.worldAssetsBundle?.();
    state.assets=normalizeAssets(result);
    save();
    renderAssets();
    window.__tggToast?.(state.assets.ok?'WORLD ASSETS READY':'WORLD ASSETS OFFLINE-READY');
    return state.assets;
  }

  function assetName(asset,fallback){
    return String(asset?.name||asset?.title||asset?.model||asset?.label||asset?.id||fallback);
  }

  function assetDetail(kind,asset){
    const safe=asset&&typeof asset==='object'?asset:{};
    const name=assetName(safe,kind==='vehicle'?'Vehicle':'Property');
    const meta=[];
    for(const key of ['type','class','district','tier','level','status','price','currency']){
      if(safe[key]!==undefined&&safe[key]!==null&&safe[key]!=='')meta.push(key.toUpperCase()+': '+String(safe[key]));
    }
    return {kind,name,meta,id:safe.id||null,readOnly:true};
  }

  function inspectProperty(index){
    const item=list(state.assets?.properties)[Number(index)];
    if(!item)return null;
    state.selectedAsset=assetDetail('property',item);
    save();
    renderSelectedAsset();
    return state.selectedAsset;
  }

  function inspectVehicle(index){
    const item=list(state.assets?.vehicles)[Number(index)];
    if(!item)return null;
    state.selectedAsset=assetDetail('vehicle',item);
    save();
    renderSelectedAsset();
    return state.selectedAsset;
  }

  function renderSelectedAsset(){
    const el=document.getElementById('businessDetail');
    if(!el||!state.selectedAsset)return;
    const a=state.selectedAsset;
    el.innerHTML='<b>'+esc(a.name)+'</b><span>'+esc(String(a.kind||'asset').toUpperCase())+' • READ ONLY</span><small>'+esc((a.meta||[]).join(' • ')||'Discovery detail available. No mutation controls exposed.')+'</small>';
  }

  function renderAssets(){
    const a=state.assets||{};
    const status=document.getElementById('worldAssetsStatus');
    if(!status)return;
    status.textContent=String(a.status||'offline_ready').toUpperCase().replaceAll('_',' ')+' • '+(a.ok?'CONNECTED':'LOCAL READY');
    const props=list(a.properties);
    const vehicles=list(a.vehicles);
    const p=document.getElementById('worldProperties');
    const v=document.getElementById('worldVehicles');
    if(p){
      p.innerHTML=props.length?'<b>PROPERTIES</b>'+props.map((x,i)=>'<button class="asset-readonly" data-property-index="'+i+'">'+esc(assetName(x,'Property'))+' <small>INSPECT</small></button>').join(''):'<small>Property market will appear when the trusted world transport is connected.</small>';
      p.querySelectorAll('[data-property-index]').forEach(btn=>btn.onclick=()=>inspectProperty(btn.dataset.propertyIndex));
    }
    if(v){
      v.innerHTML=vehicles.length?'<b>VEHICLES</b>'+vehicles.map((x,i)=>'<button class="asset-readonly" data-vehicle-index="'+i+'">'+esc(assetName(x,'Vehicle'))+' <small>INSPECT</small></button>').join(''):'<small>Vehicle progression will appear when the trusted world transport is connected.</small>';
      v.querySelectorAll('[data-vehicle-index]').forEach(btn=>btn.onclick=()=>inspectVehicle(btn.dataset.vehicleIndex));
    }
    renderSelectedAsset();
  }

  function select(id){
    const x=catalog.find(v=>v.id===id);
    if(!x)return null;
    state.selected=id;
    state.selectedAsset=null;
    save();
    const el=document.getElementById('businessDetail');
    if(el)el.innerHTML='<b>'+esc(x.name)+'</b><span>'+esc(x.type)+'</span><small>'+esc(x.detail)+'</small><div class="business-actions"><button id="businessVisit" class="primary">ENTER LOCATION</button><button id="businessActivity" class="secondary">START ACTIVITY</button></div>';
    document.getElementById('businessVisit')?.addEventListener('click',()=>visit(x));
    document.getElementById('businessActivity')?.addEventListener('click',()=>activity(x));
    return x;
  }

  function visit(item){
    const x=typeof item==='string'?catalog.find(v=>v.id===item):item;
    if(!x)return false;
    const ok=window.TGGGame?.startBusinessActivity?.(x,'visit');
    if(ok!==false)window.__tggToast?.(String(x.name).toUpperCase()+' VISITED');
    return ok!==false;
  }

  function activity(item){
    const x=typeof item==='string'?catalog.find(v=>v.id===item):item;
    if(!x)return false;
    const ok=window.TGGGame?.startBusinessActivity?.(x,'activity');
    if(ok!==false)window.__tggToast?.(String(x.name).toUpperCase()+' ACTIVITY COMPLETE');
    return ok!==false;
  }

  load();
  sync();
  window.TGGBusiness={version:VERSION,catalog,state,load,save,sync,available,localActivities,activitySnapshot,open,render,loadAssets,renderAssets,inspectProperty,inspectVehicle,select,visit,activity};
})();