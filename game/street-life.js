(() => {
  const KEY='tgg-street-life-v1';
  const CONTACTS=[
    {name:'Tasha',role:'Videographer',line:'I shoot clean performance clips. Keep your next visual simple and strong.'},
    {name:'Rico',role:'Producer',line:'Your city run is getting noticed. Keep the records consistent.'},
    {name:'Lex',role:'Promoter',line:'Crowds follow momentum. Show up twice before you ask for the bigger room.'},
    {name:'Mia',role:'Stylist',line:'Your look should move with the music. Build one signature detail.'},
    {name:'Jay',role:'Artist',line:'I keep seeing you outside. That consistency matters.'},
    {name:'Nova',role:'Engineer',line:'Bring clean takes and references. The mix gets easier when the idea is clear.'}
  ];
  let state={met:[],talks:0,lastContact:null,lastTrafficDistance:null,lastHornReaction:null};
  const $=id=>document.getElementById(id);

  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(KEY)||'null');
      if(x&&typeof x==='object')state={...state,...x};
    }catch{}
    if(!Array.isArray(state.met))state.met=[];
    return state;
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));return state;}
  function playerWorld(){
    const s=window.TGGGame?.getState?.();
    if(!s)return null;
    return {x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92,inVehicle:!!s.inVehicle};
  }
  function nearestPedestrian(radius=3.4){
    const p=playerWorld(), list=window.TGG3D?.pedestrians;
    if(!p||p.inVehicle||!Array.isArray(list))return null;
    let best=null;
    list.forEach((human,i)=>{
      const d=Math.hypot(p.x-human.position.x,p.z-human.position.z);
      if(d<=radius&&(!best||d<best.distance))best={index:i,distance:d,contact:CONTACTS[i%CONTACTS.length]};
    });
    return best;
  }
  function nearestTraffic(radius=5){
    const p=playerWorld(), list=window.TGG3D?.traffic;
    if(!p||!p.inVehicle||!Array.isArray(list))return null;
    let best=null;
    list.forEach((car,i)=>{
      const d=Math.hypot(p.x-car.position.x,p.z-car.position.z);
      if(d<=radius&&(!best||d<best.distance))best={index:i,distance:d};
    });
    state.lastTrafficDistance=best?best.distance:null;
    return best;
  }
  function activateNearest(){
    const near=nearestPedestrian();
    if(!near)return false;
    const c=near.contact;
    state.talks=Math.max(0,Number(state.talks)||0)+1;
    state.lastContact=c.name;
    if(!state.met.includes(c.name))state.met.push(c.name);
    save();
    window.__tggToast?.(c.name.toUpperCase()+' • '+c.role.toUpperCase());
    const bubble=$('streetDialogue');
    if(bubble){
      bubble.innerHTML='<b>'+c.name+' • '+c.role+'</b><span>'+c.line+'</span>';
      bubble.classList.add('show');
      clearTimeout(window.__tggStreetTalkTimer);
      window.__tggStreetTalkTimer=setTimeout(()=>bubble.classList.remove('show'),4200);
    }
    render();
    return {ok:true,status:'talked',contact:{...c},distance:near.distance};
  }
  function onHorn(){
    const near=nearestTraffic(7);
    if(!near)return false;
    state.lastHornReaction={trafficIndex:near.index,distance:near.distance,at:Date.now()};
    save();
    const badge=$('streetLifePrompt');
    if(badge){
      badge.textContent='TRAFFIC HEARD YOU';
      badge.classList.add('show','traffic');
      setTimeout(()=>badge.classList.remove('traffic'),650);
    }
    return true;
  }
  function snapshot(){
    return {met:state.met.slice(),talks:Number(state.talks)||0,lastContact:state.lastContact,lastTrafficDistance:state.lastTrafficDistance,lastHornReaction:state.lastHornReaction};
  }
  function render(){
    const prompt=$('streetLifePrompt');
    if(!prompt)return;
    const screen=window.TGGGame?.getActiveScreen?.();
    if(screen!=='game'){prompt.classList.remove('show','traffic');return;}
    const ped=nearestPedestrian();
    if(ped){
      prompt.textContent='F • TALK TO '+ped.contact.name.toUpperCase();
      prompt.classList.add('show');
      prompt.classList.remove('traffic');
      prompt.disabled=false;
      return;
    }
    const traffic=nearestTraffic();
    if(traffic){
      prompt.textContent='TRAFFIC '+Math.max(1,Math.round(traffic.distance*3.2))+'m';
      prompt.classList.add('show','traffic');
      prompt.disabled=true;
      return;
    }
    prompt.classList.remove('show','traffic');
    prompt.disabled=true;
  }
  function loop(){render();requestAnimationFrame(loop);}
  function bind(){
    $('streetLifePrompt')?.addEventListener('click',()=>activateNearest());
    document.addEventListener('keydown',e=>{
      if(String(e.key||'').toLowerCase()!=='f')return;
      const t=e.target;
      if(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement||t?.isContentEditable)return;
      if(window.TGGGame?.getActiveScreen?.()!=='game')return;
      if(nearestPedestrian()){e.preventDefault();activateNearest();}
    });
    window.addEventListener('tgg:horn',()=>onHorn());
  }
  load();
  window.TGGStreetLife={CONTACTS,state,load,save,nearestPedestrian,nearestTraffic,activateNearest,onHorn,snapshot,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();loop()},{once:true});
  else {bind();loop();}
})();