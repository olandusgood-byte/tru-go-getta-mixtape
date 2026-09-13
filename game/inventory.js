(() => {
  const KEY='tgg-inventory-v1';
  const catalog=[
    {id:'mic',name:'Mic',type:'gear',detail:'Recording gear for your next session.'},
    {id:'notebook',name:'Notebook',type:'career',detail:'Keeps ideas ready for the next track.'},
    {id:'promo-flyers',name:'Promo Flyers',type:'promo',detail:'Street promo material for city jobs.'},
    {id:'beat-pack',name:'Beat Pack',type:'music',detail:'A starter collection of production material.'}
  ];
  let state={items:{},updatedAt:0};
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};if(!state.items||typeof state.items!=='object')state.items={}}catch(e){state={items:{},updatedAt:0}}return state}
  function save(){state.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(state));return state}
  function get(id){return Math.max(0,Number(state.items[id])||0)}
  function add(id,qty=1){if(!catalog.some(x=>x.id===id))return false;qty=Math.max(1,Math.floor(Number(qty)||1));state.items[id]=get(id)+qty;save();window.__tggToast?.('ADDED — '+catalog.find(x=>x.id===id).name+' x'+qty);render();return true}
  function remove(id,qty=1){if(get(id)<qty)return false;state.items[id]=get(id)-Math.max(1,Math.floor(Number(qty)||1));save();render();return true}
  function has(id,qty=1){return get(id)>=Math.max(1,qty)}
  function starterPack(){if(localStorage.getItem(KEY))return false;catalog.forEach(x=>state.items[x.id]=1);save();return true}
  function render(){const el=document.getElementById('inventoryList');if(!el)return;el.innerHTML=catalog.map(x=>`<div class="mission-card"><b>${x.name}</b><span>${x.detail} • ${get(x.id)} owned</span><button class="secondary" data-inventory-add="${x.id}">ADD</button></div>`).join('');el.querySelectorAll('[data-inventory-add]').forEach(b=>b.onclick=()=>add(b.dataset.inventoryAdd,1))}
  load();
  window.TGGInventory={catalog,state,load,save,get,add,remove,has,starterPack,render};
})();
