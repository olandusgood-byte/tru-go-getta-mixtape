(() => {
  const KEY='tgg-inventory-v1';
  const catalog=[
    {id:'mic',name:'Mic',type:'gear',detail:'Recording gear for your next session.'},
    {id:'notebook',name:'Notebook',type:'career',detail:'Keeps ideas ready for the next track.'},
    {id:'promo-flyers',name:'Promo Flyers',type:'promo',detail:'Street promo material for city jobs.'},
    {id:'beat-pack',name:'Beat Pack',type:'music',detail:'A starter collection of production material.'},
    {id:'radio-pack',name:'Radio Pack',type:'promo',detail:'Clean edit, artwork and promo assets for DJ V.'},
    {id:'session-drive',name:'Session Drive',type:'music',detail:'Session files and stems for Kane.'},
    {id:'show-pass',name:'Show Pass',type:'event',detail:'Access credential for the City Showdown.'},
    {id:'contract-folder',name:'Contract Folder',type:'career',detail:'Offer paperwork and meeting notes for the deal route.'},
    {id:'indie-kit',name:'Indie Rollout Kit',type:'promo',detail:'Independent release plan, assets and street-team checklist.'},
    {id:'release-pass',name:'Release Night Pass',type:'event',detail:'Credential for the Mission 03 release-night finale.'},
    {id:'club-booking',name:'Club Booking',type:'event',detail:'Confirmed booking and promo packet for the club headline route.'},
    {id:'festival-kit',name:'Festival Kit',type:'event',detail:'Festival credential, set notes and promo package.'},
    {id:'headline-pass',name:'Headline Pass',type:'event',detail:'Backstage credential required to perform the Mission 04 headline show.'}
  ];
  let state={items:{},updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!state.items||typeof state.items!=='object')state.items={}}catch(e){state={items:{},updatedAt:0}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return Math.max(0,Number(state.items[id])||0)}
  function add(id,qty=1){if(!catalog.some(x=>x.id===id))return false;qty=Math.max(1,Math.floor(Number(qty)||1));state.items[id]=get(id)+qty;save();window.__tggToast?.('ADDED — '+catalog.find(x=>x.id===id).name+' x'+qty);render();return true}
  function remove(id,qty=1){if(get(id)<qty)return false;state.items[id]=get(id)-Math.max(1,Math.floor(Number(qty)||1));save();render();return true}
  function has(id,qty=1){return get(id)>=Math.max(1,qty)}
  function starterPack(){if(localStorage.getItem(KEY))return false;catalog.slice(0,4).forEach(x=>state.items[x.id]=1);save();return true}
  function mission02Pack(){
    const migration='tgg-inventory-v116-mission02';
    if(localStorage.getItem(migration))return false;
    ['radio-pack','session-drive','show-pass'].forEach(id=>state.items[id]=Math.max(1,get(id)));
    save();
    localStorage.setItem(migration,'1');
    return true;
  }
  function mission03Pack(){
    const migration='tgg-inventory-v117-mission03';
    if(localStorage.getItem(migration))return false;
    ['contract-folder','indie-kit','release-pass'].forEach(id=>state.items[id]=Math.max(1,get(id)));
    save();
    localStorage.setItem(migration,'1');
    return true;
  }
  function mission04Pack(){
    const migration='tgg-inventory-v118-mission04';
    if(localStorage.getItem(migration))return false;
    ['club-booking','festival-kit','headline-pass'].forEach(id=>state.items[id]=Math.max(1,get(id)));
    save();
    localStorage.setItem(migration,'1');
    return true;
  }
  function render(){const el=document.getElementById('inventoryList');if(!el)return;el.innerHTML=catalog.map(x=>`<div class="mission-card"><b>${x.name}</b><span>${x.detail} • ${get(x.id)} owned</span><button class="secondary" data-inventory-add="${x.id}">ADD</button></div>`).join('');el.querySelectorAll('[data-inventory-add]').forEach(b=>b.onclick=()=>add(b.dataset.inventoryAdd,1))}
  load();
  starterPack();
  mission02Pack();
  mission03Pack();
  mission04Pack();
  window.TGGInventory={catalog,state,load,save,get,add,remove,has,starterPack,mission02Pack,mission03Pack,mission04Pack,render};
})();
