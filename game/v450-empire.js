(()=>{
  const VERSION='V4.50 CREW BUSINESS CAREER EMPIRE MEGA';
  const KEY='tgg-empire-v450';
  const base={
    crew:{
      manager:{name:'M',role:'MANAGER',level:1,morale:70,trust:65},
      dj:{name:'DJ V',role:'DJ',level:1,morale:68,trust:58},
      producer:{name:'Kane',role:'PRODUCER',level:1,morale:72,trust:62}
    },
    ventures:{
      label:{name:'TGG LABEL',level:0,income:0},
      events:{name:'TGG EVENTS',level:0,income:0},
      media:{name:'TGG MEDIA',level:0,income:0}
    },
    contracts:[],
    empireRep:10,
    lastPayout:Date.now()
  };
  let state=load();
  function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return {...base,...x,crew:{...base.crew,...(x.crew||{})},ventures:{...base.ventures,...(x.ventures||{})},contracts:Array.isArray(x.contracts)?x.contracts:[]}}catch{return structuredClone(base)}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state}
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function world(){return window.TGGWorldSystems?.getStatus?.()||{cityRep:0,careerScore:0}}
  function social(){return window.TGGHomeSocial?.getStatus?.()||{support:50,bonds:{}}}
  function economy(){return window.TGGGame?.getState?.()||{cash:0,level:1}}
  function ventureCost(key){const v=state.ventures[key];return v?Math.round(700*Math.pow(1.8,v.level)):Infinity}
  function incomeRate(){return Object.values(state.ventures).reduce((sum,v)=>sum+(v.level*45),0)}
  function improveCrew(key,amount=4){
    const c=state.crew[key];if(!c)return false;
    c.morale=clamp(c.morale+amount);
    c.trust=clamp(c.trust+amount*.6);
    if(c.morale>84&&c.trust>75)c.level=Math.min(5,c.level+1);
    save();render();return true;
  }
  function upgradeVenture(key){
    const v=state.ventures[key];if(!v||v.level>=5)return false;
    const cost=ventureCost(key);
    if(window.TGGGame?.spend && !window.TGGGame.spend(cost))return false;
    v.level++;v.income=v.level*45;state.empireRep=clamp(state.empireRep+6);
    window.TGGGameFeel?.objective?.('BUSINESS UPGRADE',v.name+' LEVEL '+v.level);
    save();render();return true;
  }
  function contractOffer(){
    const w=world(),s=social();
    const score=(Number(w.cityRep)||0)+(Number(w.careerScore)||0)*.35+(Number(s.support)||0)*.25+state.empireRep;
    const type=score>140?'CITY TOUR':score>90?'BRAND PARTNERSHIP':score>55?'SHOW PACKAGE':'LOCAL PROMO';
    const value=Math.round(150+score*3.2);
    const item={id:'contract-'+Date.now(),type,value,status:'OFFERED',createdAt:Date.now()};
    state.contracts=[item,...state.contracts].slice(0,12);save();render();return item;
  }
  function acceptContract(id){
    const c=state.contracts.find(x=>x.id===id);if(!c||c.status!=='OFFERED')return false;
    c.status='ACTIVE';state.empireRep=clamp(state.empireRep+2);
    window.TGGLifeSim?.change?.({focus:-4,energy:-3,momentum:4});
    save();render();return true;
  }
  function completeContract(id){
    const c=state.contracts.find(x=>x.id===id);if(!c||c.status!=='ACTIVE')return false;
    c.status='COMPLETE';
    window.TGGGame?.reward?.(c.value,Math.round(c.value/8));
    state.empireRep=clamp(state.empireRep+8);
    Object.keys(state.crew).forEach(k=>improveCrew(k,2));
    save();render();return true;
  }
  function payoutTick(){
    const now=Date.now();if(now-state.lastPayout<180000)return false;
    const rate=incomeRate();if(rate>0)window.TGGGame?.reward?.(rate,Math.round(rate/20));
    state.lastPayout=now;save();render();return rate;
  }
  function ensure(){
    let el=document.getElementById('v450Empire');if(el)return el;
    el=document.createElement('aside');el.id='v450Empire';
    el.innerHTML='<small>V4.50 CAREER EMPIRE</small><b id="v450Rep">EMPIRE REP 10</b><span id="v450Income">PASSIVE $0</span><i id="v450Crew">CREW READY</i><div><button data-v450="label">LABEL</button><button data-v450="events">EVENTS</button><button data-v450="media">MEDIA</button><button id="v450Contract">NEW CONTRACT</button></div>';
    document.body.appendChild(el);
    el.querySelectorAll('[data-v450]').forEach(b=>b.onclick=()=>upgradeVenture(b.dataset.v450));
    el.querySelector('#v450Contract').onclick=()=>contractOffer();
    return el;
  }
  function render(){
    ensure();
    document.getElementById('v450Rep').textContent='EMPIRE REP '+Math.round(state.empireRep);
    document.getElementById('v450Income').textContent='PASSIVE $'+incomeRate();
    const avg=Math.round(Object.values(state.crew).reduce((a,c)=>a+c.morale,0)/Object.keys(state.crew).length);
    document.getElementById('v450Crew').textContent='CREW MORALE '+avg;
  }
  function getStatus(){return {version:VERSION,...state,incomeRate:incomeRate(),features:['crew-role-system','crew-morale-trust','business-venture-upgrades','passive-income-loop','dynamic-contract-offers','contract-progression','empire-reputation','career-scale-rewards']}}
  function boot(){ensure();render();setInterval(payoutTick,15000);document.documentElement.dataset.tggV450='on';window.TGGEmpire={version:VERSION,getStatus,improveCrew,upgradeVenture,contractOffer,acceptContract,completeContract,payoutTick};window.dispatchEvent(new CustomEvent('tgg:v450-ready',{detail:getStatus()}))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();