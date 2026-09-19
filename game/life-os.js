(() => {
  const VERSION='V2.21';
  const KEY='tgg-life-os-v1';
  const $=id=>document.getElementById(id);
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  const CONTACTS=[
    {id:'manager',name:'M',role:'Manager',start:9,end:20,color:'#ff466d'},
    {id:'producer',name:'Kane',role:'Producer',start:12,end:25,color:'#7b86ff'},
    {id:'dj',name:'DJ V',role:'DJ',start:18,end:26,color:'#48d7ff'},
    {id:'director',name:'Director K',role:'Video Director',start:10,end:22,color:'#c56cff'},
    {id:'friend',name:'Day One',role:'Friend',start:11,end:23,color:'#c7ff00'},
    {id:'family',name:'Mama G',role:'Family',start:8,end:21,color:'#ffc857'}
  ];
  const UPGRADES=[
    {id:'bed',name:'PREMIUM SLEEP SETUP',cost:700,detail:'+20% sleep recovery',bonus:'sleep'},
    {id:'kitchen',name:'CHEF KITCHEN',cost:900,detail:'+10 food recovery • meals cost less',bonus:'food'},
    {id:'lounge',name:'CREATOR LOUNGE',cost:1200,detail:'+20% mood/social recovery',bonus:'social'},
    {id:'wellness',name:'HOME WELLNESS ROOM',cost:1600,detail:'stress recovery + readiness floor',bonus:'wellness'}
  ];
  const defaults=()=>({
    version:VERSION,day:1,minute:540,
    needs:{energy:82,fuel:78,hygiene:76,mood:74,social:68,stress:22},
    relationships:{manager:35,producer:25,dj:20,director:15,friend:45,family:60},
    upgrades:[],
    stats:{sleeps:0,meals:0,hangouts:0,calls:0,careerActions:0},
    lastAction:'Fresh start. Build the life behind the career.',
    updatedAt:Date.now()
  });
  let state=defaults();

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      state={...defaults(),...saved};
      state.needs={...defaults().needs,...(saved.needs||{})};
      state.relationships={...defaults().relationships,...(saved.relationships||{})};
      state.stats={...defaults().stats,...(saved.stats||{})};
      state.upgrades=Array.isArray(saved.upgrades)?saved.upgrades:[];
      state.version=VERSION;
    }catch(e){state=defaults();}
    normalize();
    return state;
  }
  function normalize(){
    state.day=Math.max(1,Math.floor(Number(state.day)||1));
    state.minute=((Math.floor(Number(state.minute)||0)%1440)+1440)%1440;
    Object.keys(state.needs).forEach(k=>state.needs[k]=clamp(state.needs[k]));
    Object.keys(state.relationships).forEach(k=>state.relationships[k]=clamp(state.relationships[k]));
  }
  function save(){
    normalize();state.updatedAt=Date.now();
    localStorage.setItem(KEY,JSON.stringify(state));
    render();
    return state;
  }
  function notify(text){window.__tggToast?.(text)}
  function hasUpgrade(id){return state.upgrades.includes(id)}
  function hour(){return state.minute/60}
  function dayName(){return ['MON','TUE','WED','THU','FRI','SAT','SUN'][(state.day-1)%7]}
  function clock(){
    let h=Math.floor(state.minute/60),m=state.minute%60,ap=h>=12?'PM':'AM';
    const d=h%12||12;
    return dayName()+' • DAY '+state.day+' • '+d+':'+String(m).padStart(2,'0')+' '+ap;
  }
  function advance(minutes,quiet=false){
    let mins=Math.max(0,Math.round(Number(minutes)||0));
    if(!mins)return state;
    const old=state.minute;
    state.minute+=mins;
    while(state.minute>=1440){state.minute-=1440;state.day++;}
    const hours=mins/60;
    const n=state.needs;
    n.energy-=hours*3.0;
    n.fuel-=hours*2.6;
    n.hygiene-=hours*1.65;
    n.social-=hours*.7;
    n.mood-=hours*.42;
    n.stress+=hours*.8;
    normalize();
    if(!quiet&&Math.abs(state.minute-old)>=60)state.lastAction='Time moved forward • '+clock();
    return save();
  }
  function changeNeed(key,amount){
    if(key in state.needs)state.needs[key]=clamp(state.needs[key]+Number(amount||0));
  }
  function spend(cost){
    if(cost<=0)return true;
    if(window.TGGGame?.spend)return !!window.TGGGame.spend(cost);
    return false;
  }
  function availability(id){
    const c=CONTACTS.find(x=>x.id===id);if(!c)return false;
    let h=hour(),start=c.start,end=c.end;
    if(end>24){
      if(h<start)h+=24;
      return h>=start&&h<end;
    }
    return h>=start&&h<end;
  }
  function relationshipLabel(score){
    if(score>=85)return 'INNER CIRCLE';
    if(score>=65)return 'CLOSE';
    if(score>=45)return 'SOLID';
    if(score>=25)return 'BUILDING';
    return 'NEW LINK';
  }
  function contactInteraction(id,type='call'){
    const c=CONTACTS.find(x=>x.id===id);if(!c)return false;
    if(!availability(id)){notify(c.name.toUpperCase()+' IS BUSY RIGHT NOW');return false;}
    const hangout=type==='hangout';
    if(hangout&&!spend(20)){notify('NEED $20 FOR THE HANGOUT');return false;}
    advance(hangout?90:20,true);
    state.relationships[id]=clamp((state.relationships[id]||0)+(hangout?8:4));
    changeNeed('social',hangout?28:11);
    changeNeed('mood',hangout?16:5);
    changeNeed('stress',hangout?-13:-4);
    changeNeed('energy',hangout?-5:-1);
    state.stats[hangout?'hangouts':'calls']++;
    state.lastAction=(hangout?'Hung out with ':'Called ')+c.name+' • relationship +'+(hangout?8:4);
    save();notify(state.lastAction.toUpperCase());
    return true;
  }
  function sleep(){
    const bonus=hasUpgrade('bed')?1.2:1;
    advance(480,true);
    changeNeed('energy',58*bonus);
    changeNeed('stress',-32*(hasUpgrade('wellness')?1.2:1));
    changeNeed('mood',10);
    changeNeed('fuel',-14);
    changeNeed('hygiene',-7);
    state.stats.sleeps++;
    state.lastAction='Full sleep complete • energy restored';
    save();notify('RESTED UP — ENERGY RESTORED');
    return true;
  }
  function nap(){
    advance(120,true);
    changeNeed('energy',hasUpgrade('bed')?30:24);
    changeNeed('stress',-10);
    changeNeed('mood',4);
    state.lastAction='Power nap • back in motion';
    save();notify('POWER NAP COMPLETE');
    return true;
  }
  function meal(){
    const cost=hasUpgrade('kitchen')?8:15;
    if(!spend(cost)){notify('NOT ENOUGH CASH FOR A MEAL');return false;}
    advance(30,true);
    changeNeed('fuel',hasUpgrade('kitchen')?46:36);
    changeNeed('mood',hasUpgrade('kitchen')?9:5);
    changeNeed('energy',4);
    state.stats.meals++;
    state.lastAction='Ate a real meal • fuel restored';
    save();notify('MEAL COMPLETE — FUEL UP');
    return true;
  }
  function shower(){
    advance(25,true);
    changeNeed('hygiene',44);
    changeNeed('stress',-8);
    changeNeed('mood',5);
    state.lastAction='Reset + shower • ready to step out';
    save();notify('FRESH + READY');
    return true;
  }
  function chill(){
    advance(60,true);
    const mult=hasUpgrade('lounge')?1.2:1;
    changeNeed('mood',20*mult);
    changeNeed('stress',-18*(hasUpgrade('wellness')?1.2:1));
    changeNeed('energy',7);
    changeNeed('social',hasUpgrade('lounge')?6:2);
    state.lastAction='Chilled at home • stress down';
    save();notify('HOME RESET COMPLETE');
    return true;
  }
  function upgrade(id){
    const item=UPGRADES.find(x=>x.id===id);
    if(!item||hasUpgrade(id))return false;
    if(!spend(item.cost)){notify('NEED $'+item.cost+' FOR '+item.name);return false;}
    state.upgrades.push(id);
    changeNeed('mood',12);
    state.lastAction='Apartment upgraded • '+item.name;
    save();notify(item.name+' INSTALLED');
    return true;
  }
  function readiness(){
    const n=state.needs;
    const raw=(n.energy*.28+n.fuel*.16+n.hygiene*.10+n.mood*.24+n.social*.08+(100-n.stress)*.14)/100;
    const floor=hasUpgrade('wellness') ? .82 : .72;
    return Math.max(floor,Math.min(1.18,.72+raw*.46));
  }
  function performanceModifier(){return Number(readiness().toFixed(3))}
  function readinessLabel(){
    const r=readiness();
    if(r>=1.08)return 'LOCKED IN';
    if(r>=.98)return 'READY';
    if(r>=.88)return 'MANAGEABLE';
    return 'DRAINED';
  }
  function applyCareerAction(kind='career'){
    const profile={
      battle:{energy:-8,fuel:-5,hygiene:-3,mood:4,stress:9,minutes:45},
      show:{energy:-14,fuel:-7,hygiene:-7,mood:7,stress:10,minutes:90},
      training:{energy:-12,fuel:-6,hygiene:-8,mood:3,stress:5,minutes:75},
      recording:{energy:-9,fuel:-5,hygiene:-2,mood:5,stress:7,minutes:120},
      career:{energy:-7,fuel:-4,hygiene:-2,mood:3,stress:6,minutes:60}
    }[kind]||null;
    if(!profile)return false;
    advance(profile.minutes,true);
    for(const k of ['energy','fuel','hygiene','mood','stress'])changeNeed(k,profile[k]);
    state.stats.careerActions++;
    state.lastAction=String(kind).toUpperCase()+' session • readiness '+Math.round(readiness()*100)+'%';
    save();
    return true;
  }
  function snapshot(){
    return JSON.parse(JSON.stringify({
      version:VERSION,day:state.day,minute:state.minute,clock:clock(),needs:state.needs,
      relationships:state.relationships,upgrades:state.upgrades,stats:state.stats,
      readiness:Number(readiness().toFixed(3)),readinessLabel:readinessLabel(),lastAction:state.lastAction
    }));
  }
  function metricCard(key,label,invert=false){
    const value=Math.round(state.needs[key]);
    const pct=invert?100-value:value;
    return '<article class="lifeos-need '+(pct<30?'low':'')+'"><div><b>'+label+'</b><strong>'+value+'</strong></div><span><i style="width:'+clamp(pct)+'%"></i></span></article>';
  }
  function ensure(){
    let root=$('lifeBoard');
    if(!root){
      root=document.createElement('section');root.id='lifeBoard';root.className='screen';
      document.querySelector('main')?.appendChild(root);
    }
    if(!$('lifeOsBtn')){
      const deck=document.querySelector('.action-deck .actions');
      if(deck){const b=document.createElement('button');b.id='lifeOsBtn';b.className='action-primary';b.textContent='LIFE OS';deck.appendChild(b);}
    }
    const home=document.querySelector('#home .home-actions');
    if(home&&!$('homeSleepBtn')){
      const a=document.createElement('button');a.id='homeSleepBtn';a.textContent='SLEEP + RECOVER';home.appendChild(a);
      const b=document.createElement('button');b.id='homeLifeBtn';b.textContent='LIFE OS';home.appendChild(b);
    }
    if(!$('lifeOsStyles')){
      const style=document.createElement('style');style.id='lifeOsStyles';
      style.textContent=`
      .lifeos-shell{width:min(1180px,calc(100% - 32px));margin:22px auto 70px;padding:22px;border:1px solid #ffffff18;border-radius:24px;background:linear-gradient(145deg,#0b0f17f7,#06080df7);box-shadow:0 26px 70px #000a;color:#f4f7fb}
      .lifeos-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.lifeos-head h2{margin:2px 0 4px;font-size:clamp(28px,4vw,52px)}.lifeos-head p{max-width:680px;color:#9aa4b6}.lifeos-clock{display:grid;gap:5px;text-align:right;padding:12px 14px;border:1px solid #c7ff0038;border-radius:14px;background:#c7ff0009}.lifeos-clock b{color:#c7ff00;font-size:13px}.lifeos-clock strong{font-size:20px}
      .lifeos-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px;margin-top:18px}.lifeos-card{padding:17px;border:1px solid #ffffff14;border-radius:18px;background:#0d1119cc}.lifeos-card h3{margin:0 0 12px;font-size:13px;letter-spacing:.14em}.lifeos-needs{display:grid;grid-template-columns:1fr 1fr;gap:9px}.lifeos-need{padding:10px;border:1px solid #ffffff10;border-radius:12px;background:#070a10}.lifeos-need>div{display:flex;justify-content:space-between;gap:10px;font-size:11px}.lifeos-need strong{color:#c7ff00}.lifeos-need>span{display:block;height:5px;margin-top:8px;border-radius:999px;background:#ffffff12;overflow:hidden}.lifeos-need i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#c7ff00,#48d7ff)}.lifeos-need.low i{background:linear-gradient(90deg,#ff466d,#ffc857)}
      .lifeos-readiness{margin-top:13px;padding:13px;border:1px solid #c7ff002d;border-radius:14px;display:flex;justify-content:space-between;align-items:center;background:#c7ff0008}.lifeos-readiness b{font-size:12px}.lifeos-readiness strong{font-size:25px;color:#c7ff00}.lifeos-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.lifeos-actions button,.lifeos-contact button,.lifeos-upgrade button{min-height:44px;font-weight:900}
      .lifeos-contacts{display:grid;gap:8px}.lifeos-contact{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px;border:1px solid #ffffff11;border-radius:13px;background:#070a10}.lifeos-contact div{display:grid;gap:2px}.lifeos-contact span,.lifeos-contact small{font-size:9px;color:#9da7b6}.lifeos-contact .relationship{color:#fff;font-weight:900}.lifeos-contact .available{color:#c7ff00}.lifeos-contact .busy{color:#ff8b9d}.lifeos-contact .contact-actions{display:flex;gap:6px}.lifeos-contact button{padding:8px 10px;font-size:9px}
      .lifeos-upgrades{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lifeos-upgrade{padding:12px;border:1px solid #ffffff12;border-radius:13px;background:#070a10;display:grid;gap:6px}.lifeos-upgrade b{font-size:10px}.lifeos-upgrade span{font-size:9px;color:#9da7b6}.lifeos-upgrade.owned{border-color:#c7ff0040}.lifeos-upgrade.owned b{color:#c7ff00}.lifeos-log{margin-top:12px;padding:12px 14px;border-left:3px solid #c7ff00;background:#05080d;color:#b8c0cf;font-size:10px}.lifeos-back{margin-top:16px;width:100%;min-height:48px}
      .life-mini-hud{position:absolute;right:14px;top:14px;z-index:17;display:none;gap:5px;padding:8px 10px;border:1px solid #ffffff16;border-radius:12px;background:#06090dcc;backdrop-filter:blur(9px);font-size:8px}.life-mini-hud.active{display:flex}.life-mini-hud b{color:#c7ff00}
      @media(max-width:760px){.lifeos-shell{width:calc(100% - 20px);margin:10px auto 50px;padding:14px;border-radius:18px}.lifeos-head{display:grid}.lifeos-clock{text-align:left}.lifeos-grid{grid-template-columns:1fr}.lifeos-needs{grid-template-columns:1fr 1fr}.lifeos-actions{grid-template-columns:1fr 1fr}.lifeos-upgrades{grid-template-columns:1fr}.lifeos-contact{grid-template-columns:1fr}.lifeos-contact .contact-actions{display:grid;grid-template-columns:1fr 1fr}.life-mini-hud{right:8px;top:8px}.lifeos-head h2{font-size:30px}}
      `;
      document.head.appendChild(style);
    }
    let mini=$('lifeMiniHud');
    if(!mini){
      const city=document.querySelector('#game .city');
      if(city){mini=document.createElement('div');mini.id='lifeMiniHud';mini.className='life-mini-hud';city.appendChild(mini);}
    }
    return root;
  }
  function render(){
    const root=ensure();if(!root)return;
    root.innerHTML='<div class="lifeos-shell"><header class="lifeos-head"><div><p class="eyebrow">V2.21 • SIMS-STYLE DAILY LIFE</p><h2>LIFE OS.</h2><p>Your career hits harder when your life is together. Manage recovery, mood, stress, relationships and your home between city moves.</p></div><div class="lifeos-clock"><b>'+clock()+'</b><span>READINESS</span><strong>'+readinessLabel()+' • '+Math.round(readiness()*100)+'%</strong></div></header><div class="lifeos-grid"><section class="lifeos-card"><h3>DAILY NEEDS</h3><div class="lifeos-needs">'+metricCard('energy','ENERGY')+metricCard('fuel','FUEL')+metricCard('hygiene','HYGIENE')+metricCard('mood','MOOD')+metricCard('social','SOCIAL')+metricCard('stress','STRESS',true)+'</div><div class="lifeos-readiness"><b>CAREER PERFORMANCE MODIFIER</b><strong>x'+performanceModifier().toFixed(2)+'</strong></div><div class="lifeos-actions"><button data-life-action="sleep">SLEEP 8H</button><button data-life-action="nap">POWER NAP</button><button data-life-action="meal">EAT MEAL</button><button data-life-action="shower">SHOWER</button><button data-life-action="chill">CHILL</button><button data-life-action="advance">PASS 1H</button></div><div class="lifeos-log">'+state.lastAction+'</div></section><section class="lifeos-card"><h3>RELATIONSHIPS + AVAILABILITY</h3><div class="lifeos-contacts">'+CONTACTS.map(c=>{const score=Math.round(state.relationships[c.id]||0),open=availability(c.id);return '<article class="lifeos-contact"><div><b>'+c.name+' • '+c.role+'</b><span class="relationship">'+score+'/100 • '+relationshipLabel(score)+'</span><small class="'+(open?'available':'busy')+'">'+(open?'AVAILABLE NOW':'BUSY • '+formatWindow(c))+'</small></div><div class="contact-actions"><button data-life-call="'+c.id+'" '+(open?'':'disabled')+'>CALL</button><button data-life-hangout="'+c.id+'" '+(open?'':'disabled')+'>HANG OUT</button></div></article>'}).join('')+'</div></section><section class="lifeos-card"><h3>APARTMENT UPGRADES</h3><div class="lifeos-upgrades">'+UPGRADES.map(u=>'<article class="lifeos-upgrade '+(hasUpgrade(u.id)?'owned':'')+'"><b>'+u.name+'</b><span>'+u.detail+'</span>'+(hasUpgrade(u.id)?'<strong>INSTALLED</strong>':'<button data-life-upgrade="'+u.id+'">BUY $'+u.cost+'</button>')+'</article>').join('')+'</div></section><section class="lifeos-card"><h3>LIFE STATS</h3><div class="stats"><span><b>'+state.stats.sleeps+'</b><small>FULL SLEEPS</small></span><span><b>'+state.stats.meals+'</b><small>MEALS</small></span><span><b>'+state.stats.hangouts+'</b><small>HANGOUTS</small></span><span><b>'+state.stats.careerActions+'</b><small>CAREER SESSIONS</small></span></div><p>Home upgrades persist locally and improve recovery. Existing TGG career, battle, show and gym systems stay intact.</p></section></div><button id="lifeOsBack" class="secondary lifeos-back">BACK TO CITY</button></div>';
    root.querySelectorAll('[data-life-action]').forEach(b=>b.onclick=()=>({sleep,nap,meal,shower,chill,advance:()=>advance(60)}[b.dataset.lifeAction]?.()));
    root.querySelectorAll('[data-life-call]').forEach(b=>b.onclick=()=>contactInteraction(b.dataset.lifeCall,'call'));
    root.querySelectorAll('[data-life-hangout]').forEach(b=>b.onclick=()=>contactInteraction(b.dataset.lifeHangout,'hangout'));
    root.querySelectorAll('[data-life-upgrade]').forEach(b=>b.onclick=()=>upgrade(b.dataset.lifeUpgrade));
    $('lifeOsBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
    const mini=$('lifeMiniHud');
    if(mini){
      mini.innerHTML='<span>⚡ <b>'+Math.round(state.needs.energy)+'</b></span><span>☺ <b>'+Math.round(state.needs.mood)+'</b></span><span>STRESS <b>'+Math.round(state.needs.stress)+'</b></span>';
      mini.classList.toggle('active',window.TGGGame?.getActiveScreen?.()==='game');
    }
  }
  function formatHour(v){let h=v%24,ap=h>=12?'PM':'AM';return (h%12||12)+ap}
  function formatWindow(c){return formatHour(c.start)+'–'+formatHour(c.end)}
  function bind(){
    ensure();
    $('lifeOsBtn')?.addEventListener('click',()=>{render();window.TGGGame?.show?.('lifeBoard')});
    $('homeSleepBtn')?.addEventListener('click',sleep);
    $('homeLifeBtn')?.addEventListener('click',()=>{render();window.TGGGame?.show?.('lifeBoard')});
    window.addEventListener('tgg:life:render',render);
    render();
  }
  window.TGGLifeOS={
    version:VERSION,getState:snapshot,load,save,render,advance,sleep,nap,meal,shower,chill,upgrade,
    contactInteraction,availability,performanceModifier,readinessLabel,applyCareerAction,
    contacts:CONTACTS.map(x=>({...x})),upgrades:UPGRADES.map(x=>({...x}))
  };
  load();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();