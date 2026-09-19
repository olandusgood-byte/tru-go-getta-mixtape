(() => {
  const VERSION='V2.27';
  const KEY='tgg-v227-district-consequences-v1';
  const $=id=>document.getElementById(id);
  const core=()=>window.TGGV227Core;
  let state=null,board=null,hud=null,lastSync=0,lastUi=0;
  const flags=new Map();

  function influence(){return window.TGGV226?.status?.()||{districts:[],cityScore:0,rivalScore:0,metrics:{}}}
  function life(){return window.TGGLifeOS?.getState?.()||{day:1}}
  function currentMetrics(){
    const s=influence();
    const m=s.metrics||{};
    return {
      recordings:Math.max(0,Number(m.recordings)||0),
      battleWins:Math.max(0,Number(m.battleWins)||0),
      shows:Math.max(0,Number(m.shows)||0),
      visuals:Math.max(0,Number(m.visuals)||0)
    };
  }
  function load(){
    try{state=core().createState(JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{state=core().createState()}
    const m=currentMetrics();
    if(!state.metrics||Object.values(state.metrics).every(v=>!v))state.metrics={...m};
    else for(const k of Object.keys(m))state.metrics[k]=Math.max(Number(state.metrics[k])||0,m[k]);
    state.lastDay=Math.max(Number(state.lastDay)||1,Number(life().day)||1);
    save(false);
    return state;
  }
  function save(render=true){
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
    if(render)renderAll();
    return state;
  }
  function reward(r,label){
    if(!r)return;
    if(r.cash||r.xp)window.TGGGame?.reward?.(r.cash||0,r.xp||0);
    if(r.rep)window.TGGCareer?.addRep?.(r.rep);
    const bits=[r.cash?'+$'+r.cash:'',r.xp?'+'+r.xp+' XP':'',r.rep?'+'+r.rep+' REP':''].filter(Boolean).join(' • ');
    if(bits)window.__tggToast?.((label||'CITY BONUS')+' • '+bits);
  }
  function sync(){
    if(!state)return;
    const inf=influence(),m=currentMetrics();
    for(const metric of ['recordings','battleWins','shows','visuals']){
      const before=Number(state.metrics?.[metric])||0;
      const delta=Math.max(0,m[metric]-before);
      if(delta>0){
        const next=core().processMetric(state,inf,metric,delta);
        state=core().createState(next);
        reward(next.rewards,next.perk?String(core().PERKS[next.perk]?.name||'DISTRICT PERK'):'DISTRICT PERK');
      }
      state.metrics[metric]=m[metric];
    }
    const day=Math.max(1,Number(life().day)||1);
    if(day>state.lastDay){
      const next=core().processDay(state,inf,day);
      state=core().createState(next);
      reward(next.rewards,'TERRITORY INCOME');
      state.metrics={...m};
    }
    const takeover=core().claimFullTakeover(state,inf);
    if(takeover.claimed){
      state=core().createState(takeover);
      state.metrics={...m};
      reward(takeover.rewards,'FULL CITY TAKEOVER');
      window.dispatchEvent(new CustomEvent('tgg:v227-takeover',{detail:{version:VERSION,rewards:takeover.rewards}}));
    }
    save(false);
    return state;
  }

  function ensure(){
    document.body.classList.add('tgg-v227');
    if(!$('v227Styles')){
      const s=document.createElement('style');s.id='v227Styles';s.textContent=`
      #cityConsequencesBoard.active{align-items:flex-start;overflow:auto;padding:16px;background:radial-gradient(circle at 50% -10%,#202516 0,#080b10 48%,#030406 100%)}
      .v227-shell{width:min(1180px,96vw);margin:0 auto;padding:20px;border:1px solid #ffffff16;border-radius:24px;background:linear-gradient(145deg,#0d121af5,#06090ef7);box-shadow:0 30px 100px #000d;color:#f5f7fb}
      .v227-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.v227-head h2{margin:4px 0;font-size:clamp(34px,5vw,62px);line-height:.92}.v227-head p{max-width:660px;color:#9aa5b6}.v227-rank{display:grid;gap:4px;min-width:220px;padding:13px;border:1px solid #c7ff0038;border-radius:16px;background:#c7ff0008;text-align:right}.v227-rank small{font-size:7px;letter-spacing:.14em;color:#c7ff00}.v227-rank b{font-size:22px}.v227-rank span{font-size:8px;color:#9ba5b4}
      .v227-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.v227-stats span{padding:12px;border:1px solid #ffffff12;border-radius:13px;background:#080c12}.v227-stats b,.v227-stats small{display:block}.v227-stats b{font-size:18px}.v227-stats small{margin-top:3px;font-size:7px;letter-spacing:.12em;color:#8f99aa}
      .v227-perks{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.v227-perk{padding:15px;border:1px solid #ffffff12;border-radius:16px;background:linear-gradient(145deg,#111722,#080b11);opacity:.55}.v227-perk.active{opacity:1;border-color:#c7ff0045;box-shadow:inset 0 0 24px #c7ff0008}.v227-perk small,.v227-perk b,.v227-perk span{display:block}.v227-perk small{font-size:7px;letter-spacing:.13em;color:#8e98a9}.v227-perk b{margin-top:5px;font-size:15px;color:#fff}.v227-perk.active b{color:#c7ff00}.v227-perk span{margin-top:7px;font-size:9px;line-height:1.5;color:#a8b1c0}
      .v227-pressure{margin-top:12px;padding:14px;border:1px solid #ff466d30;border-radius:14px;background:#ff466d08}.v227-pressure>div{display:flex;justify-content:space-between;gap:12px;font-size:9px}.v227-pressure i{display:block;height:7px;margin-top:8px;border-radius:999px;background:#ffffff10;overflow:hidden}.v227-pressure em{display:block;height:100%;background:linear-gradient(90deg,#ffc857,#ff466d)}
      .v227-history{display:grid;gap:6px;margin-top:14px}.v227-history span{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #ffffff0d;border-radius:10px;background:#06090e;font-size:8px}.v227-history small{color:#8e98aa}
      .v227-hud{position:absolute;right:18px;top:205px;z-index:15;display:none;gap:2px;padding:8px 10px;border:1px solid #c7ff0038;border-radius:11px;background:#070b12e8;box-shadow:0 10px 28px #0009}.v227-hud.active{display:grid}.v227-hud small{font-size:6px;color:#c7ff00;letter-spacing:.14em}.v227-hud b{font-size:9px}.v227-hud span{font-size:7px;color:#9ca6b5}
      #cityConsequencesBtn{border-color:#c7ff0060!important}
      @media(max-width:760px){#cityConsequencesBoard.active{padding:8px}.v227-shell{width:100%;padding:13px;border-radius:18px}.v227-head{display:grid}.v227-rank{text-align:left;min-width:0}.v227-stats{grid-template-columns:repeat(2,1fr)}.v227-perks{grid-template-columns:1fr}.v227-hud{right:8px;top:170px}}
      `;document.head.appendChild(s);
    }
    if(!$('cityConsequencesBtn')){
      const anchor=$('cityInfluenceBtn')||$('rivalCrewBtn')||$('eventsBtn');
      if(anchor){
        const b=document.createElement('button');b.id='cityConsequencesBtn';b.className='action-primary';b.textContent='CITY STATUS';
        anchor.parentNode.insertBefore(b,anchor.nextSibling);
        b.addEventListener('click',()=>{renderBoard();window.TGGGame?.show?.('cityConsequencesBoard')});
      }
    }
    if(!$('cityConsequencesBoard')){
      const root=document.createElement('section');root.id='cityConsequencesBoard';root.className='screen';document.querySelector('main')?.appendChild(root);
    }
    board=$('cityConsequencesBoard');
    if(!hud){
      const city=document.querySelector('#game .city');
      if(city){hud=document.createElement('div');hud.id='v227Hud';hud.className='v227-hud';city.appendChild(hud)}
    }
  }
  function renderBoard(){
    ensure();if(!board||!state)return;
    const snap=core().snapshot(state,influence());
    board.innerHTML='<div class="v227-shell"><header class="v227-head"><div><p class="eyebrow">V2.27 • DISTRICT CONSEQUENCES</p><h2>THE CITY REACTS TO WHO OWNS IT.</h2><p>Control unlocks career perks and daily money. Night Shift territory raises pressure. Own all four districts at once to trigger the full-city takeover bonus.</p></div><div class="v227-rank"><small>CITY RECOGNITION</small><b>'+snap.recognitionLabel+'</b><span>'+snap.recognition+'% • '+snap.controlledCount+'/4 CONTROLLED</span></div></header><div class="v227-stats"><span><b>$'+snap.dailyIncome+'</b><small>DAILY TERRITORY INCOME</small></span><span><b>'+snap.pressure+'%</b><small>NIGHT SHIFT PRESSURE</small></span><span><b>$'+snap.totalPassiveIncome+'</b><small>PASSIVE INCOME EARNED</small></span><span><b>'+snap.perkTriggers+'</b><small>PERK TRIGGERS</small></span></div><div class="v227-perks">'+snap.perks.map(p=>'<article class="v227-perk '+(p.active?'active':'')+'"><small>'+p.id.toUpperCase()+' • '+(p.active?'ACTIVE':'LOCKED')+'</small><b>'+p.name+'</b><span>'+p.detail+'</span></article>').join('')+'</div><div class="v227-pressure"><div><b>NIGHT SHIFT PRESSURE</b><span>'+snap.rivalCount+' districts under hard rival control</span></div><i><em style="width:'+snap.pressure+'%"></em></i></div><div class="v227-history">'+(snap.history.length?snap.history.slice().reverse().slice(0,6).map(h=>'<span><b>'+h.label+'</b><small>'+new Date(h.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'</small></span>').join(''):'<span><b>NO CONSEQUENCES YET</b><small>TAKE CONTROL OF A DISTRICT</small></span>')+'</div><button id="v227Back" class="secondary" style="width:100%;margin-top:14px;min-height:48px">BACK TO CITY</button></div>';
    $('v227Back')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  }
  function renderHud(){
    ensure();if(!hud||!state)return;
    const snap=core().snapshot(state,influence()),active=window.TGGGame?.getActiveScreen?.()==='game';
    hud.classList.toggle('active',active);
    hud.innerHTML='<small>CITY STATUS</small><b>'+snap.recognitionLabel+' • '+snap.recognition+'%</b><span>'+snap.controlledCount+'/4 CONTROL • $'+snap.dailyIncome+'/DAY • PRESSURE '+snap.pressure+'%</span>';
  }
  function makeFlag(d){
    if(!window.THREE||!window.TGG3D?.scene||flags.has(d.id))return;
    const THREE=window.THREE,g=new THREE.Group();g.userData.v227Consequence=d.id;
    g.position.set((d.x-50)*.92,0,(d.y-50)*.92);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,4.4,8),new THREE.MeshStandardMaterial({color:0x343b48,metalness:.75,roughness:.35}));pole.position.y=2.2;g.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.9,6,2),new THREE.MeshStandardMaterial({color:0x555c6d,side:THREE.DoubleSide,emissive:0x111111,emissiveIntensity:.5}));flag.position.set(.82,3.82,0);g.add(flag);
    const light=new THREE.PointLight(0xffffff,.5,8,2);light.position.y=3.5;g.add(light);
    window.TGG3D.scene.add(g);flags.set(d.id,{g,flag,light});
  }
  function update3d(ts){
    const inf=influence();
    for(const d of inf.districts||[]){
      makeFlag(d);const f=flags.get(d.id);if(!f)continue;
      const tgg=d.control==='TGG CONTROL',rival=d.control==='NIGHT SHIFT';
      const color=tgg?0xc7ff00:rival?0xff466d:0x596274;
      f.flag.material.color.setHex(color);f.flag.material.emissive.setHex(color);f.flag.material.emissiveIntensity=tgg||rival?1.5:.25;
      f.light.color.setHex(color);f.light.intensity=tgg||rival?2.8:.5;
      f.flag.rotation.y=Math.sin(ts*.0015+d.x)*.08;
      f.flag.scale.y=1+Math.sin(ts*.004+d.y)*.035;
    }
  }
  function renderAll(){renderHud();if(window.TGGGame?.getActiveScreen?.()==='cityConsequencesBoard')renderBoard()}
  function animate(ts){
    requestAnimationFrame(animate);
    ensure();update3d(ts);
    if(ts-lastSync>700){lastSync=ts;sync()}
    if(ts-lastUi>180){lastUi=ts;renderAll()}
  }

  ensure();load();
  window.TGGV227={version:VERSION,status:()=>({...core().snapshot(state,influence()),ready:true}),sync,render:renderAll};
  requestAnimationFrame(animate);
})();