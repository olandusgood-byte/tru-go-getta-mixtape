(() => {
  const VERSION='V2.26';
  const KEY='tgg-v226-city-influence-v1';
  const core=()=>window.TGGV226Core;
  const $=id=>document.getElementById(id);
  let state=null,board=null,hud=null,wrapped=false,originalInteract=null,lastUi=0,lastMetricSync=0;
  let visuals=0;
  const markers=new Map();

  function game(){return window.TGGGame?.getState?.()||{x:50,y:55,inVehicle:false}}
  function life(){return window.TGGLifeOS?.getState?.()||{day:1,readiness:1}}
  function rival(){return window.TGGV225?.status?.()||{rivalry:25,respect:10,alliance:0,crewStrength:0}}
  function metrics(){
    const wl=window.TGGWorldLife?.getState?.()||{};
    const c=window.TGGCareer?.career||{};
    return {
      recordings:Math.max(0,Number(c.recordings)||0),
      battleWins:Math.max(0,Number(wl.battleWins)||0),
      shows:Math.max(0,Number(wl.shows)||0),
      visuals
    };
  }
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state=core().createState(saved.state||saved);
      state.metrics={recordings:0,battleWins:0,shows:0,visuals:0,...(saved.metrics||{})};
      visuals=Math.max(0,Number(state.metrics.visuals)||0);
    }catch{state=core().createState();state.metrics=metrics();}
    if(!state.metrics)state.metrics=metrics();
    const current=metrics();
    for(const k of ['recordings','battleWins','shows'])state.metrics[k]=Math.max(Number(state.metrics[k])||0,current[k]);
    state.lastDay=Math.max(1,Number(state.lastDay)||1,Number(life().day)||1);
    save(false);
    return state;
  }
  function save(render=true){
    try{localStorage.setItem(KEY,JSON.stringify({state,metrics:state.metrics}))}catch{}
    if(render)renderAll();
    return state;
  }
  function notify(t){window.__tggToast?.(t)}
  function district(id){return core().DISTRICTS.find(x=>x.id===id)||null}
  function distTo(d){
    const s=game();
    return Math.hypot((Number(s.x)||50)-d.x,(Number(s.y)||50)-d.y);
  }
  function tracked(){
    const d=district(state?.trackedDistrict);
    return d||null;
  }
  function near(){const d=tracked();return !!d&&distTo(d)<=7.4}
  function blocked(){
    const sw=window.TGGStoryWorld3D?.getStatus?.();
    if(sw?.near&&sw?.target)return true;
    if(window.TGGSocialSchedule?.near?.())return true;
    const rv=window.TGGV225?.status?.();
    if(rv&&Number(rv.distance)<=7.2)return true;
    return false;
  }
  function navigationTarget(){
    const d=tracked();
    if(!d)return null;
    return {label:'CITY INFLUENCE • '+d.name,x:d.x,y:d.y,radius:7.4,color:d.color,influence:true,arrived:near(),id:'influence-'+d.id,districtId:d.id};
  }

  function applyResult(next,label){
    if(!next)return false;
    const rewards=next.rewards||{cash:0,xp:0,rep:0};
    state=core().createState(next);
    state.metrics=state.metrics||metrics();
    if(rewards.cash||rewards.xp)window.TGGGame?.reward?.(rewards.cash||0,rewards.xp||0);
    if(rewards.rep)window.TGGCareer?.addRep?.(rewards.rep);
    if(next.justCaptured)notify(label+' CAPTURED • +$350 • +80 XP • +20 REP');
    renderAll();save(false);
    return true;
  }

  function applyActivity(id,amount,source){
    const beforeMetrics={...(state.metrics||{})};
    const next=core().applyActivity(state,id,amount,source);
    const keep=next?.justCaptured;
    if(next){next.metrics=beforeMetrics;applyResult(next,district(id)?.name||id)}
    return !!next;
  }

  function syncMetrics(){
    if(!state)return;
    const current=metrics(),base=state.metrics||current;
    const changes=[
      ['recordings','studio',8,'NEW RECORD'],
      ['battleWins','downtown',11,'BATTLE WIN'],
      ['shows','mixtape',10,'LIVE SHOW'],
      ['visuals','media',10,'MUSIC VISUAL']
    ];
    let changed=false;
    for(const [metric,id,gain,label] of changes){
      const delta=Math.max(0,(Number(current[metric])||0)-(Number(base[metric])||0));
      if(delta>0){
        for(let i=0;i<Math.min(delta,8);i++)applyActivity(id,gain,label);
        changed=true;
      }
      state.metrics[metric]=current[metric];
    }
    const l=life(),day=Math.max(1,Number(l.day)||1);
    let guard=0;
    while(day>state.lastDay&&guard++<7){
      state=core().applyDayPressure(state,{...rival(),day:state.lastDay+1});
      state.metrics={...current};
      changed=true;
    }
    if(changed)save();
  }

  function work(){
    const d=tracked();
    if(!d){notify('TRACK A DISTRICT FIRST');return false}
    if(game().inVehicle){notify('EXIT THE CAR TO WORK '+d.name);return false}
    if(!near()){notify('FOLLOW NAV TO '+d.name);window.TGGGame?.show?.('game');return false}
    if(blocked()){notify('HANDLE THE ACTIVE CITY ENCOUNTER FIRST');return false}
    const r=rival(),l=life();
    const next=core().workDistrict(state,d.id,{crewStrength:r.crewStrength,readiness:l.readiness,rivalry:r.rivalry,alliance:r.alliance});
    if(!next)return false;
    next.metrics={...(state.metrics||metrics())};
    window.TGGLifeOS?.advance?.(45,true);
    applyResult(next,d.name);
    notify(d.name+' PUSH • +'+next.gain+' INFLUENCE');
    return true;
  }

  function track(id){
    if(!district(id))return false;
    state.trackedDistrict=state.trackedDistrict===id?null:id;
    save();
    if(state.trackedDistrict){window.TGGGame?.show?.('game');notify(district(id).name+' TRACKED')}
    else notify('CITY INFLUENCE NAV CLEARED');
    return true;
  }

  function ensure(){
    document.body.classList.add('tgg-v226');
    if(!document.getElementById('v226Styles')){
      const s=document.createElement('style');s.id='v226Styles';s.textContent=`
      #cityInfluenceBoard.active{align-items:flex-start;overflow:auto;padding:16px;background:radial-gradient(circle at 50% -8%,#17212d 0,#080b10 52%,#030406 100%)}
      .v226-shell{width:min(1180px,96vw);margin:0 auto;padding:20px;border:1px solid #ffffff16;border-radius:24px;background:linear-gradient(145deg,#0d121af5,#06090ef7);box-shadow:0 30px 100px #000d;color:#f5f7fb}
      .v226-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.v226-head h2{margin:4px 0;font-size:clamp(34px,5vw,64px);line-height:.92}.v226-head p{max-width:690px;color:#99a4b7}.v226-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;min-width:330px}.v226-summary span{padding:10px;border:1px solid #ffffff14;border-radius:12px;background:#070a10}.v226-summary b,.v226-summary small{display:block}.v226-summary b{font-size:18px}.v226-summary small{margin-top:3px;font-size:7px;letter-spacing:.13em;color:#8e98a9}
      .v226-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px}.v226-card{padding:16px;border:1px solid #ffffff13;border-radius:18px;background:linear-gradient(145deg,#111722,#080b11)}.v226-card.tracked{border-color:var(--dcolor);box-shadow:0 0 0 1px color-mix(in srgb,var(--dcolor) 25%,transparent),0 18px 45px #0008}.v226-card-head{display:flex;justify-content:space-between;gap:10px}.v226-card-head b{font-size:18px}.v226-card-head span{font-size:8px;color:var(--dcolor);font-weight:900;letter-spacing:.1em}.v226-meter{display:grid;grid-template-columns:70px 1fr 36px;gap:9px;align-items:center;margin-top:10px}.v226-meter label,.v226-meter strong{font-size:8px}.v226-meter label{color:#929cad}.v226-meter strong{text-align:right}.v226-meter i{height:8px;overflow:hidden;border-radius:999px;background:#ffffff10}.v226-meter em{display:block;height:100%;border-radius:inherit}.v226-meter.you em{background:linear-gradient(90deg,#9ac900,#dfff70)}.v226-meter.rival em{background:linear-gradient(90deg,#8f1c37,#ff466d)}.v226-meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v226-meta span{padding:6px 8px;border-radius:999px;background:#ffffff08;border:1px solid #ffffff10;font-size:7px;color:#abb4c3}.v226-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v226-actions button{min-height:46px;font-weight:950}.v226-history{margin-top:14px;display:grid;gap:6px}.v226-history span{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #ffffff0d;border-radius:10px;background:#06090e;font-size:8px}.v226-history small{color:#8e98aa}
      .v226-city-hud{position:absolute;right:18px;top:145px;z-index:15;display:none;gap:2px;min-width:150px;padding:9px 11px;border:1px solid #c7ff0030;border-radius:12px;background:#070b12e8;box-shadow:0 12px 34px #0009;backdrop-filter:blur(10px)}.v226-city-hud.active{display:grid}.v226-city-hud small{font-size:6px;color:#c7ff00;letter-spacing:.14em;font-weight:900}.v226-city-hud b{font-size:9px}.v226-city-hud span{font-size:7px;color:#a3adbc}
      #cityInfluenceBtn{border-color:#48d7ff66!important}.influence-contact-near{border-color:#c7ff00!important;box-shadow:0 0 22px #c7ff0028!important}
      @media(max-width:760px){#cityInfluenceBoard.active{padding:8px}.v226-shell{width:100%;padding:13px;border-radius:18px}.v226-head{display:grid}.v226-summary{min-width:0;grid-template-columns:repeat(3,1fr)}.v226-grid{grid-template-columns:1fr}.v226-actions{grid-template-columns:1fr}.v226-city-hud{right:8px;top:112px;min-width:132px}}
      `;document.head.appendChild(s);
    }
    if(!$('cityInfluenceBtn')){
      const anchor=$('rivalCrewBtn')||$('eventsBtn')||document.querySelector('.action-deck .actions button:last-child');
      if(anchor){
        const b=document.createElement('button');b.id='cityInfluenceBtn';b.className='action-primary';b.textContent='CITY INFLUENCE';
        anchor.parentNode.insertBefore(b,anchor.nextSibling);
        b.addEventListener('click',()=>{renderBoard();window.TGGGame?.show?.('cityInfluenceBoard')});
      }
    }
    if(!$('cityInfluenceBoard')){
      const root=document.createElement('section');root.id='cityInfluenceBoard';root.className='screen';document.querySelector('main')?.appendChild(root);
    }
    board=$('cityInfluenceBoard');
    if(!hud){
      const city=document.querySelector('#game .city');
      if(city){hud=document.createElement('div');hud.id='v226CityHud';hud.className='v226-city-hud';city.appendChild(hud)}
    }
  }

  function renderBoard(){
    ensure();if(!board||!state)return;
    const snap=core().snapshot(state),trackedId=state.trackedDistrict;
    board.innerHTML='<div class="v226-shell"><header class="v226-head"><div><p class="eyebrow">V2.26 • CITY INFLUENCE</p><h2>MAKE YOUR NAME OWN THE MAP.</h2><p>Every record, battle, show, visual, crew move and rival decision changes who has momentum in each district.</p></div><div class="v226-summary"><span><b>'+snap.cityScore+'%</b><small>TGG CITY SCORE</small></span><span><b>'+snap.rivalScore+'%</b><small>NIGHT SHIFT</small></span><span><b>'+snap.captures+'/4</b><small>DISTRICTS CAPTURED</small></span></div></header><div class="v226-grid">'+snap.districts.map(d=>'<article class="v226-card '+(trackedId===d.id?'tracked':'')+'" style="--dcolor:'+d.color+'"><div class="v226-card-head"><b>'+d.name+'</b><span>'+d.control+'</span></div><div class="v226-meter you"><label>YOU</label><i><em style="width:'+d.player+'%"></em></i><strong>'+Math.round(d.player)+'</strong></div><div class="v226-meter rival"><label>NIGHT SHIFT</label><i><em style="width:'+d.rival+'%"></em></i><strong>'+Math.round(d.rival)+'</strong></div><div class="v226-meta"><span>'+d.activity+' DISTRICT</span><span>'+d.activities+' CAREER MOVES</span><span>'+d.pushes+' STREET PUSHES</span></div><div class="v226-actions"><button data-v226-track="'+d.id+'" class="primary">'+(trackedId===d.id?'CLEAR NAV':'TRACK DISTRICT')+'</button><button data-v226-work="'+d.id+'" '+(trackedId===d.id&&near()?'':'disabled')+'>WORK DISTRICT</button></div></article>').join('')+'</div><div class="v226-history">'+(snap.history.length?snap.history.slice().reverse().slice(0,6).map(h=>'<span><b>'+district(h.id)?.name+' • '+h.source+'</b><small>'+h.control+' • YOU '+Math.round(h.player)+' / NS '+Math.round(h.rival)+'</small></span>').join(''):'<span><b>CITY IS WAITING</b><small>MAKE A MOVE</small></span>')+'</div><button id="v226Back" class="secondary" style="width:100%;margin-top:14px;min-height:48px">BACK TO CITY</button></div>';
    board.querySelectorAll('[data-v226-track]').forEach(b=>b.onclick=()=>track(b.dataset.v226Track));
    board.querySelectorAll('[data-v226-work]').forEach(b=>b.onclick=()=>{if(state.trackedDistrict!==b.dataset.v226Work)track(b.dataset.v226Work);work();renderBoard()});
    $('v226Back')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  }

  function renderHud(){
    ensure();if(!hud||!state)return;
    const d=tracked(),snap=core().snapshot(state),active=window.TGGGame?.getActiveScreen?.()==='game';
    hud.classList.toggle('active',active);
    hud.innerHTML='<small>CITY INFLUENCE</small><b>'+snap.cityScore+'% TGG • '+snap.rivalScore+'% NS</b><span>'+(d?(d.name+' • '+(near()?'AT DISTRICT':Math.round(distTo(d)*3.2)+' M')):(snap.captures+'/4 DISTRICTS CAPTURED'))+'</span>';
    const interact=$('interact3dBtn');
    const own=active&&d&&near()&&!blocked();
    if(interact){
      interact.classList.toggle('influence-contact-near',!!own);
      if(own){interact.disabled=false;interact.textContent='WORK '+d.name}
    }
  }

  function makeSprite(text,color){
    const THREE=window.THREE,c=document.createElement('canvas');c.width=520;c.height=120;const x=c.getContext('2d');
    x.fillStyle='#070a10e8';x.fillRect(0,0,520,120);x.strokeStyle=color;x.lineWidth=5;x.strokeRect(4,4,512,112);
    x.fillStyle='#fff';x.font='900 27px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,260,45);
    x.fillStyle=color;x.font='900 15px Arial';x.fillText('CITY INFLUENCE',260,82);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(6,1.4,1);return s;
  }
  function boot3d(){
    if(!window.THREE||!window.TGG3D?.scene||markers.size)return false;
    const THREE=window.THREE,scene=window.TGG3D.scene;
    for(const d of core().DISTRICTS){
      const g=new THREE.Group();g.userData.v226District=d.id;
      g.position.set((d.x-50)*.92,0,(d.y-50)*.92);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(2.15,.08,9,40),new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0xc7ff00,emissiveIntensity:1.8,transparent:true,opacity:.55}));
      ring.rotation.x=Math.PI/2;ring.position.y=.12;g.add(ring);
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,4.5,8),new THREE.MeshBasicMaterial({color:0xc7ff00,transparent:true,opacity:.12}));pillar.position.y=2.25;g.add(pillar);
      const label=makeSprite(d.name,d.color);label.position.y=4.45;g.add(label);
      scene.add(g);markers.set(d.id,{g,ring,pillar,label});
    }
    return true;
  }
  function update3d(ts){
    boot3d();if(!state)return;
    for(const d of core().DISTRICTS){
      const m=markers.get(d.id);if(!m)continue;
      const row=state.districts[d.id],control=core().controlOf(row);
      const color=control==='TGG CONTROL'?0xc7ff00:control==='NIGHT SHIFT'?0xff466d:0x48d7ff;
      m.ring.material.color.setHex(color);m.ring.material.emissive.setHex(color);m.pillar.material.color.setHex(color);
      const hot=state.trackedDistrict===d.id;
      const pulse=1+Math.sin(ts*.004+d.x)*.07;
      m.ring.scale.setScalar(hot?1.22:pulse);m.ring.material.opacity=hot?.9:.45;m.pillar.material.opacity=hot?.28:.10;
    }
  }

  function renderAll(){renderHud();if(window.TGGGame?.getActiveScreen?.()==='cityInfluenceBoard')renderBoard()}
  function wrap(){
    if(wrapped||!window.TGG3D?.interactNearest)return;
    originalInteract=window.TGG3D.interactNearest.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>near()&&!blocked()?work():(originalInteract?.()??false);
    wrapped=true;
  }
  function bind(){
    ensure();
    document.addEventListener('click',e=>{
      const el=e.target?.closest?.('[data-media="video"]');
      if(el){visuals++;if(state?.metrics){}setTimeout(syncMetrics,0)}
    },true);
    window.addEventListener('tgg:v225-choice',e=>{
      const choice=e.detail?.choice;if(!choice||!state)return;
      state=core().applyRivalChoice(state,choice);state.metrics=state.metrics||metrics();save();
      notify('CITY INFLUENCE UPDATED • '+choice.toUpperCase()+' ROUTE');
    });
    $('interact3dBtn')?.addEventListener('click',e=>{
      if(near()&&!blocked()){
        e.preventDefault();e.stopImmediatePropagation();work();
      }
    },true);
  }

  function animate(ts){
    requestAnimationFrame(animate);
    ensure();wrap();update3d(ts);
    if(ts-lastMetricSync>650){lastMetricSync=ts;syncMetrics()}
    if(ts-lastUi>150){lastUi=ts;renderAll()}
  }

  ensure();load();bind();
  window.TGGV226={
    version:VERSION,status:()=>({...core().snapshot(state),metrics:{...(state?.metrics||{})},ready:true,near:near(),target:navigationTarget()}),
    track,work,navigationTarget,near,render:renderAll,sync:syncMetrics,
    applyActivity:(id,amount,source)=>applyActivity(id,amount,source)
  };
  requestAnimationFrame(animate);
})();