(()=>{
  'use strict';
  const VERSION='5.41.0';
  const POLICY='local-only';
  const KEY='tgg-v541-world-continuity';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function read(){
    try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}
  }
  function systemSnapshot(){
    const game=window.TGGGame?.getState?.()||null;
    const prior=window.TGGV540?.snapshot?.()||null;
    const contact=window.TGGContactWorld?.snapshot?.()||null;
    const threeD=window.TGG3D?.interactionRuntimeStatus?.()||null;
    return {
      gamePresent:!!game,
      priorPresent:!!prior,
      contactWorldPresent:!!window.TGGContactWorld,
      threeDPresent:!!window.TGG3D,
      livingCityPresent:!!window.TGGLivingCity,
      gameFeelPresent:!!window.TGGGameFeel,
      priorOk:prior?.ok!==false,
      player:game?{level:Number(game.level)||1,cash:Number(game.cash)||0,x:Number(game.x)||0,y:Number(game.y)||0}:null,
      contact:contact?{presence:clone(contact.presence||null),activeCallback:clone(contact.activeCallback||null)}:null,
      interaction:clone(threeD)
    };
  }
  function run(){
    const systems=systemSnapshot();
    const checks={
      runtime:systems.gamePresent,
      prior:systems.priorPresent&&systems.priorOk,
      contactWorld:systems.contactWorldPresent,
      threeD:systems.threeDPresent,
      livingCity:systems.livingCityPresent,
      gameFeel:systems.gameFeelPresent,
      policy:POLICY==='local-only'
    };
    const failed=Object.keys(checks).filter(k=>!checks[k]);
    const result={
      version:VERSION,
      layer:'WORLD-CONTINUITY-CHECKPOINT',
      mutationPolicy:POLICY,
      ok:failed.length===0,
      checks,
      failed,
      systems,
      at:new Date().toISOString()
    };
    try{localStorage.setItem(KEY,JSON.stringify(result))}catch{}
    document.documentElement.dataset.tggV541=result.ok?'ready':'degraded';
    window.dispatchEvent(new CustomEvent('tgg:v541-ready',{detail:clone(result)}));
    return result;
  }
  function snapshot(){return read()||run()}
  window.TGGV541={version:VERSION,mutationPolicy:POLICY,run,snapshot,systemSnapshot};
})();
