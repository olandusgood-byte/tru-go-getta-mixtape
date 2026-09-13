(() => {
  const report=[];
  const pass=(name,detail)=>report.push({name,status:'PASS',detail});
  const fail=(name,detail)=>report.push({name,status:'FAIL',detail});
  function check(name,condition,detail){condition?pass(name,detail):fail(name,detail)}
  function run(){
    report.length=0;
    check('localStorage','localStorage' in window,'browser persistence available');
    check('game-api',!!window.TGGGame,'main game API available');
    check('career-api',!!window.TGGCareer,'career API available');
    check('content-api',!!window.TGGContent,'content API available');
    check('expansion-api',!!window.TGGExpansion,'city expansion API available');
    check('bridge-api',!!window.TGGBridge,'website bridge API available');
    ['menu','creator','game','career','contentBoard','expansionBoard','bridge','pause','hud'].forEach(id=>check(id,!!document.getElementById(id),'required screen/control host exists'));
    ['missionBtn','saveBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','bridgeBtn'].forEach(id=>check(id,!!document.getElementById(id),'required action exists'));
    check('content-start',typeof window.TGGContent?.start==='function','content start API available');
    check('content-advance',typeof window.TGGContent?.advance==='function','content advance API available');
    check('expansion-run',typeof window.TGGExpansion?.run==='function','expansion run API available');
    check('bridge-snapshot',typeof window.TGGBridge?.snapshot==='function','bridge snapshot API available');
    const bad=report.filter(x=>x.status==='FAIL');
    window.TGGQA={report,passed:bad.length===0,repair(){return !!document.getElementById('hud')&&!!window.TGGGame}};
    return window.TGGQA;
  }
  window.TGGQA={run};
})();
