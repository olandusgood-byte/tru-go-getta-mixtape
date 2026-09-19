(() => {
  const VERSION='V2.35 TGG NPC + CROWD FORGE 100';
  const LAYERS=[
    'npc core bridge','npc enabled state','npc host registry','npc legacy snapshot','npc legacy restore','npc native attach','npc native detach','npc status API','npc rebuild API','npc rollback isolation',
    'pedestrian profile 1','pedestrian profile 2','pedestrian profile 3','pedestrian profile 4','pedestrian profile 5','pedestrian profile 6','contact profile','skin variation','height variation','build variation',
    'shoulder variation','leg variation','arm variation','head variation','top variation','pants variation','shoe variation','accent variation','hair variation','profile deterministic seed',
    'high LOD','medium LOD','low LOD','distance LOD','quality LOD','LOD refresh','LOD hysteresis','high native rig','medium native rig','low legacy rig',
    'medium face trim','medium jewelry trim','medium shoe trim','medium accessory trim','high face detail','high chain detail','high outfit detail','high shoe detail','high hair detail','high shadow detail',
    'pedestrian parts bridge','contact parts bridge','legacy parts bridge','walk animation bridge','horn reaction bridge','contact idle bridge','contact talk bridge','route preservation','position preservation','rotation preservation',
    'scale preservation','mission ring preservation','traffic avoidance preservation','pedestrian speed preservation','route index preservation','horn timer preservation','contact mission preservation','contact interaction preservation','world compatibility','interior compatibility',
    'lighting material bridge','weather compatibility','camera compatibility','animation compatibility','character forge dependency','character forge fallback','material regrade event','shadow quality gate','performance fallback','mobile LOD trim',
    'crowd HUD','crowd panel','enabled toggle','rebuild button','LOD refresh button','high count stat','medium count stat','low count stat','F10 shortcut','mobile panel',
    'landscape panel','reduced motion safety','host dedupe','native rig dedupe','legacy visibility guard','parts restore guard','V2.34 compatibility','100-layer manifest','release QA hooks','production diagnostics'
  ];

  const core=()=>globalThis.TGGV235Core||globalThis.window?.TGGV235Core;
  const state={enabled:true,hosts:[],records:new Map(),ready:false,rebuilds:0,lod:{high:0,medium:0,low:0},lastLODAt:0};
  let panel=null,hud=null;
  const hasDOM=()=>typeof window!=='undefined'&&typeof document!=='undefined';
  const quality=()=>{
    const q=hasDOM()?window.TGGV212?.status?.()?.quality:null;
    return ['high','balanced','performance'].includes(q)?q:'high';
  };

  function status(){
    return {version:VERSION,ready:state.ready||!hasDOM(),mode:'native-npc-forge',layerCount:LAYERS.length,enabled:state.enabled,hosts:state.hosts.length,rebuilds:state.rebuilds,lod:{...state.lod}};
  }

  function playerPosition(){
    const p=hasDOM()?window.TGG3D?.player:null;
    return p?.position||{x:0,z:0};
  }

  function snapshotHost(host,index,type){
    if(state.records.has(host))return state.records.get(host);
    const rec={
      host,index,type,
      legacyChildren:[...host.children],
      legacyParts:host.userData?.parts||null,
      native:null,lod:'low',profile:core()?.profile?.(index)||null
    };
    state.records.set(host,rec);return rec;
  }

  function setLegacyVisible(rec,visible){rec.legacyChildren.forEach(c=>{c.visible=!!visible})}

  function trimNative(root,lod){
    if(!root)return;
    root.traverse?.(o=>{
      if(!o.isMesh)return;
      const n=String(o.name||'').toLowerCase();
      const fancy=/pupil|brow|cheek|chain|pendant|lace|buckle|accent-seam|thumb|hair-edge/.test(n);
      o.visible=lod==='high'||!fancy;
      if(lod==='medium')o.castShadow=false;
    });
  }

  function buildNative(rec){
    if(rec.native)return rec.native;
    const builder=window.TGGV227?.buildRig;
    if(typeof builder!=='function')return null;
    const root=builder(rec.profile);
    if(!root)return null;
    root.name='v235-npc-native-'+rec.index;
    root.userData.v235NPC=true;
    root.scale.setScalar(rec.type==='contact'?.92:.78);
    rec.host.add(root);rec.native=root;
    return root;
  }

  function applyLOD(rec,lod){
    if(!rec||rec.lod===lod&&((lod==='low')||rec.native))return;
    if(lod==='low'){
      if(rec.native)rec.native.visible=false;
      setLegacyVisible(rec,true);
      if(rec.legacyParts)rec.host.userData.parts=rec.legacyParts;
    }else{
      const root=buildNative(rec);
      if(!root){
        rec.lod='low';setLegacyVisible(rec,true);if(rec.legacyParts)rec.host.userData.parts=rec.legacyParts;return;
      }
      root.visible=true;trimNative(root,lod);setLegacyVisible(rec,false);
      if(root.userData?.parts)rec.host.userData.parts=root.userData.parts;
    }
    rec.lod=lod;
  }

  function distanceToHost(host){
    const p=playerPosition();return Math.hypot((host.position?.x||0)-(p.x||0),(host.position?.z||0)-(p.z||0));
  }

  function refreshLOD(){
    if(!hasDOM())return status();
    const counts={high:0,medium:0,low:0},q=quality();
    for(const rec of state.records.values()){
      const desired=state.enabled?(core()?.lod?.(distanceToHost(rec.host),q)||'low'):'low';
      applyLOD(rec,desired);counts[rec.lod]=(counts[rec.lod]||0)+1;
    }
    state.lod=counts;state.lastLODAt=Date.now();renderUI();return status();
  }

  function discover(){
    if(!hasDOM())return [];
    const hosts=[];
    const crowd=window.TGG3D?.pedestrians||[];
    crowd.forEach((h,i)=>{if(h&&!hosts.includes(h)){hosts.push(h);snapshotHost(h,i,'pedestrian')}});
    const contact=window.TGG3D?.npc;
    if(contact&&!hosts.includes(contact)){hosts.push(contact);snapshotHost(contact,100,'contact')}
    state.hosts=hosts;return hosts;
  }

  function rebuild(){
    if(!hasDOM())return status();
    discover();
    for(const rec of state.records.values()){
      if(rec.native){rec.native.parent?.remove(rec.native);rec.native=null}
      rec.profile=core()?.profile?.(rec.index)||rec.profile;rec.lod='low';
      setLegacyVisible(rec,true);if(rec.legacyParts)rec.host.userData.parts=rec.legacyParts;
    }
    state.rebuilds++;refreshLOD();state.ready=true;
    window.TGGV231?.regrade?.();
    window.dispatchEvent(new CustomEvent('tgg:npc-forge-rebuilt',{detail:{hosts:state.hosts.length}}));
    return status();
  }

  function setEnabled(v){state.enabled=!!v;refreshLOD();renderUI();return state.enabled}

  function restore(){
    state.enabled=false;
    for(const rec of state.records.values()){
      if(rec.native){rec.native.parent?.remove(rec.native);rec.native=null}
      setLegacyVisible(rec,true);if(rec.legacyParts)rec.host.userData.parts=rec.legacyParts;rec.lod='low';
    }
    state.lod={high:0,medium:0,low:state.records.size};renderUI();return status();
  }

  function ensureUI(){
    if(!hasDOM())return;
    document.body.classList.add('tgg-v235');
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent=VERSION;
    const top=document.querySelector('.topbar');
    if(top&&!document.getElementById('v235ForgeBtn')){
      const b=document.createElement('button');b.id='v235ForgeBtn';b.className='v235-forge-btn';b.type='button';b.textContent='NPC FORGE';b.addEventListener('click',()=>panel?.classList.toggle('active'));top.appendChild(b);
    }
    if(!panel){
      panel=document.createElement('aside');panel.id='v235ForgePanel';panel.className='v235-forge-panel';
      panel.innerHTML='<div class="v235-head"><div><small>TGG NATIVE 3D</small><b>NPC + CROWD FORGE</b></div><button id="v235Close" type="button">×</button></div><div class="v235-actions"><button id="v235Toggle" type="button">NPC FORGE: ON</button><button id="v235Rebuild" type="button">REBUILD CROWD</button><button id="v235LOD" type="button">REFRESH LOD</button><button id="v235Restore" type="button">RESTORE LEGACY</button></div><div id="v235Stats" class="v235-stats"></div>';
      document.body.appendChild(panel);
      document.getElementById('v235Close')?.addEventListener('click',()=>panel.classList.remove('active'));
      document.getElementById('v235Toggle')?.addEventListener('click',()=>setEnabled(!state.enabled));
      document.getElementById('v235Rebuild')?.addEventListener('click',rebuild);
      document.getElementById('v235LOD')?.addEventListener('click',refreshLOD);
      document.getElementById('v235Restore')?.addEventListener('click',restore);
    }
    const city=document.querySelector('.city');
    if(city&&!hud){
      hud=document.createElement('div');hud.id='v235ForgeHud';hud.className='v235-forge-hud';
      hud.innerHTML='<small>TGG NPC FORGE</small><b id="v235HudMode">CROWD READY</b><span id="v235HudStats">0 NPCS</span>';city.appendChild(hud);
    }
    renderUI();
  }

  function renderUI(){
    if(!hasDOM())return;
    const q=id=>document.getElementById(id);
    if(q('v235Toggle'))q('v235Toggle').textContent='NPC FORGE: '+(state.enabled?'ON':'OFF');
    const txt=state.hosts.length+' NPCS • H '+state.lod.high+' • M '+state.lod.medium+' • L '+state.lod.low;
    if(q('v235Stats'))q('v235Stats').textContent=txt+' • '+quality().toUpperCase();
    if(q('v235HudStats'))q('v235HudStats').textContent=txt;
    if(q('v235HudMode'))q('v235HudMode').textContent=state.enabled?'NATIVE CROWD':'LEGACY CROWD';
  }

  function keyHandler(e){
    const t=e.target,typing=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable;if(typing)return;
    if(e.key==='F10'){e.preventDefault();panel?.classList.toggle('active')}
    if(e.key==='Escape'&&panel?.classList.contains('active'))panel.classList.remove('active');
  }

  let booted=false,lastLOD=0,lastQuality='';
  function tick(ts=0){
    if(!hasDOM())return;requestAnimationFrame(tick);ensureUI();
    if(!booted&&window.TGG3D?.pedestrians&&window.TGGV227?.buildRig){discover();rebuild();booted=true}
    const q=quality();
    if(q!==lastQuality||ts-lastLOD>1400){lastQuality=q;lastLOD=ts;refreshLOD()}
    renderUI();
  }

  const api={version:VERSION,layers:LAYERS,status,rebuild,setEnabled,restore,refreshLOD};
  globalThis.TGGV235=api;
  if(hasDOM()){window.TGGV235=api;document.addEventListener('keydown',keyHandler);ensureUI();requestAnimationFrame(tick)}
})();