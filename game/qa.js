(() => {
  const report=[];
  const pass=(name,detail)=>report.push({name,status:'PASS',detail});
  const fail=(name,detail)=>report.push({name,status:'FAIL',detail});
  function check(name,condition,detail){condition?pass(name,detail):fail(name,detail)}
  function run(){
    check('localStorage','localStorage' in window,'browser persistence available');
    check('game-api',!!window.TGGGame,'main game API available');
    check('career-api',!!window.TGGCareer,'career API available');
    check('content-api',!!window.TGGContent,'content API available');
    check('menu',!!document.getElementById('menu'),'menu screen exists');
    check('city',!!document.getElementById('game'),'city screen exists');
    check('career',!!document.getElementById('career'),'career screen exists');
    check('content',!!document.getElementById('contentBoard'),'content board exists');
    check('pause',!!document.getElementById('pause'),'pause screen exists');
    check('mission-action',!!document.getElementById('missionBtn'),'mission control exists');
    check('save-action',!!document.getElementById('saveBtn'),'save control exists');
    const bad=report.filter(x=>x.status==='FAIL');
    window.TGGQA={report,passed:bad.length===0,repair(){if(!document.getElementById('hud'))return false;return true}};
    return window.TGGQA;
  }
  window.TGGQA={run};
})();
