(() => {
  const VERSION='V2.36 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'npc core bridge','npc enabled state','npc registry','npc seed assignment','npc stable identity','npc status API','npc diagnostics','npc refresh API','npc rebuild API','npc rollback isolation',
    'native forge bridge','native rig build','native rig attach','native rig detach','legacy child snapshot','legacy child hide','legacy child show','legacy parts snapshot','animation parts swap','animation parts restore',
    'skin variation','height variation','shoulder variation','build variation','leg variation','arm variation','head variation','top variation','pants variation','shoe variation',
    'accent variation','hair variation','street vibe','creative vibe','business vibe','nightlife vibe','idle gesture seed','phone gesture seed','talk gesture seed','nod gesture seed',
    'high LOD','medium LOD','low LOD','distance LOD','quality LOD','high shadow enable','medium shadow trim','low legacy fallback','accessory detail trim','LOD animation bridge',
    'population high cap','population balanced cap','population performance cap','population overflow legacy','population refresh','new pedestrian upgrade','existing pedestrian dedupe','pedestrian array bridge','extra pedestrian compatibility','contact pedestrian compatibility',
    'route preservation','route index preservation','speed preservation','horn reaction preservation','car avoidance preservation','position preservation','rotation preservation','pedestrian scale preservation','world parent preservation','no movement rewrite',
    'chain visibility high','pendant visibility high','hair detail high','shoe detail high','accent detail high','chain trim medium','pendant trim medium','hair trim medium','shadow trim medium','material quality bridge',
    'player distance source','vehicle distance source','subject distance select','LOD update interval','quality update interval','visibility update','parts update','legacy fallback parts','native active parts','restore all parts',
    'NPC HUD','NPC panel','enabled toggle','refresh button','rebuild button','restore button','Shift+N shortcut','mobile panel','100-layer manifest','release QA hooks'
  ];
  const core=()=>globalThis.TGGV236Core||globalThis.window?.TGGV236Core;
  const state={enabled:true,registry:new Map(),upgraded:0,high:0,medium:0,low:0,lastRefresh:0,lastLod:0,ready:false};
  let panel=null,hud=null,lastCount=-1;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };

  function pedestrians(){return hasDOM()&&Array.isArray(window.TGG3D?.pedestrians)?window.TGG3D.pedestrians:[]}
  function status(){
    return {
      version:VERSION,ready:state.ready||!hasDOM(),mode:'native-npc-forge',layerCount:LAYERS.length,
      enabled:state.enabled,total:pedestrians().length,upgraded:state.upgraded,
      high:state.high,medium:state.medium,low:state.low,quality:quality(),
      cap:core()?.populationCap?.(quality())||8
    };
  }

  function legacyChildren(human){
    return human.children.filter(c=>!c.userData?.v236Npc);
  }
  function snapshot(human,index){
    if(state.registry.has(human))return state.registry.get(human);
    const rec={
      human,index,seed:index+1,legacyChildren:legacyChildren(human),
      legacyParts:human.userData?.parts||null,root:null,lod:'low',variant:null
    };
    state.registry.set(human,rec);return rec;
  }
  function setLegacy(rec,visible){
    rec.legacyChildren.forEach(c=>{c.visible=!!visible});
  }
  function trimDetails(root,lod){
    if(!root)return;
    root.traverse?.(o=>{
      if(!o.isMesh)return;
      const n=String(o.name||'').toLowerCase();
      const detail=/chain|pendant|lace|buckle|hair-edge|hair-fade|accent-seam|thumb/.test(n);
      if(lod==='high'){o.visible=true;o.castShadow=true}
      else if(lod==='medium'){o.visible=!detail;o.castShadow=false}
    });
  }

  function build(rec){
    if(!hasDOM()||!state.enabled)return false;
    if(rec.root)return true;
    const forge=window.TGGV227;
    if(typeof forge?.buildRig!=='function')return false;
    const v=core()?.variant?.(rec.seed);if(!v)return false;
    const root=forge.buildRig(v);if(!root)return false;
    root.name='v236-npc-'+rec.seed;root.userData.v236Npc=true;root.userData.variant=v;
    root.position.set(0,0,0);rec.human.add(root);rec.root=root;rec.variant=v;
    return true;
  }

  function applyLod(rec,lod){
    if(!rec)return;
    rec.lod=lod;
    if(!state.enabled||lod==='low'||!rec.root){
      if(rec.root)rec.root.visible=false;
      setLegacy(rec,true);
      if(rec.legacyParts)rec.human.userData.parts=rec.legacyParts;
      return;
    }
    setLegacy(rec,false);rec.root.visible=true;trimDetails(rec.root,lod);
    if(rec.root.userData?.parts)rec.human.userData.parts=rec.root.userData.parts;
  }

  function refresh(){
    if(!hasDOM())return status();
    const list=pedestrians(),cap=core()?.populationCap?.(quality())||8;
    list.forEach((human,i)=>{
      const rec=snapshot(human,i);
      if(i<cap&&state.enabled)build(rec);
      else applyLod(rec,'low');
    });
    state.upgraded=[...state.registry.values()].filter(r=>!!r.root).length;
    state.lastRefresh=Date.now();state.ready=true;updateLods(true);renderUI();return status();
  }

  function subject(){
    const gs=window.TGGGame?.getState?.()||{};
    const o=gs.inVehicle?window.TGG3D?.car:window.TGG3D?.player;
    return o?.position||null;
  }
  function updateLods(force=false){
    if(!hasDOM())return;
    const now=performance.now();if(!force&&now-state.lastLod<400)return;state.lastLod=now;
    const s=subject(),q=quality(),cap=core()?.populationCap?.(q)||8;
    let hi=0,med=0,lo=0;
    const list=pedestrians();
    list.forEach((human,i)=>{
      const rec=snapshot(human,i);
      if(!state.enabled||i>=cap){applyLod(rec,'low');lo++;return}
      if(!rec.root)build(rec);
      const d=s?Math.hypot(human.position.x-s.x,human.position.z-s.z):99;
      const lod=core()?.lod?.(d,q)||'low';
      applyLod(rec,lod);
      if(lod==='high')hi++;else if(lod==='medium')med++;else lo++;
    });
    state.high=hi;state.medium=med;state.low=lo;renderUI();
  }

  function restore(){
    for(const rec of state.registry.values()){
      if(rec.root?.parent)rec.root.parent.remove(rec.root);
      rec.root?.traverse?.(o=>{
        // Geometry is owned per generated NPC, but V2.27 Forge materials are cached/shared.
        o.geometry?.dispose?.();
      });
      rec.root=null;setLegacy(rec,true);
      if(rec.legacyParts)rec.human.userData.parts=rec.legacyParts;
    }
    state.upgraded=0;state.high=0;state.medium=0;state.low=pedestrians().length;state.enabled=false;renderUI();return status();
  }
  function rebuild(){
    const was=state.enabled;
    for(const rec of state.registry.values()){
      if(rec.root?.parent)rec.root.parent.remove(rec.root);
      rec.root=null;setLegacy(rec,true);if(rec.legacyParts)rec.human.userData.parts=rec.legacyParts;
    }
    state.enabled=was;state.registry.clear();lastCount=-1;return refresh();
  }
  function setEnabled(v){
    state.enabled=!!v;
    if(state.enabled)refresh();
    else{
      for(const rec of state.registry.values())applyLod(rec,'low');
      state.high=0;state.medium=0;state.low=pedestrians().length;
    }
    renderUI();return state.enabled;
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v236');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v236ForgeBtn')){
      const b=document.createElement('button');b.id='v236ForgeBtn';b.className='v236-forge-btn';b.type='button';b.textContent='NPC FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v236ForgePanel';panel.className='v236-forge-panel';
      panel.innerHTML='<div class="v236-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v236Close" type="button">×</button></div><div class="v236-actions"><button id="v236Toggle" type="button">NPC FORGE: ON</button><button id="v236Refresh" type="button">REFRESH CROWD</button><button id="v236Rebuild" type="button">REBUILD NPCS</button><button id="v236Restore" type="button">LEGACY CROWD</button></div><div id="v236Stats" class="v236-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v236Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v236Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v236Refresh')?.addEventListener('click',refresh);
      document.getElementById('v236Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v236Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v236ForgeHud';hud.className='v236-forge-hud';
      hud.innerHTML='<small>TGG NPC FORGE</small><b id="v236HudMode">NATIVE CROWD</b><span id="v236HudStats">0 NPCS</span>';city.appendChild(hud);
    }
    renderUI();
  }
  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id),s=status();
    if(q('v236Toggle'))q('v236Toggle').textContent='NPC FORGE: '+(state.enabled?'ON':'OFF');
    if(q('v236Stats'))q('v236Stats').textContent=s.upgraded+' NATIVE • '+s.high+' HIGH • '+s.medium+' MID • '+s.low+' LOW • CAP '+s.cap;
    if(q('v236HudMode'))q('v236HudMode').textContent=state.enabled?'NATIVE CROWD':'LEGACY CROWD';
    if(q('v236HudStats'))q('v236HudStats').textContent=s.upgraded+' UPGRADED • '+s.quality.toUpperCase();
  }
  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.shiftKey&&(e.key==='n'||e.key==='N')){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }
  function tick(){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    const count=pedestrians().length;
    if(count!==lastCount){lastCount=count;refresh()}
    updateLods(false);
  }

  const api={version:VERSION,layers:LAYERS,status,refresh,rebuild,restore,setEnabled};
  globalThis.TGGV236=api;
  if(hasDOM()){window.TGGV236=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();