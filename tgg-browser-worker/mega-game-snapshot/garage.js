(() => {
  const KEY='tgg-garage-v1';
  const defaults={color:'#c7ff00',wheelColor:'#080a0d',tuning:'street'};
  const presets={
    street:{label:'STREET',maxForward:10,maxReverse:-4.5,accel:7.5,reverseAccel:5.5,brake:12,coast:3.4,turnRate:112},
    sport:{label:'SPORT',maxForward:12.5,maxReverse:-5,accel:9.2,reverseAccel:6,brake:13.5,coast:3.1,turnRate:120},
    drift:{label:'DRIFT',maxForward:11.2,maxReverse:-4.8,accel:8.3,reverseAccel:5.8,brake:10.8,coast:2.5,turnRate:138}
  };
  let state={...defaults};

  const $=id=>document.getElementById(id);
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'null');
      if(saved&&typeof saved==='object')state={...state,...saved};
    }catch{}
    apply(true);
    return {...state};
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));}
  function apply(quiet=false){
    window.TGG3D?.setCarAppearance?.({color:state.color,wheelColor:state.wheelColor});
    window.TGGGarage3D?.setAppearance?.({color:state.color,wheelColor:state.wheelColor});
    window.TGGGame?.setDriveTuning?.(presets[state.tuning]||presets.street);
    render();
    if(!quiet)window.__tggToast?.('GARAGE SETUP APPLIED');
    return {...state};
  }
  function render(){
    $('garagePaint') && ($('garagePaint').textContent=state.color.toUpperCase());
    $('garageWheels') && ($('garageWheels').textContent=state.wheelColor.toUpperCase());
    $('garageTune') && ($('garageTune').textContent=(presets[state.tuning]?.label||'STREET'));
    document.querySelectorAll('[data-car-color]').forEach(b=>b.classList.toggle('selected',b.dataset.carColor===state.color));
    document.querySelectorAll('[data-wheel-color]').forEach(b=>b.classList.toggle('selected',b.dataset.wheelColor===state.wheelColor));
    document.querySelectorAll('[data-car-tune]').forEach(b=>b.classList.toggle('selected',b.dataset.carTune===state.tuning));
  }
  function bind(){
    document.querySelectorAll('[data-car-color]').forEach(b=>b.addEventListener('click',()=>{state.color=b.dataset.carColor;save();apply()}));
    document.querySelectorAll('[data-wheel-color]').forEach(b=>b.addEventListener('click',()=>{state.wheelColor=b.dataset.wheelColor;save();apply()}));
    document.querySelectorAll('[data-car-tune]').forEach(b=>b.addEventListener('click',()=>{state.tuning=b.dataset.carTune;save();apply()}));
    $('garageReset')?.addEventListener('click',()=>{state={...defaults};save();apply();});
    $('garageBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  }

  window.TGGGarage={getState:()=>({...state}),getPresets:()=>({...presets}),apply,load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();load()},{once:true});
  else {bind();load();}
})();