(() => {
  const KEY='tgg-business-v1';
  const catalog=[
    {id:'studio-row',name:'Studio Row',type:'MUSIC',unlock:1,detail:'Recording rooms, producers and late-night sessions.'},
    {id:'sneaker-district',name:'Sneaker District',type:'STYLE',unlock:2,detail:'Sneakers, streetwear and character upgrades.'},
    {id:'media-block',name:'Media Block',type:'MEDIA',unlock:3,detail:'Photo sets, interviews and release promotion.'},
    {id:'executive-ave',name:'Executive Ave',type:'BUSINESS',unlock:5,detail:'Properties, offices and higher-tier opportunities.'}
  ];

  let state={
    discovered:[],
    selected:null,
    assets:{status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]}
  };

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      if(saved&&typeof saved==='object') state={...state,...saved};
    }catch(e){}
    if(!Array.isArray(state.discovered)) state.discovered=[];
    if(!state.assets||typeof state.assets!=='object'){
      state.assets={status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]};
    }
    return state;
  }

  function save(){
    localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  }

  function sync(){
    const level=Number(window.TGGGame?.getState?.()?.level)||1;
    catalog.forEach(item=>{
      if(level>=item.unlock&&!state.discovered.includes(item.id)){
        state.discovered.push(item.id);
      }
    });
    save();
    return state;
  }

  function available(){
    sync();
    return catalog.filter(item=>state.discovered.includes(item.id));
  }

  function open(){
    render();
    window.TGGGame?.show?.('businessBoard');
    void loadAssets();
  }

  function render(){
    let el=document.getElementById('businessBoard');
    if(!el){
      el=document.createElement('section');
      el.id='businessBoard';
      el.className='screen';
      document.querySelector('main')?.appendChild(el);
    }

    const rows=available().map(item=>
      '<button class="business-card" data-business="'+item.id+'">'+
        '<b>'+item.name+'</b>'+
        '<span>'+item.type+' • LVL '+item.unlock+'</span>'+
        '<small>'+item.detail+'</small>'+
      '</button>'
    ).join('');

    el.innerHTML=
      '<div class="panel">'+
        '<p class="eyebrow">V1.13 • CITY BUSINESS + VEHICLE HUB</p>'+
        '<h2>KNOW THE CITY.</h2>'+
        '<p>Discover businesses, inspect available properties and track vehicle progression. Discovery never triggers a purchase.</p>'+
        '<div class="business-grid">'+rows+'</div>'+
        '<div id="businessDetail" class="mission-card">Select a location to inspect it.</div>'+
        '<div id="worldAssetsPanel" class="mission-card">'+
          '<b>WORLD ASSETS</b>'+
          '<span id="worldAssetsStatus">Loading local/offline-ready state…</span>'+
          '<div id="worldProperties"></div>'+
          '<div id="worldVehicles"></div>'+
        '</div>'+
        '<button id="businessSync" class="primary">REFRESH WORLD ASSETS</button>'+
        '<button id="businessBack" class="secondary">BACK TO CITY</button>'+
      '</div>';

    el.querySelectorAll('[data-business]').forEach(button=>{
      button.onclick=()=>select(button.dataset.business);
    });

    const back=document.getElementById('businessBack');
    if(back) back.onclick=()=>window.TGGGame?.show?.('game');

    const refresh=document.getElementById('businessSync');
    if(refresh){
      refresh.setAttribute('aria-label','Check connected world assets');
      refresh.onclick=()=>void loadAssets();
    }

    renderAssets();
    return el;
  }

  async function loadAssets(){
    let result=null;
    try{
      result=await window.TGGWorldSync?.worldAssetsBundle?.();
    }catch(error){
      result={ok:false,status:'offline_ready',error:error?.message||String(error)};
    }

    state.assets=result&&typeof result==='object'
      ? result
      : {ok:false,status:'offline_ready',properties:[],propertyUpgrades:[],vehicles:[]};

    save();
    renderAssets();
    window.__tggToast?.(state.assets?.ok?'WORLD ASSETS READY':'WORLD ASSETS OFFLINE-READY');
    return state.assets;
  }

  function renderAssets(){
    const assets=state.assets||{};
    const status=document.getElementById('worldAssetsStatus');
    if(!status) return assets;

    status.textContent=
      String(assets.status||'offline_ready').toUpperCase().replaceAll('_',' ')+
      ' • '+(assets.ok?'CONNECTED':'LOCAL READY');

    const properties=Array.isArray(assets.properties)?assets.properties:[];
    const vehicles=Array.isArray(assets.vehicles)?assets.vehicles:[];

    const propertiesEl=document.getElementById('worldProperties');
    if(propertiesEl){
      propertiesEl.innerHTML=properties.length
        ? '<b>PROPERTIES</b>'+properties.map(item=>'<small>'+String(item.name||item.title||item.id||'Property')+'</small>').join('')
        : '<small>Property market will appear when the world transport is connected.</small>';
    }

    const vehiclesEl=document.getElementById('worldVehicles');
    if(vehiclesEl){
      vehiclesEl.innerHTML=vehicles.length
        ? '<b>VEHICLES</b>'+vehicles.map(item=>'<small>'+String(item.name||item.model||item.id||'Vehicle')+'</small>').join('')
        : '<small>Vehicle progression will appear when the world transport is connected.</small>';
    }

    return assets;
  }

  function select(id){
    const item=catalog.find(value=>value.id===id);
    if(!item) return null;
    state.selected=id;
    save();
    const el=document.getElementById('businessDetail');
    if(el){
      el.innerHTML='<b>'+item.name+'</b><span>'+item.type+'</span><small>'+item.detail+'</small>';
    }
    return item;
  }

  load();
  sync();
  window.TGGBusiness={catalog,state,load,save,sync,available,open,render,select,loadAssets,renderAssets};
  render();
})();