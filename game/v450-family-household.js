(()=>{
  const VERSION='V4.50 FAMILY HOUSEHOLD LEGACY WORLD MEGA';
  const KEY='tgg-family-household-v450';
  const base={
    household:{stability:68,support:62,privacy:55,routine:60},
    family:{partner:0,kids:0,dependents:0},
    legacy:12,
    responsibilities:[],
    history:[]
  };
  let s=load();
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'{}');
      return {...base,...x,household:{...base.household,...(x.household||{})},family:{...base.family,...(x.family||{})},responsibilities:Array.isArray(x.responsibilities)?x.responsibilities:[],history:Array.isArray(x.history)?x.history:[]};
    }catch{return structuredClone(base)}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(s));return s}
  function remember(type,detail,score=0){
    s.history.push({type:String(type||'event'),detail:String(detail||''),score:Number(score)||0,at:Date.now()});
    s.history=s.history.slice(-40);save();
  }
  function householdScore(){
    return Math.round(Object.values(s.household).reduce((a,b)=>a+(Number(b)||0),0)/Object.keys(s.household).length);
  }
  function care(type='support',amount=4){
    const map={support:'support',stability:'stability',privacy:'privacy',routine:'routine'};
    const k=map[type]||'support';
    s.household[k]=clamp(s.household[k]+Number(amount||0));
    s.legacy=clamp(s.legacy+Math.max(0,Number(amount||0)*.15));
    window.TGGLifeSim?.change?.({energy:k==='routine'?2:0,focus:k==='privacy'?2:0,social:k==='support'?3:0,momentum:1});
    window.TGGHomeSocial?.remember?.('Household '+k+' improved',amount);
    remember('care',k,amount);save();render();return true;
  }
  function addResponsibility(id,label,cost=1){
    if(s.responsibilities.some(x=>x.id===id))return false;
    s.responsibilities.push({id,label,cost:Number(cost)||1,done:false,createdAt:Date.now()});
    s.responsibilities=s.responsibilities.slice(-12);save();render();return true;
  }
  function completeResponsibility(id){
    const r=s.responsibilities.find(x=>x.id===id);if(!r||r.done)return false;
    r.done=true;r.doneAt=Date.now();
    s.household.stability=clamp(s.household.stability+3);
    s.household.support=clamp(s.household.support+2);
    s.legacy=clamp(s.legacy+2.5);
    window.TGGLifeSim?.change?.({energy:-Math.max(1,r.cost),social:2,momentum:1});
    remember('responsibility',r.label,3);save();render();return true;
  }
  function neglectTick(){
    const open=s.responsibilities.filter(x=>!x.done&&Date.now()-x.createdAt>120000);
    if(!open.length)return;
    const hit=Math.min(3,open.length);
    s.household.stability=clamp(s.household.stability-hit);
    s.household.support=clamp(s.household.support-hit*.5);
    s.legacy=clamp(s.legacy-hit*.25);
    save();render();
  }
  function ensure(){
    let e=document.getElementById('v450FamilyHousehold');if(e)return e;
    e=document.createElement('aside');e.id='v450FamilyHousehold';
    e.innerHTML='<small>V4.50 FAMILY + HOUSEHOLD</small><b id="v450Household">HOUSEHOLD 61</b><span id="v450Legacy">LEGACY 12</span><i id="v450Duty">NO OPEN RESPONSIBILITIES</i><div><button data-v450="support">SUPPORT</button><button data-v450="stability">STABILITY</button><button data-v450="privacy">PRIVACY</button><button data-v450="routine">ROUTINE</button></div>';
    document.body.appendChild(e);
    e.querySelectorAll('[data-v450]').forEach(b=>b.onclick=()=>care(b.dataset.v450,4));
    return e;
  }
  function render(){
    ensure();
    const open=s.responsibilities.filter(x=>!x.done);
    document.getElementById('v450Household').textContent='HOUSEHOLD '+householdScore();
    document.getElementById('v450Legacy').textContent='LEGACY '+Math.round(s.legacy);
    document.getElementById('v450Duty').textContent=open.length?(open.length+' OPEN RESPONSIBILIT'+(open.length===1?'Y':'IES')):'NO OPEN RESPONSIBILITIES';
  }
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const t=((b.id||'')+' '+(b.textContent||'')).toLowerCase();
      if(/save game|my apartment|home/.test(t))care('stability',1.5);
      if(/career|business/.test(t))addResponsibility('work-'+Date.now(),'Balance career commitments',2);
      if(/show|event|world life/.test(t))care('support',.8);
      if(/studio|record/.test(t))care('privacy',.6);
    },true);
    window.addEventListener('tgg-story-event',e=>{
      if(/complete/i.test(String(e.detail?.type||''))){
        s.legacy=clamp(s.legacy+4);remember('story','Story milestone completed',4);save();render();
      }
    });
  }
  function getStatus(){
    return {version:VERSION,...s,householdScore:householdScore(),features:[
      'family-household-state','household-stability-system','support-privacy-routine-balance',
      'responsibility-loop','neglect-consequences','legacy-progression','home-life-care-hooks',
      'story-legacy-rewards'
    ]};
  }
  function boot(){
    ensure();render();bind();setInterval(neglectTick,30000);
    document.documentElement.dataset.tggV450='on';
    window.TGGFamilyHousehold={version:VERSION,getStatus,care,addResponsibility,completeResponsibility,remember};
    window.dispatchEvent(new CustomEvent('tgg:v450-ready',{detail:getStatus()}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();